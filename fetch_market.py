#!/usr/bin/env python3
"""Ambil data saham BEI dari sumber gratis yang benar-benar merespons,
lalu tulis JSON untuk web app. Tidak mengarang angka.

Sumber harga/dividen: Yahoo Finance chart API
  https://query1.finance.yahoo.com/v8/finance/chart/{CODE}.JK
Sumber berita: RSS CNBC Indonesia Market, Kontan Investasi, IDX Channel
Daftar emiten: data/universe.csv (kode, nama, papan)

Yahoo chart tidak mengirim header CORS, quote API v7/v10 minta auth (401),
situs idx.co.id diblokir Cloudflare dari lingkungan ini. Jadi skrip ini
yang mengambil data, lalu app memuat file JSON lokal.
"""
from __future__ import annotations

import csv
import datetime as dt
import json
import math
import os
import re
import statistics
import sys
import time
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor, as_completed
from html import unescape
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data"
CACHE = DATA / "cache"
WIB = dt.timezone(dt.timedelta(hours=7))
JST = dt.timezone(dt.timedelta(hours=9))
UA = "Mozilla/5.0 (compatible; InvestingApp/1.0; research; +https://localhost)"
RANGE = "5y"
INTERVAL = "1d"
WORKERS = 8
RETRIES = 4
MIN_VALUE_LIQUID = 2_000_000_000  # Rp 2 miliar, rata-rata 20 hari
VOL_SPIKE = 1.8
NEAR_HIGH = 0.80

RSS_FEEDS = [
    {
        "id": "cnbc-market",
        "name": "CNBC Indonesia Market",
        "url": "https://www.cnbcindonesia.com/market/rss",
    },
    {
        "id": "kontan-investasi",
        "name": "Kontan Investasi",
        "url": "https://investasi.kontan.co.id/rss",
    },
    {
        "id": "idxchannel",
        "name": "IDX Channel",
        "url": "https://www.idxchannel.com/rss",
    },
]


def now_wib() -> dt.datetime:
    return dt.datetime.now(WIB)


def iso(t: dt.datetime) -> str:
    return t.isoformat(timespec="seconds")


def ymd(ts: int | float) -> str:
    return dt.datetime.fromtimestamp(int(ts), WIB).strftime("%Y-%m-%d")


def http_get(url: str, timeout: int = 25) -> bytes:
    req = Request(url, headers={"User-Agent": UA, "Accept": "*/*"})
    with urlopen(req, timeout=timeout) as res:
        return res.read()


def fetch_bytes(url: str, retries: int = RETRIES) -> bytes:
    last = None
    for i in range(retries):
        try:
            return http_get(url)
        except HTTPError as e:
            last = e
            if e.code in (429, 500, 502, 503, 504) or e.code == 401:
                time.sleep(1.2 * (i + 1))
                continue
            raise
        except (URLError, TimeoutError, OSError) as e:
            last = e
            time.sleep(0.8 * (i + 1))
    raise last  # type: ignore


def load_universe() -> list[dict]:
    path = DATA / "universe.csv"
    rows = []
    with path.open(encoding="utf-8") as f:
        for r in csv.DictReader(f):
            code = (r.get("code") or "").strip().upper()
            if not code:
                continue
            shares = r.get("shares")
            try:
                shares_f = float(shares) if shares not in (None, "") else None
            except ValueError:
                shares_f = None
            rows.append(
                {
                    "code": code,
                    "name": (r.get("name") or code).strip(),
                    "board": (r.get("board") or "").strip(),
                    "shares": shares_f,
                    "listed": (r.get("listed") or "").strip(),
                }
            )
    return rows


def tick_size(price: float) -> int:
    if price < 200:
        return 1
    if price < 500:
        return 2
    if price < 2000:
        return 5
    if price < 5000:
        return 10
    return 25


def round_tick(price: float, up: bool = False) -> float:
    if price is None or not math.isfinite(price) or price <= 0:
        return 0.0
    t = tick_size(price)
    if up:
        return float(math.ceil(price / t) * t)
    return float(math.floor(price / t) * t)


def ara_arb(prev: float) -> dict:
    """Batasan transisi Kep-00158/BEI/10-2026 (20 Okt–31 Des 2026),
    papan Utama/Pengembangan/Ekonomi Baru."""
    p = prev
    if p <= 10:
        return {"ara_pct": None, "arb_pct": None, "ara_rp": 1, "arb_rp": 1, "note": "Rp1–10: ARA/ARB Rp1"}
    if 11 <= p <= 14:
        return {"ara_pct": 0.35, "arb_pct": None, "ara_rp": None, "arb_rp": 1, "note": "Rp11–14: ARA 35%, ARB Rp1"}
    if 15 <= p <= 200:
        return {"ara_pct": 0.35, "arb_pct": 0.07, "ara_rp": None, "arb_rp": None, "note": "Rp15–200: ARA 35%, ARB 7%"}
    if p <= 5000:
        return {"ara_pct": 0.25, "arb_pct": 0.07, "ara_rp": None, "arb_rp": None, "note": ">Rp200–5.000: ARA 25%, ARB 7%"}
    return {"ara_pct": 0.20, "arb_pct": 0.07, "ara_rp": None, "arb_rp": None, "note": ">Rp5.000: ARA 20%, ARB 7%"}


def ara_price(prev: float) -> float:
    b = ara_arb(prev)
    if b["ara_rp"] is not None:
        return round_tick(prev + b["ara_rp"], up=True)
    return round_tick(prev * (1 + b["ara_pct"]), up=True)


def clean_floats(xs: list) -> list[float | None]:
    out = []
    for x in xs:
        if x is None:
            out.append(None)
        else:
            try:
                v = float(x)
                out.append(v if math.isfinite(v) else None)
            except (TypeError, ValueError):
                out.append(None)
    return out


def sma(values: list[float | None], n: int, i: int) -> float | None:
    if i + 1 < n:
        return None
    chunk = values[i - n + 1 : i + 1]
    if any(v is None for v in chunk):
        return None
    return sum(chunk) / n  # type: ignore


def wilder(values: list[float], n: int) -> list[float | None]:
    out: list[float | None] = [None] * len(values)
    if len(values) < n:
        return out
    first = sum(values[:n]) / n
    out[n - 1] = first
    prev = first
    for i in range(n, len(values)):
        prev = (prev * (n - 1) + values[i]) / n
        out[i] = prev
    return out


def rsi_series(closes: list[float | None], n: int = 14) -> list[float | None]:
    gains, losses = [], []
    for i in range(len(closes)):
        if i == 0 or closes[i] is None or closes[i - 1] is None:
            gains.append(0.0)
            losses.append(0.0)
            continue
        d = closes[i] - closes[i - 1]  # type: ignore
        gains.append(max(d, 0.0))
        losses.append(max(-d, 0.0))
    avg_g = wilder(gains, n)
    avg_l = wilder(losses, n)
    out: list[float | None] = [None] * len(closes)
    for i, (g, l) in enumerate(zip(avg_g, avg_l)):
        if g is None or l is None:
            continue
        if l == 0:
            out[i] = 100.0 if g > 0 else 50.0
        else:
            rs = g / l
            out[i] = 100.0 - (100.0 / (1.0 + rs))
    return out


