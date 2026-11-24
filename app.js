/* Investing — vanilla JS PWA. Semua angka harga/dividen/statistik dari JSON hasil fetch, bukan karangan. */
(() => {
  "use strict";

  const TABS = [
    { id: "beranda", label: "Beranda" },
    { id: "saham", label: "Saham" },
    { id: "dividen", label: "Dividen" },
    { id: "belajar", label: "Belajar" },
    { id: "metode", label: "Metode" },
    { id: "berita", label: "Berita" },
  ];
  const USERS_KEY = "investing-users-v1";
  const SESSION_KEY = "investing-session-v1";
  const PBKDF2_ITERS = 150000;
  const MARKET_KEY = "investing-market-v1";

  // Pasar yang didukung. File data dibuat GitHub Actions (branch `data`) / fetch_market.py.
  const MARKETS = {
    id: { id: "id", flag: "🇮🇩", short: "Indonesia", label: "Indonesia (BEI)", file: "market.json", bt: "backtest.json",
          cur: "IDR", tz: "Asia/Jakarta", tzl: "WIB", lot: 100, lotWord: "1 lot (100 lbr)", idxName: "IHSG", suffix: ".JK",
          open: [9, 0], close: [16, 0], days: [1, 2, 3, 4, 5], delay: 10 },
    us: { id: "us", flag: "🇺🇸", short: "Amerika", label: "Amerika (S&P 500 + Nasdaq-100)", file: "market_us.json", bt: "backtest_us.json",
          cur: "USD", tz: "America/New_York", tzl: "ET", lot: 1, lotWord: "1 saham", idxName: "S&P 500", suffix: "",
          open: [9, 30], close: [16, 0], days: [1, 2, 3, 4, 5], delay: 0 },
    jp: { id: "jp", flag: "🇯🇵", short: "Jepang", label: "Jepang (Nikkei 225)", file: "market_jp.json", bt: "backtest_jp.json",
          cur: "JPY", tz: "Asia/Tokyo", tzl: "JST", lot: 100, lotWord: "1 unit (100 lbr)", idxName: "Nikkei 225", suffix: ".T",
          open: [9, 0], close: [15, 30], days: [1, 2, 3, 4, 5], delay: 20 },
  };
  // Sumber data online: branch `data` di repo GitHub Pages ini (CORS terbuka, tanpa kunci).
  const REMOTE = (() => {
    try {
      if (new URLSearchParams(location.search).get("data") === "local") return null;
      const h = location.hostname;
      if (!h.endsWith(".github.io")) return null;
      const owner = h.split(".")[0];
      const repo = location.pathname.split("/").filter(Boolean)[0] || `${owner}.github.io`;
      return { owner, repo, branch: "data" };
    } catch (_) { return null; }
  })();
  const QUOTES_EVERY_MS = 3 * 60 * 1000;
  const LIVE_EVERY_MS = 60 * 1000;
  const MARKET_EVERY_MS = 30 * 60 * 1000;

  const EVENT_LABEL = {
    buyback: "Buyback",
    rights_issue: "Rights/HMETD",
    stock_split: "Stock split",
    reverse_split: "Reverse split",
    private_placement: "Private placement",
    akuisisi: "Akuisisi/tender",
    dividen: "Dividen",
    rebalancing: "Rebalancing/indeks",
    insider: "Beli porsi besar",
    ipo: "IPO",
    kinerja: "Kinerja/laba",
    macro_suku_bunga: "Suku bunga",
    macro_rupiah: "Rupiah",
    macro_komoditas: "Komoditas",
    rilis_atur: "Regulasi/bursa",
  };

  const state = {
    tab: "beranda",
    mkt: (() => { try { const v = localStorage.getItem(MARKET_KEY); return MARKETS[v] ? v : "id"; } catch (_) { return "id"; } })(),
    data: {},        // { id: {market, backtest}, us: {...}, jp: {...} }
    quotes: null,    // quotes.json (GitHub Actions, tiap ~15 menit saat bursa buka)
    quotesFrom: "",
    live: { us: {}, jp: {} }, // harga langsung dari CNBC (AS real-time, Jepang tertunda) saat app terbuka
    liveAt: { us: 0, jp: 0 },
    loadingMarket: false,
    market: null,
    backtest: null,
    news: null,
    loadError: null,
    watch: new Set(),
    user: null,
    authMode: "masuk",
    authError: "",
    authBusy: false,
    firebase: null,
    query: "",
    sahamFilter: "semua",
    selected: null,
    lessonId: null,
    metodeId: null,
    metodeCat: "semua",
    newsQuery: "",
    newsEvent: "semua",
    watchOnly: false,
    calc: { code: "", modal: "", price: "", dps: "", reinvest: false },
    divModal: {},
    divView: "terdekat",
    divMonth: 0,
    divShowAll: false,
    divExplainOpen: true,
  };

  const $ = (sel, el = document) => el.querySelector(sel);
  const appEl = $("#app");
  const navEl = $("#nav");
  const stampEl = $("#stamp");

  function watchKey() {
    const em = (state.user && state.user.email || "").toLowerCase();
    return em ? "investing-watch-v1:" + em : "investing-watch-v1:anon";
  }
  function loadWatch() {
    try { state.watch = new Set(JSON.parse(localStorage.getItem(watchKey()) || "[]")); }
    catch (_) { state.watch = new Set(); }
  }
  function saveWatch() {
    if (state.user) localStorage.setItem(watchKey(), JSON.stringify([...state.watch]));
    const n = $("#watch-count");
    if (n) n.textContent = String(state.watch.size);
    const b = $("#btn-watch");
    if (b) b.classList.toggle("active", state.watchOnly || state.tab === "saham" && state.sahamFilter === "watch");
  }

  function b64(bytes) {
    let s = "";
    bytes = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return btoa(s);
  }
  function unb64(str) {
    const bin = atob(str);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }
  function sameBits(a, b) {
    if (a.length !== b.length) return false;
    let x = 0;
    for (let i = 0; i < a.length; i++) x |= a[i] ^ b[i];
    return x === 0;
  }
  async function pbkdf2(password, salt, iters) {
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
    const bits = await crypto.subtle.deriveBits(
      { name: "PBKDF2", hash: "SHA-256", salt, iterations: iters },
      key,
      256
    );
    return new Uint8Array(bits);
  }
  function loadUsers() {
    try { return JSON.parse(localStorage.getItem(USERS_KEY) || "{}"); }
    catch (_) { return {}; }
  }
  function saveUsers(map) {
    localStorage.setItem(USERS_KEY, JSON.stringify(map));
  }
  function validEmail(e) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((e || "").trim());
  }
  function validPass(pw) {
    return typeof pw === "string" && pw.length >= 8;
  }
  async function localRegister(email, password) {
    const em = email.trim().toLowerCase();
    const users = loadUsers();
    if (users[em]) throw new Error("Email ini sudah terdaftar. Silakan masuk.");
    const salt = crypto.getRandomValues(new Uint8Array(16));
    const hash = await pbkdf2(password, salt, PBKDF2_ITERS);
    users[em] = {
      email: em,
      salt: b64(salt),
      hash: b64(hash),
      iterations: PBKDF2_ITERS,
      algo: "PBKDF2-SHA256",
      created: new Date().toISOString(),
    };
    saveUsers(users);
    return { email: em, via: "local" };
  }
  async function localLogin(email, password) {
    const em = email.trim().toLowerCase();
    const rec = loadUsers()[em];
    if (!rec) throw new Error("Email atau kata sandi salah.");
    const hash = await pbkdf2(password, unb64(rec.salt), rec.iterations || PBKDF2_ITERS);
    if (!sameBits(hash, unb64(rec.hash))) throw new Error("Email atau kata sandi salah.");
    return { email: em, via: "local" };
  }
  function setSession(user) {
    state.user = user;
    if (user) localStorage.setItem(SESSION_KEY, JSON.stringify({ email: user.email, via: user.via, ts: Date.now() }));
    else localStorage.removeItem(SESSION_KEY);
  }
  function readSession() {
    try {
      const s = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
      if (s && s.email) return { email: s.email, via: s.via || "local" };
    } catch (_) {}
    return null;
  }
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const el = document.createElement("script");
      el.src = src;
      el.async = true;
      el.onload = resolve;
      el.onerror = () => reject(new Error("Gagal memuat " + src));
      document.head.appendChild(el);
    });
  }
  async function tryFirebase() {
    try {
      const r = await fetch("firebase-config.json", { cache: "no-cache" });
      if (!r.ok) return null;
      const cfg = await r.json();
      if (!cfg || !cfg.apiKey || String(cfg.apiKey).includes("PASTE_")) return null;
      await loadScript("https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js");
      await loadScript("https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js");
      if (!window.firebase) return null;
      if (!firebase.apps.length) firebase.initializeApp(cfg);
      return firebase.auth();
    } catch (_) {
      return null;
    }
  }
  async function authSubmit(email, password, mode) {
    if (!validEmail(email)) throw new Error("Masukkan email yang valid.");
    if (!validPass(password)) throw new Error("Kata sandi minimal 8 karakter.");
    if (state.firebase) {
      if (mode === "daftar") {
        const cred = await state.firebase.createUserWithEmailAndPassword(email.trim(), password);
        return { email: cred.user.email, via: "firebase" };
      }
      const cred = await state.firebase.signInWithEmailAndPassword(email.trim(), password);
      return { email: cred.user.email, via: "firebase" };
    }
    return mode === "daftar" ? localRegister(email, password) : localLogin(email, password);
  }
  function showShell(on) {
    const auth = $("#auth-root");
    const shell = $("#shell");
    if (auth) auth.hidden = !!on;
    if (shell) shell.hidden = !on;
  }
  function renderAuth() {
    const root = $("#auth-root");
    if (!root) return;
    const mode = state.authMode;
    root.hidden = false;
    root.innerHTML = `
      <div class="auth-card">
        <div class="logo" aria-hidden="true"></div>
        <h1>Investing</h1>
        <p class="sub">Masuk untuk pakai watchlist dan pantau saham BEI. Akun disimpan di perangkat ini (kata sandi tidak pernah disimpan polos).</p>
        <div class="tabs">
          <button type="button" data-auth-mode="masuk" aria-selected="${mode === "masuk"}">Masuk</button>
          <button type="button" data-auth-mode="daftar" aria-selected="${mode === "daftar"}">Daftar</button>
        </div>
        <form class="form" id="auth-form" autocomplete="on">
          <label>Email<input id="auth-email" type="email" required inputmode="email" autocomplete="username" placeholder="nama@email.com" /></label>
          <label>Kata sandi<input id="auth-pass" type="password" required minlength="8" autocomplete="${mode === "daftar" ? "new-password" : "current-password"}" placeholder="Minimal 8 karakter" /></label>
          ${state.authError ? `<p class="err">${escapeHtml(state.authError)}</p>` : ""}
          <button class="primary" type="submit" ${state.authBusy ? "disabled" : ""}>${state.authBusy ? "Memproses…" : (mode === "daftar" ? "Daftar" : "Masuk")}</button>
        </form>
        <p class="note">Auth lokal memakai hash PBKDF2-SHA256 ber-salt di localStorage. Kalau file <code>firebase-config.json</code> tersedia (lihat firebase-config.example.json), masuk/daftar dialihkan ke Firebase Auth — tidak ada kunci yang ditanam di kode app.</p>
      </div>`;
  }
  async function afterLogin(user) {
    setSession(user);
    loadWatch();
    showShell(true);
    readHash();
    render();
  }
  function logout() {
    if (state.firebase && state.firebase.signOut) state.firebase.signOut().catch(() => {});
    setSession(null);
    state.watch = new Set();
    showShell(false);
    state.authMode = "masuk";
    state.authError = "";
    renderAuth();
  }


  function fmtNum(n, dec = 0) {
    if (n == null || Number.isNaN(Number(n))) return "—";
    return Number(n).toLocaleString("id-ID", { maximumFractionDigits: dec, minimumFractionDigits: dec });
  }
  function curSym() { return { IDR: "Rp", USD: "US$", JPY: "¥" }[M().cur] || ""; }
  function pxDec(n) {
    if (M().cur === "USD") return 2;
    if (M().cur === "JPY") return Number.isInteger(Number(n)) ? 0 : 1;
    return 0;
  }
  // harga per lembar sesuai pasar (Rp tanpa desimal, US$ 2 desimal, ¥)
  function px(n) {
    if (n == null || Number.isNaN(Number(n))) return "—";
    return fmtNum(n, pxDec(n));
  }
  function rp(n, dec) {
    if (n == null || Number.isNaN(Number(n))) return "—";
    const d = dec == null ? (M().cur === "USD" ? 2 : 0) : dec;
    return curSym() + fmtNum(n, d);
  }
  function rpCompact(n) {
    if (n == null || Number.isNaN(Number(n))) return "—";
    const a = Math.abs(Number(n));
    const c = curSym();
    if (a >= 1e12) return c + fmtNum(n / 1e12, 2) + " T";
    if (a >= 1e9) return c + fmtNum(n / 1e9, 2) + " M";
    if (a >= 1e6) return c + fmtNum(n / 1e6, 1) + " jt";
    return rp(n);
  }
  function tmLocal(epochSec, tz, withDay) {
    if (!epochSec) return "—";
    const d = new Date(epochSec * 1000);
    const o = { timeZone: tz, hour: "2-digit", minute: "2-digit", hour12: false };
    if (withDay) { o.day = "numeric"; o.month = "short"; }
    return d.toLocaleString("id-ID", o).replace(/\./g, ":");
  }
  function marketOpenNow(mk) {
    const m = mk || M();
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: m.tz, weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false }).formatToParts(new Date());
    const g = (t) => parts.find((p) => p.type === t)?.value;
    const wd = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(g("weekday"));
    const mins = (Number(g("hour")) % 24) * 60 + Number(g("minute"));
    if (!m.days.includes(wd)) return false;
    return mins >= m.open[0] * 60 + m.open[1] && mins <= m.close[0] * 60 + m.close[1];
  }
  function pct(n, dec = 2) {
    if (n == null || Number.isNaN(Number(n))) return "—";
    const s = (n >= 0 ? "+" : "") + Number(n).toFixed(dec).replace(".", ",") + "%";
    return s;
  }
  function chgClass(n) {
    if (n == null || Number.isNaN(Number(n)) || n === 0) return "flat";
    return n > 0 ? "up" : "down";
  }
  function parseDay(s) {
    if (!s) return null;
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${Number(m[3])} ${["Jan","Feb","Mar","Apr","Mei","Jun","Jul","Agu","Sep","Okt","Nov","Des"][Number(m[2])-1]} ${m[1]}`;
    return s;
  }
  function parseDateTimeWib(iso) {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    // tampilkan WIB dan JST (user di Jepang)
    const wib = d.toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
    const jst = d.toLocaleString("id-ID", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", hour12: false });
    return `${wib} WIB · ${jst} JST`;
  }
  function escapeHtml(s) {
    return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  function wk(code) { return state.mkt === "id" ? code : `${state.mkt}:${code}`; }
  function isWatched(code) { return state.watch.has(wk(code)); }
  function M() { return MARKETS[state.mkt]; }

  function stockByCode(code) {
    return (state.market?.stocks || []).find((s) => s.code === code);
  }
  function isLiquid(s) {
    const min = state.market?.min_value_likuid || 2e9;
    return (s.value20 || 0) >= min && !String(s.board || "").toLowerCase().startsWith("pemantauan");
  }

  // ---- Harga terbaru: live (CNBC) > quotes.json (Actions) > tutup harian (market.json) ----
  function quoteOf(s) {
    const mk = M();
    const base = { price: s.price, chg_pct: s.chg_pct, t: s.quote_time || (s.date ? Date.parse(s.date + "T16:00:00+07:00") / 1000 : 0), src: "tutup harian", delay: null, daily: true };
    let best = base;
    const qm = state.quotes?.markets?.[state.mkt];
    const q = qm?.q?.[s.code];
    if (q && q[0] != null && q[2] && q[2] >= (best.t || 0)) {
      best = { price: q[0], chg_pct: q[1], t: q[2], src: "Yahoo via GitHub Actions", delay: mk.delay, daily: false, high: q[4], low: q[5], prev: q[6] };
    }
    const lv = state.live[state.mkt]?.[s.code];
    if (lv && lv.t && lv.t >= (best.t || 0)) best = { ...lv, daily: false };
    return best;
  }
  function quoteStamp(qt) {
    if (!qt || !qt.t) return "";
    const mk = M();
    const day = (ms) => new Date(ms).toLocaleDateString("en-CA", { timeZone: mk.tz });
    const when = tmLocal(qt.t, mk.tz, day(qt.t * 1000) !== day(Date.now()));
    return `${when} ${mk.tzl}`;
  }
  // Status zona beli: dibandingkan harga terbaru (bukan hanya tutup sinyal)
  function zoneState(s, qt) {
    if (s.signal !== "BELI" || s.entry_lo == null || s.entry_hi == null) return null;
    const p = qt?.price ?? s.price;
    if (s.sl != null && p <= s.sl) return { k: "batal", label: "Batal — tembus SL", cls: "jual" };
    if (p > s.entry_hi) return { k: "lewat", label: "Lewat zona — jangan kejar", cls: "warn" };
    if (p < s.entry_lo) return { k: "bawah", label: "Di bawah zona — cek ulang", cls: "thin" };
    return { k: "zona", label: "Masih di zona beli", cls: "beli" };
  }
  function zoneLine(s, qt) {
    const z = zoneState(s, qt);
    if (!z) return "";
    return `<div class="zone-line mt">
      <div><span class="badge ${z.cls}">${z.label}</span> <span class="small faint">harga ${px(qt?.price ?? s.price)} · ${quoteStamp(qt)}</span></div>
      <div class="small">Beli di bawah <strong>${px(s.entry_hi)}</strong> · area masuk <strong>${px(s.entry_lo)}–${px(s.entry_hi)}</strong> · SL <strong class="down">${px(s.sl)}</strong> · TP <strong class="up">${px(s.tp1)}</strong> / ${px(s.tp2)}</div>
    </div>`;
  }
  function screenerScore(s) {
    const vol = Math.min(s.vol_ratio || 0, 5);
    const br = s.breakout ? 2 : 0;
    const near = (s.close_loc || 0) >= 0.8 ? 1 : 0;
    const chg = Math.max(0, Math.min(s.chg_pct || 0, 15)) / 5;
    const rsi = s.rsi14 == null ? 0 : (s.rsi14 >= 50 && s.rsi14 <= 75 ? 1 : 0);
    return vol + br + near + chg + rsi + (s.retest ? 1 : 0);
  }

  function sparkSvg(values, color) {
    const pts = (values || []).map((v, i) => [i, v]).filter((p) => p[1] != null);
    if (pts.length < 2) return `<div class="faint small">Grafik tidak cukup</div>`;
    const ys = pts.map((p) => p[1]);
    const min = Math.min(...ys);
    const max = Math.max(...ys);
    const span = max - min || 1;
    const w = 140, h = 56, pad = 2;
    const last = ys[ys.length - 1];
    const first = ys[0];
    const col = color || (last >= first ? "#3dd68c" : "#f07178");
    const d = pts.map((p, i) => {
      const x = pad + (p[0] / (values.length - 1)) * (w - pad * 2);
      const y = pad + (1 - (p[1] - min) / span) * (h - pad * 2);
      return `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ");
    return `<svg class="spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true"><path d="${d}" fill="none" stroke="${col}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
  }

  function candleChart(ohlc, obs) {
    if (!ohlc || !ohlc.c || ohlc.c.length < 5) return `<div class="faint small">Grafik tidak cukup</div>`;
    const n = ohlc.c.length;
    const dates = ohlc.dates || [];
    const pads = { l: 4, r: 4, t: 8, b: 16 };
    const w = 360, h = 200;
    const innerW = w - pads.l - pads.r;
    const innerH = h - pads.t - pads.b;
    const highs = ohlc.h.filter((x) => x != null);
    const lows = ohlc.l.filter((x) => x != null);
    let ymin = Math.min(...lows), ymax = Math.max(...highs);
    const vis = (obs || []).filter((ob) => ob.high >= ymin * 0.97 && ob.low <= ymax * 1.03);
    vis.forEach((ob) => { ymin = Math.min(ymin, ob.low); ymax = Math.max(ymax, ob.high); });
    if (ymax <= ymin) ymax = ymin + 1;
    const span = ymax - ymin;
    const xAt = (i) => pads.l + (i + 0.5) * (innerW / n);
    const yAt = (p) => pads.t + (1 - (p - ymin) / span) * innerH;
    const idxOf = (day) => {
      const j = dates.indexOf(day);
      return j >= 0 ? j : 0;
    };
    const slot = innerW / n;
    const cw = Math.max(1.2, slot * 0.62);
    let zones = "";
    vis.forEach((ob) => {
      const i0 = idxOf(ob.formed);
      const i1 = ob.mitigated && ob.mitigated_on && dates.indexOf(ob.mitigated_on) >= 0
        ? dates.indexOf(ob.mitigated_on)
        : n - 1;
      const x = xAt(Math.min(i0, i1)) - cw / 2;
      const x2 = xAt(Math.max(i0, i1)) + cw / 2;
      const y = yAt(ob.high);
      const hh = Math.max(2, yAt(ob.low) - y);
      const col = ob.side === "bull" ? "61,214,140" : "240,113,120";
      const op = ob.mitigated ? 0.12 : 0.22;
      zones += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(x2 - x).toFixed(1)}" height="${hh.toFixed(1)}" fill="rgba(${col},${op})" stroke="rgba(${col},${ob.mitigated ? 0.35 : 0.7})" stroke-width="0.8"/>`;
    });
    let candles = "";
    for (let i = 0; i < n; i++) {
      const o = ohlc.o[i], hgt = ohlc.h[i], l = ohlc.l[i], c = ohlc.c[i];
      if (o == null || hgt == null || l == null || c == null) continue;
      const up = c >= o;
      const col = up ? "#3dd68c" : "#f07178";
      const x = xAt(i);
      candles += `<line x1="${x.toFixed(1)}" x2="${x.toFixed(1)}" y1="${yAt(hgt).toFixed(1)}" y2="${yAt(l).toFixed(1)}" stroke="${col}" stroke-width="1"/>`;
      const y1 = yAt(Math.max(o, c)), y2 = yAt(Math.min(o, c));
      const bh = Math.max(0.8, y2 - y1);
      candles += `<rect x="${(x - cw / 2).toFixed(1)}" y="${y1.toFixed(1)}" width="${cw.toFixed(1)}" height="${bh.toFixed(1)}" fill="${col}"/>`;
    }
    const last = dates[n - 1] || "";
    return `<svg class="obchart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="Grafik candle dan zona order block">
      ${zones}${candles}
      <text x="${pads.l}" y="${h - 3}" fill="#5c6b84" font-size="8">${escapeHtml(dates[0] || "")}</text>
      <text x="${w - pads.r}" y="${h - 3}" fill="#5c6b84" font-size="8" text-anchor="end">${escapeHtml(last)}</text>
    </svg>`;
  }

  function badgeSignal(status) {
    const st = (status || "TUNGGU").toLowerCase();
    return `<span class="badge ${st}">${escapeHtml(status)}</span>`;
  }

  function hashSet(obj) {
    const parts = ["#/" + (obj.tab || "beranda")];
    if (obj.selected) parts.push("k/" + obj.selected);
    if (obj.lessonId) parts.push("l/" + obj.lessonId);
    if (obj.metodeId) parts.push("m/" + obj.metodeId);
    if (obj.watchOnly) parts.push("watch");
    location.hash = parts.join("/");
  }
  function readHash() {
    const h = location.hash.replace(/^#\/?/, "");
    const bits = h.split("/").filter(Boolean);
    state.tab = TABS.some((t) => t.id === bits[0]) ? bits[0] : "beranda";
    state.selected = null;
    state.lessonId = null;
    state.metodeId = null;
    state.watchOnly = false;
    for (let i = 1; i < bits.length; i++) {
      if (bits[i] === "k" && bits[i + 1]) { state.selected = bits[++i].toUpperCase(); }
      else if (bits[i] === "l" && bits[i + 1]) { state.lessonId = bits[++i]; }
      else if (bits[i] === "m" && bits[i + 1]) { state.metodeId = bits[++i]; }
      else if (bits[i] === "watch") state.watchOnly = true;
    }
  }
  function go(patch) {
    Object.assign(state, patch);
    const prev = location.hash;
    hashSet(state);
    if (location.hash === prev) {
      render();
      window.scrollTo(0, 0);
    }
  }

  function navRender() {
    navEl.innerHTML = TABS.map((t) =>
      `<button type="button" data-tab="${t.id}" aria-current="${state.tab === t.id ? "page" : "false"}">${t.label}</button>`
    ).join("");
  }

  function stampRender() {
    const m = state.market;
    if (state.loadError) {
      stampEl.innerHTML = `<strong>Data gagal dimuat.</strong> ${escapeHtml(state.loadError)}`;
      return;
    }
    if (!m) { stampEl.textContent = state.loadingMarket ? `Lagi muat data ${M().short}…` : ""; return; }
    stampEl.innerHTML = `<span class="stamp-live">${priceStampHtml()}</span><span class="faint">Sinyal dari candle tutup ${parseDay(m.ihsg?.date || m.stocks?.[0]?.date)} · data harian diambil ${parseDateTimeWib(m.fetched_at_wib)} · ${fmtNum(m.counts?.yahoo_ok)}/${fmtNum(m.counts?.universe)} saham</span>`;
  }

  function priceStampHtml() {
    const mk = M();
    const qm = state.quotes?.markets?.[state.mkt];
    const lvAt = state.liveAt[state.mkt] || 0;
    const open = marketOpenNow(mk);
    let t = 0, srcTxt = "", delayTxt = "";
    // waktu transaksi terakhir yang benar-benar ada di data
    const lv = state.live[state.mkt] || {};
    const lvTimes = Object.values(lv).map((x) => x.t || 0);
    const lvMax = lvTimes.length ? Math.max(...lvTimes) : 0;
    if (lvMax && lvMax >= (qm?.last_trade_epoch || 0)) {
      t = lvMax; srcTxt = mk.id === "us" ? "CNBC langsung (Nasdaq last sale)" : "CNBC langsung";
    } else if (qm?.last_trade_epoch) {
      t = qm.last_trade_epoch; srcTxt = "Yahoo · update otomatis ~15 mnt";
    } else if (state.market?.index?.date || state.market?.ihsg?.date) {
      srcTxt = "harga tutup harian";
    }
    if (t) {
      const age = Math.max(0, Math.round((Date.now() / 1000 - t) / 60));
      delayTxt = open ? `(tertunda ~${age} menit)` : `(pasar tutup)`;
      const fresh = open && age <= 20 ? "live" : "";
      return `<span class="dot ${fresh}"></span>Harga per <strong>${tmLocal(t, mk.tz, !open || age > 600)} ${mk.tzl}</strong> ${delayTxt} · ${srcTxt}`;
    }
    return `Harga tutup <strong>${parseDay(state.market?.ihsg?.date)}</strong> · belum ada data harga intraday`;
  }

  function marketSwitch() {
    return `<div class="mkt-switch" role="tablist" aria-label="Pilih pasar">${Object.values(MARKETS).map((mk) =>
      `<button type="button" role="tab" data-mkt="${mk.id}" aria-selected="${state.mkt === mk.id}">${mk.flag} ${mk.short}</button>`).join("")}</div>`;
  }

  function disclaimer() {
    return `<footer class="disc">Ini bukan saran beli/jual dan bukan jaminan keuntungan. Tidak ada yang bisa mastiin saham naik 10% dalam sehari. Semua harga, volume, dividen, dan statistik di app ini berasal dari data yang benar-benar diambil (Yahoo Finance chart &amp; RSS berita), lengkap dengan waktu pengambilan. Kalau datanya kosong atau gagal, app ini tidak mengarang angka.</footer>`;
  }

  function renderBeranda() {
    const m = state.market;
    const bt = state.backtest;
    const ihsg = m.ihsg;
    const qIdx = state.quotes?.markets?.[state.mkt]?.index;
    const idxDaily = ihsg?.date ? Date.parse(ihsg.date + "T00:00:00Z") / 1000 : 0;
    const idxLive = qIdx && qIdx.t && qIdx.t > idxDaily ? qIdx : null;
    const idxPrice = idxLive ? idxLive.price : ihsg?.price;
    const idxChg = idxLive ? idxLive.chg_pct : ihsg?.chg_pct;
    const stocks = m.stocks || [];
    const beliList = stocks.filter((s) => s.signal === "BELI" && isLiquid(s)).sort((a, b) => (b.value20 || 0) - (a.value20 || 0));
    const cands = stocks.filter((s) => s.screener).sort((a, b) => screenerScore(b) - screenerScore(a));
    const bandar = stocks.filter((s) => s.ikut_bandar).sort((a, b) => (b.vol_ratio || 0) - (a.vol_ratio || 0));
    const bandar1d = bt?.next_day?.E_ikut_bandar;
    const bandar5d = bt?.day5?.E_ikut_bandar;
    const beli = stocks.filter((s) => s.signal === "BELI").length;
    const jual = stocks.filter((s) => s.signal === "JUAL").length;
    const scr = bt?.next_day?.C_screener;
    const trade = bt?.trade_beli;
    const dBeli = bt?.next_day?.D_beli_aturan;

    return `
      <div class="warn"><strong>Jujur dulu.</strong> Penyaring “potensi naik kuat” cuma nyaring momentum &amp; volume. Bukan ramalan naik 10% besok. Di sejarah ${escapeHtml(bt?.range || "5y")} data Yahoo, sinyal yang sama jarang dilanjutkan kenaikan 10% di hari berikutnya — angkanya di bawah.</div>
      <div class="card ihsg-card">
        <div class="ihsg">
          <div>
            <div class="small faint">${escapeHtml(ihsg?.code || M().idxName)} · ${idxLive ? quoteStamp(idxLive) : parseDay(ihsg?.date)}</div>
            <div class="px ${chgClass(idxChg)}">${fmtNum(idxPrice, 2)}</div>
            <div class="chg ${chgClass(idxChg)}">${pct(idxChg)}</div>
            <div class="small muted mt">SMA20 ${fmtNum(ihsg?.sma20, 0)} · SMA50 ${fmtNum(ihsg?.sma50, 0)} · SMA200 ${fmtNum(ihsg?.sma200, 0)}</div>
          </div>
          ${sparkSvg(ihsg?.spark)}
        </div>
      </div>
      <div class="kv three">
        <div class="cell"><span class="lbl">Sinyal BELI hari ini</span><span class="val" style="color:var(--up)">${fmtNum(beli)}</span></div>
        <div class="cell"><span class="lbl">Sinyal JUAL</span><span class="val" style="color:var(--down)">${fmtNum(jual)}</span></div>
        <div class="cell"><span class="lbl">Lolos penyaring</span><span class="val">${fmtNum(cands.length)}</span></div>
      </div>
      <div class="sec-head"><h2>Sinyal BELI + area masuk<span>Zona dari candle harian (±ATR / order block), dicek ke harga terbaru</span></h2></div>
      <div class="infobox">Harga gratis bisa tertunda, jadi tiap sinyal BELI punya <strong>area masuk</strong>. Kalau harga sekarang sudah di atas batas atas, statusnya <strong>“lewat zona”</strong> — jangan kejar. Di bawah SL = sinyal batal.</div>
      ${beliList.length ? beliList.slice(0, 12).map((s) => stockCard(s)).join("") : `<div class="card empty">Belum ada sinyal BELI di saham likuid ${escapeHtml(M().short)} pada candle terakhir.</div>`}

      <div class="sec-head"><h2>Potensi naik kuat<span>Filter volume, breakout, tutup dekat high — bukan jaminan</span></h2></div>
      ${cands.length ? cands.map(stockCard).join("") : `<div class="card empty">Hari ini tidak ada saham likuid yang lolos filter penyaring. Coba buka tab Saham untuk lihat sinyal lain, atau tunggu data hari bursa berikutnya.</div>`}

      <div class="sec-head" id="ikut-bandar"><h2>Ikut Bandar<span>Inferensi volume, bukan broker summary</span></h2></div>
      <div class="infobox">Fitur ini <strong>tidak memakai broker summary atau foreign flow</strong> — data itu tidak tersedia di sumber gratis app ini. Yang dipakai: lonjakan volume/nilai vs rata-rata 20 hari, harga naik, tutup dekat high, OBV atau Accumulation/Distribution 5 hari naik, dan breakout dari base (highest 20 hari). Ini tebakan terdidik dari tape, bukan jejak sekuritas tertentu.</div>
      ${bandar.length ? bandar.map(stockCard).join("") : `<div class="card empty">Hari ini tidak ada saham likuid yang lolos flag Ikut Bandar.</div>`}
      <div class="card">
        <h3>Statistik Ikut Bandar (sejarah nyata)</h3>
        <p class="small muted">${escapeHtml(bandar1d?.definisi || "")}</p>
        <p class="small faint">Hari berikutnya (tutup → tutup):</p>
        ${statBlock(bandar1d)}
        <p class="small faint mt">Lima hari bursa kemudian:</p>
        ${statBlock(bandar5d)}
        <p class="small mt">Dari <strong>${fmtNum(bandar1d?.n)}</strong> kali flag muncul, lanjut ≥10% di hari berikutnya <strong>${fmtNum(bandar1d?.n_ge_10)}</strong> kali (${fmtNum(bandar1d?.pct_ge_10, 2)}%). Median hari +1: ${fmtNum(bandar1d?.median_pct, 2)}%. Di hari ke-5, ≥10% terjadi ${fmtNum(bandar5d?.pct_ge_10, 2)}% dari sampel, median ${fmtNum(bandar5d?.median_pct, 2)}%. Bukan jaminan ke depan.</p>
      </div>

      <div class="sec-head"><h2>Statistik jujur<span>Dihitung dari sejarah nyata Yahoo, range ${escapeHtml(bt?.range || "—")}, close → close hari berikutnya</span></h2></div>
      <div class="card">
        <h3>Sinyal penyaring, hari berikutnya</h3>
        <p class="small muted">${escapeHtml(scr?.definisi || "")}</p>
        ${statBlock(scr)}
        <p class="small mt">Dari <strong>${fmtNum(scr?.n)}</strong> kali sinyal muncul, yang lanjut naik ≥10% di hari berikutnya cuma <strong>${fmtNum(scr?.n_ge_10)}</strong> kali (${fmtNum(scr?.pct_ge_10, 2)}%). Median malah ${fmtNum(scr?.median_pct, 2)}%. Ini bukti bahwa “potensi” ≠ janji.</p>
      </div>
      <div class="card">
        <h3>Aturan BELI (breakout/retest), hari berikutnya</h3>
        <p class="small muted">${escapeHtml(dBeli?.definisi || "")}</p>
        ${statBlock(dBeli)}
      </div>
      <div class="card">
        <h3>Simulasi posisi aturan BELI</h3>
        <p class="small muted">${escapeHtml(bt?.catatan_trade_beli || "")}</p>
        <div class="stat-grid">
          <div class="cell"><div class="lbl small faint">Jumlah trade</div><div class="num">${fmtNum(trade?.n_trades)}</div></div>
          <div class="cell"><div class="lbl small faint">Win rate</div><div class="num">${fmtNum(trade?.win_rate, 2)}%</div></div>
          <div class="cell"><div class="lbl small faint">Menang / kalah</div><div class="num">${fmtNum(trade?.n_win)} / ${fmtNum(trade?.n_lose)}</div></div>
          <div class="cell"><div class="lbl small faint">Median hasil</div><div class="num">${fmtNum(trade?.median_pct, 2)}%</div></div>
        </div>
        <p class="small mt">Win rate di bawah 50% dan median negatif artinya aturan ini, di data 5 tahun, tidak unggul secara kasar. Dipakai sebagai kerangka, bukan mesin cuan.</p>
      </div>
      ${bt?.trade_beli_zona ? `<div class="card">
        <h3>Simulasi BELI hanya di area masuk</h3>
        <p class="small muted">${escapeHtml(bt.trade_beli_zona.definisi || "")}</p>
        <div class="stat-grid">
          <div class="cell"><div class="lbl small faint">Trade masuk</div><div class="num">${fmtNum(bt.trade_beli_zona.n_trades)}</div></div>
          <div class="cell"><div class="lbl small faint">Dilewati (lewat zona)</div><div class="num">${fmtNum(bt.trade_beli_zona.n_skip_lewat_zona)}</div></div>
          <div class="cell"><div class="lbl small faint">Win rate</div><div class="num">${fmtNum(bt.trade_beli_zona.win_rate, 2)}%</div></div>
          <div class="cell"><div class="lbl small faint">Median / rata-rata</div><div class="num">${fmtNum(bt.trade_beli_zona.median_pct, 2)}% / ${fmtNum(bt.trade_beli_zona.avg_pct, 2)}%</div></div>
        </div>
        <p class="small mt">Area masuk mencegah beli kemahalan setelah harga lari, tapi angka di atas menunjukkan itu <strong>bukan</strong> jaminan untung.</p>
      </div>` : ""}
      <p class="small faint">Setup lain (volume spike saja, breakout+volume) ada di data/backtest.json — definisinya tertulis, angkanya dihitung, bukan dikarang.</p>
      ${disclaimer()}
    `;
  }

  function statBlock(s) {
    if (!s || !s.n) return `<p class="muted">Belum ada sampel.</p>`;
    return `<div class="kv">
      <div class="cell"><span class="lbl">Sampel</span><span class="val">${fmtNum(s.n)}</span></div>
      <div class="cell"><span class="lbl">≥10% hari +1</span><span class="val">${fmtNum(s.pct_ge_10, 2)}%</span></div>
      <div class="cell"><span class="lbl">≥5% hari +1</span><span class="val">${fmtNum(s.pct_ge_5, 2)}%</span></div>
      <div class="cell"><span class="lbl">≥0% (tidak merah)</span><span class="val">${fmtNum(s.pct_ge_0, 2)}%</span></div>
      <div class="cell"><span class="lbl">≤−5%</span><span class="val">${fmtNum(s.pct_le_m5, 2)}%</span></div>
      <div class="cell"><span class="lbl">Median / rata-rata</span><span class="val">${fmtNum(s.median_pct, 2)}% / ${fmtNum(s.avg_pct, 2)}%</span></div>
    </div>`;
  }

  function stockCard(s, { compact } = {}) {
    const qt = quoteOf(s);
    const thin = s.thin ? `<span class="badge thin">kurang likuid</span>` : "";
    const mon = String(s.board || "").toLowerCase().startsWith("pemantauan") ? `<span class="badge warn">${escapeHtml(s.board)}</span>` : `<span class="badge board">${escapeHtml(s.board || "")}</span>`;
    const star = isWatched(s.code) ? "★" : "";
    return `<article class="card stock-card" data-open="${s.code}">
      <div class="stock">
        <div>
          <div class="code">${escapeHtml(s.code)} ${star} ${badgeSignal(s.signal)}</div>
        </div>
        <div class="right">
          <div class="price">${px(qt.price)}</div>
          <div class="chg ${chgClass(qt.chg_pct)}">${pct(qt.chg_pct)}</div>
          <div class="qt-time">${quoteStamp(qt)}</div>
        </div>
        <div class="name">${escapeHtml(s.name)}</div>
      </div>
      ${zoneLine(s, qt)}
      <div class="meta-line mt">
        ${mon} ${thin}
        ${s.ikut_bandar ? `<span class="badge bandar">Ikut Bandar</span>` : ""}
        ${s.ob_near === "bull" ? `<span class="badge beli">OB naik</span>` : s.ob_near === "bear" ? `<span class="badge jual">OB turun</span>` : ""}
        <span>Vol ${s.vol_ratio ? fmtNum(s.vol_ratio, 2) + "×" : "—"}</span>
        <span>RSI ${s.rsi14 ?? "—"}</span>
        <span>${M().lotWord} ${rp((qt.price || 0) * (s.lot || M().lot))}</span>
      </div>
      ${compact ? "" : `<div class="small muted mt">${(s.reasons || []).slice(0, 2).map(escapeHtml).join(" · ")}</div>`}
    </article>`;
  }

  function filteredStocks() {
    let list = state.market.stocks || [];
    const q = state.query.trim().toLowerCase();
    if (q) {
      list = list.filter((s) =>
        s.code.toLowerCase().includes(q) ||
        (s.name || "").toLowerCase().includes(q) ||
        (s.yahoo_name || "").toLowerCase().includes(q)
      );
    }
    const f = state.sahamFilter;
    if (f === "beli") list = list.filter((s) => s.signal === "BELI");
    else if (f === "jual") list = list.filter((s) => s.signal === "JUAL");
    else if (f === "tunggu") list = list.filter((s) => s.signal === "TUNGGU");
    else if (f === "screener") list = list.filter((s) => s.screener);
    else if (f === "likuid") list = list.filter(isLiquid);
    else if (f === "watch") list = list.filter((s) => isWatched(s.code));
    else if (f === "bandar") list = list.filter((s) => s.ikut_bandar);
    else if (f === "dividen") list = list.filter((s) => (s.yield_ttm || 0) >= 4);
    else if (f === "utama") list = list.filter((s) => state.mkt === "id" ? s.board === "Utama" : /Nasdaq-100|Nikkei/.test(s.board || ""));
    if (state.watchOnly) list = list.filter((s) => isWatched(s.code));
    list = [...list].sort((a, b) => (b.value || 0) - (a.value || 0));
    return list;
  }

  function renderSaham() {
    if (state.selected) return renderDetail(state.selected);
    const list = filteredStocks();
    const missing = state.market.missing || [];
    const filters = [
      ["semua", "Semua"],
      ["beli", "BELI"],
      ["jual", "JUAL"],
      ["tunggu", "TUNGGU"],
      ["screener", "Penyaring"],
      ["likuid", "Likuid"],
      ["dividen", "Yield ≥4%"],
      ["utama", state.mkt === "us" ? "Nasdaq-100" : state.mkt === "jp" ? "Nikkei 225" : "Papan utama"],
      ["watch", "Watchlist"],
      ["bandar", "Ikut Bandar"],
    ];
    return `
      <div class="sec-head"><h2>${state.watchOnly ? "Watchlist" : "Cari saham"}<span>${escapeHtml(M().label)} · sinyal dari candle ${parseDay(state.market.ihsg?.date)}</span></h2></div>
      <input class="search" id="q" type="search" placeholder="${state.mkt === "us" ? "Cari ticker / nama, mis. AAPL" : state.mkt === "jp" ? "Cari kode / nama, mis. 7203 Toyota" : "Cari kode atau nama emiten…"}" value="${escapeHtml(state.query)}" />
      <div class="filters" id="filters">
        ${filters.map(([id, lab]) => `<button type="button" data-f="${id}" aria-pressed="${state.sahamFilter === id}">${lab}</button>`).join("")}
      </div>
      <p class="hint tight">${fmtNum(list.length)} saham ditampilkan · ${fmtNum(state.market.counts.yahoo_ok)} ada datanya · ${fmtNum(missing.length)} tidak ketemu di Yahoo</p>
      ${list.length ? list.map((s) => stockCard(s, { compact: true })).join("") : `<div class="card empty">Tidak ada yang cocok. Coba kata kunci lain atau reset filter.</div>`}
      ${missing.length ? `<details class="card flat"><summary class="small">Emiten di daftar tanpa data Yahoo (${missing.length})</summary><p class="small muted mt">${missing.map((x) => escapeHtml(x.code)).join(", ")}. Biasanya karena tidak ada chart, ticker berbeda, atau saham tidak aktif di Yahoo. App tidak mengisi harga palsu.</p></details>` : ""}
      ${disclaimer()}
    `;
  }

  function renderDetail(code) {
    const s = stockByCode(code);
    if (!s) {
      return `<button class="back" data-back="saham">← Kembali</button><div class="card">Kode ${escapeHtml(code)} tidak ada di data yang berhasil diambil.</div>`;
    }
    const watched = isWatched(s.code);
    const qt = quoteOf(s);
    const zs = zoneState(s, qt);
    const news = (state.news?.items || []).filter((n) => (n.tickers || []).includes(s.code));
    const araNote = s.tp1 && s.ara && s.tp1 > s.ara
      ? `<p class="small muted">TP1 (${fmtNum(s.tp1)}) di atas batas ARA perkiraan hari ini (${fmtNum(s.ara)}) — target itu biasanya butuh lebih dari satu sesi, dan bisa terhalang auto rejection.</p>`
      : "";
    return `
      <button class="back" data-back="saham">← Kembali ke daftar</button>
      <div class="card">
        <div class="row">
          <div>
            <div class="code" style="font-weight:800;font-size:20px;letter-spacing:.04em">${escapeHtml(s.code)}</div>
            <div class="name muted">${escapeHtml(s.name)}</div>
            <div class="tags">${s.board ? `<span class="badge board">${escapeHtml(s.board)}</span>` : ""} ${s.thin ? `<span class="badge thin">kurang likuid</span>` : ""}</div>
          </div>
          <div class="right">
            <div class="px ${chgClass(qt.chg_pct)}" style="font-size:26px">${px(qt.price)}</div>
            <div class="chg ${chgClass(qt.chg_pct)}">${pct(qt.chg_pct)}</div>
            <div class="qt-time">${quoteStamp(qt)} · ${escapeHtml(qt.src)}</div>
          </div>
        </div>
        <div class="mt">${s.ohlc ? candleChart(s.ohlc, s.obs) : sparkSvg(s.spark, s.chg_pct >= 0 ? "#3dd68c" : "#f07178")}</div>
        <p class="small faint">Candle ±80 hari · zona hijau = order block naik (demand), merah = OB turun (supply). Pudar = sudah termitigasi. Deteksi mekanis dari displacement, <strong>bukan</strong> antrian order/bandar. Data ${parseDay(s.date)} · Yahoo ${escapeHtml(s.code)}${M().suffix}</p>
        <div class="mt">
          <button type="button" class="icon-btn ${watched ? "active" : ""}" data-toggle-watch="${s.code}">${watched ? "★ Di watchlist" : "☆ Tambah watchlist"}</button>
        </div>
      </div>

      <div class="card sinyal">
        <div class="small faint">Kartu Sinyal · aturan mekanis, bukan saran</div>
        <p class="status ${escapeHtml(s.signal)}">${escapeHtml(s.signal)}</p>
        <p class="small muted">${s.signal_kind === "breakout" ? "Setup breakout bervolume" : s.signal_kind === "retest" ? "Setup retest support di tren naik" : s.signal_kind === "breakdown" ? "Setup keluar / breakdown" : "Belum ada setup masuk/keluar yang terpenuhi"}</p>
        ${zs ? `<p class="mt"><span class="badge ${zs.cls}">${zs.label}</span> <span class="small faint">harga ${px(qt.price)} · ${quoteStamp(qt)}</span></p>` : ""}
        <div class="kv three mt">
          <div class="cell"><span class="lbl">${s.signal === "BELI" ? "Beli di bawah" : "Batas atas zona"}</span><span class="val">${px(s.entry_hi)}</span></div>
          <div class="cell"><span class="lbl">Area masuk</span><span class="val">${px(s.entry_lo)} – ${px(s.entry_hi)}</span></div>
          <div class="cell"><span class="lbl">Stop loss</span><span class="val">${px(s.sl)}</span></div>
          <div class="cell"><span class="lbl">TP1 / TP2</span><span class="val">${px(s.tp1)} / ${px(s.tp2)}</span></div>
        </div>
        <p class="small faint">Zona: ${escapeHtml(s.zone_basis || "tutup sinyal ± ATR14")}. Dihitung dari candle harian ${parseDay(s.date)} (tutup ${px(s.price)}), jadi tetap berlaku walau harga live tertunda. Di atas batas atas = lewat zona, jangan kejar.</p>
        ${araNote}
        <ul class="reasons">${(s.reasons || []).map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul>
        <p class="small faint mt">Entry/SL/TP dibulatkan ke fraksi harga ${state.mkt === "id" ? "BEI" : state.mkt === "jp" ? "TSE (tabel standar)" : "US$0,01"}. Win rate aturan ini di sejarah 5 tahun ada di Beranda — baca sebelum ikut angka di kartu ini.</p>
      </div>

      <div class="card">
        <h3>Ringkasan pasar</h3>
        <div class="kv">
          <div class="cell"><span class="lbl">Open · High · Low</span><span class="val">${px(s.open)} · ${px(s.high)} · ${px(s.low)}</span></div>
          <div class="cell"><span class="lbl">Volume · nilai</span><span class="val">${fmtNum(s.volume)} · ${rpCompact(s.value)}</span></div>
          <div class="cell"><span class="lbl">SMA20 · 50 · 200</span><span class="val">${fmtNum(s.sma20)} · ${fmtNum(s.sma50)} · ${fmtNum(s.sma200)}</span></div>
          <div class="cell"><span class="lbl">RSI14 · ATR14 · vol 20h</span><span class="val">${s.rsi14 ?? "—"} · ${fmtNum(s.atr14, 1)} · ${s.vol_ratio ? fmtNum(s.vol_ratio, 2) + "×" : "—"}</span></div>
        </div>
      </div>

      <div class="card">
        <h3>Dividen — kapan beli &amp; kapan cair</h3>
        ${s.div?.next ? `<div class="mb">${countdown(s.div.next)} ${s.div.next_is_official ? `<span class="badge beli">jadwal resmi</span>` : `<span class="badge tunggu">perkiraan</span>`}</div>${schedTable(s.div.next)}` : `<p class="muted">Belum ada jadwal dividen berikutnya (resmi maupun perkiraan).</p>`}
        ${s.div?.next && !s.div.next_is_official ? `<p class="small muted">${escapeHtml(s.div.next.cum?.basis || "")}. Tanggal cair: ${escapeHtml(s.div.next.pay?.basis || "")}.</p>` : ""}
        ${s.div?.next?.source_url ? `<p class="small faint">Sumber: <a href="${escapeHtml(s.div.next.source_url)}" target="_blank" rel="noopener">pengumuman KSEI (PDF)</a></p>` : ""}
        <p class="mt">DPS 12 bulan terakhir <strong>${s.dps_ttm ? fmtNum(s.dps_ttm, 2) : "—"}</strong> · yield <strong>${s.yield_ttm != null ? fmtNum(s.yield_ttm, 2) + "%" : "—"}</strong>${(s.div?.pay_months || []).length ? ` · Biasanya cair: <strong>${s.div.pay_months.map((m) => MONTHS[m - 1]).join(", ")}</strong>` : ""}</p>
        ${simLine(s, modalVal())}
        ${s.div?.last ? `<details class="mt"><summary class="small">Jadwal terakhir (${parseDay(s.div.last.pay?.date || s.div.last.ex?.date)})</summary>${schedTable(s.div.last)}</details>` : ""}
        ${s.divs?.length ? `<details class="mt"><summary class="small">Riwayat ex-date Yahoo (${s.divs.length})</summary><table class="prose"><thead><tr><th>Ex-date</th><th>DPS</th></tr></thead><tbody>${s.divs.slice().reverse().map((d) => `<tr><td>${parseDay(d.ex)}</td><td>${fmtNum(d.dps, 2)}</td></tr>`).join("")}</tbody></table></details>` : ""}
        <button type="button" class="icon-btn mt" data-calc-from="${s.code}">Hitung dividen saham ini</button>
      </div>

      <div class="card">
        <h3>Berita terkait</h3>
        ${news.length ? news.slice(0, 8).map(newsCard).join("") : `<p class="muted">Tidak ada berita RSS terbaru yang berhasil ditandai ke kode ${escapeHtml(s.code)}. Bukan berarti tidak ada berita di luar sana.</p>`}
      </div>
      ${disclaimer()}
    `;
  }

  // ================= DIVIDEN =================
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  const DEFAULT_MODAL = { id: 5000000, us: 1000, jp: 500000 };
  function todayMkt() { return new Date().toLocaleDateString("en-CA", { timeZone: M().tz }); }
  function daysBetween(a, b) { return Math.round((Date.parse(b + "T00:00:00Z") - Date.parse(a + "T00:00:00Z")) / 86400000); }
  function modalVal() {
    const v = state.divModal?.[state.mkt];
    return v == null || v === "" ? DEFAULT_MODAL[state.mkt] : Number(v);
  }
  function taxRateFor(reinvest) {
    if (state.mkt === "id") return reinvest ? 0 : 0.1;
    if (state.mkt === "jp") return 0.20315;
    return 1 - 0.9 * (1 - 0.20315);
  }
  function taxLabel(reinvest) {
    if (state.mkt === "jp") return "pajak Jepang 20,315%";
    if (state.mkt === "us") return "pajak ±28,3% (AS 10% + Jepang)";
    return reinvest ? "pajak 0% (reinvest sesuai aturan)" : "PPh final 10%";
  }
  function lotSize() { return M().lot; }
  function divNext(s) { return s.div?.next || null; }
  function dpsPerPay(s) {
    const n = divNext(s);
    const cur = n?.dps_currency || s.div?.last?.dps_currency;
    if (cur && cur !== M().cur) return { dps: null, foreign: cur };
    if (n?.dps != null) return { dps: n.dps, basis: n.dps_status === "resmi" ? "DPS resmi berikutnya" : "DPS pembayaran yang sama tahun lalu" };
    if (s.div?.last?.dps != null) return { dps: s.div.last.dps, basis: "DPS pembayaran terakhir" };
    if (s.last_dps != null) return { dps: s.last_dps, basis: "DPS terakhir (Yahoo)" };
    return { dps: null };
  }
  // Simulasi modal → lot → dividen (dari pembayaran nyata 12 bulan terakhir, bukan jaminan)
  function divSim(s, modal, opts = {}) {
    const price = opts.price != null && opts.price !== "" ? Number(opts.price) : (quoteOf(s).price || s.price);
    const lot = lotSize();
    const lots = price > 0 ? Math.floor(modal / (price * lot)) : 0;
    const shares = lots * lot;
    const cost = shares * price;
    const per = dpsPerPay(s);
    const dps = opts.dps != null && opts.dps !== "" ? Number(opts.dps) : per.dps;
    const rate = taxRateFor(!!opts.reinvest);
    const grossPer = dps != null ? shares * dps : null;
    const ttm = s.dps_ttm || 0;
    const grossYear = shares * ttm;
    return {
      price, lot, lots, shares, cost, sisa: modal - cost, dps, dpsBasis: opts.dps ? "isian kamu" : per.basis, foreign: per.foreign,
      rate, grossPer, taxPer: grossPer == null ? null : grossPer * rate, netPer: grossPer == null ? null : grossPer * (1 - rate),
      grossYear, netYear: grossYear * (1 - rate), yieldGross: cost ? (grossYear / cost) * 100 : null, yieldNet: cost ? (grossYear * (1 - rate) / cost) * 100 : null,
      needOneLot: price * lot,
    };
  }
  function modalWord(n) {
    if (state.mkt === "id") return n >= 1e6 && n % 1e6 === 0 ? `Rp${fmtNum(n / 1e6)} juta` : rp(n);
    return rp(n);
  }
  function lotWord(lots) {
    if (state.mkt === "us") return `${fmtNum(lots)} saham`;
    if (state.mkt === "jp") return `${fmtNum(lots)} unit (${fmtNum(lots * 100)} lbr)`;
    return `${fmtNum(lots)} lot`;
  }
  function simLine(s, modal) {
    const r = divSim(s, modal);
    if (r.foreign) return `<div class="sim small muted">DPS dibayar dalam ${escapeHtml(r.foreign)} — hitung manual di detail.</div>`;
    if (!r.lots) return `<div class="sim small muted">${modalWord(modal)} belum cukup untuk ${state.mkt === "us" ? "1 saham" : "1 lot"} (butuh ${rp(r.needOneLot)}).</div>`;
    if (!s.dps_ttm && r.dps == null) return "";
    return `<div class="sim"><span class="lbl">Beli ${modalWord(modal)}</span> → ${lotWord(r.lots)} (${rp(r.cost)}) → dividen bersih ±<strong>${rp(r.netYear)}</strong>/tahun${r.netPer != null ? ` · ±${rp(r.netPer)} per pembayaran` : ""} <span class="faint">(dari pembayaran 12 bln terakhir, bukan jaminan)</span></div>`;
  }
  function stBadge(f) {
    if (!f) return `<span class="badge thin">—</span>`;
    if (f.status === "resmi") return `<span class="badge beli" title="${escapeHtml(f.basis)}">resmi</span>`;
    if (f.status === "resmi*") return `<span class="badge board" title="${escapeHtml(f.basis)}">resmi*</span>`;
    return `<span class="badge tunggu" title="${escapeHtml(f.basis)}">perkiraan</span>`;
  }
  function countdown(n) {
    if (!n?.cum) return "";
    const t = todayMkt();
    const dc = daysBetween(t, n.cum.date);
    const pay = n.pay?.date;
    if (dc > 1) return `<span class="cd soon">Beli paling lambat ${dc} hari lagi</span>`;
    if (dc === 1) return `<span class="cd soon">Besok hari terakhir beli (cum)</span>`;
    if (dc === 0) return `<span class="cd now">Hari ini cum date — hari terakhir beli!</span>`;
    if (pay && daysBetween(t, pay) >= 0) {
      const dp = daysBetween(t, pay);
      return `<span class="cd wait">Cum sudah lewat · yang sudah pegang tinggal tunggu cair ${dp === 0 ? "hari ini" : dp + " hari lagi"}</span>`;
    }
    return `<span class="cd past">Sudah lewat, tunggu jadwal berikutnya</span>`;
  }
  function schedTable(n) {
    if (!n) return `<p class="muted small">Belum ada jadwal resmi dan pola tahun lalu tidak cukup untuk perkiraan.</p>`;
    const row = (lbl, f, strong) => `<tr><td>${lbl}</td><td>${f ? (strong ? `<strong>${parseDay(f.date)}</strong>` : parseDay(f.date)) : "—"}</td><td>${stBadge(f)}</td></tr>`;
    return `<table class="sched"><tbody>
      ${row("Beli paling lambat (cum date)", n.cum, true)}
      ${row("Ex date (mulai boleh jual)", n.ex)}
      ${row("Recording date", n.record)}
      ${row("Tanggal cair (payment)", n.pay, true)}
      <tr><td>Dividen per lembar</td><td><strong>${n.dps != null ? (n.dps_currency && n.dps_currency !== M().cur ? n.dps_currency + " " + fmtNum(n.dps, 3) : rp(n.dps, n.dps % 1 ? 2 : (M().cur === "USD" ? 2 : 0))) : "—"}</strong></td><td>${n.dps != null ? stBadge({ status: n.dps_status || "perkiraan", basis: "DPS" }) : ""}</td></tr>
    </tbody></table>`;
  }
  function divRow(s, modal) {
    const n = divNext(s);
    const months = (s.div?.pay_months || []).map((m) => MONTHS[m - 1]).join(", ");
    return `<article class="card stock-card div-card" data-open="${s.code}">
      <div class="stock">
        <div><div class="code">${escapeHtml(s.code)} ${badgeSignal(s.signal)} ${n ? (s.div.next_is_official ? `<span class="badge beli">jadwal resmi</span>` : `<span class="badge tunggu">perkiraan</span>`) : ""}</div></div>
        <div class="right"><div class="price">${s.yield_ttm != null ? fmtNum(s.yield_ttm, 2) + "%" : "—"}</div><div class="qt-time">yield 12 bln</div></div>
        <div class="name">${escapeHtml(s.name)}</div>
      </div>
      ${n ? `<div class="mt">${countdown(n)}</div>
      <div class="dates4">
        <div><span class="lbl">Beli paling lambat</span><b>${parseDay(n.cum?.date)}</b>${stBadge(n.cum)}</div>
        <div><span class="lbl">Ex date</span><b>${parseDay(n.ex?.date)}</b>${stBadge(n.ex)}</div>
        <div><span class="lbl">Recording</span><b>${parseDay(n.record?.date)}</b>${stBadge(n.record)}</div>
        <div><span class="lbl">Cair</span><b>${parseDay(n.pay?.date)}</b>${stBadge(n.pay)}</div>
      </div>
      <div class="small mt">DPS ${n.dps != null ? (n.dps_currency && n.dps_currency !== M().cur ? n.dps_currency + " " + fmtNum(n.dps, 3) : rp(n.dps, n.dps % 1 ? 2 : undefined)) : "—"} · harga ${px(quoteOf(s).price)}${months ? ` · Biasanya cair: <strong>${months}</strong>` : ""}</div>` :
      `<div class="small muted mt">Belum ada jadwal berikutnya.${months ? ` Biasanya cair: <strong>${months}</strong>.` : ""}</div>`}
      ${simLine(s, modal)}
    </article>`;
  }
  function divExplainer() {
    const settle = state.mkt === "us" ? "T+1: beli paling lambat 1 hari bursa sebelum ex date (record = ex date)"
      : state.mkt === "jp" ? "T+2 (権利付最終日): beli paling lambat 2 hari bursa sebelum recording; ex date = 1 hari bursa sebelum recording"
      : "T+2: beli paling lambat di cum date; ex date = 1 hari bursa setelah cum; recording = 2 hari bursa setelah cum";
    return `<details class="card flat explain" ${state.divExplainOpen ? "open" : ""}>
      <summary><strong>Cara dapat dividen (cum · ex · recording · cair)</strong></summary>
      <ol class="small">
        <li><strong>Cum date</strong> = hari terakhir <strong>beli</strong>. Beli sebelum atau <em>pada</em> cum date (pasar reguler) → kamu berhak dapat dividen.</li>
        <li><strong>Ex date</strong> = beli mulai hari ini <strong>tidak</strong> dapat dividen. Tapi kalau kamu sudah pegang sejak cum date, <strong>boleh jual mulai ex date</strong> dan tetap dapat dividen.</li>
        <li><strong>Recording date</strong> = KSEI/biro mencatat siapa pemegang saham (hasil settlement ${state.mkt === "us" ? "T+1" : "T+2"}).</li>
        <li><strong>Tanggal cair (payment)</strong> = dividen masuk ke RDN/rekening sekuritas, sudah dipotong pajak.</li>
      </ol>
      <p class="small muted">${settle}. Harga biasanya turun kira-kira sebesar dividen di ex date — dividen bukan uang gratis.</p>
      <p class="small muted"><span class="badge beli">resmi</span> dari sumber resmi (${state.mkt === "id" ? "KSEI: API jadwal aksi korporasi + PDF pengumuman" : state.mkt === "us" ? "Nasdaq dividend calendar" : "belum ada sumber resmi gratis untuk Jepang"}). <span class="badge board">resmi*</span> dihitung dari tanggal resmi dengan aturan settlement. <span class="badge tunggu">perkiraan</span> dari pola tahun lalu — cek pengumuman emiten sebelum bertindak.</p>
    </details>`;
  }

  function dividendList() {
    return (state.market.stocks || [])
      .filter((s) => s.yield_ttm != null && s.dps_ttm > 0)
      .sort((a, b) => (b.yield_ttm || 0) - (a.yield_ttm || 0));
  }

  function renderDividen() {
    const modal = modalVal();
    const view = state.divView || "terdekat";
    const t = todayMkt();
    const stocks = state.market.stocks || [];
    const payers = stocks.filter((s) => (s.dps_ttm || 0) > 0 || s.div?.next);
    const ds = state.market.dividend_schedule || {};
    let body = "";
    if (view === "terdekat") {
      const withNext = payers.filter((s) => divNext(s)?.cum?.date);
      const upcoming = withNext.filter((s) => daysBetween(t, divNext(s).cum.date) >= 0)
        .sort((a, b) => divNext(a).cum.date.localeCompare(divNext(b).cum.date) || (b.yield_ttm || 0) - (a.yield_ttm || 0));
      const waiting = withNext.filter((s) => daysBetween(t, divNext(s).cum.date) < 0 && divNext(s).pay?.date && daysBetween(t, divNext(s).pay.date) >= 0)
        .sort((a, b) => divNext(a).pay.date.localeCompare(divNext(b).pay.date));
      const off = upcoming.filter((s) => s.div.next_is_official);
      const est = upcoming.filter((s) => !s.div.next_is_official && daysBetween(t, divNext(s).cum.date) <= 120);
      const lim = state.divShowAll ? 400 : 25;
      body = `
        <div class="sec-head"><h2>Jadwal dividen terdekat<span>Diurutkan dari cum date (hari terakhir beli) paling dekat</span></h2></div>
        <h3 class="subh">Sudah diumumkan resmi (${fmtNum(off.length)})</h3>
        ${off.length ? off.map((s) => divRow(s, modal)).join("") : `<div class="card empty">Belum ada pengumuman resmi dengan cum date ke depan${state.mkt === "jp" ? " (Jepang: belum ada sumber resmi gratis)" : ""}.</div>`}
        ${waiting.length ? `<h3 class="subh">Cum sudah lewat, tinggal tunggu cair (${fmtNum(waiting.length)})</h3>${waiting.slice(0, lim).map((s) => divRow(s, modal)).join("")}` : ""}
        <h3 class="subh">Perkiraan 4 bulan ke depan (${fmtNum(est.length)})</h3>
        <p class="hint tight">Dari pola tahun lalu — tanggal & DPS bisa berubah atau batal.</p>
        ${est.slice(0, lim).map((s) => divRow(s, modal)).join("") || `<div class="card empty">Tidak ada.</div>`}
        ${est.length > lim ? `<button type="button" class="icon-btn" data-div-all="1">Tampilkan semua (${est.length})</button>` : ""}`;
    } else if (view === "kalender") {
      const mo = state.divMonth || 0;
      const counts = MONTHS.map((_, i) => payers.filter((s) => (s.div?.pay_months || []).includes(i + 1)).length);
      const list = payers.filter((s) => !mo || (s.div?.pay_months || []).includes(mo))
        .sort((a, b) => (b.yield_ttm || 0) - (a.yield_ttm || 0));
      body = `
        <div class="sec-head"><h2>Kalender dividen<span>Bulan biasanya cair — dari riwayat pembayaran, perkiraan</span></h2></div>
        <div class="month-grid">
          <button type="button" data-div-month="0" aria-pressed="${!mo}">Semua<small>${fmtNum(payers.length)}</small></button>
          ${MONTHS.map((m, i) => `<button type="button" data-div-month="${i + 1}" aria-pressed="${mo === i + 1}">${m}<small>${counts[i]}</small></button>`).join("")}
        </div>
        <p class="hint tight">${mo ? `${fmtNum(list.length)} saham biasanya cair di bulan <strong>${MONTHS[mo - 1]}</strong>` : `${fmtNum(list.length)} saham pembagi dividen`} · urut yield tertinggi. Dasar: ${escapeHtml("tanggal bayar resmi 12 bln terakhir + pola ex-date ≥2 tahun")}.</p>
        ${list.slice(0, state.divShowAll ? 600 : 40).map((s) => divRow(s, modal)).join("")}
        ${list.length > 40 && !state.divShowAll ? `<button type="button" class="icon-btn" data-div-all="1">Tampilkan semua (${list.length})</button>` : ""}`;
    } else {
      const all = dividendList();
      const good = all.filter((s) => s.yield_ttm >= 4 && isLiquid(s));
      const show = (good.length ? good : all.filter((s) => isLiquid(s))).slice(0, state.divShowAll ? 400 : 30);
      body = `
        <div class="sec-head"><h2>Yield tertinggi${good.length ? " (likuid ≥ 4%)" : ""}<span>Yield = DPS 12 bln terakhir ÷ harga sekarang · likuid ≥ ${escapeHtml(state.market.min_value_label || "Rp2 miliar")}/hari</span></h2></div>
        ${show.map((s) => divRow(s, modal)).join("")}
        <p class="small faint">Yield tinggi bisa karena harga sedang jatuh atau ada dividen spesial. Cek riwayat di halaman saham.</p>`;
    }
    const c = calcResult();
    const codes = stocks.filter((s) => (s.dps_ttm || 0) > 0).map((s) => `<option value="${s.code}">${escapeHtml(s.name)}</option>`).join("");
    return `
      <div class="sec-head"><h2>Dividen<span>${fmtNum(payers.length)} saham bayar dividen · jadwal resmi ${fmtNum(ds.next_official || 0)} · perkiraan ${fmtNum(ds.next_estimated || 0)}${ds.updated_utc ? ` · cek sumber ${parseDateTimeWib(ds.updated_utc)}` : ""}</span></h2></div>
      ${divExplainer()}
      <div class="card modal-card">
        <label class="modal-in">Modal simulasi (${curSym()})<input id="div-modal" type="number" min="0" step="${state.mkt === "us" ? 10 : 1000}" value="${escapeHtml(String(modal))}" /></label>
        <p class="small faint">Dipakai di tiap baris: modal → ${state.mkt === "us" ? "jumlah saham" : state.mkt === "jp" ? "unit (100 lembar)" : "lot (100 lembar)"} dibulatkan ke bawah → dividen bersih (${taxLabel(false)}). Berdasar pembayaran 12 bulan terakhir, <strong>bukan jaminan</strong>.</p>
      </div>
      <div class="filters">
        ${[["terdekat", "Jadwal terdekat"], ["kalender", "Kalender Jan–Des"], ["yield", "Yield tertinggi"]].map(([id, lab]) => `<button type="button" data-div-view="${id}" aria-pressed="${view === id}">${lab}</button>`).join("")}
      </div>
      ${body}

      <div class="card" id="kalkulator">
        <h3>Kalkulator dividen per saham</h3>
        <div class="form">
          <label>Kode<input id="calc-code" list="calc-codes" value="${escapeHtml(state.calc.code)}" placeholder="${state.mkt === "us" ? "Contoh: KO" : state.mkt === "jp" ? "Contoh: 7203" : "Contoh: BBCA"}" autocomplete="off" /><datalist id="calc-codes">${codes}</datalist></label>
          <label>Modal (${curSym()})<input id="calc-modal" type="number" min="0" step="${state.mkt === "us" ? 10 : 1000}" value="${escapeHtml(state.calc.modal === "" || state.calc.modal == null ? String(modal) : state.calc.modal)}" /></label>
          <label>Harga per lembar (kosong = harga terbaru)<input id="calc-price" type="number" min="0" step="any" value="${escapeHtml(state.calc.price)}" placeholder="${c.priceHint || ""}" /></label>
          <label>Dividen per lembar per pembayaran (kosong = otomatis)<input id="calc-dps" type="number" min="0" step="any" value="${escapeHtml(state.calc.dps)}" placeholder="${c.dpsHint || ""}" /></label>
          <label class="toggle" ${state.mkt !== "id" ? "hidden" : ""}><input id="calc-reinvest" type="checkbox" ${state.calc.reinvest ? "checked" : ""} /> Saya reinvest sesuai aturan (pajak 0%)</label>
        </div>
        ${c.s ? `<div class="kv three mt">
          <div class="cell"><span class="lbl">${state.mkt === "us" ? "Jumlah saham" : state.mkt === "jp" ? "Unit (100 lbr)" : "Lot (100 lbr)"}</span><span class="val">${fmtNum(c.lots)}</span></div>
          <div class="cell"><span class="lbl">Biaya beli</span><span class="val">${rp(c.cost)}</span></div>
          <div class="cell"><span class="lbl">Sisa modal</span><span class="val">${rp(c.sisa)}</span></div>
          <div class="cell"><span class="lbl">Dividen kotor / bayar</span><span class="val">${c.grossPer == null ? "—" : rp(c.grossPer)}</span></div>
          <div class="cell"><span class="lbl">${escapeHtml(taxLabel(c.reinvest))}</span><span class="val">${c.taxPer == null ? "—" : rp(c.taxPer)}</span></div>
          <div class="cell"><span class="lbl">Bersih diterima / bayar</span><span class="val">${c.netPer == null ? "—" : rp(c.netPer)}</span></div>
          <div class="cell"><span class="lbl">Total 12 bln kotor / bersih</span><span class="val">${rp(c.grossYear)} / ${rp(c.netYear)}</span></div>
          <div class="cell"><span class="lbl">Yield kotor / bersih</span><span class="val">${fmtNum(c.yieldGross, 2)}% / ${fmtNum(c.yieldNet, 2)}%</span></div>
          <div class="cell"><span class="lbl">Lembar</span><span class="val">${fmtNum(c.shares)}</span></div>
        </div>
        <p class="small muted">DPS per pembayaran: ${escapeHtml(c.dpsBasis || "—")}. Total 12 bulan = DPS 12 bln terakhir (${fmtNum(c.s.dps_ttm, 2)}) × lembar. ${c.lots ? "" : `Modal belum cukup 1 ${state.mkt === "us" ? "saham" : "lot"} (butuh ${rp(c.needOneLot)}).`}</p>` : `<p class="muted small mt">Pilih kode saham untuk menghitung.</p>`}
        <p class="small muted" ${state.mkt !== "id" ? "" : "hidden"}>Asumsi pajak: residen Jepang, rekening biasa (bukan NISA). Saham AS: dipotong 10% di AS lalu 20,315% di Jepang (bisa klaim kredit pajak luar negeri). Perkiraan, bukan nasihat pajak.</p>
        <p class="small muted" ${state.mkt !== "id" ? "hidden" : ""}><strong>Pajak:</strong> dividen dalam negeri untuk WP orang pribadi bebas PPh jika diinvestasikan kembali di Indonesia sesuai syarat (UU HPP jo. PMK-18/2021); kalau tidak, PPh final 10%. Ringkasan, bukan nasihat pajak.</p>
      </div>
      ${disclaimer()}
    `;
  }

  function calcResult() {
    const s = state.calc.code ? stockByCode(state.calc.code) : null;
    const modal = state.calc.modal === "" || state.calc.modal == null ? modalVal() : Number(state.calc.modal);
    if (!s) return { s: null, reinvest: !!state.calc.reinvest };
    const r = divSim(s, modal, { price: state.calc.price, dps: state.calc.dps, reinvest: !!state.calc.reinvest });
    return { s, ...r, reinvest: !!state.calc.reinvest, priceHint: String(quoteOf(s).price ?? ""), dpsHint: r.dps != null ? String(r.dps) : "" };
  }

  function renderBelajar() {
    const items = window.SAHAM_CONTENT?.belajar || [];
    if (state.lessonId === "kuis") return renderQuizPage("Kuis dasar saham", window.SAHAM_CONTENT.belajarQuiz, "belajar");
    const item = items.find((x) => x.id === state.lessonId);
    if (item) {
      return `
        <button class="back" data-back="belajar">← Semua materi dasar</button>
        <div class="card prose">
          <h2 style="font-family:var(--sans);color:var(--accent-2);margin-top:0">${escapeHtml(item.title)}</h2>
          ${item.html}
        </div>
        <p><button type="button" class="icon-btn" data-go-quiz>Lanjut ke kuis dasar</button></p>
        ${disclaimer()}
      `;
    }
    return `
      <div class="sec-head"><h2>Belajar saham<span>Ringkas, bahasa santai, sesuai aturan BEI yang berlaku</span></h2></div>
      <div class="hint">Mulai dari lot &amp; fraksi, lalu kapan beli/jual. Pustaka metode lengkap (teknikal, fundamental, bandar, berita, makro) ada di tab Metode.</div>
      <div class="lesson-list">
        ${items.map((x, i) => `<button type="button" class="item" data-lesson="${x.id}"><div class="cat">Dasar ${i + 1}</div><div class="ttl">${escapeHtml(x.title)}</div><div class="sub">${escapeHtml(x.teaser)}</div></button>`).join("")}
        <button type="button" class="item" data-lesson="kuis"><div class="cat">Kuis</div><div class="ttl">Kuis materi dasar</div><div class="sub">Enam soal, pembahasan langsung.</div></button>
      </div>
      ${disclaimer()}
    `;
  }

  function renderMetode() {
    const items = window.SAHAM_CONTENT?.metode || [];
    const cats = [
      ["semua", "Semua"],
      ["teknikal", "Teknikal"],
      ["fundamental", "Fundamental"],
      ["bandarmologi", "Bandarmologi"],
      ["berita", "Berita & aksi korporasi"],
      ["makro", "Makro"],
    ];
    const item = items.find((x) => x.id === state.metodeId);
    if (item) {
      const quiz = item.quiz || [];
      return `
        <button class="back" data-back="metode">← Pustaka metode</button>
        <div class="card prose">
          <div class="cat badge accent">${escapeHtml(item.cat)}</div>
          <h2 style="font-family:var(--sans);color:var(--accent-2);margin:8px 0">${escapeHtml(item.title)}</h2>
          ${item.html}
          ${item.example ? `<div class="example"><div class="lbl">Contoh</div>${escapeHtml(item.example).replace(/\n/g, "<br>")}</div>` : ""}
        </div>
        ${quiz.length ? `<div class="card"><h3>Kuis</h3>${quiz.map((q, i) => quizBlock(q, `m-${item.id}-${i}`)).join("")}</div>` : ""}
        ${disclaimer()}
      `;
    }
    const shown = items.filter((x) => state.metodeCat === "semua" || x.cat === state.metodeCat);
    return `
      <div class="sec-head"><h2>Pustaka metode<span>Teknikal, fundamental, bandar, berita/aksi korporasi, makro — tiap topik ada contoh &amp; kuis</span></h2></div>
      <div class="filters">
        ${cats.map(([id, lab]) => `<button type="button" data-mcat="${id}" aria-pressed="${state.metodeCat === id}">${lab}</button>`).join("")}
      </div>
      <div class="lesson-list">
        ${shown.map((x) => `<button type="button" class="item" data-metode="${x.id}"><div class="cat">${escapeHtml(x.cat)}</div><div class="ttl">${escapeHtml(x.title)}</div><div class="sub">${escapeHtml(x.teaser)}</div></button>`).join("")}
      </div>
      ${disclaimer()}
    `;
  }

  function quizBlock(q, id) {
    return `<div class="quiz" data-quiz="${id}" style="margin-bottom:16px">
      <div class="q">${escapeHtml(q.q)}</div>
      ${q.options.map((o, i) => `<button type="button" class="opt" data-quiz-id="${id}" data-i="${i}">${escapeHtml(o)}</button>`).join("")}
      <div class="explain" hidden></div>
    </div>`;
  }

  function renderQuizPage(title, questions, back) {
    return `
      <button class="back" data-back="${back}">← Kembali</button>
      <div class="sec-head"><h2>${escapeHtml(title)}<span>Pilih jawaban, pembahasan muncul langsung</span></h2></div>
      <div class="card">${(questions || []).map((q, i) => quizBlock(q, `b-${i}`)).join("")}</div>
      ${disclaimer()}
    `;
  }

  function findQuiz(id) {
    if (id.startsWith("b-")) return window.SAHAM_CONTENT.belajarQuiz[Number(id.slice(2))];
    if (id.startsWith("m-")) {
      const parts = id.split("-");
      const qIdx = Number(parts.pop());
      const mid = parts.slice(1).join("-");
      const item = (window.SAHAM_CONTENT.metode || []).find((x) => x.id === mid);
      return item?.quiz?.[qIdx];
    }
    return null;
  }

  function newsCard(n) {
    const ev = (n.events || []).map((e) => `<span class="badge event">${escapeHtml(EVENT_LABEL[e] || e)}</span>`).join("");
    const tk = (n.tickers || []).map((t) => `<span class="badge accent">${escapeHtml(t)}</span>`).join("");
    return `<a class="news-item card" href="${escapeHtml(n.url)}" target="_blank" rel="noopener noreferrer">
      <div class="meta">${escapeHtml(n.source)} · ${parseDateTimeWib(n.published)}</div>
      <h3>${escapeHtml(n.title)}</h3>
      ${n.summary ? `<div class="sum">${escapeHtml(n.summary).slice(0, 220)}</div>` : ""}
      <div class="tags">${tk}${ev}</div>
    </a>`;
  }

  function renderBerita() {
    const news = state.news;
    let items = news?.items || [];
    const q = state.newsQuery.trim().toLowerCase();
    if (q) items = items.filter((n) => (n.title + " " + (n.summary || "") + " " + (n.tickers || []).join(" ")).toLowerCase().includes(q));
    if (state.newsEvent === "ticker") items = items.filter((n) => n.tickers?.length);
    else if (state.newsEvent !== "semua") items = items.filter((n) => (n.events || []).includes(state.newsEvent));
    const evs = [["semua", "Semua"], ["ticker", "Ada ticker"], ...Object.keys(EVENT_LABEL).map((k) => [k, EVENT_LABEL[k]])];
    return `
      <div class="sec-head"><h2>Berita<span>RSS nyata, bukan buatan. Diambil ${parseDateTimeWib(news?.fetched_at_wib)}</span></h2></div>
      <p class="hint">Sumber: ${(news?.sources || []).map((s) => escapeHtml(s.name)).join(", ")}. Tag ticker/jenis event dari pola judul &amp; ringkasan — bisa kelewat atau salah. Klik untuk baca di sumber aslinya.</p>
      <input class="search" id="nq" type="search" placeholder="Cari berita atau kode…" value="${escapeHtml(state.newsQuery)}" />
      <div class="filters">
        ${evs.map(([id, lab]) => `<button type="button" data-nev="${id}" aria-pressed="${state.newsEvent === id}">${lab}</button>`).join("")}
      </div>
      ${items.length ? `<p class="hint tight">${fmtNum(Math.min(items.length, 40))} dari ${fmtNum(items.length)} berita ditampilkan.</p>` + items.slice(0, 40).map(newsCard).join("") : `<div class="card empty">Tidak ada berita yang cocok, atau RSS gagal diambil.</div>`}
      ${news?.errors?.length ? `<div class="warn">Beberapa feed gagal: ${news.errors.map((e) => escapeHtml(e.feed + ": " + e.error)).join("; ")}</div>` : ""}
      ${disclaimer()}
    `;
  }

  function renderError() {
    return `<div class="warn"><strong>Data tidak berhasil dimuat.</strong> ${escapeHtml(state.loadError || "")}<p class="small">App ini membutuhkan file data/market.json, data/backtest.json, dan data/news.json. Jalankan <code>python3 fetch_market.py</code> di folder app, lalu muat ulang. App ini tidak menampilkan harga atau berita palsu sebagai gantinya.</p></div>`;
  }

  function render() {
    navRender();
    stampRender();
    saveWatch();
    if (state.loadError && !state.market) {
      appEl.innerHTML = marketSwitch() + renderError();
      bind();
      return;
    }
    if (!state.market) {
      appEl.innerHTML = marketSwitch() + (state.loadError ? renderError() : `<p class="hint">Lagi muat data ${escapeHtml(M().label)}…</p>`);
      return;
    }
    const fn = {
      beranda: renderBeranda,
      saham: renderSaham,
      dividen: renderDividen,
      belajar: renderBelajar,
      metode: renderMetode,
      berita: renderBerita,
    }[state.tab] || renderBeranda;
    const dataTab = ["beranda", "saham", "dividen"].includes(state.tab);
    const newsNote = state.tab === "berita" && state.mkt !== "id"
      ? `<div class="infobox">Berita RSS saat ini hanya untuk pasar Indonesia (CNBC Indonesia, Kontan, IDX Channel). Untuk ${escapeHtml(M().short)}, belum ada sumber RSS gratis yang dipasang — tidak dikarang.</div>` : "";
    appEl.innerHTML = (dataTab || state.tab === "berita" ? marketSwitch() : "") + newsNote + fn();
    bind();
  }

  function bind() {
    const q = $("#q");
    if (q) q.addEventListener("input", (e) => { state.query = e.target.value; /* don't full rerender caret */ clearTimeout(bind._t); bind._t = setTimeout(() => render(), 120); });
    const nq = $("#nq");
    if (nq) nq.addEventListener("input", (e) => { state.newsQuery = e.target.value; clearTimeout(bind._t); bind._t = setTimeout(() => render(), 120); });
    const cc = $("#calc-code");
    if (cc) {
      const apply = () => {
        state.calc.code = (cc.value || "").trim().toUpperCase();
        const s = stockByCode(state.calc.code);
        if (s) { state.calc.price = ""; state.calc.dps = ""; }
        render();
      };
      cc.addEventListener("change", apply);
      cc.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); apply(); } });
    }
    const dm = $("#div-modal");
    if (dm) dm.addEventListener("change", (e) => { state.divModal[state.mkt] = e.target.value; state.calc.modal = ""; render(); });
    ["modal", "price", "dps"].forEach((k) => {
      const el = $(`#calc-${k}`);
      if (el) el.addEventListener("change", (e) => { state.calc[k] = e.target.value; render(); });
    });
    const cr = $("#calc-reinvest");
    if (cr) cr.addEventListener("change", (e) => { state.calc.reinvest = e.target.checked; render(); });
  }

  navEl.addEventListener("click", (e) => {
    const b = e.target.closest("[data-tab]");
    if (!b) return;
    go({ tab: b.dataset.tab, selected: null, lessonId: null, metodeId: null, watchOnly: false });
  });

  appEl.addEventListener("click", (e) => {
    const open = e.target.closest("[data-open]");
    if (open) { go({ tab: "saham", selected: open.dataset.open, watchOnly: false }); return; }
    const back = e.target.closest("[data-back]");
    if (back) {
      const t = back.dataset.back;
      if (t === "saham") go({ tab: "saham", selected: null });
      else if (t === "belajar") go({ tab: "belajar", lessonId: null });
      else if (t === "metode") go({ tab: "metode", metodeId: null });
      else go({ tab: t });
      return;
    }
    const mb = e.target.closest("[data-mkt]");
    if (mb) { switchMarket(mb.dataset.mkt); return; }
    const f = e.target.closest("[data-f]");
    if (f) { state.sahamFilter = f.dataset.f; state.watchOnly = f.dataset.f === "watch"; render(); return; }
    const mcat = e.target.closest("[data-mcat]");
    if (mcat) { state.metodeCat = mcat.dataset.mcat; render(); return; }
    const nev = e.target.closest("[data-nev]");
    if (nev) { state.newsEvent = nev.dataset.nev; render(); return; }
    const les = e.target.closest("[data-lesson]");
    if (les) { go({ tab: "belajar", lessonId: les.dataset.lesson }); return; }
    const met = e.target.closest("[data-metode]");
    if (met) { go({ tab: "metode", metodeId: met.dataset.metode }); return; }
    const qz = e.target.closest("[data-go-quiz]");
    if (qz) { go({ tab: "belajar", lessonId: "kuis" }); return; }
    const tw = e.target.closest("[data-toggle-watch]");
    if (tw) {
      const c = tw.dataset.toggleWatch;
      const key = wk(c);
      if (state.watch.has(key)) state.watch.delete(key); else state.watch.add(key);
      saveWatch();
      render();
      return;
    }
    const cf = e.target.closest("[data-calc-from]");
    if (cf) {
      state.calc.code = cf.dataset.calcFrom;
      state.calc.price = "";
      state.calc.dps = "";
      go({ tab: "dividen", selected: null });
      setTimeout(() => $("#kalkulator")?.scrollIntoView({ block: "start" }), 50);
      return;
    }
    const dvv = e.target.closest("[data-div-view]");
    if (dvv) { state.divView = dvv.dataset.divView; state.divShowAll = false; render(); return; }
    const dmo = e.target.closest("[data-div-month]");
    if (dmo) { state.divMonth = Number(dmo.dataset.divMonth); state.divShowAll = false; render(); return; }
    const dall = e.target.closest("[data-div-all]");
    if (dall) { state.divShowAll = true; render(); return; }
    const sumEx = e.target.closest("details.explain > summary");
    if (sumEx) { state.divExplainOpen = !sumEx.parentElement.open; return; }
    const opt = e.target.closest("button.opt");
    if (opt && opt.dataset.quizId) {
      const quiz = findQuiz(opt.dataset.quizId);
      if (!quiz) return;
      const box = opt.closest(".quiz");
      const i = Number(opt.dataset.i);
      box.querySelectorAll(".opt").forEach((b) => {
        b.disabled = true;
        const ii = Number(b.dataset.i);
        if (ii === quiz.answer) b.classList.add("correct");
        else if (ii === i) b.classList.add("wrong");
      });
      const ex = box.querySelector(".explain");
      ex.hidden = false;
      ex.textContent = (i === quiz.answer ? "Benar. " : "Belum tepat. ") + quiz.explain;
      return;
    }
    // news links should work normally (anchor)
  });

  $("#btn-watch").addEventListener("click", () => {
    go({ tab: "saham", selected: null, sahamFilter: "watch", watchOnly: true, query: "" });
    state.sahamFilter = "watch";
    render();
  });
  const btnLogout = $("#btn-logout");
  if (btnLogout) btnLogout.addEventListener("click", () => logout());
  const btnReload = $("#btn-reload");
  if (btnReload) btnReload.addEventListener("click", () => location.reload());

  const authRoot = $("#auth-root");
  if (authRoot) {
    authRoot.addEventListener("click", (e) => {
      const m = e.target.closest("[data-auth-mode]");
      if (!m) return;
      state.authMode = m.dataset.authMode;
      state.authError = "";
      renderAuth();
    });
    authRoot.addEventListener("submit", async (e) => {
      const form = e.target.closest("#auth-form");
      if (!form) return;
      e.preventDefault();
      const email = ($("#auth-email") || {}).value || "";
      const password = ($("#auth-pass") || {}).value || "";
      state.authBusy = true;
      state.authError = "";
      renderAuth();
      if ($("#auth-email")) $("#auth-email").value = email;
      try {
        const user = await authSubmit(email, password, state.authMode);
        state.authBusy = false;
        await afterLogin(user);
      } catch (err) {
        state.authBusy = false;
        let msg = err && err.message ? String(err.message) : "Gagal masuk.";
        if (/email-already-in-use/i.test(msg)) msg = "Email ini sudah terdaftar. Silakan masuk.";
        else if (/user-not-found|wrong-password|invalid-credential/i.test(msg)) msg = "Email atau kata sandi salah.";
        else if (/weak-password/i.test(msg)) msg = "Kata sandi terlalu lemah (minimal 8 karakter).";
        state.authError = msg;
        renderAuth();
        if ($("#auth-email")) $("#auth-email").value = email;
      }
    });
  }

  window.addEventListener("hashchange", () => { if (state.user) { readHash(); render(); window.scrollTo(0, 0); } });

  async function loadJson(path, opts) {
    const res = await fetch(path, { cache: "no-cache", ...(opts || {}) });
    if (!res.ok) throw new Error(`${path} HTTP ${res.status}`);
    return res.json();
  }
  function rawUrl(file) {
    return `https://raw.githubusercontent.com/${REMOTE.owner}/${REMOTE.repo}/${REMOTE.branch}/${file}`;
  }
  // Data online (branch data) dulu; kalau belum ada / gagal, pakai snapshot data/ di situs.
  async function loadData(file) {
    if (REMOTE) {
      try { return await loadJson(rawUrl(file)); } catch (_) { /* fallback */ }
    }
    return loadJson("data/" + file);
  }
  async function loadQuotes() {
    const tries = [];
    if (REMOTE) {
      // api.github.com: cache 60 dtk (lebih segar dari raw yang 5 mnt). Batas 60 request/jam per IP.
      tries.push(["api", () => loadJson(`https://api.github.com/repos/${REMOTE.owner}/${REMOTE.repo}/contents/quotes.json?ref=${REMOTE.branch}`, { headers: { Accept: "application/vnd.github.raw+json" } })]);
      tries.push(["raw", () => loadJson(rawUrl("quotes.json"))]);
    }
    tries.push(["lokal", () => loadJson("data/quotes.json")]);
    for (const [name, fn] of tries) {
      try {
        const q = await fn();
        if (q && q.markets) {
          // jangan mundur ke data yang lebih lama
          if (!state.quotes || (q.generated_at_utc || "") >= (state.quotes.generated_at_utc || "")) {
            state.quotes = q; state.quotesFrom = name;
          }
          return true;
        }
      } catch (_) { /* coba sumber berikutnya */ }
    }
    return false;
  }
  // AS & Jepang: CNBC quote API mengirim CORS terbuka, tanpa kunci (tidak resmi — kalau gagal, diam saja).
  function cnbcSymbol(code) { return state.mkt === "jp" ? `${code}.T` : code; }
  function parseCnbcTime(x) {
    if (!x) return 0;
    const t = Date.parse(String(x).replace(/([+-]\d{2})(\d{2})$/, "$1:$2"));
    return Number.isNaN(t) ? 0 : Math.floor(t / 1000);
  }
  async function pollLive() {
    const mid = state.mkt;
    if (mid === "id" || !state.market || document.hidden) return;
    if (!marketOpenNow(MARKETS[mid]) && state.liveAt[mid]) return;
    const codes = (state.market.stocks || []).map((s) => s.code);
    const out = {};
    for (let i = 0; i < codes.length; i += 100) {
      const chunk = codes.slice(i, i + 100);
      const url = "https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol?symbols=" +
        encodeURIComponent(chunk.map(cnbcSymbol).join("|")) + "&requestMethod=itv&noform=1&partnerId=2&fund=1&exthrs=0&output=json";
      try {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) continue;
        const j = await res.json();
        let arr = j?.FormattedQuoteResult?.FormattedQuote || [];
        if (!Array.isArray(arr)) arr = [arr];
        for (const r of arr) {
          if (r.code !== 0 || !r.last) continue;
          const price = Number(String(r.last).replace(/,/g, ""));
          const t = parseCnbcTime(r.last_time);
          if (!price || !t) continue;
          const code = mid === "jp" ? String(r.symbol).replace(/\.T$/, "") : r.symbol;
          const cp = Number(String(r.change_pct || "").replace(/[%,+]/g, ""));
          out[code] = { price, chg_pct: Number.isNaN(cp) ? null : cp, t, src: mid === "us" ? "CNBC real-time" : "CNBC (tertunda ±20 mnt)", delay: MARKETS[mid].delay };
        }
      } catch (_) { /* jaringan / CORS — pakai quotes.json */ }
    }
    if (Object.keys(out).length && state.mkt === mid) {
      state.live[mid] = out;
      state.liveAt[mid] = Date.now();
      softRender();
    }
  }
  function softRender() {
    // re-render tanpa mengganggu ketikan di kolom cari
    const a = document.activeElement;
    if (a && (a.id === "q" || a.id === "nq" || (a.id || "").startsWith("calc-"))) { stampRender(); return; }
    if (state.user) render();
  }
  async function loadMarket(mid) {
    const mk = MARKETS[mid];
    if (state.data[mid]?.market) return state.data[mid];
    const [market, backtest] = await Promise.all([loadData(mk.file), loadData(mk.bt)]);
    state.data[mid] = { market, backtest, loadedAt: Date.now() };
    return state.data[mid];
  }
  async function switchMarket(mid) {
    if (!MARKETS[mid]) return;
    state.mkt = mid;
    try { localStorage.setItem(MARKET_KEY, mid); } catch (_) {}
    state.selected = null;
    state.query = "";
    state.calc.code = "";
    state.loadError = null;
    const cached = state.data[mid];
    state.market = cached?.market || null;
    state.backtest = cached?.backtest || null;
    state.loadingMarket = !cached;
    render();
    if (!cached) {
      try {
        const d = await loadMarket(mid);
        if (state.mkt !== mid) return;
        state.market = d.market; state.backtest = d.backtest;
      } catch (err) {
        state.loadError = `Data ${mk_label(mid)} belum tersedia (${String(err.message || err)}). Tunggu jadwal update otomatis pertama.`;
      }
      state.loadingMarket = false;
      render();
    }
    pollLive();
  }
  function mk_label(mid) { return MARKETS[mid]?.label || mid; }
  async function refreshMarketIfNew() {
    const mid = state.mkt;
    try {
      const mk = MARKETS[mid];
      const fresh = await loadData(mk.file);
      if (fresh?.fetched_at_wib && fresh.fetched_at_wib !== state.data[mid]?.market?.fetched_at_wib) {
        const backtest = await loadData(mk.bt).catch(() => state.data[mid]?.backtest);
        state.data[mid] = { market: fresh, backtest, loadedAt: Date.now() };
        if (state.mkt === mid) { state.market = fresh; state.backtest = backtest; softRender(); }
      }
    } catch (_) {}
  }
  function startAutoRefresh() {
    setInterval(() => { if (!document.hidden) loadQuotes().then((ok) => ok && softRender()); }, QUOTES_EVERY_MS);
    setInterval(() => { if (!document.hidden) pollLive(); }, LIVE_EVERY_MS);
    setInterval(() => { if (!document.hidden) refreshMarketIfNew(); }, MARKET_EVERY_MS);
    setInterval(() => { if (!document.hidden) stampRender(); }, 30 * 1000);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) { loadQuotes().then(() => softRender()); pollLive(); }
    });
  }

  function hookServiceWorker(reg) {
    const toast = $("#toast");
    const show = () => { if (toast) toast.classList.remove("hidden"); };
    if (reg.waiting && navigator.serviceWorker.controller) show();
    reg.addEventListener("updatefound", () => {
      const sw = reg.installing;
      if (!sw) return;
      sw.addEventListener("statechange", () => {
        if (sw.state === "installed" && navigator.serviceWorker.controller) show();
      });
    });
    setTimeout(() => reg.update().catch(() => {}), 5000);
    setInterval(() => reg.update().catch(() => {}), 15 * 60 * 1000);
  }

  async function init() {
    state.firebase = await tryFirebase();
    const sess = readSession();
    if (sess) {
      setSession(sess);
      loadWatch();
      showShell(true);
    } else {
      showShell(false);
      renderAuth();
    }
    try {
      const [d, news] = await Promise.all([
        loadMarket(state.mkt),
        loadData("news.json").catch(() => null),
        loadQuotes(),
      ]);
      state.market = d.market;
      state.backtest = d.backtest;
      state.news = news;
    } catch (err) {
      state.loadError = String(err.message || err);
    }
    startAutoRefresh();
    pollLive();
    if (state.user) {
      navRender();
      saveWatch();
      readHash();
      render();
    }
    if ("serviceWorker" in navigator) {
      try {
        const reg = await navigator.serviceWorker.register("./sw.js");
        hookServiceWorker(reg);
      } catch (_) { /* offline optional */ }
    }
  }

  init();
})();
