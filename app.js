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
    calc: { code: "", lots: 10, price: "", dps: "", reinvest: false },
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
  function rp(n, dec = 0) {
    if (n == null || Number.isNaN(Number(n))) return "—";
    return "Rp" + fmtNum(n, dec);
  }
  function rpCompact(n) {
    if (n == null || Number.isNaN(Number(n))) return "—";
    const a = Math.abs(Number(n));
    if (a >= 1e12) return "Rp" + fmtNum(n / 1e12, 2) + " T";
    if (a >= 1e9) return "Rp" + fmtNum(n / 1e9, 2) + " M";
    if (a >= 1e6) return "Rp" + fmtNum(n / 1e6, 1) + " jt";
    return rp(n);
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

  function stockByCode(code) {
    return (state.market?.stocks || []).find((s) => s.code === code);
  }
  function isLiquid(s) {
    return (s.value20 || 0) >= 2e9 && !String(s.board || "").toLowerCase().startsWith("pemantauan");
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
    if (!m) return;
    const ihsg = m.ihsg;
    stampEl.innerHTML = `Yahoo Finance · tutup BEI <strong>${parseDay(ihsg?.date || m.stocks?.[0]?.date)}</strong>
      · diambil <strong>${parseDateTimeWib(m.fetched_at_wib)}</strong>
      · ${fmtNum(m.counts?.yahoo_ok)}/${fmtNum(m.counts?.universe)} emiten`;
  }

  function disclaimer() {
    return `<footer class="disc">Ini bukan saran beli/jual dan bukan jaminan keuntungan. Tidak ada yang bisa mastiin saham naik 10% dalam sehari. Semua harga, volume, dividen, dan statistik di app ini berasal dari data yang benar-benar diambil (Yahoo Finance chart &amp; RSS berita), lengkap dengan waktu pengambilan. Kalau datanya kosong atau gagal, app ini tidak mengarang angka.</footer>`;
  }

  function renderBeranda() {
    const m = state.market;
    const bt = state.backtest;
    const ihsg = m.ihsg;
    const stocks = m.stocks || [];
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
            <div class="small faint">IHSG · ${parseDay(ihsg?.date)}</div>
            <div class="px ${chgClass(ihsg?.chg_pct)}">${fmtNum(ihsg?.price, 2)}</div>
            <div class="chg ${chgClass(ihsg?.chg_pct)}">${pct(ihsg?.chg_pct)}</div>
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
    const thin = s.thin ? `<span class="badge thin">kurang likuid</span>` : "";
    const mon = String(s.board || "").toLowerCase().startsWith("pemantauan") ? `<span class="badge warn">${escapeHtml(s.board)}</span>` : `<span class="badge board">${escapeHtml(s.board || "")}</span>`;
    const star = state.watch.has(s.code) ? "★" : "";
    return `<article class="card stock-card" data-open="${s.code}">
      <div class="stock">
        <div>
          <div class="code">${escapeHtml(s.code)} ${star} ${badgeSignal(s.signal)}</div>
        </div>
        <div class="right">
          <div class="price">${fmtNum(s.price)}</div>
          <div class="chg ${chgClass(s.chg_pct)}">${pct(s.chg_pct)}</div>
        </div>
        <div class="name">${escapeHtml(s.name)}</div>
      </div>
      <div class="meta-line mt">
        ${mon} ${thin}
        ${s.ikut_bandar ? `<span class="badge bandar">Ikut Bandar</span>` : ""}
        ${s.ob_near === "bull" ? `<span class="badge beli">OB naik</span>` : s.ob_near === "bear" ? `<span class="badge jual">OB turun</span>` : ""}
        <span>Vol ${s.vol_ratio ? fmtNum(s.vol_ratio, 2) + "×" : "—"}</span>
        <span>RSI ${s.rsi14 ?? "—"}</span>
        <span>1 lot ${rp(s.lot_cost)}</span>
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
    else if (f === "watch") list = list.filter((s) => state.watch.has(s.code));
    else if (f === "bandar") list = list.filter((s) => s.ikut_bandar);
    else if (f === "dividen") list = list.filter((s) => (s.yield_ttm || 0) >= 4);
    else if (f === "utama") list = list.filter((s) => s.board === "Utama");
    if (state.watchOnly) list = list.filter((s) => state.watch.has(s.code));
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
      ["utama", "Papan utama"],
      ["watch", "Watchlist"],
      ["bandar", "Ikut Bandar"],
    ];
    return `
      <div class="sec-head"><h2>${state.watchOnly ? "Watchlist" : "Cari saham"}<span>Sinyal BELI / TUNGGU / JUAL dari data Yahoo ${parseDay(state.market.ihsg?.date)}</span></h2></div>
      <input class="search" id="q" type="search" placeholder="Cari kode atau nama emiten…" value="${escapeHtml(state.query)}" />
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
    const watched = state.watch.has(s.code);
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
            <div class="px ${chgClass(s.chg_pct)}" style="font-size:26px">${fmtNum(s.price)}</div>
            <div class="chg ${chgClass(s.chg_pct)}">${pct(s.chg_pct)}</div>
          </div>
        </div>
        <div class="mt">${s.ohlc ? candleChart(s.ohlc, s.obs) : sparkSvg(s.spark, s.chg_pct >= 0 ? "#3dd68c" : "#f07178")}</div>
        <p class="small faint">Candle ±80 hari · zona hijau = order block naik (demand), merah = OB turun (supply). Pudar = sudah termitigasi. Deteksi mekanis dari displacement, <strong>bukan</strong> antrian order/bandar. Data ${parseDay(s.date)} · Yahoo ${escapeHtml(s.code)}.JK</p>
        <div class="mt">
          <button type="button" class="icon-btn ${watched ? "active" : ""}" data-toggle-watch="${s.code}">${watched ? "★ Di watchlist" : "☆ Tambah watchlist"}</button>
        </div>
      </div>

      <div class="card sinyal">
        <div class="small faint">Kartu Sinyal · aturan mekanis, bukan saran</div>
        <p class="status ${escapeHtml(s.signal)}">${escapeHtml(s.signal)}</p>
        <p class="small muted">${s.signal_kind === "breakout" ? "Setup breakout bervolume" : s.signal_kind === "retest" ? "Setup retest support di tren naik" : s.signal_kind === "breakdown" ? "Setup keluar / breakdown" : "Belum ada setup masuk/keluar yang terpenuhi"}</p>
        <div class="kv three mt">
          <div class="cell"><span class="lbl">Zona entry</span><span class="val">${fmtNum(s.entry_lo)} – ${fmtNum(s.entry_hi)}</span></div>
          <div class="cell"><span class="lbl">Stop loss</span><span class="val">${fmtNum(s.sl)}</span></div>
          <div class="cell"><span class="lbl">TP1 / TP2</span><span class="val">${fmtNum(s.tp1)} / ${fmtNum(s.tp2)}</span></div>
        </div>
        ${araNote}
        <ul class="reasons">${(s.reasons || []).map((r) => `<li>${escapeHtml(r)}</li>`).join("")}</ul>
        <p class="small faint mt">Entry/SL/TP dibulatkan ke fraksi BEI. Win rate aturan ini di sejarah 5 tahun ada di Beranda — baca sebelum ikut angka di kartu ini.</p>
      </div>

      <div class="card">
        <h3>Ringkasan pasar</h3>
        <div class="kv">
          <div class="cell"><span class="lbl">Open · High · Low</span><span class="val">${fmtNum(s.open)} · ${fmtNum(s.high)} · ${fmtNum(s.low)}</span></div>
          <div class="cell"><span class="lbl">Volume · nilai</span><span class="val">${fmtNum(s.volume)} · ${rpCompact(s.value)}</span></div>
          <div class="cell"><span class="lbl">SMA20 · 50 · 200</span><span class="val">${fmtNum(s.sma20)} · ${fmtNum(s.sma50)} · ${fmtNum(s.sma200)}</span></div>
          <div class="cell"><span class="lbl">RSI14 · ATR14 · vol 20h</span><span class="val">${s.rsi14 ?? "—"} · ${fmtNum(s.atr14, 1)} · ${s.vol_ratio ? fmtNum(s.vol_ratio, 2) + "×" : "—"}</span></div>
        </div>
      </div>

      <div class="card">
        <h3>Dividen (data Yahoo)</h3>
        ${s.last_dps != null ? `<p>DPS 12 bulan terakhir <strong>${fmtNum(s.dps_ttm, 2)}</strong> · yield TTM <strong>${fmtNum(s.yield_ttm, 2)}%</strong> di harga sekarang. Ex terakhir <strong>${parseDay(s.last_ex)}</strong>${s.last_cum_perkiraan ? ` · cum perkiraan ${parseDay(s.last_cum_perkiraan)}` : ""}.</p>` : `<p class="muted">Tidak ada event dividen di chart Yahoo untuk periode yang diambil.</p>`}
        ${s.next_div_perkiraan ? `<div class="infobox mt"><strong>Perkiraan, bukan pengumuman.</strong> Pola ex-date tahun lalu menunjuk sekitar ${parseDay(s.next_div_perkiraan.ex_perkiraan)} (DPS acuan ${fmtNum(s.next_div_perkiraan.dps_perkiraan, 2)}, dari ex ${parseDay(s.next_div_perkiraan.berdasarkan_ex)}). ${escapeHtml(s.next_div_perkiraan.catatan)}</div>` : ""}
        ${s.divs?.length ? `<table class="prose"><thead><tr><th>Ex-date (Yahoo)</th><th>DPS</th><th>Cum (perkiraan)</th></tr></thead><tbody>${s.divs.slice().reverse().map((d) => `<tr><td>${parseDay(d.ex)}</td><td>${fmtNum(d.dps, 2)}</td><td>${d.cum_perkiraan ? parseDay(d.cum_perkiraan) : "—"}</td></tr>`).join("")}</tbody></table>` : ""}
        <button type="button" class="icon-btn" data-calc-from="${s.code}">Hitung dividen saham ini</button>
      </div>

      <div class="card">
        <h3>Berita terkait</h3>
        ${news.length ? news.slice(0, 8).map(newsCard).join("") : `<p class="muted">Tidak ada berita RSS terbaru yang berhasil ditandai ke kode ${escapeHtml(s.code)}. Bukan berarti tidak ada berita di luar sana.</p>`}
      </div>
      ${disclaimer()}
    `;
  }

  function dividendList() {
    return (state.market.stocks || [])
      .filter((s) => s.yield_ttm != null && s.dps_ttm > 0)
      .sort((a, b) => (b.yield_ttm || 0) - (a.yield_ttm || 0));
  }

  function renderDividen() {
    const all = dividendList();
    const good = all.filter((s) => s.yield_ttm >= 4 && isLiquid(s));
    const show = good.length ? good : all.filter((s) => isLiquid(s)).slice(0, 40);
    const c = calcResult();
    const codes = (state.market.stocks || []).map((s) => `<option value="${s.code}">${escapeHtml(s.name)}</option>`).join("");
    const shownN = Math.min(show.length, 30);
    const shown = show.slice(0, 30);
    return `
      <div class="sec-head"><h2>Dividen<span>Ex-date &amp; DPS dari event Yahoo Finance, bukan karangan</span></h2></div>
      <div class="infobox">Yield TTM = jumlah DPS 12 bulan terakhir (event Yahoo) dibagi harga terakhir. Cum date di sini <strong>perkiraan</strong> (hari bursa sebelum ex). Tanggal bayar resmi sering tidak ada di Yahoo — app ini tidak mengisi tanggal palsu.</div>
      <div class="card">
        <h3>Kalkulator dividen</h3>
        <div class="form">
          <label>Kode emiten<input id="calc-code" list="calc-codes" value="${escapeHtml(state.calc.code)}" placeholder="Contoh: BBCA" autocomplete="off" /><datalist id="calc-codes">${codes}</datalist></label>
          <label>Jumlah lot<input id="calc-lots" type="number" min="1" step="1" value="${escapeHtml(state.calc.lots)}" /></label>
          <label>Harga per lembar (kosongkan = harga terakhir)<input id="calc-price" type="number" min="0" step="1" value="${escapeHtml(state.calc.price)}" placeholder="${c.priceHint || ""}" /></label>
          <label>Dividen per lembar / DPS (kosongkan = DPS TTM)<input id="calc-dps" type="number" min="0" step="0.01" value="${escapeHtml(state.calc.dps)}" placeholder="${c.dpsHint || ""}" /></label>
          <label class="toggle"><input id="calc-reinvest" type="checkbox" ${state.calc.reinvest ? "checked" : ""} /> Saya reinvest sesuai aturan (lihat catatan pajak)</label>
        </div>
        <div class="kv three mt">
          <div class="cell"><span class="lbl">Modal (tanpa biaya broker)</span><span class="val">${rp(c.modal)}</span></div>
          <div class="cell"><span class="lbl">Dividen kotor</span><span class="val">${rp(c.kotor, 0)}</span></div>
          <div class="cell"><span class="lbl">${c.reinvest ? "Pajak (diasumsikan 0)" : "PPh 10% final"}</span><span class="val">${rp(c.pajak, 0)}</span></div>
          <div class="cell"><span class="lbl">Dividen bersih</span><span class="val">${rp(c.bersih, 0)}</span></div>
          <div class="cell"><span class="lbl">Yield kotor / bersih</span><span class="val">${fmtNum(c.yieldKotor, 2)}% / ${fmtNum(c.yieldBersih, 2)}%</span></div>
          <div class="cell"><span class="lbl">Lembar</span><span class="val">${fmtNum(c.lembar)}</span></div>
        </div>
        <div class="example mt">
          <div class="lbl">Kapan harus beli</div>
          <p>Supaya dapat dividen, kamu harus sudah beli paling lambat di <strong>cum date</strong>. Karena settlement T+2, beli di cum date (pasar reguler) biasanya masih sempat masuk pencatatan. Beli mulai <strong>ex date</strong> = tidak dapat dividen tersebut. Kalau hanya ada ex-date Yahoo, cum perkiraan = hari bursa sebelumnya — cek pengumuman resmi emiten/KSEI sebelum bertindak.</p>
        </div>
        <p class="small muted"><strong>Pajak (WP orang pribadi dalam negeri, aturan yang berlaku). </strong>Dividen dalam negeri bisa dikecualikan dari objek PPh jika diinvestasikan lagi di Indonesia dalam jangka waktu tertentu (paling lambat 31 Maret tahun berikutnya, dipegang minimal 3 tahun pajak, plus laporan realisasi dan SPT) — UU Cipta Kerja / UU HPP jo. PMK-18/PMK.03/2021. Kalau syarat itu tidak dipenuhi, terutang <strong>PPh final 10%</strong> (disetor sendiri). Ini ringkasan, bukan nasihat pajak. Non-residen beda aturannya.</p>
      </div>

      <div class="sec-head"><h2>Daftar yield${good.length ? " likuid ≥ 4%" : ""}<span>${good.length ? "Filter: yield TTM ≥ 4% dan rata-rata nilai 20 hari ≥ Rp2 miliar, bukan papan pemantauan" : "Tidak ada yang lolos filter ketat; menampilkan yang likuid ber-dividen"}</span></h2></div>
      ${shown.length ? `<p class="hint tight">Menampilkan ${fmtNum(shownN)} yield tertinggi dari ${fmtNum(show.length)} yang lolos filter. Ketuk kartu untuk riwayat DPS.</p>` : ""}
      ${shown.map((s) => `
        <article class="card stock-card" data-open="${s.code}">
          <div class="stock">
            <div>
              <div class="code">${escapeHtml(s.code)} ${badgeSignal(s.signal)}</div>
              <div class="name">${escapeHtml(s.name)}</div>
            </div>
            <div class="right">
              <div class="price">${fmtNum(s.yield_ttm, 2)}%</div>
              <div class="small muted">yield TTM</div>
            </div>
          </div>
          <div class="small muted mt">DPS 12bln ${fmtNum(s.dps_ttm, 2)} · harga ${fmtNum(s.price)} · ex terakhir ${parseDay(s.last_ex)}${s.last_cum_perkiraan ? ` · cum perkiraan ${parseDay(s.last_cum_perkiraan)}` : ""} · 1 lot ${rp(s.lot_cost)}</div>
          ${s.next_div_perkiraan ? `<div class="small faint">Perkiraan ex berikutnya ~ ${parseDay(s.next_div_perkiraan.ex_perkiraan)} (pola lama, bukan resmi)</div>` : ""}
        </article>`).join("")}
      <p class="small faint">Yield tinggi bisa karena harga sedang jatuh atau ada special dividend. Cek riwayat DPS di halaman saham.</p>
      ${disclaimer()}
    `;
  }

  function calcResult() {
    const code = state.calc.code;
    const s = code ? stockByCode(code) : null;
    const lots = Math.max(0, Number(state.calc.lots) || 0);
    const price = state.calc.price === "" || state.calc.price == null
      ? (s ? s.price : 0)
      : Number(state.calc.price);
    const dps = state.calc.dps === "" || state.calc.dps == null
      ? (s && s.dps_ttm != null ? s.dps_ttm : (s?.last_dps || 0))
      : Number(state.calc.dps);
    const lembar = lots * 100;
    const modal = lembar * (Number(price) || 0);
    const kotor = lembar * (Number(dps) || 0);
    const reinvest = !!state.calc.reinvest;
    const pajak = reinvest ? 0 : 0.1 * kotor;
    const bersih = kotor - pajak;
    const yieldKotor = modal ? (kotor / modal) * 100 : 0;
    const yieldBersih = modal ? (bersih / modal) * 100 : 0;
    return {
      lembar, modal, kotor, pajak, bersih, yieldKotor, yieldBersih, reinvest,
      priceHint: s ? String(s.price) : "",
      dpsHint: s && s.dps_ttm != null ? String(s.dps_ttm) : "",
    };
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
      appEl.innerHTML = renderError();
      return;
    }
    if (!state.market) {
      appEl.innerHTML = `<p class="hint">Lagi muat data…</p>`;
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
    appEl.innerHTML = fn();
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
    ["lots", "price", "dps"].forEach((k) => {
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
      if (state.watch.has(c)) state.watch.delete(c); else state.watch.add(c);
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
      return;
    }
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

  async function loadJson(path) {
    const res = await fetch(path, { cache: "no-cache" });
    if (!res.ok) throw new Error(`${path} HTTP ${res.status}`);
    return res.json();
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
      const [market, backtest, news] = await Promise.all([
        loadJson("data/market.json"),
        loadJson("data/backtest.json"),
        loadJson("data/news.json"),
      ]);
      state.market = market;
      state.backtest = backtest;
      state.news = news;
    } catch (err) {
      state.loadError = String(err.message || err);
    }
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