def atr_series(h, l, c, n=14) -> list[float | None]:
    tr = []
    for i in range(len(c)):
        if h[i] is None or l[i] is None or c[i] is None:
            tr.append(0.0)
            continue
        if i == 0 or c[i - 1] is None:
            tr.append(h[i] - l[i])
            continue
        tr.append(max(h[i] - l[i], abs(h[i] - c[i - 1]), abs(l[i] - c[i - 1])))
    return wilder(tr, n)


def last_valid(xs, i=None):
    end = len(xs) if i is None else i + 1
    for j in range(end - 1, -1, -1):
        if xs[j] is not None:
            return xs[j], j
    return None, None


def parse_chart(payload: dict, code: str) -> dict | None:
    err = (payload.get("chart") or {}).get("error")
    results = (payload.get("chart") or {}).get("result") or []
    if err or not results:
        return None
    r = results[0]
    meta = r.get("meta") or {}
    ts = r.get("timestamp") or []
    quote = (r.get("indicators") or {}).get("quote") or [{}]
    q = quote[0] if quote else {}
    o = clean_floats(q.get("open") or [])
    h = clean_floats(q.get("high") or [])
    l = clean_floats(q.get("low") or [])
    c = clean_floats(q.get("close") or [])
    v = clean_floats(q.get("volume") or [])
    n = min(len(ts), len(o), len(h), len(l), len(c), len(v))
    if n < 5:
        return None
    ts, o, h, l, c, v = ts[:n], o[:n], h[:n], l[:n], c[:n], v[:n]
    # drop bars that are completely empty
    keep = [i for i in range(n) if c[i] is not None and h[i] is not None and l[i] is not None]
    if len(keep) < 5:
        return None
    ts = [ts[i] for i in keep]
    o = [o[i] if o[i] is not None else c[i] for i in keep]
    h = [h[i] for i in keep]
    l = [l[i] for i in keep]
    c = [c[i] for i in keep]
    v = [v[i] if v[i] is not None else 0.0 for i in keep]

    divs = []
    splits = []
    ev = r.get("events") or {}
    for item in (ev.get("dividends") or {}).values():
        try:
            divs.append({"ex": ymd(item["date"]), "dps": float(item["amount"]), "ts": int(item["date"])})
        except (KeyError, TypeError, ValueError):
            continue
    divs.sort(key=lambda x: x["ts"])
    for item in (ev.get("splits") or {}).values():
        try:
            splits.append(
                {
                    "date": ymd(item["date"]),
                    "numerator": item.get("numerator"),
                    "denominator": item.get("denominator"),
                    "ts": int(item["date"]),
                }
            )
        except (KeyError, TypeError, ValueError):
            continue

    return {
        "code": code,
        "meta": meta,
        "ts": ts,
        "o": o,
        "h": h,
        "l": l,
        "c": c,
        "v": v,
        "divs": divs,
        "splits": splits,
    }


