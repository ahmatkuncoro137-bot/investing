window.SAHAM_CONTENT = {
  belajar: [
    {
      id: "lot-fraksi",
      title: "Lot, lembar, dan fraksi harga",
      teaser: "1 lot = 100 lembar. Harga order harus kelipatan fraksi BEI.",
      html: `<p>Di Bursa Efek Indonesia, satuan perdagangan di pasar reguler adalah <strong>1 lot = 100 lembar</strong> saham. Kamu nggak bisa beli 1 lembar di pasar reguler.</p>
<p>Harga yang kamu masukkan ke aplikasi sekuritas harus sesuai <strong>fraksi harga</strong> (tick size). Aturan ini ada di Peraturan BEI Nomor II-A (terbaru lewat Kep-00136/BEI/09-2026 dan dikukuhkan lagi di Kep-00158/BEI/10-2026):</p>
<table>
<thead><tr><th>Harga previous</th><th>Fraksi</th><th>Jenjang max*</th></tr></thead>
<tbody>
<tr><td>Kurang dari Rp200</td><td>Rp1</td><td>Rp10</td></tr>
<tr><td>Rp200 s.d. &lt; Rp500</td><td>Rp2</td><td>Rp20</td></tr>
<tr><td>Rp500 s.d. &lt; Rp2.000</td><td>Rp5</td><td>Rp50</td></tr>
<tr><td>Rp2.000 s.d. &lt; Rp5.000</td><td>Rp10</td><td>Rp100</td></tr>
<tr><td>Rp5.000 atau lebih</td><td>Rp25</td><td>Rp250</td></tr>
</tbody>
</table>
<p class="small">*Jenjang perubahan harga maksimum per input, dan tetap tidak boleh melewati batas Auto Rejection. Harga minimum order di JATS adalah Rp1.</p>
<p>Modal 1 lot = <strong>harga × 100</strong>. Kalau saham Rp5.800, 1 lot = Rp580.000, belum termasuk biaya broker.</p>`
    },
    {
      id: "ara-arb",
      title: "ARA dan ARB (auto rejection)",
      teaser: "Batas naik/turun sehari. Aturan transisi berlaku sampai 31 Des 2026.",
      html: `<p><strong>ARA</strong> (auto rejection atas) dan <strong>ARB</strong> (bawah) itu batas harga yang masih diterima sistem JATS dalam satu hari. Bukan jaminan harga “aman”, cuma batas order.</p>
<p>Sejak 20 Oktober 2026 sampai <strong>31 Desember 2026</strong>, BEI memakai aturan transisi (Kep-00158/BEI/10-2026) untuk papan Utama, Pengembangan, dan Ekonomi Baru. Setelah itu akan dievaluasi. Papan Akselerasi dan Pemantauan Khusus punya aturan sendiri.</p>
<table>
<thead><tr><th>Harga acuan</th><th>ARA</th><th>ARB</th></tr></thead>
<tbody>
<tr><td>Rp1–10</td><td>Rp1</td><td>Rp1</td></tr>
<tr><td>Rp11–14</td><td>35%</td><td>Rp1</td></tr>
<tr><td>Rp15–200</td><td>35%</td><td>7%</td></tr>
<tr><td>&gt;Rp200–5.000</td><td>25%</td><td>7%</td></tr>
<tr><td>&gt;Rp5.000</td><td>20%</td><td>7%</td></tr>
</tbody>
</table>
<p>Jadi impian “naik 10% sehari” memang mungkin untuk banyak saham (di bawah batas ARA), tapi nggak otomatis terjadi, dan saham mahal cuma boleh naik sampai 20% sehari. Saham gorengan yang sudah ARA hari ini, besok bisa ARB.</p>`
    },
    {
      id: "t2-biaya",
      title: "Settlement T+2 dan biaya broker",
      teaser: "Saham dan dana selesai di hari bursa ke-2. Biaya beda-beda per sekuritas.",
      html: `<p>Di <strong>pasar reguler</strong>, penyelesaian transaksi masih <strong>T+2</strong> (hari bursa ke-2 setelah transaksi), sesuai mekanisme resmi BEI. Pasar tunai = T+0. T+1 masih dikaji, belum berlaku.</p>
<p>Artinya: kalau kamu beli Senin, sahamnya baru tercatat tuntas Rabu (kalau tidak ada libur bursa). Kalau jual Senin, dana baru efektif di RDN sekitar Rabu. Libur nasional tidak dihitung.</p>
<p><strong>Biaya</strong> beda di tiap sekuritas. Biasanya ada:</p>
<ul>
<li>Komisi beli dan jual (sering 0,1%–0,3% per sisi, kadang ada minimum)</li>
<li>Levy bursa + biaya kliring/kustodian</li>
<li>PPh final 0,1% atas <em>nilai penjualan</em> saham (bukan atas laba)</li>
</ul>
<p>App ini nggak memakai tarif broker tertentu, karena app ini nggak tahu sekuritas kamu. Cek di aplikasi broker sendiri sebelum hitung laba bersih.</p>`
    },
    {
      id: "candlestick",
      title: "Dasar candlestick",
      teaser: "Satu batang = open, high, low, close. Warna saja tidak cukup.",
      html: `<p>Setiap candle harian merekam empat harga: <strong>open</strong> (pembukaan), <strong>high</strong> (tertinggi), <strong>low</strong> (terendah), dan <strong>close</strong> (penutupan).</p>
<ul>
<li>Badan hijau/putih: close di atas open (pembeli lebih menang di sesi itu)</li>
<li>Badan merah/hitam: close di bawah open</li>
<li>Sumbu (wick) atas/bawah: jejak reject di high/low</li>
</ul>
<p>Candle panjang dengan volume besar lebih bermakna daripada candle kecil sepi. Satu pola (misalnya doji atau hammer) <strong>bukan sinyal beli sendirian</strong> — harus dibaca bareng tren, support/resisten, dan volume.</p>`
    },
    {
      id: "support-resisten",
      title: "Support dan resisten",
      teaser: "Zona di mana harga sering berhenti, bukan garis ajaib.",
      html: `<p><strong>Support</strong> adalah zona di mana permintaan sering muncul, jadi penurunan cenderung mereda. <strong>Resisten</strong> sebaliknya: zona pasokan, kenaikan sering tertahan.</p>
<p>Cara sederhana melihatnya: swing high/low sebelumnya, gap, moving average yang sering “dihormati”, atau area volume padat. Semakin sering zona itu diuji dan bertahan, semakin banyak orang yang memperhatikannya — sampai suatu hari pecah.</p>
<p>Kalau support pecah dengan volume besar, zona itu sering berubah jadi resisten. Jangan paku harga ke satu angka; anggap sebagai area.</p>`
    },
    {
      id: "volume",
      title: "Volume dan nilai transaksi",
      teaser: "Harga tanpa volume gampang menipu. Cek juga berapa rupiah yang berpindah.",
      html: `<p>Volume = berapa lembar yang berpindah. <strong>Nilai transaksi</strong> = harga × volume, dalam rupiah. Saham Rp100 volume 1 miliar lembar kelihatan ramai, tapi nilainya mungkin lebih kecil dari saham blue chip yang “sepi” di layar.</p>
<p>Lonjakan volume saat breakout lebih meyakinkan daripada breakout sepi (mudah palsu). Volume tinggi saat harga turun juga bisa berarti distribusi (orang besar lepas barang).</p>
<p>Di app ini, volume diambil dari Yahoo Finance (satuan lembar). Saham dianggap likuid di penyaring kalau rata-rata nilai 20 hari ≥ Rp2 miliar. Itu filter, bukan jaminan gampang masuk-keluar di harga yang kamu mau.</p>`
    },
    {
      id: "rasio-fundamental",
      title: "PER, PBV, ROE, DER",
      teaser: "Alat ukur, bukan tombol ajaib. Data live rasio tidak ada di sumber gratis app ini.",
      html: `<p>Empat rasio yang sering disebut:</p>
<ul>
<li><strong>PER</strong> = harga / laba per saham. Tinggi bisa berarti mahal, atau pasar sedang pasang ekspektasi pertumbuhan.</li>
<li><strong>PBV</strong> = harga / nilai buku per saham. Di bawah 1 belum tentu murah (bisa aset bermasalah).</li>
<li><strong>ROE</strong> = laba / ekuitas. Mengukur seberapa efisien modal pemegang saham diputar.</li>
<li><strong>DER</strong> = utang / ekuitas. Tinggi = leverage besar, risiko bunga dan refinancing naik.</li>
</ul>
<p>Bandingkan dengan historinya sendiri dan dengan emiten sejenis, bukan dengan “angka keramat” asal. Laba sekali lonjak (jual aset) bisa bikin PER kelihatan murah palsu.</p>
<p><strong>Batasan app ini:</strong> API quote Yahoo yang biasanya membawa PER/PBV/EPS menolak akses tanpa login (HTTP 401). Jadi kartu saham di sini tidak menampilkan rasio live — app ini tidak mengarang angkanya. Pakai laporan keuangan di IDX/KSEI atau broker kamu.</p>`
    },
    {
      id: "istilah-dividen",
      title: "Cum, ex, recording, payment, yield",
      teaser: "Harus pegang sampai cum date. Yield = dividen / harga, bukan janji ke depan.",
      html: `<p>Kalau emiten bagikan dividen tunai, ingat empat tanggal:</p>
<ul>
<li><strong>Cum date</strong> — hari terakhir kamu bisa <em>beli</em> dan masih berhak dividen.</li>
<li><strong>Ex date</strong> — hari berikutnya; yang beli dari sini tidak dapat dividen itu. Harga sering turun kira-kira sebesar dividen, tapi tidak selalu pas.</li>
<li><strong>Recording date (DPS)</strong> — tanggal pencatatan pemegang saham. Karena settlement T+2, beli di cum date biasanya masih sempat masuk pencatatan (itu alasan cum-nya diatur sehari sebelum ex).</li>
<li><strong>Payment date</strong> — uang masuk ke rekening. Bisa berminggu-minggu setelah ex.</li>
</ul>
<p><strong>Yield</strong> = dividen per saham (biasanya 12 bulan terakhir) dibagi harga sekarang. <strong>Payout ratio</strong> = dividen / laba. Yield tinggi bisa berarti murah, atau harga sedang jatuh, atau dividen sekali-pakai (special dividend) yang tidak berulang.</p>
<p>Di tab Dividen, <em>ex-date</em> dan DPS diambil dari event Yahoo Finance (data nyata). Cum date ditandai <strong>perkiraan</strong> (hari bursa sebelum ex), karena jadwal resmi cum/recording/payment di idx.co.id tidak berhasil diambil dari sini. Perkiraan ex berikutnya dari pola tahun lalu juga diberi label perkiraan — bukan pengumuman emiten.</p>`
    },
    {
      id: "manajemen-risiko",
      title: "Manajemen risiko",
      teaser: "Posisi kecil, stop jelas, jangan all-in karena 'kayaknya naik 10%'.",
      html: `<p>Saham bisa ARB beruntun. Modal yang kamu setorkan bisa menyusut dalam, bahkan di blue chip, apalagi saham sepi.</p>
<ul>
<li>Tentukan dulu berapa kamu rela hilang per posisi (misalnya 0,5%–1% dari modal), baru hitung jumlah lot dari jarak entry ke stop loss.</li>
<li>Jangan geser stop loss menjauh “biar tidak salah”. Itu mengubah rencana jadi harapan.</li>
<li>Jangan tambah posisi yang sudah merugi tanpa alasan baru yang terukur (averaging down sering mengubur modal).</li>
<li>Kalau tidur tidak nyenyak karena satu saham, posisinya kelebihan.</li>
</ul>
<p>Penyaring “potensi naik kuat” di app ini <strong>bukan</strong> ramalan +10% besok. Lihat panel statistik: dari sejarah nyata, sinyal semacam itu jarang dilanjutkan kenaikan 10% di hari berikutnya.</p>`
    },
    {
      id: "kapan-beli-jual",
      title: "Kapan beli dan kapan jual",
      teaser: "Aturan masuk: tren + retest support/OB + volume, atau breakout bervolume. Keluar: TP, trailing, SL, disiplin cut loss.",
      html: `<p>Nggak ada jam ajaib “beli jam segini pasti cuan”. Yang bisa disusun adalah aturan, lalu diuji di data lama — tetap bukan jaminan ke depan.</p>
<p><strong>Kapan beli (entry) yang dipakai kartu Sinyal:</strong></p>
<ol>
<li><strong>Breakout bervolume</strong> — harga tutup di atas highest 20 hari, volume ≥ 1,5× rata-rata 20 hari. Tren lebih nyaman kalau harga masih di atas SMA50.</li>
<li><strong>Retest di tren naik</strong> — SMA20 di atas SMA50, harga sudah naik, lalu menarik ke zona support/SMA20 (order block sederhana: area permintaan terakhir), lalu tutup kuat dengan volume terkonfirmasi.</li>
</ol>
<p>Yang tidak dilakukan: kejar ARA tanpa rencana, beli cuma karena RSI rendah, atau karena “katanya bagus di grup”.</p>
<p><strong>Kapan jual (exit):</strong></p>
<ul>
<li><strong>Stop loss</strong> di bawah zona support/OB atau di bawah level breakout, dibulatkan ke fraksi. Kalau SL tersentuh, keluar. Itu disiplin, bukan malu.</li>
<li><strong>Take profit</strong> TP1 di 1,5× risiko (R), TP2 di 3R, atau di resisten terdekat. TP harian bisa terhalang ARA.</li>
<li><strong>Trailing</strong> — setelah TP1, stop bisa dinaikkan ke bawah candle terakhir atau ke SMA20, biar cuan tidak balik jadi rugi.</li>
<li><strong>Sinyal jual teknis</strong> — tutup di bawah lowest 20 hari, atau tren berubah (SMA20 &lt; SMA50 dan harga di bawah SMA20).</li>
<li><strong>Menjelang ex-date dividen</strong> — kalau kamu <em>tidak</em> mengejar dividen, kadang orang jual sebelum ex supaya tidak kena gap. Kalau kamu memang mau dividen, yang penting sudah pegang di cum date. Jangan beli di cum cuma demi yield 1% lalu kaget harga ex-nya turun lebih dalam.</li>
</ul>
<p>Kartu Sinyal di tab Saham memakai aturan di atas pada data Yahoo. Statusnya cuma tiga: BELI, TUNGGU, atau JUAL. Itu pembacaan mekanis, bukan perintah. Hasil uji sejarah ada di Beranda — baca angkanya, jangan yang enak saja.</p>`
    }
  ],
  belajarQuiz: [
    { q: "Berapa lembar dalam 1 lot di pasar reguler BEI?", options: ["1 lembar", "10 lembar", "100 lembar", "1.000 lembar"], answer: 2, explain: "Satuan perdagangan pasar reguler adalah 100 efek (1 lot)." },
    { q: "Untuk saham di atas Rp5.000, berapa fraksi harganya?", options: ["Rp1", "Rp5", "Rp10", "Rp25"], answer: 3, explain: "Fraksi untuk previous Rp5.000 atau lebih adalah Rp25." },
    { q: "Sampai kapan aturan transisi ARA/ARB (ARB 7% di banyak rentang, ARB Rp1 untuk Rp11–14) berlaku menurut SK Oktober 2026?", options: ["Sampai 20 Oktober 2026", "Sampai 31 Desember 2026, lalu dievaluasi", "Selamanya", "Hanya untuk papan akselerasi"], answer: 1, explain: "Kep-00158/BEI/10-2026 memberlakukan masa transisi sampai 31 Desember 2026 dan akan dievaluasi." },
    { q: "Settlement pasar reguler BEI saat ini adalah…", options: ["T+0", "T+1", "T+2", "T+3"], answer: 2, explain: "Masih T+2. T+1 baru dikaji, belum diterapkan." },
    { q: "Supaya berhak dividen, kamu harus sudah beli paling lambat…", options: ["Payment date", "Ex date", "Cum date", "Seminggu setelah pengumuman, kapan pun"], answer: 2, explain: "Beli paling lambat di cum date. Yang beli mulai ex date tidak mendapat dividen tersebut." },
    { q: "Kalau penyaring ‘potensi naik kuat’ muncul, artinya…", options: ["Pasti naik ≥10% besok", "Ada sinyal momentum/volume, tapi tidak ada jaminan hasil", "Boleh all-in", "BEI yang merekomendasikan"], answer: 1, explain: "Itu saringan teknis. Statistik sejarah di Beranda menunjukkan kenaikan 10% di hari berikutnya justru jarang." }
  ],
  metode: [
    {
      id: "tren",
      cat: "teknikal",
      title: "Tren (naik, turun, sideways)",
      teaser: "Berdagang searah arus lebih masuk akal daripada nebak titik balik tiap hari.",
      html: `<p>Tren naik: higher high dan higher low. Tren turun: lower high dan lower low. Sideways: harga jalan di rentang.</p>
<p>Alat bantu di app: SMA20 vs SMA50. Kalau SMA20 di atas SMA50 dan harga di atas SMA20, kartu Sinyal menandai tren naik. Ini penyederhanaan — tren jangka panjang (SMA200) bisa berbeda, seperti IHSG yang bisa naik harian meski masih di bawah SMA200.</p>`,
      example: `Ilustrasi (bukan harga live): saham naik dari 1.000 ke 1.200, turun ke 1.100 (masih di atas 1.000), lalu ke 1.300. Itu higher high & higher low — tren naik. Membeli asal di 1.300 tanpa zona atau stop, tetap berisiko.`,
      quiz: [{ q: "Higher high + higher low biasanya menandakan…", options: ["Tren turun", "Tren naik", "Dividen naik", "ARB pasti terjadi"], answer: 1, explain: "Itu definisi sederhana tren naik." }]
    },
    {
      id: "ma",
      cat: "teknikal",
      title: "Moving average (SMA/EMA)",
      teaser: "Rata-rata harga. Terlambat, tapi membantu merapikan kebisingan.",
      html: `<p><strong>SMA</strong> N hari = rata-rata close N hari. <strong>EMA</strong> lebih cepat merespons harga baru. MA bukan ramalan; dia ringkasan masa lalu.</p>
<p>Pakai MA sebagai: (1) filter tren, (2) zona dynamic support/resisten, (3) sinyal silang (MA pendek memotong MA panjang) — yang terakhir sering telat dan sering palsu di sideways.</p>
<p>App menampilkan SMA20, SMA50, SMA200 dari data Yahoo, kalau bar-nya cukup.</p>`,
      example: `Ilustrasi: close 20 hari terakhir rata-rata Rp2.000. Harga sekarang Rp2.050, hampir menempel SMA20 dari atas di tren naik — ini zona retest, bukan jaminan memantul.`,
      quiz: [{ q: "Kelemahan utama moving average adalah…", options: ["Selalu lebih cepat dari harga", "Mengabaikan volume saja, dan bersifat terlambat", "Dilarang BEI", "Hanya untuk saham bank"], answer: 1, explain: "MA dihitung dari harga lampau, jadi terlambat, dan tidak melihat volume." }]
    },
    {
      id: "rsi",
      cat: "teknikal",
      title: "RSI (Relative Strength Index)",
      teaser: "Mengukur kecepatan kenaikan/penurunan, bukan “murah/mahal” mutlak.",
      html: `<p>RSI14 di app memakai rumus Wilder klasik, 0–100. Tradisi: di atas 70 disebut jenuh beli, di bawah 30 jenuh jual. Di tren kuat, RSI bisa “nunggu” di zona 60–80 lama sekali — jual hanya karena RSI 70 sering keduluan.</p>
<p>Lebih berguna: divergensi (harga higher high, RSI lower high) sebagai peringatan, bukan pelatuk otomatis. Kartu Sinyal menampilkan RSI sebagai konteks, tidak membeli hanya karena RSI rendah.</p>`,
      example: `Kalau RSI 75 bareng breakout volume, itu momentum, bukan sinyal jual otomatis. Kalau RSI 28 tapi tren turun dan volume lepas, itu bisa masih jatuh — “jenuh jual bisa makin jual”.`,
      quiz: [{ q: "RSI 72 di saham yang sedang tren naik sebaiknya dibaca sebagai…", options: ["Wajib jual hari ini", "Wajib beli", "Momentum kuat / hati-hati kejar, bukan perintah otomatis", "Saham akan ARA"], answer: 2, explain: "RSI tinggi = pergerakan naik yang cepat. Bukan tombol jual wajib, apalagi di tren sehat." }]
    },
    {
      id: "macd",
      cat: "teknikal",
      title: "MACD",
      teaser: "Selisih dua EMA, plus garis sinyal. Bagus untuk momentum, sering palsu di sideways.",
      html: `<p>MACD garis = EMA12 − EMA26. Signal = EMA9 dari MACD. Histogram = selisih keduanya. Potongan ke atas sering dibaca momentum naik; ke bawah sebaliknya.</p>
<p>Di pasar mendatar, MACD sering silang berulang (whipsaw). Konfirmasikan dengan tren dan volume. App tidak menampilkan MACD live di kartu (supaya kartu tidak ramai), tapi metodenya sama: momentum + konfirmasi, bukan silang sendirian.</p>`,
      example: `Ilustrasi: histogram memudar (lebih pendek) saat harga masih naikin high baru — divergensi negatif, peringatan untuk mengencangkan trailing stop, bukan alasan short tanpa rencana.`,
      quiz: [{ q: "MACD paling rawan gagal saat…", options: ["Saham tren naik jelas", "Pasar sideways / mendatar", "Setelah laporan keuangan", "Hari ex-date"], answer: 1, explain: "Di rentang mendatar, silang MACD sering bolak-balik." }]
    },
    {
      id: "bollinger",
      cat: "teknikal",
      title: "Bollinger Bands",
      teaser: "Pita volatilitas di sekeliling SMA. Menyentuh pita bukan otomatis beli/jual.",
      html: `<p>Biasanya: SMA20 ± 2 standar deviasi. Pita melembung = volatilitas naik. Pita kempis (squeeze) = volatilitas rendah, sering diikuti gerakan besar — arahnya tidak diketahui dari squeeze itu sendiri.</p>
<p>Harga “menembus” pita atas bisa berarti overbought, atau awal tren kuat (walking the band). Jangan short hanya karena menyentuh pita atas.</p>`,
      example: `Squeeze beberapa minggu, lalu candle keluar ke atas dengan volume 2× biasa: itu breakout volatilitas. Tetap pakai stop di bawah zona keluar, karena breakout palsu sering terjadi.`,
      quiz: [{ q: "Squeeze pada Bollinger artinya…", options: ["Pasti naik", "Pasti turun", "Volatilitas sedang rendah; gerakan besar mungkin menyusul, arah belum diketahui", "Emiten akan pecah saham"], answer: 2, explain: "Squeeze = pita menyempit. Arah break-nya harus ditunggu dan dikonfirmasi." }]
    },
    {
      id: "fibonacci",
      cat: "teknikal",
      title: "Fibonacci retracement",
      teaser: "Alat zonasi pullback (38,2% / 50% / 61,8%), bukan hukum alam.",
      html: `<p>Tarik dari swing low ke swing high (tren naik). Level 0,382 / 0,5 / 0,618 sering dipantau sebagai zona retracement. Banyak orang memakainya, jadi kadang “berhasil” karena jadi ramalan yang memenuhi dirinya — tetap bukan sihir.</p>
<p>Pakai sebagai zona, gabungkan dengan candle dan volume. Kalau harga merusak 0,618 dengan volume, sinyal tren itu mungkin sudah rusak.</p>`,
      example: `Ilustrasi: naik 1.000 → 2.000. Retracement 50% = 1.500, 61,8% ≈ 1.382. Kalau harga mundur ke 1.500, volume mereda, lalu muncul candle bolak dengan volume, itu setup retest — tetap butuh stop di bawah zona.`,
      quiz: [{ q: "Level Fibonacci sebaiknya dipakai sebagai…", options: ["Harga wajib putar balik", "Zona, bersama sinyal lain", "Pengganti laporan keuangan", "Penentu ARA"], answer: 1, explain: "Itu alat zonasi, bukan jaminan pantulan." }]
    },
    {
      id: "pola-candle",
      cat: "teknikal",
      title: "Pola candle dan pola chart",
      teaser: "Hammer, engulfing, double bottom, flag… pola tanpa konteks sering menipu.",
      html: `<p>Pola candle populer: hammer / shooting star (bayangan panjang), engulfing (badan menelan candle sebelumnya), doji (open≈close, keraguan). Pola chart: double top/bottom, head and shoulders, flag, triangle.</p>
<p>Syarat minimal: muncul di zona yang masuk akal (support/resisten), ada konfirmasi close, dan volume mendukung. Pola di tengah kebisingan sideways nilainya rendah.</p>`,
      example: `Hammer di zona support 20 hari + volume naik, lalu candle berikutnya tutup di atas high hammer — konfirmasi. Hammer di tengah udara setelah turun 1% sepi volume — diabaikan.`,
      quiz: [{ q: "Pola engulfing bullish lebih bermakna jika…", options: ["Muncul di resisten setelah naik panjang", "Muncul di zona support dengan volume, lalu dikonfirmasi", "Warnanya hijau, di mana pun", "Terjadi pada hari IPO"], answer: 1, explain: "Konteks zona + volume + konfirmasi lebih penting daripada nama pola." }]
    },
    {
      id: "sr-lanjut",
      cat: "teknikal",
      title: "Support, resisten, dan perpindahan peran",
      teaser: "Yang pecah sering bertukar peran. Uji ulang (retest) sering jadi entry yang lebih tenang.",
      html: `<p>Setelah resisten pecah, zona itu sering jadi support (role reversal), dan sebaliknya. Banyak trader menunggu retest daripada mengejar candle breakout pertama — risikonya ketinggalan kalau tidak ada retest.</p>
<p>App mendeteksi versi sederhana: breakout highest 20 hari, atau retest SMA20/support 20 hari di tren naik.</p>`,
      example: `Harga berulang kali gagal tembus 1.000, lalu tutup 1.030 dengan volume 2×. Keesokan hari turun ke 1.005 lalu naik lagi — itu retest. Entry di zona 1.000–1.010, SL di bawah 1.000, lebih terukur daripada beli saat sudah 1.080.`,
      quiz: [{ q: "Role reversal artinya…", options: ["Saham ganti papan pencatatan", "Support yang pecah bisa jadi resisten, atau sebaliknya", "Broker wajib beli", "RSI dipaksa ke 50"], answer: 1, explain: "Zona yang pecah sering bertukar peran." }]
    },
    {
      id: "order-block",
      cat: "teknikal",
      title: "Order block (zona permintaan/pasokan)",
      teaser: "Area candle terakhir sebelum gerakan kuat. Mirip support/resisten, bukan ‘smart money’ magis.",
      html: `<p>Order block (istilah price-action / ICT yang sering dipakai di medsos) secara praktis: <strong>zona candle terakhir yang berlawanan</strong> sebelum harga lari jauh. Di situ diduga ada tumpukan order. Ini konsep zona, bukan bukti ada “bandar” di harga itu — app ini tidak bisa melihat antrian order.</p>
<p>Cara pakai yang waras: tandai zona, tunggu harga kembali, cari konfirmasi (penolakan + volume), pasang SL di luar zona. Kalau zona sudah ditembus bersih, anggap invalid.</p>
<p>Di halaman saham, app menandai zona OB naik/turun dari candle harian (displacement + candle berlawanan sebelumnya) dan menggambarnya di grafik. Itu deteksi mekanis, bukan bukti ada order institusi. Kalau harga ada di zona yang belum termitigasi, alasan itu muncul di kartu Sinyal.</p>`,
      example: `Harga turun, ada candle merah di 900–920, lalu tiba-tiba lari ke 1.100. Zona 900–920 adalah demand/OB. Saat harga kembali ke situ dan memantul dengan volume, itu retest OB. SL di bawah 900.`,
      quiz: [{ q: "Order block yang sehat dipakai sebagai…", options: ["Bukti resmi ada bandar", "Zona tunda (tunggu retest + konfirmasi + SL jelas)", "Sinyal beli tanpa stop", "Pengganti berita aksi korporasi"], answer: 1, explain: "Tanpa melihat order book, OB hanyalah zona. Tetap butuh konfirmasi dan SL." }]
    },
    {
      id: "volume-lanjut",
      cat: "teknikal",
      title: "Volume, spike, dan kekeringan",
      teaser: "Breakout sepi sering palsu. Volume tinggi di harga turun bisa distribusi.",
      html: `<p>Spike volume vs rata-rata 20 hari adalah salah satu filter penyaring app ini (≥ 1,8× untuk ‘potensi naik kuat’). Tapi spike bisa berarti banyak hal: akumulasi, distribusi, short covering, atau berita.</p>
<p>Lihat arah: volume tinggi + tutup dekat high lebih mendukung pembeli. Volume tinggi + tutup dekat low = tekanan jual. Volume mengering di resisten = kenaikan kehabisan tenaga.</p>`,
      example: `Saham naik 6% dengan volume 0,7× rata-rata — curigai breakout lemah. Naik 4% dengan 2,5× volume dan tutup dekat high — lebih layak masuk watchlist, tetap dengan SL.`,
      quiz: [{ q: "Breakout harga tanpa kenaikan volume biasanya…", options: ["Lebih dapat dipercaya", "Lebih rawan palsu", "Dijamin ARA esok hari", "Sama saja dengan yang bervolume"], answer: 1, explain: "Tanpa partisipasi volume, breakout lebih gampang gagal." }]
    },
    {
      id: "valuasi",
      cat: "fundamental",
      title: "Rasio valuasi (PER, PBV, EV/EBITDA, PEG)",
      teaser: "Murah atau mahal hanya bermakna dibanding laba, aset, arus kas, dan prospek.",
      html: `<p>Selain PER/PBV: <strong>EV/EBITDA</strong> lebih adil untuk membandingkan perusahaan beda utang. <strong>PEG</strong> ≈ PER / pertumbuhan laba; di bawah 1 sering disebut menarik — tapi pertumbuhan masa depan adalah tebakan.</p>
<p>Jangan bandingin PER bank dengan PER startup rugi. Jangan andalkan satu rasio. Dan ingat: app ini tidak menampilkan rasio live karena sumber gratisnya tidak memberikan angka itu.</p>`,
      example: `Ilustrasi: laba per saham Rp200, harga Rp2.000 → PER 10×. Kalau emiten sejenis biasanya 14–16× dan labanya berkualitas (berulang, bukan jual aset), ini kandidat undervalue. Kalau laba turun tiap tahun, PER 10× bisa tetap mahal.`,
      quiz: [{ q: "PER rendah selalu berarti saham wajib dibeli?", options: ["Ya, selalu", "Tidak. Bisa karena laba merosot atau risiko tinggi", "Hanya jika PBV juga rendah", "Hanya di hari ex-date"], answer: 1, explain: "PER rendah bisa perangkap nilai (value trap)." }]
    },
    {
      id: "laporan-keuangan",
      cat: "fundamental",
      title: "Membaca laporan keuangan",
      teaser: "Laba rugi, neraca, arus kas. Arus kas operasi sering lebih jujur daripada laba akuntansinya.",
      html: `<p>Tiga laporan utama:</p>
<ul>
<li><strong>Laba rugi</strong> — pendapatan, beban, laba bersih. Cek kualitas: laba dari operasi atau dari penjualan aset / keuntungan kurs?</li>
<li><strong>Neraca</strong> — aset, liabilitas, ekuitas. Cek utang jatuh tempo, persediaan, piutang yang menggembung.</li>
<li><strong>Arus kas</strong> — operasi, investasi, pendanaan. Laba besar tapi arus kas operasi lemah bisa tanda laba “kertas”.</li>
</ul>
<p>Baca juga catatan kaki: merubah umur aset, relasi istimewa, dan kontinjensi. Sumber resmi: laporan di idx.co.id / IDXnet, bukan gosip grup.</p>`,
      example: `Ilustrasi: laba naik 80%, tapi arus kas operasi negatif dan piutang melonjak. Mungkin penjualan kredit agresif. Tunda pujian sampai uangnya benar-benar masuk.`,
      quiz: [{ q: "Kalau laba naik tapi arus kas operasi lemah, kamu sebaiknya…", options: ["Langsung beli karena laba naik", "Curiga dan periksa piutang/persediaan/catatan", "Abaikan laporan, andalkan RSI", "Tunggu ARA"], answer: 1, explain: "Kualitas laba dicek lewat arus kas dan neraca, bukan judul ‘laba naik’ saja." }]
    },
    {
      id: "dcf",
      cat: "fundamental",
      title: "DCF sederhana",
      teaser: "Nilai = arus kas masa depan yang didiskonto. Sangat sensitif ke asumsi.",
      html: `<p>Ide Discounted Cash Flow: bisnis bernilai sebesar uang yang bisa dihasilkannya di masa depan, di-diskon ke hari ini. Versi sangat sederhana (model Gordon untuk yang sudah matang):</p>
<p><strong>Nilai ≈ CF<sub>1</sub> / (r − g)</strong>, dengan r = imbal hasil yang kamu minta, g = pertumbuhan abadi yang wajar (jangan agresif).</p>
<p>Ubah sedikit g atau r, hasilnya bisa jauh. Jadi DCF adalah kerangka pikir, bukan kalkulator “harga wajar pastinya RpX”. Untuk bisnis rugi atau komoditas yang labanya berayun, DCF mudah menipu.</p>`,
      example: `Ilustrasi (bukan valuasi emiten nyata): arus kas yang diharapkan tahun depan Rp1 triliun, r = 12%, g = 3%. Nilai ≈ 1 / (0,12 − 0,03) = Rp11,1 triliun. Kalau g kamu naikin ke 6% tanpa dasar, nilainya melonjak ke Rp16,7 triliun — itu bukan keajaiban, itu asumsi.`,
      quiz: [{ q: "Kelemahan utama DCF adalah…", options: ["Tidak bisa dihitung pakai kalkulator", "Hasilnya sangat bergantung pada asumsi pertumbuhan dan diskonto", "Dilarang OJK", "Hanya untuk dividen"], answer: 1, explain: "Sedikit ubah r atau g, nilai wajar bisa berubah drastis." }]
    },
    {
      id: "dividen-invest",
      cat: "fundamental",
      title: "Investasi dividen",
      teaser: "Cari pembayaran yang berkelanjutan, bukan yield tertinggi semata.",
      html: `<p>Investor dividen merawat arus kas dari emiten yang labanya stabil, payout wajar, neraca tidak rapuh, dan dividen tidak dibiayai utang terus-menerus.</p>
<p>Yield tinggi setelah harga jatuh bisa jebakan: dividen mungkin dipotong tahun depan. Cek riwayat DPS beberapa tahun, payout vs laba, dan apakah ada special dividend sekali jalan.</p>
<p>Pajak: untuk WP orang pribadi dalam negeri, dividen dari dalam negeri bisa <strong>bebas PPh</strong> jika diinvestasikan lagi di Indonesia (syarat dan laporan realisasi, PMK-18/PMK.03/2021). Kalau tidak memenuhi syarat, <strong>PPh final 10%</strong>. Detail di tab Dividen.</p>`,
      example: `Dua saham yield 8%. Yang satu 8 tahun berturut-turut bayar naik pelan, payout 50%, utang rendah. Yang satu 8% karena harganya baru anjlok 60% dan labanya negatif. Yield-nya sama, kualitasnya tidak.`,
      quiz: [{ q: "Yield dividen sangat tinggi setelah harga anjlok sebaiknya…", options: ["Langsung dibeli karena murah", "Diperiksa: apakah dividennya berkelanjutan atau akan dipotong", "Diabaikan saja", "Selalu lebih aman dari yield rendah"], answer: 1, explain: "Yield melonjak bisa karena harga jatuh, bukan karena bisnis makin sehat." }]
    },
    {
      id: "value-growth",
      cat: "fundamental",
      title: "Value vs growth",
      teaser: "Value cari harga di bawah nilai. Growth bayar mahal untuk laba yang (diharapkan) tumbuh.",
      html: `<p><strong>Value</strong>: PER/PBV rendah, diskon ke aset atau laba, sering di sektor matang. Risikonya value trap. <strong>Growth</strong>: penjualan/laba tumbuh cepat, PER sering tinggi. Risikonya ekspektasi tidak terpenuhi lalu PER turun kencang (derating).</p>
<p>Keduanya butuh margin of safety. Saham growth bagus pun bisa jadi investasi buruk kalau harganya sudah memasang pertumbuhan sempurna selamanya.</p>`,
      example: `Ilustrasi: emiten tumbuh 25%/tahun, PER 40×. Kalau pertumbuhan turut 10%, PER bisa merosot ke 20× — harga bisa turun meski labanya masih naik. Itu risiko growth yang mahal.`,
      quiz: [{ q: "Risiko khas saham growth yang mahal adalah…", options: ["Tidak pernah turun", "Derating kalau pertumbuhan mengecewakan", "Tidak ada volume", "Tidak boleh masuk LQ45"], answer: 1, explain: "Kalau cerita pertumbuhannya pecah, valuasi bisa turun lebih cepat daripada labanya." }]
    },
    {
      id: "broker-summary",
      cat: "bandarmologi",
      title: "Broker summary",
      teaser: "Melihat sekuritas mana yang net beli/jual. Berguna, tapi mudah salah tafsir — dan datanya tidak ada di app ini.",
      html: `<p>Broker summary menampilkan per sekuritas: volume/nilai beli dan jual di satu saham. “Bandar” di obrolan pasar sering hanya berarti broker yang mencolok, padahal di belakangnya bisa banyak nasabah, termasuk asing, institusi, atau trader ritel.</p>
<p>Cara baca yang waras: lihat apakah akumulasi terjadi di harga naik pelan (bisa penyerapan) atau tiba-tiba di puncak (bisa distribusi). Satu hari net beli besar tidak cukup.</p>
<p><strong>Jujur soal data:</strong> ringkasan broker dan flow asing tidak tersedia di Yahoo maupun RSS yang dipakai app ini. app ini tidak akan mengarang peta bandar. Lihat di RTI/Stockbit/IDX kalau kamu punya akses, dan tetap pakai manajemen risiko.</p>`,
      example: `Ilustrasi: broker A net beli 3 hari di saham yang sideways, harga belum lari. Itu menarik untuk diawasi. Kalau broker A net beli saat saham sudah ARA 2 hari, bisa jadi yang ketinggalan sedang kejar — atau memang masih kuat. Tanpa konteks, angkanya mentah.`,
      quiz: [{ q: "Net beli satu broker dalam sehari artinya…", options: ["Pasti bandar akumulasi, wajib ikut", "Hanya info siapa yang aktif; bisa banyak makna, bukan perintah beli", "BEI menjamin labanya", "Akan masuk berita resmi"], answer: 1, explain: "Broker summary adalah jejak transaksi, bukan sinyal pasti." }]
    },
    {
      id: "foreign-flow",
      cat: "bandarmologi",
      title: "Foreign flow (aliran asing)",
      teaser: "Asing masuk/keluar bisa menggerakkan IHSG, tapi bukan alasan membeli asal.",
      html: `<p>Data investor asing (net buy/sell pasar atau per saham) sering dikutip media. Aliran besar bisa mendorong indeks, terutama blue chip yang masuk indeks global. Tapi asing juga sering salah, dan bisa keluar mendadak saat dolar menguat atau risk-off.</p>
<p>Jangan ikut “asing beli jadi saya beli” tanpa melihat harga, valuasi, dan risiko. Data flow asing resmi biasanya dari bursa/KSEI/media; app ini tidak memilikinya secara live, jadi tidak ditampilkan.</p>`,
      example: `Hari IHSG hijau, berita “asing net beli Rp1 triliun”. Kalau yang dibeli hanya 3-4 saham big cap, saham kamu yang second liner belum tentu ikut. Baca rinciannya, jangan judulnya saja.`,
      quiz: [{ q: "Foreign net buy di IHSG artinya semua saham akan naik?", options: ["Ya, otomatis", "Tidak. Sering terkonsentrasi di saham besar tertentu", "Hanya saham papan akselerasi", "Hanya saham yang ARA"], answer: 1, explain: "Aliran asing biasanya tidak merata ke seluruh emiten." }]
    },
    {
      id: "akumulasi",
      cat: "bandarmologi",
      title: "Akumulasi dan distribusi",
      teaser: "Harga naik pelan bervolume, atau turun pelan saat “kayaknya tenang”, bisa jadi jejak penyerapan/pelepasan.",
      html: `<p>Akumulasi: pihak besar menyerap saham tanpa meroketkan harga — volume naik, range sempit, net permintaan. Distribusi: melepas ke ritel yang euforia, harga macet atau turun pelan di volume tinggi.</p>
<p>Alat kasar: On-Balance Volume atau bandingkan volume up-day vs down-day. Tidak sempurna. Tanpa data broker, ini tebakan terdidik, bukan bukti.</p>`,
      example: `Saham 10 hari naik tipis, hampir tiap hari tutup di atas open, volume di atas rata-rata, berita sepi — pola akumulasi yang pantas diawasi. Lawannya: setelah naik 80%, volume besar tapi close lemah berhari-hari — waspada distribusi.`,
      quiz: [{ q: "Volume besar + close lemah berhari-hari setelah rally panjang lebih mirip…", options: ["Akumulasi", "Distribusi / pelepasan", "Rights issue", "Stock split"], answer: 1, explain: "Itu pola kasar distribusi, tetap perlu konfirmasi dan bukan jaminan." }]
    },
    {
      id: "aksi-korporasi",
      cat: "berita",
      title: "Berdagang dari berita dan aksi korporasi",
      teaser: "Baca dokumennya, bukan judulnya. Harga sering bergerak sebelum berita “resmi” ramai di grup.",
      html: `<p>Harga merespons berita karena mengubah arus kas, jumlah saham, kendali, atau persepsi risiko. Pola khas: bocoran/isyu dulu, gap saat pengumuman, lalu “jual fakta” kalau sudah terdiskon di harga.</p>
<p>Langkah waras: (1) identifikasi jenis aksi, (2) baca keterbukaan resmi, (3) hitung dampak ke jumlah saham dan valuasi, (4) jangan kejar ARA tanpa rencana, (5) ingat risiko deal batal.</p>
<p>Tab Berita menampilkan RSS nyata (CNBC Market, Kontan, IDX Channel) dan menandai ticker/jenis event dari judul — bisa kelewat atau salah tempel, jadi klik sumber aslinya.</p>`,
      example: `Judul “laba naik 200%” bisa jadi dari basis rugi tahun lalu atau laba sekali-pakai. Buka laporan: naik dari apa ke apa, arus kasnya bagaimana. Jangan beli hanya karena judul.`,
      quiz: [{ q: "Saat berita bagus keluar dan saham sudah naik banyak sebelumnya, risiko yang sering terjadi adalah…", options: ["Wajib lanjut ARA", "Sell on news / jual fakta", "BEI membatalkan berita", "Dividen otomatis naik"], answer: 1, explain: "Kalau berita sudah terdiskon di harga, pengumuman resmi bisa jadi momen ambil untung." }]
    },
    {
      id: "akuisisi",
      cat: "berita",
      title: "Akuisisi dan tender offer",
      teaser: "Harga target sering naik ke arah harga tawaran, tapi deal bisa batal atau terlewat lama.",
      html: `<p>Kalau perusahaan A mengakuisisi B, atau ada tender offer, pemegang B biasanya ditawari harga tertentu. Harga pasar B sering merapat ke harga tawaran, diskon sedikit (risiko gagal, waktu, syarat OJK/BEI).</p>
<p>Risiko: tawaran ditarik, harga jauh di bawah ekspektasi, dilusi di sisi A kalau bayar pakai saham baru, atau integrasi bisnis yang jelek jangka panjang.</p>
<p>Jangan beli target yang sudah di atas harga tender tanpa alasan jelas — upside-nya bisa tipis, downsidanya besar kalau batal.</p>`,
      example: `Ilustrasi: tawaran tender Rp1.000, pasar sebelumnya Rp700, langsung gap ke Rp960. Selisih Rp40 adalah “imbalan” menanggung risiko batal. Kalau sudah Rp1.050 (di atas tender), kamu spekulasi ada tawaran lebih tinggi — bukan free lunch.`,
      quiz: [{ q: "Membeli saham target di atas harga tender offer berarti…", options: ["Aman karena ada tawaran resmi", "Kamu berspekulasi tawaran naik atau ada katalis lain; risiko merugikan jika deal biasa saja / batal", "OJK mengganti selisihnya", "Wajib laku di ARA"], answer: 1, explain: "Di atas harga tawaran, pelindungnya tipis kalau tidak ada kenaikan tawaran." }]
    },
    {
      id: "buyback",
      cat: "berita",
      title: "Buyback (pembelian kembali saham)",
      teaser: "Emiten beli sahamnya sendiri. Bisa menopang harga, tapi anggaran belum tentu dipakai habis.",
      html: `<p>Buyback mengurangi saham beredar kalau sahamnya kemudian ditarik, atau jadi treasuri. Sinyal: manajemen anggap harga murah, atau sekadar menyangga pasar. Lihat: plafon dana, periode, sudah berapa yang terpakai, sumber dana (kas bebas atau utang?).</p>
<p>Pengumuman buyback sering bikin sentimen positif jangka pendek. Eksekusinya yang menentukan. Ada emiten mengumumkan besar, merealisasikan kecil.</p>`,
      example: `Berita nyata perlu dibaca di tab Berita / sumber aslinya. Secara umum: plafon Rp40 miliar terdengar besar di emiten kecil, tapi cek kapitalisasi dan periode. Jangan anggap seluruh plafon langsung diserap hari ini.`,
      quiz: [{ q: "Pengumuman buyback menjamin harga naik terus?", options: ["Ya", "Tidak. Tergantung eksekusi, dana, dan kondisi pasar", "Hanya jika yield di atas 5%", "Hanya di papan utama"], answer: 1, explain: "Buyback adalah niat + kapasitas, bukan jaminan harga." }]
    },
    {
      id: "rights",
      cat: "berita",
      title: "Rights issue / HMETD",
      teaser: "Saham baru = dilusi. Harga teoritis biasanya turun, bukan otomatis “murah”.",
      html: `<p>Hak Memesan Efek Terlebih Dahulu memberi kamu hak beli saham baru, sering di bawah harga pasar. Yang tidak ikut, terdelusi (porsi kepemilikan turun). Harga ex-rights biasanya menyesuaikan ke <strong>harga teoritis</strong> (rata-rata tertimbang saham lama dan baru).</p>
<p>Pertanyaan penting: dana dipakai buat apa? Melunasi utang yang mahal, ekspansi yang masuk akal, atau menambal lubang? Rights murah bukan diskon gratis.</p>`,
      example: `Ilustrasi: harga Rp1.000, rights 1:1 di Rp400. Harga teoritis ≈ (1.000+400)/2 = Rp700. Kalau pasar sudah 700 di ex, itu penyesuaian, bukan kejatuhan bisnis semata. Hitung dulu sebelum panik atau “serok karena turun”.`,
      quiz: [{ q: "Kalau kamu tidak melaksanakan HMETD, biasanya…", options: ["Porsi kepemilikan tetap", "Porsi kepemilikan terdelusi", "Kamu dapat dividen ganda", "Saham dihapus"], answer: 1, explain: "Saham baru terbit untuk yang melaksanakan hak; yang tidak ikut terdelusi. Haknya sendiri biasanya bisa dijual di pasar di periode tertentu." }]
    },
    {
      id: "split",
      cat: "berita",
      title: "Stock split dan reverse split",
      teaser: "Nominal pecah, nilai perusahaan tidak otomatis bertambah.",
      html: `<p>Stock split 1:5 memecah 1 saham jadi 5, harga teoretis jadi 1/5. Kapitalisasi teoritis sama. Alasan umum: biar harga “terjangkau” secara psikologis dan fraksi lebih rapat. Reverse split sebaliknya, sering di saham penny agar memenuhi syarat harga.</p>
<p>Harga bisa ramai spekulasi sebelum split, lalu sepi sesudahnya. Jangan beli hanya karena “nanti pecah jadi banyak lembar”. Event split historis yang terdeteksi Yahoo (kalau ada) dicatat di data saham, bukan sebagai sinyal beli.</p>`,
      example: `Saham Rp10.000 di-split 1:10, harga teoretis Rp1.000, lot tetap 100 lembar. Modal 1 lot turun, tapi bisnisnya sama. Kalau harga cuma turun ke Rp1.000, kamu tidak dapat “hadiah”.`,
      quiz: [{ q: "Stock split secara teori membuat nilai perusahaan…", options: ["Naik otomatis 10×", "Turun otomatis", "Tetap (hanya pecah nominal/jumlah lembar)", "Bebas pajak selalu"], answer: 2, explain: "Split mengubah pecahan, bukan nilai intrinsik secara otomatis." }]
    },
    {
      id: "pp",
      cat: "berita",
      title: "Private placement / penempatan terbatas",
      teaser: "Saham baru ke pihak tertentu. Cek harga, dilusi, dan siapa yang masuk.",
      html: `<p>Penempatan terbatas menerbitkan saham ke investor terpilih, sering lebih cepat daripada rights. Dampak: dilusi, tapi bisa membawa dana dan pemegang baru yang “dianggap” strategis.</p>
<p>Kalau harga penempatan jauh di bawah pasar, pemegang lama dirugikan kecuali dananya benar-benar menambah nilai. Cek keterbukaan: berapa lembar, harga, diskon, tujuan, lock-up.</p>`,
      example: `Ilustrasi: pasar Rp800, private placement Rp500 ke pemegang baru 20%. Dilusi terasa, dan harga pasar sering merosot ke arah harga penempatan. Tanya: kenapa tidak rights ke pemegang lama?`,
      quiz: [{ q: "Private placement di bawah harga pasar terutama berisiko…", options: ["Tidak ada risikonya", "Dilusi dan tekanan harga bagi pemegang lama", "Menaikkan ARA", "Menghapus utang otomatis"], answer: 1, explain: "Saham baru murah mendilusi dan sering menekan harga." }]
    },
    {
      id: "rebalancing",
      cat: "berita",
      title: "Rebalancing MSCI, LQ45, dan indeks lain",
      teaser: "Dana indeks harus beli/jual di sekitar efektif. Efeknya sering jangka pendek.",
      html: `<p>Kalau saham masuk LQ45, IDX30, MSCI, FTSE, dsb., reksa dana/ETF yang meniru indeks harus membeli (dan menjual yang keluar). Arus itu bisa mendorong harga di sekitar pengumuman dan tanggal efektif, lalu mereda.</p>
<p>Masuk indeks bukan jaminan bisnis makin bagus. Keluar indeks bukan otomatis perusahaan hancur. Spekulasi “masuk MSCI” sering sudah dikunyah sebelum pengumuman resmi.</p>`,
      example: `Saham sepi tiba-tiba ramai setelah kabar akan masuk indeks: volume naik, harga naik duluan. Di tanggal efektif, bisa justru “jual fakta”. Tanpa konfirmasi resmi, itu spekulasi.`,
      quiz: [{ q: "Saham yang masuk indeks global/besar biasanya…", options: ["Wajib naik selamanya", "Bisa kena arus dana indeks, sering bersifat jangka pendek, bukan jaminan fundamental", "Langsung merdeka dari ARB", "Bebas biaya broker"], answer: 1, explain: "Efek rebalancing itu aliran dana, biasanya temporal." }]
    },
    {
      id: "insider-astra",
      cat: "berita",
      title: "Pembelian pemegang besar / konglomerat (contoh: Astra beli saham banyak)",
      teaser: "Siapa yang beli, berapa, harga, dan tujuannya lebih penting daripada gosip ‘Astra masuk’.",
      html: `<p>Kalau pemegang pengendali, orang dalam, atau konglomerat (misalnya grup sebesar Astra) membeli porsi besar, pasar sering membacanya sebagai sinyal percaya diri — atau langkah konsolidasi/kendali. Ini event-driven, bukan jaminan cuan.</p>
<p>Yang harus dicek di keterbukaan resmi (bukan status WA):</p>
<ul>
<li>Berapa persen sebelum dan sesudah, apakah melewati ambang tender offer</li>
<li>Harga transaksi vs pasar (premium atau diskon)</li>
<li>Saham dari siapa (pasar, private, rights)</li>
<li>Ada tidaknya rencana penggabungan, delisting, atau sekadar investasi keuangan</li>
<li>Lock-up atau komitmen sudah berapa lama dipegang</li>
</ul>
<p><strong>Reaksi harga yang sering (tidak selalu):</strong> gap naik di saham target, volume meledak, kadang ARA. Lalu bisa konsolidasi. Saham pembeli (induk) kadang justru berat kalau dianggap mahal atau menambah risiko.</p>
<p><strong>Cara menyikapi, bukan resep:</strong> jangan kejar candle pertama kalau sudah jauh di atas harga transaksi mereka. Kalau masih di sekitar harga beli pemegang besar, itu informasi — tetap butuh SL, karena “tangan kuat” pun bisa salah, atau belinya bertahap lalu berhenti.</p>
<p><strong>Risiko:</strong> isu belum tentu benar; beli di pasar terbuka bisa selesai cepat; setelah kendali didapat, likuiditas publik menyusut; konflik kepentingan vs pemegang minoritas.</p>`,
      example: `Ilustrasi (bukan berita hari ini): “Grup besar beli 15% emiten X di rata-rata Rp500, pasar sebelumnya Rp420.” Harga mungkin melonjak ke Rp480–520. Mengejar di Rp620 tanpa sisa upside ke harga beli mereka adalah spekulasi murni. Kalau beritanya hanya “katanya Astra beli”, tunggu keterbukaan — judul grup bisa dipakai untuk menggiring ritel.`,
      quiz: [{ q: "Kalau ada kabar konglomerat beli porsi besar, langkah paling waras adalah…", options: ["All-in sebelum dicek", "Cek keterbukaan resmi: porsi, harga, tujuan; jangan kejar jauh di atas harga transaksi mereka", "Pasti aman karena namanya besar", "Langsung jual semua blue chip lain"], answer: 1, explain: "Nama besar bukan jaminan. Dokumen dan harga transaksi lebih penting daripada gosip." }]
    },
    {
      id: "bi-rate",
      cat: "makro",
      title: "Suku bunga BI dan pasar saham",
      teaser: "Bunga naik biasanya menekan valuasi dan kredit. Efeknya tidak merata ke semua sektor.",
      html: `<p>Bank Indonesia menetapkan suku bunga kebijakan (BI-Rate). Naik: biaya utang naik, valuasi (diskonto) lebih mahal, perbankan bisa nikmati neto bunga tapi kredit bisa seret, saham pertumbuhan sering tertekan. Turun: sebaliknya, tapi kalau bunga turun karena ekonomi lemah, labanya juga bisa lemah.</p>
<p>Jangan beli/jual semua saham hanya karena satu keputusan RDG. Lihat jalur bunga (naik/turun beruntun), inflasi, dan nilai tukar.</p>`,
      example: `Saat pasar sudah memasang ekspektasi “hold”, keputusan hold bisa jadi non-event. Yang menggerakkan sering kali adalah nada pernyataan (hawkish/dovish) dan proyeksi, bukan angka yang sudah ditebak.`,
      quiz: [{ q: "Kenaikan suku bunga, secara umum, cenderung…", options: ["Menaikkan semua saham hari itu juga", "Menekan valuasi aset berisiko dan menaikkan biaya utang, dengan dampak berbeda per sektor", "Menghapus ARB", "Menaikkan dividen wajib"], answer: 1, explain: "Transmisi bunga tidak merata dan tidak otomatis dalam sehari." }]
    },
    {
      id: "rupiah",
      cat: "makro",
      title: "Rupiah dan saham",
      teaser: "Rupiah melemah sering bikin asing keluar, tapi emiten eksportir/komoditas bisa diuntungkan.",
      html: `<p>USD/IDR naik (rupiah lemah) bisa: menekan saham berutang dolar, menaikkan biaya impor, dan memicu outflow. Di sisi lain, eksportir, komoditas berdenominasi dolar, atau emiten yang pendapatannya banyak valuta asing bisa ketolong.</p>
<p>IHSG dan rupiah sering bergerak bareng saat risk-off, tapi tidak 1:1. Cek eksposur emiten, bukan indeksnya saja.</p>`,
      example: `Saham perbankan big cap sering ikut tertekan saat rupiah lepas dan asing jual indeks. Saham tambang ekspor bisa lebih tahan, atau malah naik, kalau harga komoditasnya juga kuat. Bukan rumus kaku.`,
      quiz: [{ q: "Rupiah melemah selalu buruk untuk semua emiten BEI?", options: ["Ya", "Tidak. Tergantung utang valas, impor vs ekspor, dan aliran asing", "Hanya buruk bagi emiten papan pengembangan", "Tidak berpengaruh sama sekali"], answer: 1, explain: "Dampaknya bergantung pada struktur bisnis dan arus modal." }]
    },
    {
      id: "komoditas",
      cat: "makro",
      title: "Komoditas (CPO, batubara, nikel, emas, minyak)",
      teaser: "Harga komoditas bisa menggerakkan emiten terkait, dengan jeda dan yang tidak selalu pas.",
      html: `<p>Banyak emiten BEI tertambat ke harga CPO, batubara, nikel, emas, atau minyak. Harga komoditas naik belum tentu sahamnya naik sama cepat: ada hedging, biaya, pajak ekspor, kuota, dan grading kualitas.</p>
<p>Jangan bela saham tambang hanya karena “harga emas dunia naik semalam” tanpa cek apakah emiten itu benar-benar produsen yang relevan dan sudah mahal.</p>`,
      example: `Batubara naik, saham batubara sering ikut dalam beberapa sesi, lalu menyesuaikan ke laporan produksi dan harga kontrak mereka (bukan harga spot yang kamu lihat di berita). Korelasinya ada, bukan 100%.`,
      quiz: [{ q: "Harga komoditas dunia naik semalam, saham emiten terkait…", options: ["Pasti ARA", "Bisa bereaksi, tapi tidak otomatis dan perlu dicek eksposur plus valuasi", "Tidak boleh bergerak", "Selalu turun dulu"], answer: 1, explain: "Korelasi ada, bukan jaminan pergerakan yang sama." }]
    }
  ]
};
