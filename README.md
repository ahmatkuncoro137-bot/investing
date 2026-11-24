# Investing

Aplikasi web (PWA) belajar dan pantau saham BEI. Bahasa Indonesia, mobile-first.
Bukan saran beli/jual. Tidak ada jaminan saham naik 10% dalam sehari.

Nama di app, manifest, dan ikon: **Investing**. Ikon biru orisinal (huruf I + garis naik) — bukan salinan merek Investing.com.

## Isi

- **Masuk/Daftar** — email + kata sandi. Hash PBKDF2-SHA256 ber-salt disimpan di localStorage (bukan kata sandi polos). Watchlist terpisah per pengguna. Tombol Keluar ada di header.
- **Beranda** — penyaring momentum, **Ikut Bandar** (berbasis volume, bukan broker summary), statistik jujur dari backtest.
- **Saham** — cari emiten, kartu Sinyal BELI / TUNGGU / JUAL, badge Ikut Bandar dan OB, grafik candle + zona order block.
- **Dividen** — yield TTM, ex-date Yahoo, kalkulator, catatan pajak.
- **Belajar / Metode** — materi + kuis, termasuk pelajaran order block.
- **Berita** — RSS CNBC Market, Kontan Investasi, IDX Channel.

## Data harga (jadwal harian)

Harga dan event dividen diambil dari Yahoo Finance chart API (ticker `.JK`). Browser tidak bisa memanggil Yahoo langsung (tidak ada CORS), jadi data diload dari JSON hasil skrip.

Jalankan **setelah bursa tutup** (sesi reguler berakhir 15:00 WIB; data Yahoo biasanya sudah merampungkan penutupan sekitar **16:15–17:00 WIB**):

```bash
cd /workspace/saham_app   # atau folder deploy app ini
python3 fetch_market.py --force
```

Tanpa `--force`, cache hari yang sama dipakai ulang. File hasil: `data/market.json`, `data/backtest.json`, `data/news.json`.

Setelah file data baru diunggah ke hosting, app mengambil `/data/` secara network-first. Pembaruan *kode* PWA memakai cache `investing-v3`; kalau ada service worker baru, pengguna melihat toast **“Versi baru tersedia”** lalu bisa memuat ulang.

Buka app (jangan `file://`):

```bash
python3 -m http.server 8765
```

http://127.0.0.1:8765/

## Auth Firebase (opsional)

Default: akun lokal di perangkat. Untuk memakai Firebase Auth, salin `firebase-config.example.json` menjadi `firebase-config.json` dan isi `apiKey`, `authDomain`, `projectId`, `appId` milik proyekmu. **Jangan menanam kunci di kode.** Kalau file itu ada dan valid, daftar/masuk dialihkan ke Firebase Auth. Kata sandi tetap tidak disimpan polos di app ini.

## Batasan data

- API quote Yahoo (PER/PBV) menolak tanpa login. Rasio live tidak ditampilkan.
- idx.co.id sering diblokir Cloudflare. Cum date di app adalah perkiraan.
- Broker summary / foreign flow tidak tersedia. “Ikut Bandar” murni dari volume, nilai, OBV, A/D, dan breakout harga.