def fetch_ticker(symbol: str, code: str) -> dict:
    cache = CACHE / f"{code}.json"
    url = (
        f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}"
        f"?range={RANGE}&interval={INTERVAL}&events=div%7Csplit&includePrePost=false"
    )
    raw = fetch_bytes(url)
    payload = json.loads(raw.decode("utf-8"))
    parsed = parse_chart(payload, code)
    if parsed is None:
        raise RuntimeError(f"chart kosong/error untuk {symbol}: {payload.get('chart', {}).get('error')}")
    cache.parent.mkdir(parents=True, exist_ok=True)
    # compact cache without giant meta
    slim = {
        "code": code,
        "symbol": symbol,
        "saved_at": iso(now_wib()),
        "meta": {
            k: parsed["meta"].get(k)
            for k in (
                "currency",
                "symbol",
                "shortName",
                "longName",
                "regularMarketPrice",
                "regularMarketTime",
                "regularMarketVolume",
                "regularMarketChangePercent",
                "regularMarketDayHigh",
                "regularMarketDayLow",
                "fiftyTwoWeekHigh",
                "fiftyTwoWeekLow",
                "exchangeName",
                "exchangeTimezoneName",
            )
        },
        "ts": parsed["ts"],
        "o": parsed["o"],
        "h": parsed["h"],
        "l": parsed["l"],
        "c": parsed["c"],
        "v": parsed["v"],
        "divs": parsed["divs"],
        "splits": parsed["splits"],
    }
    cache.write_text(json.dumps(slim, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    return slim


def load_cache(code: str) -> dict | None:
    p = CACHE / f"{code}.json"
    if not p.exists():
        return None
    try:
        return json.loads(p.read_text(encoding="utf-8"))
    except Exception:
        return None


def rolling_max(xs, i, n, lookback_only=True):
    # max of xs[i-n:i] (exclude today if lookback_only)
    start = i - n
    end = i if lookback_only else i + 1
    if start < 0:
        start = 0
    if end - start < 1:
        return None
    chunk = [x for x in xs[start:end] if x is not None]
    return max(chunk) if chunk else None


def rolling_min(xs, i, n, lookback_only=True):
    start = i - n
    end = i if lookback_only else i + 1
    if start < 0:
        start = 0
    if end - start < 1:
        return None
    chunk = [x for x in xs[start:end] if x is not None]
    return min(chunk) if chunk else None


def rolling_mean(xs, i, n, lookback_only=False):
    start = i - n + (0 if lookback_only else 1)
    if lookback_only:
        start = i - n
        end = i
    else:
        start = i - n + 1
        end = i + 1
    if start < 0:
        return None
    chunk = xs[start:end]
    if len(chunk) < n or any(x is None for x in chunk):
        return None
    return sum(chunk) / n


def indicators_at(ch: dict, i: int) -> dict | None:
    c, h, l, o, v = ch["c"], ch["h"], ch["l"], ch["o"], ch["v"]
    if i < 20 or c[i] is None:
        return None
    close = c[i]
    prev = c[i - 1] if i else None
    high20 = rolling_max(h, i, 20, True)
    low20 = rolling_min(l, i, 20, True)
    sma20 = rolling_mean(c, i, 20, False)
    sma50 = rolling_mean(c, i, 50, False) if i >= 49 else None
    sma200 = rolling_mean(c, i, 200, False) if i >= 199 else None
    vol20 = rolling_mean(v, i, 20, False)
    vol_prev20 = rolling_mean(v, i, 20, True)  # exclude today for spike vs avg
    # use prior 20d avg volume for spike (more honest)
    vol_base = vol_prev20 if vol_prev20 and vol_prev20 > 0 else vol20
    vol_ratio = (v[i] / vol_base) if vol_base else None
    value = close * (v[i] or 0)
    value20 = None
    if i >= 20:
        vals = []
        for j in range(i - 19, i + 1):
            if c[j] is not None and v[j] is not None:
                vals.append(c[j] * v[j])
        if len(vals) >= 15:
            value20 = sum(vals) / len(vals)
    rng = (h[i] - l[i]) if (h[i] is not None and l[i] is not None and h[i] != l[i]) else None
    close_loc = ((close - l[i]) / rng) if rng else None
    chg = ((close / prev) - 1) if prev else None
    gap = ((o[i] / prev) - 1) if (prev and o[i]) else None
    return {
        "close": close,
        "open": o[i],
        "high": h[i],
        "low": l[i],
        "prev": prev,
        "volume": v[i],
        "value": value,
        "value20": value20,
        "vol_ratio": vol_ratio,
        "high20": high20,
        "low20": low20,
        "sma20": sma20,
        "sma50": sma50,
        "sma200": sma200,
        "chg": chg,
        "gap": gap,
        "close_loc": close_loc,
    }


def obv_series(c, v) -> list[float]:
    out = [0.0] * len(c)
    for i in range(1, len(c)):
        prev = out[i - 1]
        if c[i] is None or c[i - 1] is None:
            out[i] = prev
        elif c[i] > c[i - 1]:
            out[i] = prev + (v[i] or 0)
        elif c[i] < c[i - 1]:
            out[i] = prev - (v[i] or 0)
        else:
            out[i] = prev
    return out


def ad_series(h, l, c, v) -> list[float]:
    out = [0.0] * len(c)
    for i in range(len(c)):
        if i:
            prev = out[i - 1]
        else:
            prev = 0.0
        if h[i] is None or l[i] is None or c[i] is None or h[i] == l[i]:
            out[i] = prev
            continue
        clv = ((c[i] - l[i]) - (h[i] - c[i])) / (h[i] - l[i])
        out[i] = prev + clv * (v[i] or 0)
    return out


def precompute_series(ch: dict) -> dict:
    c, h, l, v = ch["c"], ch["h"], ch["l"], ch["v"]
    rsi = rsi_series(c, 14)
    atr = atr_series(h, l, c, 14)
    return {"rsi": rsi, "atr": atr, "obv" : obv_series(c, v), "ad": ad_series(h, l, c, v)}


def detect_order_blocks(ch: dict, atr: list) -> list[dict]:
    """Order block mekanis: candle berlawanan terakhir sebelum displacement (badan ≥ 1,4× ATR).
    Bukan bukti antrian order / bandar. Bull: demand. Bear: supply.
    Termitigasi jika sumbu kemudian menembus sisi jauh zona."""
    o, h, l, c, ts = ch["o"], ch["h"], ch["l"], ch["c"], ch["ts"]
    n = len(c)
    raw = []
    for i in range(8, n):
        if any(x is None for x in (o[i], h[i], l[i], c[i])) or not atr[i]:
            continue
        body = abs(c[i] - o[i])
        if body < 1.4 * atr[i]:
            continue
        up = c[i] > o[i]
        found = None
        for k in range(1, 7):
            j = i - k
            if j < 0 or o[j] is None or c[j] is None or l[j] is None or h[j] is None:
                continue
            if up and c[j] < o[j]:
                found = j
                break
            if (not up) and c[j] > o[j]:
                found = j
                break
        if found is None:
            continue
        j = found
        zlo, zhi = min(l[j], o[j], c[j]), max(h[j], o[j], c[j])
        if zhi <= zlo:
            continue
        raw.append({
            "side": "bull" if up else "bear",
            "low": round(float(zlo), 2),
            "high": round(float(zhi), 2),
            "formed": ymd(ts[j]),
            "disp": ymd(ts[i]),
            "fi": j,
            "di": i,
        })
    # mitigate after displacement
    for ob in raw:
        mit, md = False, None
        for k in range(ob["di"] + 1, n):
            if ob["side"] == "bull" and l[k] is not None and l[k] <= ob["low"]:
                mit, md = True, ymd(ts[k])
                break
            if ob["side"] == "bear" and h[k] is not None and h[k] >= ob["high"]:
                mit, md = True, ymd(ts[k])
                break
        ob["mitigated"] = mit
        ob["mitigated_on"] = md
    return raw



def _obs_in_window(obs, ch, i, lookback=80):
    start = max(0, i - lookback + 1)
    ls = [x for x in ch["l"][start : i + 1] if x is not None]
    hs = [x for x in ch["h"][start : i + 1] if x is not None]
    if not ls or not hs:
        return obs
    lo, hi = min(ls) * 0.97, max(hs) * 1.03
    return [ob for ob in obs if not (ob["high"] < lo or ob["low"] > hi)]


def slim_obs(obs: list[dict], last_i: int, limit_unmit=6, limit_mit=3) -> list[dict]:
    unmit, mit = [], []
    for ob in reversed(obs):
        if ob["di"] > last_i:
            continue
        # if mitigated after last_i, treat as unmit at last_i
        item = {k: ob[k] for k in ("side", "low", "high", "formed", "disp", "mitigated", "mitigated_on")}
        if ob["mitigated"] and ob["mitigated_on"]:
            # keep as mitigated only if mitigation date is on or before last bar date — already is
            pass
        if not ob["mitigated"]:
            if len(unmit) < limit_unmit:
                unmit.append(item)
        else:
            if len(mit) < limit_mit:
                mit.append(item)
    return list(reversed(unmit + mit))


def ob_context(obs: list[dict], ch: dict, i: int) -> dict:
    close, high, low = ch["c"][i], ch["h"][i], ch["l"][i]
    last_date = ymd(ch["ts"][i])
    near_bull = near_bear = inside_bull = inside_bear = False
    zone = None
    for ob in obs:
        if ob["di"] > i:
            continue
        # unmitigated as of bar i: no mitigation, or mitigated_on after this bar
        mit = ob["mitigated"] and ob["mitigated_on"] and ob["mitigated_on"] <= last_date
        # if mitigation happens on this bar, still "inside" but flagged mitigated today
        if mit and ob["mitigated_on"] < last_date:
            continue
        if close is None:
            continue
        zlo, zhi = ob["low"], ob["high"]
        mid_ok = (low is not None and high is not None and low <= zhi and high >= zlo) or (zlo <= close <= zhi)
        dist = 0.0 if mid_ok else min(abs(close - zlo), abs(close - zhi)) / close
        near = mid_ok or dist <= 0.015
        if not near:
            continue
        if ob["side"] == "bull":
            near_bull = True
            inside_bull = inside_bull or mid_ok
            if zone is None or ob["side"] == "bull":
                zone = ob
        else:
            near_bear = True
            inside_bear = inside_bear or mid_ok
            if zone is None:
                zone = ob
    return {
        "near_bull": near_bull,
        "near_bear": near_bear,
        "inside_bull": inside_bull,
        "inside_bear": inside_bear,
        "zone": zone,
    }


def is_ikut_bandar(ind: dict, series: dict, i: int) -> tuple[bool, list[str]]:
    """Akumulasi tidak biasa berbasis volume/harga — BUKAN broker summary / foreign flow."""
    reasons = []
    vol_ratio = ind.get("vol_ratio") or 0
    value20 = ind.get("value20") or 0
    chg = ind.get("chg")
    close_loc = ind.get("close_loc")
    high20 = ind.get("high20")
    close = ind.get("close")
    if value20 < MIN_VALUE_LIQUID:
        return False, reasons
    if vol_ratio < VOL_SPIKE:
        return False, reasons
    if chg is None or chg <= 0:
        return False, reasons
    if close_loc is None or close_loc < NEAR_HIGH:
        return False, reasons
    reasons.append(f"Volume {vol_ratio:.2f}× rata-rata 20 hari, harga naik, tutup dekat high")
    obv, ad = series.get("obv") or [], series.get("ad") or []
    flow = False
    if i >= 5 and obv and obv[i] > obv[i - 5]:
        flow = True
        reasons.append("OBV 5 hari naik (akumulasi kasar dari volume)")
    if i >= 5 and ad and ad[i] > ad[i - 5]:
        flow = True
        reasons.append("Accumulation/Distribution 5 hari naik")
    if not flow:
        return False, []
    base = high20 is not None and close is not None and close >= high20
    if not base:
        return False, []
    reasons.append("Breakout dari base: tutup di atas highest 20 hari")
    return True, reasons


def classify_signal(ind: dict, rsi: float | None, atr: float | None) -> dict:
    """Aturan mekanis (bukan saran). BELI / TUNGGU / JUAL."""
    reasons = []
    close = ind["close"]
    sma20, sma50 = ind["sma20"], ind["sma50"]
    high20, low20 = ind["high20"], ind["low20"]
    vol_ratio = ind["vol_ratio"] or 0.0
    close_loc = ind["close_loc"]
    chg = ind["chg"]
    value20 = ind["value20"] or 0.0
    thin = value20 < MIN_VALUE_LIQUID

    uptrend = sma20 and sma50 and sma20 > sma50 and close > sma20
    downtrend = sma20 and sma50 and sma20 < sma50 and close < sma20
    if uptrend:
        reasons.append("Tren naik: SMA20 di atas SMA50 dan harga di atas SMA20")
    elif downtrend:
        reasons.append("Tren turun: SMA20 di bawah SMA50 dan harga di bawah SMA20")
    elif sma20 and sma50:
        reasons.append("Sideways: SMA20 dan SMA50 tidak searah dengan harga")

    breakout = high20 is not None and close >= high20 and vol_ratio >= 1.5
    if high20 is not None and close >= high20:
        if vol_ratio >= 1.5:
            reasons.append(f"Breakout tutup di atas highest 20 hari, volume {vol_ratio:.2f}× rata-rata 20 hari")
        else:
            reasons.append(f"Tutup di atas highest 20 hari, tapi volume hanya {vol_ratio:.2f}× (kurang konfirmasi)")

    retest = False
    if uptrend and sma20 and ind["low"] is not None:
        # sentuh zona SMA20 / support 20d lalu tutup kuat
        near_sup = ind["low"] <= sma20 * 1.015 or (low20 and ind["low"] <= low20 * 1.02)
        bounce = close > sma20 and (close_loc is None or close_loc >= 0.6)
        if near_sup and bounce and vol_ratio >= 1.2:
            retest = True
            reasons.append("Retest support/SMA20 di tren naik, tutup kuat dengan volume terkonfirmasi")

    sell = False
    if downtrend and close < (sma20 or close):
        sell = True
    if low20 is not None and close < low20:
        sell = True
        reasons.append("Tutup di bawah lowest 20 hari (support pecah)")
    elif downtrend:
        reasons.append("Harga dan rata-rata sudah tren turun — sinyal keluar untuk yang masih pegang")

    status = "TUNGGU"
    kind = "none"
    if breakout or retest:
        status = "BELI"
        kind = "breakout" if breakout else "retest"
    elif sell:
        status = "JUAL"
        kind = "breakdown"

    if rsi is not None:
        if rsi >= 70:
            reasons.append(f"RSI14 {rsi:.1f} (jenuh beli — hati-hati kejar harga)")
        elif rsi <= 30:
            reasons.append(f"RSI14 {rsi:.1f} (jenuh jual — belum otomatis berarti beli)")
        else:
            reasons.append(f"RSI14 {rsi:.1f}")

    if close_loc is not None and close_loc >= NEAR_HIGH:
        reasons.append("Tutup dekat harga tertinggi hari ini")
    if ind["gap"] is not None and ind["gap"] >= 0.02:
        reasons.append(f"Gap naik {ind['gap']*100:.1f}% di pembukaan")
    if thin:
        reasons.append("Likuiditas 20 hari di bawah Rp2 miliar — hati-hati selisih harga")

    # rencana entry/SL/TP
    entry = close
    if kind == "breakout" and high20:
        sl = round_tick(min(ind["low"], high20 * 0.97, close - (atr or close * 0.03)))
    elif kind == "retest" and sma20:
        sl = round_tick(min(ind["low"], sma20 * 0.97, close - (atr or close * 0.03)))
    else:
        sl = round_tick(close - (atr * 1.5 if atr else close * 0.04))
    if sl <= 0 or sl >= close:
        sl = round_tick(close * 0.96)
    risk = close - sl
    tp1 = round_tick(close + 1.5 * risk, up=True)
    tp2 = round_tick(close + 3.0 * risk, up=True)
    # jangan janji TP di atas ARA sehari
    if ind["prev"]:
        ara = ara_price(ind["prev"])
    else:
        ara = ara_price(close)
    entry_lo = round_tick(close * 0.995)
    entry_hi = round_tick(min(close * 1.01, ara), up=True)
    if entry_hi < entry_lo:
        entry_hi = round_tick(close, up=True)

    return {
        "status": status,
        "kind": kind,
        "reasons": reasons,
        "entry_lo": entry_lo,
        "entry_hi": entry_hi,
        "sl": sl,
        "tp1": tp1,
        "tp2": tp2,
        "risk": risk,
        "ara": ara,
        "thin": thin,
        "breakout": bool(breakout),
        "retest": bool(retest),
        "uptrend": bool(uptrend),
        "downtrend": bool(downtrend),
        "screener": bool(
            (vol_ratio >= VOL_SPIKE)
            and (value20 >= MIN_VALUE_LIQUID)
            and (
                (high20 is not None and close >= high20)
                or (close_loc is not None and close_loc >= NEAR_HIGH and chg is not None and chg >= 0.03)
            )
        ),
    }


def trailing_dps(divs: list[dict], last_date: str, months: int = 12) -> float | None:
    if not divs:
        return None
    end = dt.date.fromisoformat(last_date)
    start = date_add_months(end, -months)
    total = 0.0
    n = 0
    for d in divs:
        ex = dt.date.fromisoformat(d["ex"])
        if start < ex <= end:
            total += d["dps"]
            n += 1
    return total if n else None


def date_add_months(d: dt.date, months: int) -> dt.date:
    y = d.year + (d.month - 1 + months) // 12
    m = (d.month - 1 + months) % 12 + 1
    day = min(d.day, [31, 29 if y % 4 == 0 and (y % 100 != 0 or y % 400 == 0) else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1])
    return dt.date(y, m, day)


def prev_trading_day(dates: list[str], ex: str) -> str | None:
    prev = None
    for d in dates:
        if d >= ex:
            return prev
        prev = d
    return prev


def estimate_next_div(divs: list[dict], last_date: str) -> dict | None:
    """Perkiraan kasar dari pola tahun sebelumnya, bukan pengumuman resmi."""
    if len(divs) < 2:
        return None
    last = dt.date.fromisoformat(last_date)
    # group by month-day pattern year over year
    by_md: dict[str, list] = {}
    for d in divs:
        ex = dt.date.fromisoformat(d["ex"])
        key = ex.strftime("%m")
        by_md.setdefault(key, []).append(d)
    cands = []
    for d in divs:
        ex = dt.date.fromisoformat(d["ex"])
        guess = ex.replace(year=last.year) if ex.month > 1 or ex.day >= 1 else ex
        try:
            guess = dt.date(last.year, ex.month, min(ex.day, 28 if ex.month == 2 else ex.day))
        except ValueError:
            continue
        if guess <= last:
            try:
                guess = dt.date(last.year + 1, ex.month, min(ex.day, 28 if ex.month == 2 else ex.day))
            except ValueError:
                continue
        # only if this month appeared at least twice historically or last year same month
        month_hits = by_md.get(ex.strftime("%m"), [])
        if len(month_hits) >= 2 or (last.year - ex.year == 1):
            cands.append((guess, d["dps"], ex))
    if not cands:
        return None
    cands.sort(key=lambda x: x[0])
    g, dps, src = cands[0]
    if (g - last).days > 400:
        return None
    return {
        "ex_perkiraan": g.isoformat(),
        "dps_perkiraan": dps,
        "berdasarkan_ex": src.isoformat(),
        "catatan": "Perkiraan dari pola ex-date tahun lalu, bukan jadwal resmi emiten/KSEI/BEI",
    }



def _best_name(uni, meta):
    import re
    u = (uni.get("name") or "").strip()
    y = (meta.get("longName") or meta.get("shortName") or "").strip()
    if not u:
        return y or uni["code"]
    if not y:
        return u

    def norm(s):
        s = re.sub(r"\s+", " ", s.lower())
        s = re.sub(r"\s*\(persero\)\s*", " ", s)
        s = re.sub(r"\s*tbk\.?$", "", s).strip()
        return s

    nu, ny = norm(u), norm(y)
    name = y if nu and ny and (nu in ny or ny in nu) and len(y) >= len(u) else u
    if name.endswith(" Tb"):
        name += "k"
    elif name.endswith(" T"):
        name += "bk"
    return name


def summarize_stock(uni: dict, ch: dict) -> dict:
    series = precompute_series(ch)
    i = len(ch["c"]) - 1
    ind = indicators_at(ch, i)
    if not ind:
        raise RuntimeError("indikator kurang bar")
    rsi = series["rsi"][i]
    atr = series["atr"][i]
    sig = classify_signal(ind, rsi, atr)
    last_date = ymd(ch["ts"][i])
    all_obs = detect_order_blocks(ch, series["atr"])
    ctx = ob_context(all_obs, ch, i)
    if ctx["inside_bull"] or ctx["near_bull"]:
        z = ctx["zone"]
        where = "di dalam" if ctx["inside_bull"] else "dekat"
        formed = z["formed"] if z else "?"
        sig["reasons"].append(
            f"Harga {where} order block naik yang belum termitigasi (zona {formed}) — konfirmasi, bukan bukti ada bandar"
        )
    elif ctx["inside_bear"] or ctx["near_bear"]:
        z = ctx["zone"]
        where = "di dalam" if ctx["inside_bear"] else "dekat"
        formed = z["formed"] if z else "?"
        sig["reasons"].append(
            f"Harga {where} order block turun yang belum termitigasi (zona {formed})"
        )
    ib, ib_reasons = is_ikut_bandar(ind, series, i)
    if ib:
        sig["reasons"].extend(ib_reasons)
    dates = [ymd(t) for t in ch["ts"]]
    meta = ch.get("meta") or {}
    price = ind["close"]
    # prefer last bar close; also keep official regularMarketPrice if same day
    rmp = meta.get("regularMarketPrice")
    rmt = meta.get("regularMarketTime")
    if rmp and rmt and ymd(rmt) == last_date:
        # already should match close
        pass
    spark = [round(x, 2) if x is not None else None for x in ch["c"][-60:]]
    dps_ttm = trailing_dps(ch["divs"], last_date, 12)
    yield_ttm = (dps_ttm / price) if (dps_ttm and price) else None
    last_div = ch["divs"][-1] if ch["divs"] else None
    cum = prev_trading_day(dates, last_div["ex"]) if last_div else None
    divs_out = []
    for d in ch["divs"][-8:]:
        divs_out.append(
            {
                "ex": d["ex"],
                "dps": d["dps"],
                "cum_perkiraan": prev_trading_day(dates, d["ex"]),
                "source": "Yahoo Finance chart events (biasanya ex-date)",
            }
        )
    nxt = estimate_next_div(ch["divs"], last_date)
    chg_pct = (ind["chg"] * 100) if ind["chg"] is not None else None
    return {
        "code": uni["code"],
        "name": _best_name(uni, meta),
        "board": uni["board"],
        "listed": uni["listed"],
        "shares": uni["shares"],
        "yahoo_name": meta.get("shortName") or meta.get("longName"),
        "date": last_date,
        "price": price,
        "prev": ind["prev"],
        "open": ind["open"],
        "high": ind["high"],
        "low": ind["low"],
        "chg_pct": None if chg_pct is None else round(chg_pct, 2),
        "volume": ind["volume"],
        "value": ind["value"],
        "value20": ind["value20"],
        "vol_ratio": None if not ind["vol_ratio"] else round(ind["vol_ratio"], 2),
        "sma20": None if not ind["sma20"] else round(ind["sma20"], 2),
        "sma50": None if not ind["sma50"] else round(ind["sma50"], 2),
        "sma200": None if not ind["sma200"] else round(ind["sma200"], 2),
        "high20": ind["high20"],
        "low20": ind["low20"],
        "rsi14": None if rsi is None else round(rsi, 1),
        "atr14": None if atr is None else round(atr, 2),
        "close_loc": None if ind["close_loc"] is None else round(ind["close_loc"], 2),
        "gap_pct": None if ind["gap"] is None else round(ind["gap"] * 100, 2),
        "w52_high": meta.get("fiftyTwoWeekHigh"),
        "w52_low": meta.get("fiftyTwoWeekLow"),
        "lot_cost": price * 100,
        "signal": sig["status"],
        "signal_kind": sig["kind"],
        "entry_lo": sig["entry_lo"],
        "entry_hi": sig["entry_hi"],
        "sl": sig["sl"],
        "tp1": sig["tp1"],
        "tp2": sig["tp2"],
        "ara": sig["ara"],
        "reasons": sig["reasons"],
        "screener": sig["screener"],
        "thin": sig["thin"],
        "uptrend": sig["uptrend"],
        "downtrend": sig["downtrend"],
        "breakout": sig["breakout"],
        "retest": sig["retest"],
        "divs": divs_out,
        "dps_ttm": dps_ttm,
        "yield_ttm": None if yield_ttm is None else round(yield_ttm * 100, 2),
        "last_ex": last_div["ex"] if last_div else None,
        "last_dps": last_div["dps"] if last_div else None,
        "last_cum_perkiraan": cum,
        "next_div_perkiraan": nxt,
        "spark": spark,
        "bars": len(ch["c"]),
        "first_date": ymd(ch["ts"][0]),
        "splits": ch.get("splits") or [],
        "currency": (ch.get("meta") or {}).get("currency") or "IDR",
        "ikut_bandar": bool(ib),
        "ob_near": ("bull" if (ctx["inside_bull"] or ctx["near_bull"]) else ("bear" if (ctx["inside_bear"] or ctx["near_bear"]) else None)),
        "obs": slim_obs(_obs_in_window(all_obs, ch, i), i),
        "ohlc": {
            "dates": [ymd(x) for x in ch["ts"][-80:]],
            "o": [None if x is None else round(float(x), 2) for x in ch["o"][-80:]],
            "h": [None if x is None else round(float(x), 2) for x in ch["h"][-80:]],
            "l": [None if x is None else round(float(x), 2) for x in ch["l"][-80:]],
            "c": [None if x is None else round(float(x), 2) for x in ch["c"][-80:]],
        },
    }


def is_liquid_row(row: dict) -> bool:
    v = row.get("value20") or 0
    if v < MIN_VALUE_LIQUID:
        return False
    if (row.get("board") or "").lower().startswith("pemantauan"):
        return False
    return True


def backtest_all(charts: dict[str, dict], uni_map: dict) -> dict:
    """Hitung statistik dari sejarah nyata. Return angka mentah + definisi aturan."""
    # collect daily IHSG not required
    setups = {
        "A_vol_spike": "Volume ≥ 1,8× rata-rata 20 hari, nilai transaksi 20 hari ≥ Rp2 miliar",
        "B_breakout_vol": "Tutup ≥ highest 20 hari + volume ≥ 1,5× + nilai 20 hari ≥ Rp2 miliar",
        "C_screener": "Sinyal 'potensi naik kuat' di app: volume ≥ 1,8× dan (breakout 20 hari atau tutup dekat high + naik ≥ 3%), likuid Rp2 miliar",
        "D_beli_aturan": "Sinyal BELI (breakout bervolume atau retest support di tren naik)",
        "E_ikut_bandar": "Ikut Bandar (volume-based): likuid Rp2 miliar, volume ≥ 1,8×, harga naik, tutup dekat high, OBV atau A/D 5 hari naik, breakout highest 20 hari. Bukan broker summary/foreign flow.",
    }
    buckets = {k: {"rets": [], "rets5": [], "n_no_next": 0} for k in setups}

    trades = []  # for rule D hold to SL/TP1
    for code, ch in charts.items():
        c, h, l, o, v = ch["c"], ch["h"], ch["l"], ch["o"], ch["v"]
        series = precompute_series(ch)
        n = len(c)
        for i in range(20, n - 1):
            ind = indicators_at(ch, i)
            if not ind or not ind["prev"]:
                continue
            nxt = c[i + 1]
            if nxt is None or ind["close"] is None:
                continue
            ret = nxt / ind["close"] - 1
            rsi = series["rsi"][i]
            atr = series["atr"][i]
            sig = classify_signal(ind, rsi, atr)
            vol_ratio = ind["vol_ratio"] or 0
            value20 = ind["value20"] or 0
            high20 = ind["high20"]
            close_loc = ind["close_loc"]
            chg = ind["chg"]
            liquid = value20 >= MIN_VALUE_LIQUID
            if liquid and vol_ratio >= VOL_SPIKE:
                buckets["A_vol_spike"]["rets"].append(ret)
            if liquid and high20 is not None and ind["close"] >= high20 and vol_ratio >= 1.5:
                buckets["B_breakout_vol"]["rets"].append(ret)
            if sig["screener"]:
                buckets["C_screener"]["rets"].append(ret)
            ib, _ibr = is_ikut_bandar(ind, series, i)
            if ib:
                buckets["E_ikut_bandar"]["rets"].append(ret)
                if i + 5 < n and c[i + 5] is not None:
                    buckets["E_ikut_bandar"]["rets5"].append(c[i + 5] / ind["close"] - 1)
            if sig["status"] == "BELI":
                buckets["D_beli_aturan"]["rets"].append(ret)
                # trade simulation: fill next open, else next close
                entry = o[i + 1] if o[i + 1] else c[i + 1]
                if not entry:
                    continue
                sl, tp1 = sig["sl"], sig["tp1"]
                exit_px, exit_why, hold = None, None, None
                last = min(n - 1, i + 20)
                for j in range(i + 1, last + 1):
                    # conservative: if both SL and TP touched, count SL
                    hit_sl = l[j] is not None and l[j] <= sl
                    hit_tp = h[j] is not None and h[j] >= tp1
                    if j == i + 1 and o[j] is not None and o[j] <= sl:
                        exit_px, exit_why, hold = o[j], "gap_sl", j - i
                        break
                    if hit_sl and hit_tp:
                        exit_px, exit_why, hold = sl, "sl_same_day_conservative", j - i
                        break
                    if hit_sl:
                        exit_px, exit_why, hold = sl, "sl", j - i
                        break
                    if hit_tp:
                        exit_px, exit_why, hold = tp1, "tp1", j - i
                        break
                    # sell rule on close
                    indj = indicators_at(ch, j)
                    if indj:
                        sj = classify_signal(indj, series["rsi"][j], series["atr"][j])
                        if sj["status"] == "JUAL":
                            exit_px, exit_why, hold = c[j], "sinyal_jual", j - i
                            break
                if exit_px is None:
                    exit_px, exit_why, hold = c[last], "time_20d", last - i
                if exit_px and entry:
                    trades.append(exit_px / entry - 1)

    def pack(rets: list[float]) -> dict:
        n = len(rets)
        if n == 0:
            return {"n": 0, "pct_ge_10": None, "pct_ge_5": None, "pct_ge_0": None, "pct_le_m5": None,
                    "median_pct": None, "avg_pct": None, "n_ge_10": 0, "n_ge_5": 0, "n_ge_0": 0, "n_le_m5": 0}
        n10 = sum(1 for x in rets if x >= 0.10)
        n5 = sum(1 for x in rets if x >= 0.05)
        n0 = sum(1 for x in rets if x >= 0)
        nm5 = sum(1 for x in rets if x <= -0.05)
        return {
            "n": n,
            "n_ge_10": n10,
            "n_ge_5": n5,
            "n_ge_0": n0,
            "n_le_m5": nm5,
            "pct_ge_10": round(100 * n10 / n, 2),
            "pct_ge_5": round(100 * n5 / n, 2),
            "pct_ge_0": round(100 * n0 / n, 2),
            "pct_le_m5": round(100 * nm5 / n, 2),
            "median_pct": round(100 * statistics.median(rets), 2),
            "avg_pct": round(100 * statistics.mean(rets), 2),
        }

    trade_pack = pack(trades)
    if trades:
        wins = sum(1 for x in trades if x > 0)
        trade_pack["win_rate"] = round(100 * wins / len(trades), 2)
        trade_pack["n_trades"] = len(trades)
        trade_pack["n_win"] = wins
        trade_pack["n_lose"] = len(trades) - wins
    else:
        trade_pack["win_rate"] = None
        trade_pack["n_trades"] = 0
        trade_pack["n_win"] = 0
        trade_pack["n_lose"] = 0

    return {
        "range": RANGE,
        "interval": INTERVAL,
        "aturan": setups,
        "catatan_next_day": "Return diukur tutup hari sinyal → tutup hari bursa berikutnya. Bukan jaminan hasil ke depan.",
        "catatan_trade_beli": "Simulasi sinyal BELI: masuk di open hari berikutnya, keluar di SL / TP1 (1,5R) / sinyal JUAL / maksimal 20 hari. Kalau SL dan TP1 tersentuh di hari yang sama, dihitung kalah di SL (konservatif).",
        "next_day": {k: {"definisi": setups[k], **pack(buckets[k]["rets"])} for k in setups},
        "day5": {
            "E_ikut_bandar": {
                "definisi": "Return tutup hari sinyal Ikut Bandar → tutup 5 hari bursa kemudian.",
                **pack(buckets["E_ikut_bandar"]["rets5"]),
            }
        },
        "trade_beli": trade_pack,
        "min_value_likuid": MIN_VALUE_LIQUID,
        "catatan_ikut_bandar": "Sinyal 'Ikut Bandar' TIDAK memakai broker summary atau foreign flow (data itu tidak tersedia di sumber gratis app ini). Ini inferensi dari volume, nilai transaksi, OBV, Accumulation/Distribution, dan breakout harga. Bukan jejak sekuritas tertentu.",
    }


EVENT_RULES = [
    ("buyback", ["buyback", "beli kembali saham", "pembelian kembali saham"]),
    ("rights_issue", ["rights issue", "right issue", "hmetd", "hak memesan efek"]),
    ("stock_split", ["stock split", "pemecahan saham", "split saham", "stocksplit"]),
    ("reverse_split", ["reverse split", "penggabungan saham"]),
    ("private_placement", ["private placement", "penempatan terbatas", "pmh "]),
    ("akuisisi", ["akuisisi", "mengakuisisi", "diakuisisi", "tender offer", "pengambilalihan", "ambil alih"]),
    ("dividen", ["dividen", "dividend", "ex-dividen", "ex dividen", "cum dividen", "dps "]),
    ("rebalancing", ["msci", "lq45", "idx30", "ftse", "rebalancing", "rebalance", "masuk lq45", "keluar lq45"]),
    ("insider", ["pembelian saham", "beli saham", "unjuk gigi", "pemegang saham pengendali", "akuisisi saham", "mengambil alih saham", "beli Saham"]),
    ("ipo", ["ipo", "penawaran umum perdana", "melantai"]),
    ("kinerja", ["laba", "rugi", "pendapatan", "kuartal", "kinerja", "net profit", "laba bersih"]),
    ("macro_suku_bunga", ["suku bunga", "bi rate", "bank indonesia", "7-day", "hold suku", "potong suku"]),
    ("macro_rupiah", ["rupiah", "kurs", "usd/idr", "dolar as", "dollar as"]),
    ("macro_komoditas", ["batubara", "cpo", "minyak", "emas", "nikel", "timah", "komoditas", "brent", "oil"]),
    ("rilis_atur", ["bei ", "ojk", "ksei", "auto rejection", "arb", "ara", "papan pemantauan"]),
]


def strip_html(s: str) -> str:
    s = re.sub(r"<[^>]+>", " ", s or "")
    s = unescape(s)
    s = re.sub(r"\s+", " ", s).strip()
    return s


def parse_rfc822(s: str | None) -> str | None:
    if not s:
        return None
    s = s.strip()
    for fmt in (
        "%a, %d %b %Y %H:%M:%S %z",
        "%a, %d %b %Y %H:%M:%S %Z",
        "%a, %d %b %Y %H:%M:%S GMT",
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%d %H:%M:%S",
    ):
        try:
            t = dt.datetime.strptime(s.replace("GMT", "+0000"), fmt) if "GMT" in fmt else dt.datetime.strptime(s, fmt)
            if t.tzinfo is None:
                t = t.replace(tzinfo=WIB)
            return iso(t.astimezone(WIB))
        except ValueError:
            continue
    return s


def classify_events(text: str) -> list[str]:
    t = text.lower()
    hits = []
    for ev, keys in EVENT_RULES:
        if any(k.lower() in t for k in keys):
            hits.append(ev)
    return hits


def tag_tickers(text: str, codes: set[str], name_map: list[tuple[str, str]]) -> list[str]:
    found = set()
    # (CODE) or CODE: patterns common in Indo finance news
    for m in re.findall(r"\(([A-Z]{4})\)", text.upper()):
        if m in codes:
            found.add(m)
    for m in re.findall(r"\b([A-Z]{4})\b", text.upper()):
        # only if appears near saham-ish context already captured by paren mostly;
        # require explicit patterns to reduce false positives
        pass
    # "saham BBCA" / "emiten BBCA" / "kode BBCA"
    for m in re.findall(r"(?:saham|emiten|ticker|kode)\s+([A-Za-z]{4})\b", text, flags=re.I):
        c = m.upper()
        if c in codes:
            found.add(c)
    # company names (min 12 chars to reduce noise), skip very generic
    low = text.lower()
    for code, name in name_map:
        if len(name) < 12:
            continue
        if name in low:
            found.add(code)
    return sorted(found)


def fetch_news(universe: list[dict]) -> dict:
    codes = {u["code"] for u in universe}
    name_map = []
    for u in universe:
        nm = re.sub(r"\s+Tbk\.?$", "", u["name"], flags=re.I).strip().lower()
        nm = re.sub(r"\s*\(persero\)\s*", " ", nm, flags=re.I)
        nm = re.sub(r"\s+", " ", nm).strip()
        if nm and nm != u["code"].lower():
            name_map.append((u["code"], nm))
    items = []
    errors = []
    fetched_at = iso(now_wib())
    for feed in RSS_FEEDS:
        try:
            raw = fetch_bytes(feed["url"], retries=3)
            root = ET.fromstring(raw)
            ch = root.find("channel")
            if ch is None:
                raise RuntimeError("channel hilang")
            for it in ch.findall("item"):
                title = strip_html(it.findtext("title") or "")
                link = (it.findtext("link") or "").strip()
                desc = strip_html(it.findtext("description") or "")
                pub = parse_rfc822(it.findtext("pubDate"))
                guid = (it.findtext("guid") or link or title).strip()
                text = f"{title} {desc}"
                items.append(
                    {
                        "id": guid,
                        "title": title,
                        "url": link,
                        "summary": desc[:400],
                        "published": pub,
                        "source": feed["name"],
                        "source_id": feed["id"],
                        "tickers": tag_tickers(text, codes, name_map),
                        "events": classify_events(text),
                    }
                )
        except Exception as e:
            errors.append({"feed": feed["name"], "url": feed["url"], "error": str(e)})
    # dedupe by url/title
    seen = set()
    uniq = []
    for it in items:
        key = it["url"] or it["title"]
        if key in seen:
            continue
        seen.add(key)
        uniq.append(it)

    def sort_key(it):
        return it["published"] or ""

    uniq.sort(key=sort_key, reverse=True)
    return {
        "fetched_at_wib": fetched_at,
        "timezone": "Asia/Jakarta (WIB, UTC+7)",
        "sources": RSS_FEEDS,
        "errors": errors,
        "count": len(uniq),
        "items": uniq[:200],
        "catatan": "Berita diambil apa adanya dari RSS. Bukan rekayasa. Tag ticker/event dari pola judul & ringkasan, bisa kelewat atau salah tempel.",
    }


def summarize_ihsg(ch: dict) -> dict:
    i = len(ch["c"]) - 1
    ind = indicators_at(ch, i) or {}
    price = ch["c"][i]
    prev = ch["c"][i - 1] if i else None
    chg = (price / prev - 1) * 100 if prev else None
    return {
        "code": "IHSG",
        "yahoo": "^JKSE",
        "date": ymd(ch["ts"][i]),
        "price": price,
        "prev": prev,
        "chg_pct": None if chg is None else round(chg, 2),
        "high": ch["h"][i],
        "low": ch["l"][i],
        "sma20": None if not ind.get("sma20") else round(ind["sma20"], 2),
        "sma50": None if not ind.get("sma50") else round(ind["sma50"], 2),
        "sma200": None if not ind.get("sma200") else round(ind["sma200"], 2),
        "spark": [round(x, 2) if x is not None else None for x in ch["c"][-60:]],
        "first_date": ymd(ch["ts"][0]),
        "bars": len(ch["c"]),
        "w52_high": (ch.get("meta") or {}).get("fiftyTwoWeekHigh"),
        "w52_low": (ch.get("meta") or {}).get("fiftyTwoWeekLow"),
    }


def main():
    DATA.mkdir(parents=True, exist_ok=True)
    CACHE.mkdir(parents=True, exist_ok=True)
    force = "--force" in sys.argv
    universe = load_universe()
    print(f"universe {len(universe)} emiten, mulai unduh Yahoo range={RANGE}", flush=True)

    jobs = [("IHSG", "^JKSE")] + [(u["code"], f"{u['code']}.JK") for u in universe]
    charts: dict[str, dict] = {}
    errors: list[dict] = []
    fetched = 0
    cached_n = 0

    def one(code, symbol):
        if not force:
            ch = load_cache(code)
            if ch and ch.get("c") and len(ch["c"]) >= 30:
                # reuse if saved today
                saved = ch.get("saved_at") or ""
                if saved.startswith(now_wib().strftime("%Y-%m-%d")):
                    return code, ch, "cache"
        ch = fetch_ticker(symbol, code)
        return code, ch, "net"

    with ThreadPoolExecutor(max_workers=WORKERS) as ex:
        futs = [ex.submit(one, c, s) for c, s in jobs]
        done = 0
        for fut in as_completed(futs):
            done += 1
            try:
                code, ch, src = fut.result()
                charts[code] = ch
                if src == "cache":
                    cached_n += 1
                else:
                    fetched += 1
            except Exception as e:
                # try identify
                errors.append({"error": str(e)})
            if done % 50 == 0 or done == len(futs):
                print(f"  progress {done}/{len(futs)} ok={len(charts)} cache={cached_n} net={fetched} err={len(errors)}", flush=True)

    # map leftover errors more cleanly: find missing
    missing = []
    if "IHSG" not in charts:
        missing.append({"code": "IHSG", "symbol": "^JKSE", "error": "gagal diambil"})
    for u in universe:
        if u["code"] not in charts:
            missing.append({"code": u["code"], "symbol": f"{u['code']}.JK", "error": "gagal diambil / chart kosong"})

    print(f"hitung indikator & sinyal untuk {len(charts)} chart...", flush=True)
    uni_map = {u["code"]: u for u in universe}
    stocks = []
    sum_err = []
    for u in universe:
        ch = charts.get(u["code"])
        if not ch:
            continue
        try:
            stocks.append(summarize_stock(u, ch))
        except Exception as e:
            sum_err.append({"code": u["code"], "error": str(e)})

    ihsg = summarize_ihsg(charts["IHSG"]) if "IHSG" in charts else None

    print("backtest sejarah...", flush=True)
    # only equity charts
    eq_charts = {k: v for k, v in charts.items() if k != "IHSG"}
    bt = backtest_all(eq_charts, uni_map)

    print("ambil berita RSS...", flush=True)
    news = fetch_news(universe)

    fetched_at = now_wib()
    market = {
        "fetched_at_wib": iso(fetched_at),
        "fetched_at_jst": iso(fetched_at.astimezone(JST)),
        "timezone_data": "Asia/Jakarta (WIB, UTC+7) — jam bursa",
        "source": {
            "harga_dividen": "Yahoo Finance chart API (query1.finance.yahoo.com/v8/finance/chart)",
            "range": RANGE,
            "interval": INTERVAL,
            "universe": "data/universe.csv (kode, nama, papan emiten BEI)",
            "berita": [f["name"] + " — " + f["url"] for f in RSS_FEEDS],
            "keterbatasan": [
                "API quote Yahoo (v7/v10) menolak tanpa crumb (HTTP 401), jadi PER/PBV/EPS live tidak tersedia di app ini.",
                "Yahoo chart tidak mengirim Access-Control-Allow-Origin, jadi browser tidak bisa mengambil langsung — data diload dari JSON hasil skrip ini.",
                "idx.co.id diblokir Cloudflare dari lingkungan pengambil data, jadwal resmi cum/recording/payment sering tidak ada; ex-date dari event Yahoo, cum-date ditandai perkiraan (hari bursa sebelumnya).",
                "Data bandarmologi (broker summary, foreign flow) tidak tersedia di sumber gratis yang dipakai. Materi Metode tetap menjelaskan caranya, tanpa angka palsu.",
                "Volume Yahoo untuk saham .JK dalam satuan lembar. Nilai transaksi = harga × volume.",
            ],
        },
        "counts": {
            "universe": len(universe),
            "yahoo_ok": len(stocks),
            "yahoo_fail": len(missing) - (0 if ihsg else 1) if True else len(missing),
            "berita": news.get("count"),
        },
        "ihsg": ihsg,
        "stocks": stocks,
        "missing": missing,
        "summarize_errors": sum_err,
        "fetch_exceptions": errors[:30],
    }

    # slim write
    (DATA / "market.json").write_text(json.dumps(market, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (DATA / "backtest.json").write_text(json.dumps(bt, ensure_ascii=False, indent=2), encoding="utf-8")
    (DATA / "news.json").write_text(json.dumps(news, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")

    # human snapshot
    n_beli = sum(1 for s in stocks if s["signal"] == "BELI")
    n_jual = sum(1 for s in stocks if s["signal"] == "JUAL")
    n_scr = sum(1 for s in stocks if s["screener"])
    liq = sum(1 for s in stocks if is_liquid_row(s))
    print("OK wrote data/market.json", (DATA / "market.json").stat().st_size, "bytes")
    print("stocks", len(stocks), "liquid", liq, "screener", n_scr, "BELI", n_beli, "JUAL", n_jual, "missing", len(missing))
    if ihsg:
        print("IHSG", ihsg["date"], ihsg["price"], ihsg["chg_pct"])
    print("backtest next_day C_screener", bt["next_day"]["C_screener"])
    print("backtest next_day E_ikut_bandar", bt["next_day"]["E_ikut_bandar"])
    print("backtest day5 E_ikut_bandar", bt["day5"]["E_ikut_bandar"])
    print("backtest trade_beli", bt["trade_beli"])
    print("ikut_bandar today", sum(1 for s in stocks if s.get("ikut_bandar")))
    print("news", news["count"], "errors", news["errors"])


if __name__ == "__main__":
    main()
