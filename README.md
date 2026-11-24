# Investing

Aplikasi web (PWA) belajar dan pantau saham BEI, AS, dan Jepang. Bahasa Indonesia, mobile-first.
Bukan saran beli/jual. Tidak ada jaminan saham naik 10% dalam sehari.

Nama di app, manifest, dan ikon: **Investing**. Ikon biru orisinal (huruf I + garis naik) — bukan salinan merek Investing.com.

## Isi

- **Masuk/Daftar** — email + kata sandi. Hash PBKDF2-SHA256 ber-salt disimpan di localStorage (bukan kata sandi polos). Watchlist terpisah per pengguna. Tombol Keluar ada di header.
- **Beranda** — penyaring momentum, **Ikut Bandar** (berbasis volume, bukan broker summary), statistik jujur dari backtest.
- **Saham** — cari emiten, kartu Sinyal BELI / TUNGGU / JUAL, badge Ikut Bandar dan OB, grafik candle + zona order block.
- **Dividen** — yield TTM, ex-date Yahoo, kalkulator, catatan pajak.
- **Belajar / Metode** — materi + kuis, termasuk pelajaran order block.
- **Berita** — RSS CNBC Market, Kontan Investasi, IDX Channel.

## Pasar

Tombol di atas Beranda/Saham/Dividen: **Indonesia (BEI, 957 emiten)** · **Amerika (S&P 500 + Nasdaq-100, 518 saham)** · **Jepang (Nikkei 225, 225 saham)**. Sinyal BELI/TUNGGU/JUAL, penyaring, Ikut Bandar (volume), zona order block, dividen, dan backtest dihitung dengan aturan yang sama untuk tiap pasar (batas likuid: Rp2 miliar / US$20 juta / ¥1 miliar per hari, rata-rata 20 hari).

## Update otomatis (GitHub Actions, gratis)

`.github/workflows/update-data.yml` menjalankan `fetch_market.py`:

| Jadwal (Senin–Jumat) | Mode | Isi |
|---|---|---|
| tiap 15 menit, 00:00–09:59 UTC (09:00–18:59 JST) | `quotes` | harga terakhir semua saham BEI & Jepang yang sedang buka (~2 detik) |
| tiap 15 menit, 13:00–21:59 UTC (22:00–06:59 JST) | `quotes` | harga terakhir saham AS |
| 15:50 JST · 16:35 WIB · 16:40 ET | `full` | rebuild penuh per pasar: sinyal, zona beli, OB, dividen, backtest, berita |

Hasilnya di-*force-push* ke branch **`data`** (selalu 1 commit, jadi repo tidak membengkak). App membaca branch itu dari `api.github.com` (cache 60 detik) atau `raw.githubusercontent.com` (cache 5 menit); kalau belum ada, pakai snapshot `data/` di situs.

Saat app terbuka: `quotes.json` dicek ulang tiap 3 menit; pasar AS & Jepang juga ambil harga langsung dari CNBC tiap 60 detik (CORS terbuka, tanpa kunci, tidak resmi — kalau gagal, otomatis kembali ke data Actions).

**Keterlambatan jujur:** BEI via Yahoo tertunda ±10 menit + jadwal 15 menit (+ jadwal GitHub bisa telat 5–15 menit) → biasanya 15–35 menit. AS real-time saat app terbuka (CNBC/Nasdaq last sale). Jepang ±20 menit. Header app selalu menulis "Harga per HH:MM (tertunda ~X menit)".

**Zona beli:** tiap sinyal BELI punya area masuk (tutup sinyal −0,5×ATR14 s/d +0,25×ATR14, atau mulai dari atas zona OB naik), SL, TP1/TP2. Kalau harga terbaru di atas batas atas → "Lewat zona — jangan kejar"; di bawah SL → "Batal".

Manual:

```bash
python3 fetch_market.py --mode full --market all --force      # rebuild penuh 3 pasar (~1,5 menit)
python3 fetch_market.py --mode quotes --market auto            # harga terbaru pasar yang buka
python3 fetch_market.py --mode full --market us --out /tmp/x   # tulis ke folder lain
```

File: `data/market.json` (BEI), `market_us.json`, `market_jp.json`, `backtest*.json`, `news.json`, `quotes.json`. Daftar saham: `data/universe.csv`, `universe_us.csv` (Wikipedia S&P 500 + Nasdaq.com Nasdaq-100, Nov 2026), `universe_jp.csv` (indexes.nikkei.co.jp, Nov 2026) — perbarui berkala.

## Jadwal dividen (tab Dividen & detail saham)

`dividends.py` (dipanggil `fetch_market.py --mode full`): per saham → **beli paling lambat (cum)**, ex, recording, **tanggal cair**, DPS, yield, hitung mundur, bulan biasanya cair, simulasi modal → lot → dividen bersih.

- **BEI resmi:** KSEI `api/corporate_actions` (recording, pembayaran, DPS) + PDF pengumuman KSEI untuk cum/ex pasar reguler. Kalau PDF gagal: cum = recording − 2 hari bursa (T+2), ditandai `resmi*`.
- **AS resmi:** Nasdaq dividend calendar (ex, record, payment, DPS) — cakupan terutama saham listing Nasdaq; saham NYSE pakai perkiraan. Beli paling lambat = 1 hari bursa sebelum ex (T+1).
- **Jepang:** belum ada sumber resmi gratis → perkiraan dari ex-date Yahoo tahun lalu; cair ±70 hari setelah recording (pola umum setelah RUPS).
- Riwayat disimpan di `div_hist_id.json` / `div_hist_us.json` (backfill 400 hari sekali, lalu jendela −25…+100 hari tiap rebuild).

Buka app (jangan `file://`): `python3 -m http.server 8765` → http://127.0.0.1:8765/

## Auth Firebase (opsional)

Default: akun lokal di perangkat. Untuk memakai Firebase Auth, salin `firebase-config.example.json` menjadi `firebase-config.json` dan isi `apiKey`, `authDomain`, `projectId`, `appId` milik proyekmu. **Jangan menanam kunci di kode.** Kalau file itu ada dan valid, daftar/masuk dialihkan ke Firebase Auth. Kata sandi tetap tidak disimpan polos di app ini.

## Batasan data

- API quote Yahoo (PER/PBV) menolak tanpa login. Rasio live tidak ditampilkan.
- idx.co.id sering diblokir Cloudflare. Cum date di app adalah perkiraan.
- Broker summary / foreign flow tidak tersedia. “Ikut Bandar” murni dari volume, nilai, OBV, A/D, dan breakout harga.
