# 🎓 Wadah Guru — AI-Powered Educational Game Generator

Aplikasi web berbasis **Node.js (Express)** untuk memproduksi file HTML5 game edukasi interaktif mandiri yang dapat digunakan secara **offline** oleh siswa TK dan SD. Didukung oleh kecerdasan **Google Gemini AI**.

**Author / Creator:** Zaini Suparlan

---

## 🌟 Fitur Utama
1. **Personalisasi Guru & Kelas**: Nama Guru, Wali Kelas, dan Kelas otomatis disuntikkan ke dalam game.
2. **Kecerdasan Gemini AI**: Menyusun soal dan konten game kreatif sesuai tema/kata kunci pelajaran yang diinputkan.
3. **9 Jenis Template Game**:
   - **SD**: Flashcard, Isian Singkat, Labirin Angka, Mencocokkan Pasangan, Petualangan Cerita, Tarik Tambang.
   - **TK**: Hubungkan Garis, Sortir Warna & Benda, Detektif Suara (Audio TTS).
4. **Siap Pakai Offline**: Hasil unduhan berupa file single HTML5 yang dapat dimainkan di mana saja tanpa koneksi internet.
5. **Watermark Hak Cipta Permanen**: Label `by ZAINI SUPARLAN` terpasang aman & elegan di seluruh game hasil cetak.
6. **Vercel Serverless Ready**: Dilengkapi konfigurasi `vercel.json` untuk kemudahan deployment.

---

## 📁 Struktur Proyek
```
Wadah Guru/
├── package.json          # Manifest dependencies Node.js & script
├── vercel.json           # Konfigurasi deploy Vercel Serverless
├── server.js             # Express Backend & Logika Gemini AI API
├── .env                  # Tempat menyimpan GEMINI_API_KEY
├── .gitignore            # Git ignore file
├── public/
│   ├── index.html        # Antarmuka web utama guru
│   └── style.css         # Styling modern, bersih, & ramah anak
└── Template Game/        # Brankas Template HTML5
    ├── sd/
    │   ├── game_flashcard.html
    │   ├── game_isian_singkat.html
    │   ├── game_labirin.html
    │   ├── game_mencocokkan.html
    │   ├── game_petualangan_cerita.html
    │   └── game_tarik_tambang.html
    └── tk/
        ├── tk_mencocokkan_garis.html
        ├── tk_sortir_warna.html
        └── tk_tebak_suara.html
```

---

## 🚀 Cara Menjalankan di Komputer Lokal

### 1. Install Dependencies
Buka terminal / Command Prompt di folder `Wadah Guru` lalu jalankan:
```bash
npm install
```

### 2. Atur API Key Gemini
Dapatkan API Key gratis di [Google AI Studio](https://aistudio.google.com/app/apikey).
Buka file `.env` di root folder, lalu masukkan key Anda:
```env
GEMINI_API_KEY=AIzaSyYourActualApiKeyHere...
```

### 3. Jalankan Mode Development
Jalankan perintah:
```bash
npm run dev
```
Buka browser dan kunjungi: **`http://localhost:3000`**

---

## ☁️ Cara Deploy ke Vercel

1. Push / Upload proyek ini ke repository **GitHub**.
2. Buka dashboard [Vercel](https://vercel.com) dan buat **New Project**.
3. Import repository GitHub Anda.
4. Di bagian **Environment Variables**, tambahkan:
   - **Key**: `GEMINI_API_KEY`
   - **Value**: *(API Key Gemini Anda)*
5. Klik **Deploy**! Aplikasi Wadah Guru Anda siap digunakan di seluruh dunia.

---

## ⚖️ Lisensi & Hak Cipta
Hak Cipta © 2026 oleh **Zaini Suparlan**. Dibuat khusus untuk membantu guru TK & SD Indonesia.
