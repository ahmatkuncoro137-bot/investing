#!/usr/bin/env python3
"""Jadwal dividen untuk app Investing — resmi kalau ada sumbernya, perkiraan kalau tidak.

Sumber resmi (gratis, tanpa kunci):
- BEI: KSEI API publik  https://www.ksei.co.id/api/corporate_actions  (dipakai halaman
  "Jadwal Aksi Korporasi" KSEI) → recording date & tanggal pembayaran + rasio DPS.
  Tanggal cum/ex pasar reguler diambil dari PDF pengumuman KSEI
  (storage/announcements/{KODE}_DIV_{recording}_ID.pdf). Kalau PDF gagal, cum = recording − 2
  hari bursa (T+2), ex = cum + 1 hari bursa (ditandai "dihitung dari recording resmi").
- AS: Nasdaq dividend calendar API  https://api.nasdaq.com/api/calendar/dividends?date=…
  → ex-date, record date, payment date, DPS, tanggal pengumuman (semua bursa AS).
- Jepang: belum ada sumber resmi gratis yang bisa dipanggil → hanya perkiraan dari pola
  ex-date Yahoo tahun lalu.

Tidak ada tanggal yang dikarang: setiap tanggal ditandai "resmi" atau "perkiraan" + dasar.
"""
from __future__ import annotations

import datetime as dt
import json
import re
import shutil
import statistics
import subprocess
import tempfile
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request, urlopen

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
BULAN = {"januari": 1, "februari": 2, "maret": 3, "april": 4, "mei": 5, "juni": 6, "juli": 7,
         "agustus": 8, "september": 9, "oktober": 10, "november": 11, "desember": 12}


def _get(url: str, timeout: int = 30, accept: str = "application/json") -> bytes:
    last = None
    for i in range(3):
        try:
            with urlopen(Request(url, headers={"User-Agent": UA, "Accept": accept}), timeout=timeout) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            last = e
            time.sleep(1.5 * (i + 1))
    raise last  # type: ignore[misc]


def d_(s) -> dt.date | None:
    if not s:
        return None
    try:
        return dt.date.fromisoformat(str(s)[:10])
    except ValueError:
        return None


def weekdays(start: dt.date, end: dt.date) -> list[dt.date]:
    out, d = [], start
    while d <= end:
        if d.weekday() < 5:
            out.append(d)
        d += dt.timedelta(days=1)
    return out


def add_bdays(d: dt.date, n: int, holidays: set[dt.date] | None = None) -> dt.date:
    """Geser n hari bursa (Senin–Jumat, minus libur yang diketahui)."""
    holidays = holidays or set()
    step = 1 if n >= 0 else -1
    left = abs(n)
    while left:
        d += dt.timedelta(days=step)
        if d.weekday() < 5 and d not in holidays:
            left -= 1
    return d


def fld(date, status: str, basis: str) -> dict | None:
    if date is None:
        return None
    return {"date": date.isoformat() if isinstance(date, dt.date) else str(date)[:10], "status": status, "basis": basis}


# ---------------------------------------------------------------- BEI / KSEI
def ksei_day(day: dt.date) -> list[dict]:
    url = ("https://www.ksei.co.id/api/corporate_actions?locale=id&filter%5Bca_date%5D="
           + day.isoformat() + "&type_of_ca=" + quote("CASH DIVIDEND"))
    data = json.loads(_get(url).decode("utf-8")).get("data") or []
    return [x for x in data if (x.get("type_of_ca") or "").upper() == "CASH DIVIDEND"]


def parse_dps_text(desc: str) -> tuple[float | None, str]:
    cur = "USD" if re.search(r"\b(USD|US\$|dolar)", desc or "", re.I) else "IDR"
    m = re.search(r"(?:Rp\.?|USD|US\$)\s*([0-9][0-9.]*(?:,[0-9]+)?)", desc or "", re.I)
    if not m:
        return None, cur
    raw = m.group(1)
    if "," in raw:
        raw = raw.replace(".", "").replace(",", ".")
    elif raw.count(".") == 1 and len(raw.split(".")[1]) != 3:
        pass  # desimal
    else:
        raw = raw.replace(".", "")
    try:
        return float(raw), cur
    except ValueError:
        return None, cur


def fetch_ksei_range(start: dt.date, end: dt.date, workers: int = 6) -> tuple[dict, int, int]:
    """Return {key: event} + (query ok, query fail)."""
    days = weekdays(start, end)
    out: dict[str, dict] = {}
    ok = fail = 0
    with ThreadPoolExecutor(max_workers=workers) as ex:
        for res in ex.map(_safe_ksei, days):
            if res is None:
                fail += 1
                continue
            ok += 1
            for x in res:
                code = (x.get("security_code") or "").strip().upper()
                rec = d_(x.get("record_date"))
                if not code or not rec:
                    continue
                dps, cur = parse_dps_text(x.get("description") or "")
                kind = "interim" if "interim" in (x.get("description") or "").lower() else "final"
                out[f"{code}|{rec.isoformat()}"] = {
                    "code": code,
                    "record": rec.isoformat(),
                    "pay": (d_(x.get("distribution_date")) or d_(x.get("effective_date")) or rec).isoformat(),
                    "cum_api": (d_(x.get("cum_date")) or rec).isoformat(),
                    "dps": dps,
                    "dps_currency": cur,
                    "kind": kind,
                    "desc": (x.get("description") or "")[:220],
                }
    return out, ok, fail


def _safe_ksei(day):
    try:
        return ksei_day(day)
    except Exception:  # noqa: BLE001
        return None


def _id_date(txt: str) -> dt.date | None:
    m = re.search(r"(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})", txt)
    if not m:
        return None
    mon = BULAN.get(m.group(2).lower())
    if not mon:
        return None
    try:
        return dt.date(int(m.group(3)), mon, int(m.group(1)))
    except ValueError:
        return None


def ksei_pdf(code: str, record: str) -> dict | None:
    """Ambil cum/ex pasar reguler dari PDF pengumuman KSEI (butuh pdftotext)."""
    if not shutil.which("pdftotext"):
        return None
    url = f"https://www.ksei.co.id/storage/announcements/{code}_DIV_{record.replace('-', '')}_ID.pdf"
    try:
        raw = _get(url, accept="application/pdf")
    except Exception:  # noqa: BLE001
        return None
    if not raw.startswith(b"%PDF"):
        return None
    with tempfile.NamedTemporaryFile(suffix=".pdf") as f:
        f.write(raw)
        f.flush()
        try:
            txt = subprocess.run(["pdftotext", "-layout", f.name, "-"], capture_output=True, timeout=30).stdout.decode("utf-8", "ignore")
        except Exception:  # noqa: BLE001
            return None
    out = {"url": url}
    for line in txt.splitlines():
        low = line.lower()
        if "cum dividen di pasar reg" in low:
            out["cum"] = _id_date(line)
        elif "ex dividen di pasar reg" in low:
            out["ex"] = _id_date(line)
        elif "recording date" in low:
            out["record"] = _id_date(line)
        elif "tanggal pembayaran" in low:
            out["pay"] = _id_date(line)
    if not out.get("cum") or not out.get("ex"):
        return None
    return {k: (v.isoformat() if isinstance(v, dt.date) else v) for k, v in out.items()}


# ---------------------------------------------------------------- AS / Nasdaq
def _us_date(s):
    if not s or s in ("N/A", "--"):
        return None
    try:
        return dt.datetime.strptime(s, "%m/%d/%Y").date()
    except ValueError:
        return None


def nasdaq_day(day: dt.date) -> list[dict] | None:
    try:
        d = json.loads(_get(f"https://api.nasdaq.com/api/calendar/dividends?date={day.isoformat()}").decode("utf-8"))
    except Exception:  # noqa: BLE001
        return None
    return ((d.get("data") or {}).get("calendar") or {}).get("rows") or []


def fetch_nasdaq_range(start: dt.date, end: dt.date, symbols: set[str], workers: int = 6) -> tuple[dict, int, int]:
    days = weekdays(start, end)
    out: dict[str, dict] = {}
    ok = fail = 0
    with ThreadPoolExecutor(max_workers=workers) as ex:
        for rows in ex.map(nasdaq_day, days):
            if rows is None:
                fail += 1
                continue
            ok += 1
            for r in rows:
                sym = (r.get("symbol") or "").strip().upper()
                if sym not in symbols:
                    continue
                exd = _us_date(r.get("dividend_Ex_Date"))
                if not exd:
                    continue
                out[f"{sym}|{exd.isoformat()}"] = {
                    "code": sym,
                    "ex": exd.isoformat(),
                    "record": (_us_date(r.get("record_Date")) or exd).isoformat(),
                    "pay": (_us_date(r.get("payment_Date")).isoformat() if _us_date(r.get("payment_Date")) else None),
                    "announced": (_us_date(r.get("announcement_Date")).isoformat() if _us_date(r.get("announcement_Date")) else None),
                    "dps": r.get("dividend_Rate"),
                    "dps_currency": "USD",
                }
    return out, ok, fail


# ---------------------------------------------------------------- riwayat & estimasi
def load_hist(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:  # noqa: BLE001
        return {"events": {}, "updated": None}


def save_hist(path: Path, hist: dict) -> None:
    path.write_text(json.dumps(hist, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


def refresh_history(market: str, data_dir: Path, codes: set[str], today: dt.date, log=print) -> dict:
    """Ambil sumber resmi, gabung ke riwayat tersimpan (backfill ±400 hari kalau masih kosong)."""
    if market == "id":
        path = data_dir / "div_hist_id.json"
    elif market == "us":
        path = data_dir / "div_hist_us.json"
    else:
        return {"events": {}, "source": None, "ok": 0, "fail": 0}
    hist = load_hist(path)
    first = not hist.get("events")
    start = today - dt.timedelta(days=400 if first else 25)
    end = today + dt.timedelta(days=100 if market == "id" else 75)
    t0 = time.time()
    if market == "id":
        new, ok, fail = fetch_ksei_range(start, end)
        src = "KSEI api/corporate_actions"
    else:
        new, ok, fail = fetch_nasdaq_range(start, end, codes)
        src = "Nasdaq api/calendar/dividends"
    log(f"[{market}] dividen resmi: {len(new)} event dari {ok} hari ({fail} gagal), {time.time()-t0:.0f}s, backfill={first}")
    ev = hist.setdefault("events", {})
    # Pertahankan cum/ex PDF yang sudah pernah diambil
    for k, v in new.items():
        old = ev.get(k) or {}
        for keep in ("pdf_cum", "pdf_ex", "pdf_url"):
            if keep in old and keep not in v:
                v[keep] = old[keep]
        ev[k] = v
    if market == "id":
        # PDF KSEI hanya untuk yang masih relevan (pembayaran belum lewat / baru lewat)
        want = [v for v in ev.values() if d_(v.get("pay")) and d_(v["pay"]) >= today - dt.timedelta(days=7) and "pdf_cum" not in v and v["code"] in codes]
        t1 = time.time()
        got = 0
        with ThreadPoolExecutor(max_workers=4) as ex:
            for v, res in zip(want, ex.map(lambda e: ksei_pdf(e["code"], e["record"]), want)):
                if res:
                    v["pdf_cum"], v["pdf_ex"], v["pdf_url"] = res["cum"], res["ex"], res["url"]
                    got += 1
        log(f"[id] PDF KSEI cum/ex: {got}/{len(want)} ({time.time()-t1:.0f}s)")
    # buang yang terlalu tua (> 3 tahun) supaya file kecil
    cutoff = (today - dt.timedelta(days=1100)).isoformat()
    for k in [k for k, v in ev.items() if (v.get("record") or v.get("ex") or "") < cutoff]:
        ev.pop(k)
    hist["updated"] = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    hist["source"] = src
    if ok:  # jangan simpan kalau sumber gagal total
        save_hist(path, hist)
    hist["ok"], hist["fail"] = ok, fail
    return hist


def _median(xs, default):
    xs = [x for x in xs if x is not None]
    return statistics.median(xs) if xs else default


def build_schedule(market: str, code: str, yahoo_divs: list[dict], hist_events: list[dict], price: float | None,
                   today: dt.date, holidays: set[dt.date]) -> dict:
    """Satu jadwal 'berikutnya' + jadwal terakhir + bulan biasanya cair."""
    yahoo_divs = sorted(yahoo_divs or [], key=lambda d: d["ex"])
    hist_events = sorted(hist_events or [], key=lambda e: e.get("record") or e.get("ex"))
    gaps_pay = []  # recording/ex → bayar (hari kalender)
    official = []
    for e in hist_events:
        if market == "id":
            rec = d_(e["record"])
            pay = d_(e.get("pay"))
            if e.get("pdf_cum"):
                cum = d_(e["pdf_cum"]); ex = d_(e["pdf_ex"]); cum_basis = ("resmi", "PDF pengumuman KSEI")
            else:
                cum = add_bdays(rec, -2, holidays); ex = add_bdays(cum, 1, holidays)
                cum_basis = ("resmi*", "dihitung dari recording date resmi KSEI (T+2)")
            if rec and pay:
                gaps_pay.append((pay - rec).days)
            official.append({
                "cum": fld(cum, *cum_basis), "ex": fld(ex, *cum_basis),
                "record": fld(rec, "resmi", "KSEI"), "pay": fld(pay, "resmi", "KSEI") if pay else None,
                "dps": e.get("dps"), "dps_currency": e.get("dps_currency") or "IDR", "dps_status": "resmi" if e.get("dps") is not None else None,
                "kind": e.get("kind"), "source": "KSEI", "source_url": e.get("pdf_url"),
            })
        else:  # us
            ex = d_(e["ex"]); rec = d_(e.get("record")) or ex; pay = d_(e.get("pay"))
            if ex and pay:
                gaps_pay.append((pay - ex).days)
            official.append({
                "cum": fld(add_bdays(ex, -1, holidays), "resmi*", "hari bursa sebelum ex-date resmi (T+1)"),
                "ex": fld(ex, "resmi", "Nasdaq"), "record": fld(rec, "resmi", "Nasdaq"),
                "pay": fld(pay, "resmi", "Nasdaq") if pay else None,
                "dps": e.get("dps"), "dps_currency": "USD", "dps_status": "resmi",
                "announced": e.get("announced"), "source": "Nasdaq",
            })

    default_gap = {"id": 14, "us": 14, "jp": 70}[market]
    gap = round(_median(gaps_pay, default_gap))
    gap_basis = (f"median {len(gaps_pay)} pembayaran resmi saham ini" if gaps_pay else
                 {"id": "umumnya ±2 minggu setelah recording di BEI", "us": "umumnya ±2 minggu setelah ex-date di AS",
                  "jp": "umumnya ±2–3 bulan setelah recording di Jepang (setelah RUPS)"}[market])

    # 'berikutnya' = jadwal resmi yang bayarnya belum lewat
    nxt = None
    for o in official:
        p = d_((o.get("pay") or {}).get("date")) or d_(o["record"]["date"])
        if p and p >= today:
            nxt = o
            break
    last = None
    past = [o for o in official
            if (d_((o.get("pay") or o["record"])["date"]) or today) < today]
    if past:
        last = past[-1]

    # estimasi dari pola tahun lalu kalau belum ada pengumuman resmi
    est = None
    if nxt is None:
        cands = []
        for o in official:  # pola resmi tahun lalu
            base = d_(o["ex"]["date"])
            g = _plus_year(base)
            if g and g > today:
                cands.append((g, o.get("dps"), base, "jadwal resmi tahun lalu"))
        if not cands:
            months = {}
            for dv in yahoo_divs:
                months.setdefault(dv["ex"][5:7], []).append(dv)
            for horizon in (400, 800):  # utamakan pola 12 bulan terakhir
                for dv in yahoo_divs:
                    exd = d_(dv["ex"])
                    if not exd or (today - exd).days > horizon:
                        continue
                    g = _plus_year(exd)
                    while g and g <= today:
                        g = _plus_year(g)
                    if g and (len(months.get(dv["ex"][5:7], [])) >= 2 or (today - exd).days <= 400):
                        cands.append((g, dv["dps"], exd, "ex-date Yahoo tahun lalu"))
                if cands:
                    break
            if market == "us" and len(yahoo_divs) >= 3:
                # dividen rutin (kuartalan/bulanan): ex terakhir + jarak median
                exs = [d_(x["ex"]) for x in yahoo_divs[-6:]]
                iv = _median([(b - a).days for a, b in zip(exs, exs[1:])], None)
                if iv and 20 <= iv <= 190:
                    g = exs[-1] + dt.timedelta(days=round(iv))
                    while g <= today:
                        g += dt.timedelta(days=round(iv))
                    cands.append((g, yahoo_divs[-1]["dps"], exs[-1], f"ex terakhir + jarak rutin {round(iv)} hari"))
        cands = [c for c in cands if (c[0] - today).days <= 400]
        if cands:
            cands.sort(key=lambda c: c[0])
            g, dps, base, why = cands[0]
            exd = g
            while exd.weekday() >= 5:
                exd += dt.timedelta(days=1)
            b = f"perkiraan: {why} ({base.isoformat()})"
            if market == "id":
                cum = add_bdays(exd, -1, holidays); rec = add_bdays(exd, 1, holidays); pay = rec + dt.timedelta(days=gap)
            elif market == "us":
                cum = add_bdays(exd, -1, holidays); rec = exd; pay = exd + dt.timedelta(days=gap)
            else:  # jp: ex = 1 hari bursa sebelum record; beli terakhir = 2 hari bursa sebelum record
                rec = add_bdays(exd, 1, holidays); cum = add_bdays(exd, -1, holidays); pay = rec + dt.timedelta(days=gap)
            est = {
                "cum": fld(cum, "perkiraan", b), "ex": fld(exd, "perkiraan", b), "record": fld(rec, "perkiraan", b),
                "pay": fld(pay, "perkiraan", f"{gap} hari setelah {'ex' if market == 'us' else 'recording'} — {gap_basis}"),
                "dps": dps, "dps_currency": {"id": "IDR", "us": "USD", "jp": "JPY"}[market], "dps_status": "perkiraan" if dps else None,
                "source": "perkiraan",
            }

    if last is None and yahoo_divs:
        dv = yahoo_divs[-1]
        exd = d_(dv["ex"])
        if exd:
            if market == "us":
                rec, cum = exd, add_bdays(exd, -1, holidays)
            elif market == "jp":
                rec, cum = add_bdays(exd, 1, holidays), add_bdays(exd, -1, holidays)
            else:
                rec, cum = add_bdays(exd, 1, holidays), add_bdays(exd, -1, holidays)
            last = {"cum": fld(cum, "perkiraan", "hari bursa sebelum ex (aturan settlement)"),
                    "ex": fld(exd, "resmi*", "ex-date dari event Yahoo"),
                    "record": fld(rec, "perkiraan", "aturan settlement"),
                    "pay": fld(rec + dt.timedelta(days=gap), "perkiraan", gap_basis),
                    "dps": dv["dps"], "dps_currency": {"id": "IDR", "us": "USD", "jp": "JPY"}[market], "dps_status": "resmi*", "source": "Yahoo"}

    # bulan biasanya cair: bulan bayar resmi (riwayat tersimpan) + bulan perkiraan dari
    # ex-date Yahoo yang muncul di ≥2 tahun berbeda (3 tahun terakhir)
    off_months = set()
    for o in official:
        p = d_((o.get("pay") or {}).get("date"))
        if p and (today - p).days <= 400:
            off_months.add(p.month)
    yh: dict[int, set] = {}
    for dv in yahoo_divs:
        exd = d_(dv["ex"])
        if not exd or (today - exd).days > 3 * 366:
            continue
        p = exd + dt.timedelta(days=gap + (1 if market != "us" else 0))
        yh.setdefault(p.month, set()).add(p.year)
    yh_months = {m for m, ys in yh.items() if len(ys) >= 2}
    usual = sorted(off_months | yh_months)
    if not usual and yh:
        usual = sorted(yh)
    basis_months = ("tanggal bayar resmi 12 bln terakhir" if off_months else "") + \
        (" + " if off_months and yh_months else "") + ("pola ex-date Yahoo ≥2 tahun" if yh_months else "")
    return {
        "next": nxt or est,
        "next_is_official": nxt is not None,
        "last": last,
        "upcoming_official": [o for o in official if d_((o.get("pay") or o["record"])["date"]) and d_((o.get("pay") or o["record"])["date"]) >= today],
        "pay_gap_days": gap,
        "pay_gap_basis": gap_basis,
        "pay_months": usual,
        "pay_months_basis": (basis_months or "ex-date Yahoo terakhir") + " — perkiraan, bukan janji",
    }


def _plus_year(d: dt.date | None) -> dt.date | None:
    if not d:
        return None
    try:
        return d.replace(year=d.year + 1)
    except ValueError:
        return d.replace(year=d.year + 1, day=28)
