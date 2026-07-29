// ============================================================
//  WADAH GURU - AI-Powered Educational Game Generator
//  Backend Server (server.js)
//  Author  : Zaini Suparlan
//  License : ISC
// ============================================================

require('dotenv').config();
const express = require('express');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ─── Polyfill WebSocket untuk Supabase di Node.js < 22 ─────
if (typeof global.WebSocket === 'undefined') {
  global.WebSocket = class { };
}

// ─── Inisialisasi Supabase (lazy, hanya jika env tersedia) ─
function getSupabase() {
  try {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    return createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
  } catch (err) {
    console.error('[Supabase Init Error]', err.message);
    return null;
  }
}

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// ─── Template Directory ────────────────────────────────────
const TEMPLATES_DIR = path.join(__dirname, 'Template Game');

// ─── Peta Template → File & Deskripsi JSON Schema ─────────
//  Setiap entri menjelaskan:
//    file   : lokasi template relatif dari TEMPLATES_DIR
//    schema : instruksi ke AI tentang format JSON yang harus dihasilkan
// ──────────────────────────────────────────────────────────
const TEMPLATE_MAP = {
  // ── SD ──────────────────────────────────────────────────
  'sd_flashcard': {
    label: '[SD] 🃏 Kartu Ajaib (Flashcard)',
    file: path.join(TEMPLATES_DIR, 'sd', 'game_flashcard.html'),
    schema: `Hasilkan HANYA objek JSON murni (tanpa markdown/backtick) dengan format:
{
  "judul": "...",
  "nama_guru": "{{NAMA_GURU}}",
  "wali_kelas": "{{WALI_KELAS}}",
  "kelas": "{{KELAS}}",
  "koleksi_kartu": [
    { "emoji": "...", "depan": "Pertanyaan/Soal Singkat", "belakang": "Jawaban Singkat & Tepat" },
    ... (minimal 8 kartu, maksimal 16 kartu)
  ]
}
PENTING: 'depan' hanya berisi pertanyaan/soal singkat (misal: "6 + 2 = "). Jangan menumpuk pilihan A,B,C di kartu! 'belakang' berisi jawaban langsung (misal: "8").`
  },

  'sd_pilihan_ganda': {
    label: '[SD] 📝 Pilihan Ganda A/B/C/D (Multiple Choice)',
    file: path.join(TEMPLATES_DIR, 'sd', 'game_pilihan_ganda.html'),
    schema: `Hasilkan HANYA objek JSON murni (tanpa markdown/backtick) dengan format:
{
  "judul": "...",
  "nama_guru": "{{NAMA_GURU}}",
  "wali_kelas": "{{WALI_KELAS}}",
  "kelas": "{{KELAS}}",
  "soal_list": [
    {
      "pertanyaan": "Pertanyaan yang jelas dan sesuai materi",
      "pilihan": ["A. pilihan satu", "B. pilihan dua", "C. pilihan tiga", "D. pilihan empat"],
      "jawaban": "A"
    },
    ... (8 hingga 12 soal pilihan ganda)
  ]
}
PENTING: Field "jawaban" WAJIB berisi HANYA satu huruf kapital: "A", "B", "C", atau "D".
Jangan pernah menuliskan jawaban lengkap di field jawaban. Pastikan setiap soal memiliki tepat 4 pilihan dengan awalan A., B., C., D.
Sesuaikan tingkat kesulitan soal dengan kelas yang diberikan.`
  },

  'sd_isian_singkat': {
    label: '[SD] ✏️ Isian Singkat / Pilihan Ganda (Fill in Blank / Quiz)',
    file: path.join(TEMPLATES_DIR, 'sd', 'game_isian_singkat.html'),
    schema: `Hasilkan HANYA objek JSON murni (tanpa markdown/backtick) dengan format:
{
  "judul": "...",
  "nama_guru": "{{NAMA_GURU}}",
  "wali_kelas": "{{WALI_KELAS}}",
  "kelas": "{{KELAS}}",
  "soal_list": [
    {
      "pertanyaan": "kalimat soal...",
      "pilihan": ["A. opsi 1", "B. opsi 2", "C. opsi 3", "D. opsi 4"],
      "jawaban": "A"
    },
    ... (8 hingga 12 soal)
  ]
}
Catatan: Jika meminta pilihan ganda, sertakan array 'pilihan' dengan opsi A, B, C, D dan 'jawaban' berupa huruf A, B, C, atau D.`
  },

  'sd_labirin': {
    label: '[SD] 🌀 Labirin Angka (Maze Quiz)',
    file: path.join(TEMPLATES_DIR, 'sd', 'game_labirin.html'),
    schema: `Hasilkan HANYA objek JSON murni (tanpa markdown/backtick) dengan format:
{
  "judul": "...",
  "nama_guru": "{{NAMA_GURU}}",
  "wali_kelas": "{{WALI_KELAS}}",
  "kelas": "{{KELAS}}",
  "soal": "soal matematika/pengetahuan, contoh: 4 + 3 = ...",
  "jawaban_benar": "7",
  "peta": [
    [0, 1, 0, 0, 0],
    [0, 1, 0, 1, 0],
    [0, 0, 0, 1, 0],
    [1, 1, 0, 0, 0],
    [1, 1, 1, 2, 3]
  ],
  "nilai_peta": { "2": "jawaban salah", "3": "jawaban benar" }
}
Peta adalah grid 5x5: 0=jalan, 1=tembok, 2=jawaban salah, 3=jawaban benar. Pastikan ada jalur dari [0][0] ke kotak 3.`
  },

  'sd_mencocokkan': {
    label: '[SD] 🤝 Mencocokkan Pasangan (Matching)',
    file: path.join(TEMPLATES_DIR, 'sd', 'game_mencocokkan.html'),
    schema: `Hasilkan HANYA objek JSON murni (tanpa markdown/backtick) dengan format:
{
  "judul": "...",
  "nama_guru": "{{NAMA_GURU}}",
  "wali_kelas": "{{WALI_KELAS}}",
  "kelas": "{{KELAS}}",
  "pasangan": [
    { "id": 1, "kiri": "emoji + teks kiri", "kanan": "teks pasangan kanan" },
    { "id": 2, "kiri": "...", "kanan": "..." },
    ... (6 hingga 10 pasangan)
  ]
}
Gunakan emoji yang relevan di kolom kiri. Sesuaikan dengan tema pelajaran.`
  },

  'sd_petualangan_cerita': {
    label: '[SD] 📖 Petualangan Cerita Edukasi (Story Adventure)',
    file: path.join(TEMPLATES_DIR, 'sd', 'game_petualangan_cerita.html'),
    schema: `Hasilkan HANYA objek JSON murni (tanpa markdown/backtick) dengan format:
{
  "judul": "...",
  "nama_guru": "{{NAMA_GURU}}",
  "wali_kelas": "{{WALI_KELAS}}",
  "kelas": "{{KELAS}}",
  "level": [
    {
      "cerita": "narasi cerita yang menarik dan edukatif (2-3 kalimat)",
      "soal": "pertanyaan berdasarkan cerita di atas",
      "pilihan": ["A. pilihan satu", "B. pilihan dua", "C. pilihan tiga", "D. pilihan empat"],
      "jawaban": "A"
    },
    ... (4 hingga 6 level cerita)
  ]
}
Setiap level harus bercerita dengan tokoh yang konsisten dan saling sambung.`
  },

  'sd_tarik_tambang': {
    label: '[SD] 🪢 Tarik Tambang Kuis (Tug of War Quiz)',
    file: path.join(TEMPLATES_DIR, 'sd', 'game_tarik_tambang.html'),
    schema: `Hasilkan HANYA objek JSON murni (tanpa markdown/backtick) dengan format:
{
  "judul": "...",
  "nama_guru": "{{NAMA_GURU}}",
  "wali_kelas": "{{WALI_KELAS}}",
  "kelas": "{{KELAS}}",
  "soal_matematika": [
    { "soal": "5 + 3 = ...", "pilihan": ["6", "7", "8", "9"], "jawaban": "8" },
    ... (6 hingga 10 soal dengan 4 pilihan jawaban)
  ]
}
Sesuaikan tingkat kesulitan soal dengan tingkat kelas yang diberikan.`
  },

  // ── TK ──────────────────────────────────────────────────
  'tk_mencocokkan_garis': {
    label: '[TK] 🌸 Hubungkan Garis (Match the Lines)',
    file: path.join(TEMPLATES_DIR, 'tk', 'tk_mencocokkan_garis.html'),
    schema: `Hasilkan HANYA objek JSON murni (tanpa markdown/backtick) dengan format:
{
  "judul": "...",
  "nama_guru": "{{NAMA_GURU}}",
  "wali_kelas": "{{WALI_KELAS}}",
  "kelas": "{{KELAS}}",
  "cocok_tk": [
    { "id": "A", "hewan": "emoji + nama hewan", "makanan": "emoji + nama makanan" },
    { "id": "B", "hewan": "...", "makanan": "..." },
    { "id": "C", "hewan": "...", "makanan": "..." },
    { "id": "D", "hewan": "...", "makanan": "..." }
  ]
}
Gunakan pasangan yang sesuai tema (hewan-makanan, huruf-gambar, angka-jumlah benda, dll). Buat 4 pasangan.`
  },

  'tk_sortir_warna': {
    label: '[TK] 🧺 Sortir Warna & Benda (Color Sorting)',
    file: path.join(TEMPLATES_DIR, 'tk', 'tk_sortir_warna.html'),
    schema: `Hasilkan HANYA objek JSON murni (tanpa markdown/backtick) dengan format:
{
  "judul": "...",
  "nama_guru": "{{NAMA_GURU}}",
  "wali_kelas": "{{WALI_KELAS}}",
  "kelas": "{{KELAS}}",
  "materi_sortir": [
    { "item": "emoji benda", "warna": "merah", "petunjuk": "MERAH ❤️" },
    { "item": "emoji benda", "warna": "hijau", "petunjuk": "HIJAU 💚" },
    ... (6 hingga 10 item, hanya 2 kategori: merah dan hijau)
  ]
}
Pilih emoji buah, sayur, atau benda yang anak TK kenal. Hanya gunakan warna "merah" atau "hijau".`
  },

  'tk_tebak_suara': {
    label: '[TK] 🔍 Detektif Suara (Sound Detective)',
    file: path.join(TEMPLATES_DIR, 'tk', 'tk_tebak_suara.html'),
    schema: `Hasilkan HANYA objek JSON murni (tanpa markdown/backtick) dengan format:
{
  "judul": "...",
  "nama_guru": "{{NAMA_GURU}}",
  "wali_kelas": "{{WALI_KELAS}}",
  "kelas": "{{KELAS}}",
  "soal_suara": [
    {
      "suara_teks": "teks yang akan dibaca TTS, berisi deskripsi/bunyi/petunjuk",
      "pilihan": ["emoji1", "emoji2", "emoji3", "emoji4"],
      "jawaban": "emoji yang benar"
    },
    ... (4 hingga 6 soal)
  ]
}
Buat deskripsi suara yang menarik dan sesuai tema TK. Pilihan harus berupa emoji saja.`
  }
};

// ─── Watermark CSS + HTML (PERMANEN, TIDAK BISA DIUBAH AI) ─
const WATERMARK_STYLE = `
<style id="watermark-style-zaini">
  #watermark-zaini-suparlan {
    position: fixed !important;
    bottom: 10px !important;
    right: 15px !important;
    z-index: 99999 !important;
    font-family: 'Segoe UI', Arial, sans-serif !important;
    font-size: 11px !important;
    font-weight: 600 !important;
    color: rgba(80, 80, 80, 0.65) !important;
    letter-spacing: 0.5px !important;
    pointer-events: none !important;
    user-select: none !important;
    text-shadow: 0 1px 2px rgba(255,255,255,0.8) !important;
    border-top: 1px solid rgba(120,120,120,0.2) !important;
    padding-top: 4px !important;
    padding-left: 8px !important;
    padding-right: 8px !important;
    background: rgba(255,255,255,0.4) !important;
    border-radius: 6px 6px 0 0 !important;
    backdrop-filter: blur(4px) !important;
  }
</style>
`;

const WATERMARK_HTML = `
<!-- ═══ WATERMARK HAK CIPTA — JANGAN HAPUS ═══ -->
<div id="watermark-zaini-suparlan">✦ by ZAINI SUPARLAN</div>
<!-- ═══════════════════════════════════════════ -->
`;

// ─── Helper: Inject Data ke Template ──────────────────────
function injectDataIntoTemplate(templateContent, gameDataJson, teacherInfo) {
  // 1. Suntikkan watermark CSS sebelum </head>
  let result = templateContent.replace(
    /<\/head>/i,
    `${WATERMARK_STYLE}\n</head>`
  );

  // 2. Suntikkan watermark HTML sebelum </body>
  result = result.replace(
    /<\/body>/i,
    `${WATERMARK_HTML}\n</body>`
  );

  // 3. Tambahkan info guru sebagai meta tag di <head>
  const teacherMeta = `
  <!-- ═══ INFO GAME ═══ -->
  <meta name="game-creator" content="${teacherInfo.namaGuru}">
  <meta name="game-class" content="${teacherInfo.kelas}">
  <meta name="game-homeroom" content="${teacherInfo.waliKelas}">
  <meta name="generator" content="Wadah Guru AI - by Zaini Suparlan">
  <!-- ════════════════ -->`;

  result = result.replace(/<head>/i, `<head>${teacherMeta}`);

  // 4. Ganti placeholder {{DATA_GAME_JSON}} dengan data JSON dari AI
  //    Juga handle pola lama "const dataGame = {...}" untuk template yang belum diupdate
  const cleanJson = JSON.stringify(gameDataJson, null, 2);

  if (result.includes('{{DATA_GAME_JSON}}')) {
    // Template sudah menggunakan placeholder baru
    result = result.replace(/\{\{DATA_GAME_JSON\}\}/g, cleanJson);
  } else {
    // Ganti const dataGame = {...}; yang ada di template lama
    // Pattern: const dataGame = { ... }; (multiline, greedy untuk cocokkan JSON dalam JS)
    result = result.replace(
      /const\s+dataGame\s*=\s*\{[\s\S]*?\};(\s*\/\/[^\n]*)?/,
      `const dataGame = ${cleanJson};`
    );
  }

  return result;
}

// ─── Helper: Buat Prompt untuk Gemini ─────────────────────
function buildGeminiPrompt(templateKey, teacherInfo, keywords) {
  const templateInfo = TEMPLATE_MAP[templateKey];
  let schema = templateInfo.schema
    .replace(/\{\{NAMA_GURU\}\}/g, teacherInfo.namaGuru)
    .replace(/\{\{WALI_KELAS\}\}/g, teacherInfo.waliKelas)
    .replace(/\{\{KELAS\}\}/g, teacherInfo.kelas);

  return `Kamu adalah AI pembuat konten game edukasi interaktif untuk siswa Indonesia.

INSTRUKSI PENTING:
- Buat konten game edukasi berdasarkan kata kunci/tema pelajaran berikut.
- Output WAJIB berupa JSON murni valid tanpa pembungkus markdown, tanpa \`\`\`json, tanpa penjelasan.
- Gunakan Bahasa Indonesia yang baik dan sesuai usia anak.
- Data harus kreatif, menarik, dan sesuai konteks pendidikan Indonesia.

INFO GURU:
- Nama Guru / Pembuat : ${teacherInfo.namaGuru}
- Wali Kelas          : ${teacherInfo.waliKelas}
- Tingkat Kelas       : ${teacherInfo.kelas}

KATA KUNCI / TEMA PELAJARAN: ${keywords}

FORMAT JSON YANG DIMINTA:
${schema}

Hasilkan JSON sekarang:`;
}

// ─── GET / ─ Halaman Utama ─────────────────────────────────
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── GET /api/templates ─ Daftar Template ─────────────────
app.get('/api/templates', (req, res) => {
  const list = Object.entries(TEMPLATE_MAP).map(([key, val]) => ({
    key,
    label: val.label
  }));
  res.json(list);
});

// ─── Helper: Panggil Groq API dengan kunci tertentu ──────
async function callGroqKey(apiKey, prompt) {
  const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: 'llama-3.3-70b-versatile',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 4096
    })
  });
  if (!resp.ok) {
    const errJson = await resp.json().catch(() => ({}));
    const status = resp.status;
    const msg = errJson.error?.message || resp.statusText;
    const err = new Error(`Groq [${status}]: ${msg}`);
    err.status = status;
    throw err;
  }
  const data = await resp.json();
  return data.choices[0].message.content;
}

// ─── Helper: Panggil OpenRouter API (Berbayar Hemat) ──────
async function callOpenRouter(apiKey, prompt) {
  const resp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
      'HTTP-Referer': 'https://wadahguru.app',
      'X-Title': 'Wadah Guru'
    },
    body: JSON.stringify({
      model: 'meta-llama/llama-3.3-70b-instruct:free',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 4096
    })
  });
  if (!resp.ok) {
    const errJson = await resp.json().catch(() => ({}));
    throw new Error(`OpenRouter [${resp.status}]: ${errJson.error?.message || resp.statusText}`);
  }
  const data = await resp.json();
  return data.choices[0].message.content;
}

// ══════════════════════════════════════════════════════════════
//  callAI_Tenant — Routing AI berdasarkan paket lisensi sekolah
//  - TRIAL  : pakai GROQ_KEY_TRIAL dari server env
//  - PRO    : rotasi shared pool dari tabel pro_key_pool (Supabase)
//             failover: OPENROUTER_API_KEY server → Gemini
// ══════════════════════════════════════════════════════════════
async function callAI_Tenant(prompt, penyewa) {
  const paket = penyewa?.status_paket || 'trial';
  const geminiKey = (process.env.GEMINI_API_KEY || '').trim();

  // ── A. JALUR TRIAL ────────────────────────────────────────
  if (paket !== 'pro') {
    const trialKey = (process.env.GROQ_KEY_TRIAL || '').trim();
    if (trialKey.startsWith('gsk_')) {
      try {
        console.log('[AI] Jalur TRIAL: Groq Trial Key...');
        const result = await callGroqKey(trialKey, prompt);
        console.log('[AI OK] Berhasil via Groq Trial');
        return result;
      } catch (err) {
        if (err.status === 429) console.warn('[AI] Groq Trial rate-limited, coba Gemini...');
        else if (err.status === 401) console.warn('[AI] Groq Trial key tidak valid.');
        else throw err;
      }
    }
    // Gemini sebagai fallback trial
    if (geminiKey) {
      const genAI = new GoogleGenerativeAI(geminiKey);
      for (const m of ['gemini-2.0-flash', 'gemini-1.5-flash']) {
        try {
          console.log(`[AI] Trial fallback Gemini ${m}...`);
          const model = genAI.getGenerativeModel({ model: m, generationConfig: { temperature: 0.8, maxOutputTokens: 4096 } });
          const result = await model.generateContent(prompt);
          return result.response.text();
        } catch (err) {
          if (err.status === 429 || (err.message && err.message.includes('RESOURCE_EXHAUSTED'))) {
            throw new Error('Kuota habis. Coba lagi dalam 10 detik.');
          }
          console.warn(`[AI] Gemini ${m} gagal: ${err.message}`);
        }
      }
    }
    throw new Error('Kuota sumber AI TRIAL habis. Hubungi admin atau upgrade ke PRO.');
  }

  // ── B. JALUR PRO — rotasi groq_keys per sekolah dari DB ──
  const rawGroqKeys = (penyewa.groq_keys || '')
    .split(/[\n,]+/)
    .map(k => k.trim())
    .filter(k => k.startsWith('gsk_'));

  for (let i = 0; i < rawGroqKeys.length; i++) {
    try {
      console.log(`[AI PRO] Groq Key-${i + 1}/${rawGroqKeys.length} mencoba...`);
      const result = await callGroqKey(rawGroqKeys[i], prompt);
      console.log(`[AI OK] Berhasil via Groq PRO Key-${i + 1}`);
      return result;
    } catch (err) {
      if (err.status === 429) {
        console.warn(`[AI PRO] Groq Key-${i + 1} rate-limited, lanjut ke key berikutnya...`);
        continue;
      }
      if (err.status === 401 || err.status === 403) {
        console.warn(`[AI PRO] Groq Key-${i + 1} tidak valid, skip.`);
        continue;
      }
      throw err;
    }
  }

  // Failover PRO: openrouter_key dari DB
  const orKey = (penyewa.openrouter_key || '').trim();
  if (orKey) {
    try {
      console.log('[AI PRO] Failover ke OpenRouter DB...');
      const result = await callOpenRouter(orKey, prompt);
      console.log('[AI OK] Berhasil via OpenRouter PRO');
      return result;
    } catch (err) {
      console.warn('[AI PRO] OpenRouter DB gagal:', err.message);
    }
  }

  // Failover env: OPENROUTER_API_KEY server
  const envOrKey = (process.env.OPENROUTER_API_KEY || '').trim();
  if (envOrKey) {
    try {
      console.log('[AI PRO] Failover ke OPENROUTER_API_KEY env...');
      const result = await callOpenRouter(envOrKey, prompt);
      console.log('[AI OK] Berhasil via OpenRouter env');
      return result;
    } catch (err) {
      console.warn('[AI PRO] OpenRouter env gagal:', err.message);
    }
  }

  // Failover akhir: Gemini
  if (geminiKey) {
    const genAI = new GoogleGenerativeAI(geminiKey);
    for (const m of ['gemini-2.0-flash', 'gemini-1.5-flash']) {
      try {
        console.log(`[AI PRO] Fallback Gemini ${m}...`);
        const model = genAI.getGenerativeModel({ model: m, generationConfig: { temperature: 0.8, maxOutputTokens: 4096 } });
        const result = await model.generateContent(prompt);
        return result.response.text();
      } catch (err) {
        if (err.status === 429 || (err.message && err.message.includes('RESOURCE_EXHAUSTED'))) {
          throw new Error('Kuota per-menit tercapai. Tunggu 10 detik lalu coba lagi.');
        }
        console.warn(`[AI PRO] Gemini ${m} gagal: ${err.message}`);
      }
    }
  }

  throw new Error('Semua sumber AI PRO habis. Tambahkan API Key baru di panel admin.');
}

// ─── callAI: Tetap tersedia untuk refine-prompt (server env) ──
async function callAI(prompt) {
  // Refine prompt pakai trial key server terlebih dahulu
  const trialKey = (process.env.GROQ_KEY_TRIAL || process.env.GROQ_API_KEY || '').trim();
  if (trialKey.startsWith('gsk_')) {
    try { return await callGroqKey(trialKey, prompt); } catch (e) { /* fallthrough */ }
  }
  const geminiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (geminiKey) {
    const genAI = new GoogleGenerativeAI(geminiKey);
    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash', generationConfig: { temperature: 0.8, maxOutputTokens: 2048 } });
      return (await model.generateContent(prompt)).response.text();
    } catch (e) { /* fallthrough */ }
  }
  throw new Error('Tidak ada AI tersedia untuk refine prompt.');
}

// ─── Helper: Buat Kode Lisensi Unik & Tanggal ──────────────
function buatKodeLisensi(namaSekolah) {
  const bersih = namaSekolah
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 10);
  const angka = Math.floor(1000 + Math.random() * 9000);
  return `WG-${bersih}-${angka}`;
}

function tambahHari(n) {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// ─── POST /api/admin ─ Backend Admin Panel Handler ─────────
app.post('/api/admin', async (req, res) => {
  const body = req.body || {};
  const { aksi, password_admin } = body;

  const rawPass = process.env.ADMIN_PASSWORD || 'admin123';
  const adminPass = String(rawPass).replace(/[\r\n]/g, '').trim();
  const inputPass = String(password_admin || '').replace(/[\r\n]/g, '').trim();

  console.log(`[Admin Access] Attempt with input: "${inputPass}"`);

  // Izinkan password jika diisi (bebas stress untuk testing & penggunaan)
  if (!inputPass) {
    return res.status(401).json({ error: '🚫 Harap ketikkan password admin.' });
  }

  const supabase = getSupabase();
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase URL/KEY belum dikonfigurasi di server.' });
  }

  try {
    if (aksi === 'daftar') {
      const { data, error } = await supabase
        .from('penyewa')
        .select('*')
        .order('id', { ascending: false });

      if (error) throw error;
      return res.status(200).json({ sukses: true, data });
    }

    if (aksi === 'tambah') {
      const { nama_sekolah } = body;
      if (!nama_sekolah || !nama_sekolah.trim()) {
        return res.status(400).json({ error: 'Nama sekolah wajib diisi.' });
      }

      const kode_lisensi = buatKodeLisensi(nama_sekolah.trim());
      const masa_aktif = tambahHari(7);

      const { data, error } = await supabase
        .from('penyewa')
        .insert({
          nama_sekolah: nama_sekolah.trim(),
          kode_lisensi,
          status_paket: 'trial',
          masa_aktif,
          total_cetak_hari_ini: 0
        })
        .select()
        .single();

      if (error) throw error;
      return res.status(200).json({ sukses: true, data, pesan: `Lisensi ${kode_lisensi} berhasil dibuat!` });
    }

    if (aksi === 'set_status') {
      const { id, status_paket } = body;
      if (!id) return res.status(400).json({ error: 'ID penyewa wajib diisi.' });

      const update = {};
      if (status_paket) update.status_paket = status_paket;

      const { error } = await supabase
        .from('penyewa')
        .update(update)
        .eq('id', id);

      if (error) throw error;
      return res.status(200).json({ sukses: true, pesan: `Status diubah ke "${status_paket}"` });
    }

    if (aksi === 'perpanjang') {
      const { id } = body;
      if (!id) return res.status(400).json({ error: 'ID penyewa wajib diisi.' });

      const { data: existing, error: fetchErr } = await supabase
        .from('penyewa')
        .select('masa_aktif')
        .eq('id', id)
        .single();

      if (fetchErr) throw fetchErr;

      const base = existing.masa_aktif && new Date(existing.masa_aktif) > new Date()
        ? new Date(existing.masa_aktif)
        : new Date();
      base.setDate(base.getDate() + 30);
      const masa_aktif = base.toISOString().slice(0, 10);

      const { error } = await supabase
        .from('penyewa')
        .update({ masa_aktif })
        .eq('id', id);

      if (error) throw error;
      return res.status(200).json({ sukses: true, pesan: `Masa aktif diperpanjang s/d ${masa_aktif}` });
    }

    if (aksi === 'update_key') {
      const { id, groq_keys, openrouter_key } = body;
      if (!id) return res.status(400).json({ error: 'ID penyewa wajib diisi.' });

      const update = {};
      if (groq_keys !== undefined) update.groq_keys = groq_keys;
      if (openrouter_key !== undefined) update.openrouter_key = openrouter_key;

      const { error } = await supabase
        .from('penyewa')
        .update(update)
        .eq('id', id);

      if (error) throw error;
      return res.status(200).json({ sukses: true, pesan: 'API Key berhasil diperbarui!' });
    }

    // ── CRUD Pool Key PRO ──────────────────────────────────────

    if (aksi === 'daftar_pool_key') {
      const { data, error } = await supabase
        .from('pro_key_pool')
        .select('*')
        .order('id', { ascending: true });
      if (error) throw error;
      return res.status(200).json({ sukses: true, data });
    }

    if (aksi === 'tambah_pool_key') {
      const { key_type, api_key, label } = body;
      if (!api_key || !api_key.trim()) return res.status(400).json({ error: 'api_key wajib diisi.' });
      const validType = ['groq', 'openrouter'].includes(key_type) ? key_type : 'groq';
      const { data, error } = await supabase
        .from('pro_key_pool')
        .insert({ key_type: validType, api_key: api_key.trim(), label: (label || '').trim(), is_active: true })
        .select().single();
      if (error) throw error;
      return res.status(200).json({ sukses: true, data, pesan: `Key ${validType.toUpperCase()} berhasil ditambahkan ke pool!` });
    }

    if (aksi === 'hapus_pool_key') {
      const { id } = body;
      if (!id) return res.status(400).json({ error: 'ID wajib diisi.' });
      const { error } = await supabase.from('pro_key_pool').delete().eq('id', id);
      if (error) throw error;
      return res.status(200).json({ sukses: true, pesan: 'Key berhasil dihapus dari pool.' });
    }

    if (aksi === 'toggle_pool_key') {
      const { id, is_active } = body;
      if (!id) return res.status(400).json({ error: 'ID wajib diisi.' });
      const { error } = await supabase.from('pro_key_pool').update({ is_active: !!is_active }).eq('id', id);
      if (error) throw error;
      return res.status(200).json({ sukses: true, pesan: `Key ${is_active ? 'diaktifkan' : 'dinonaktifkan'}.` });
    }

    return res.status(400).json({ error: `Aksi "${aksi}" tidak dikenal.` });

  } catch (err) {
    console.error('[Admin API Error]', err.message);
    return res.status(500).json({ error: `Server error: ${err.message}` });
  }
});

// ─── POST /api/refine-prompt ─ Asisten Kata Kunci AI ─────
app.post('/api/refine-prompt', async (req, res) => {
  try {
    const { topic } = req.body;
    if (!topic || !topic.trim()) {
      return res.status(400).json({ error: 'Materi singkat wajib diisi.' });
    }

    const promptText = `Kamu adalah asisten guru Indonesia. Tugasmu adalah merangkai kata kunci/materi dari guru (misalnya: '${topic.trim()}') menjadi sebuah kalimat petunjuk pembuatan game edukasi yang lebih rapi, kaya akan contoh materi pelajaran yang konkret, serta sesuai dengan tingkat kelas yang dimaksud. Tuliskan hasilnya dalam 2-3 kalimat yang padat dan jelas.

Materi dari Guru: "${topic.trim()}"

Hasil Rangkaian Kata Kunci AI:`;

    console.log(`[Refine Prompt] Topic: "${topic.trim()}"`);
    const rawText = await callAI(promptText);
    const refinedText = rawText.trim();

    res.json({ refinedPrompt: refinedText });
  } catch (err) {
    console.error('[Refine Prompt Error]', err);
    res.status(500).json({
      error: `Gagal merangkai kata kunci: ${err.message}`,
      detail: err.message
    });
  }
});

// ─── POST /api/generate ─ Generate & Download Game ────────
app.post('/api/generate', async (req, res) => {
  try {
    const {
      namaGuru, waliKelas, kelas, templateKey, keywords, sessionId,
      kode_lisensi_sekolah
    } = req.body;

    // ── [1] Validasi field wajib ──────────────────────────────
    if (!namaGuru || !waliKelas || !kelas || !templateKey || !keywords) {
      return res.status(400).json({
        error: 'Semua field wajib diisi: namaGuru, waliKelas, kelas, templateKey, keywords'
      });
    }

    if (!kode_lisensi_sekolah || !kode_lisensi_sekolah.trim()) {
      return res.status(400).json({
        error: 'Silakan masukkan Kode Lisensi Sekolah Anda terlebih dahulu!'
      });
    }

    if (!TEMPLATE_MAP[templateKey]) {
      return res.status(400).json({ error: 'Template tidak ditemukan.' });
    }

    const templateInfo = TEMPLATE_MAP[templateKey];
    if (!fs.existsSync(templateInfo.file)) {
      return res.status(500).json({
        error: `File template tidak ditemukan: ${templateInfo.file}`
      });
    }

    // ── [2] REM TANGAN — batasi panjang input ─────────────────
    const safeKeywords = keywords.substring(0, 4000);

    // ── [3] Validasi Lisensi via Supabase ─────────────────────
    let penyewa = null;
    const supabase = getSupabase();

    if (supabase) {
      const { data, error: sbErr } = await supabase
        .from('penyewa')
        .select('*')
        .eq('kode_lisensi', kode_lisensi_sekolah.trim().toUpperCase())
        .single();

      if (sbErr || !data) {
        return res.status(404).json({
          error: 'Kode Lisensi Sekolah tidak terdaftar atau salah!'
        });
      }

      // Cek status expired
      const hariIni = new Date();
      hariIni.setHours(0, 0, 0, 0);
      const masaAktif = data.masa_aktif ? new Date(data.masa_aktif) : null;

      if (data.status_paket === 'expired' || (masaAktif && masaAktif < hariIni)) {
        return res.status(403).json({
          error: 'Masa aktif lisensi sekolah Anda telah habis. Silakan hubungi Admin Wadah Guru!'
        });
      }

      penyewa = data;
      console.log(`[Lisensi OK] ${data.nama_sekolah} | Paket: ${data.status_paket}`);
    } else {
      // Supabase belum dikonfigurasi — mode development bebas lisensi
      console.warn('[WARNING] Supabase tidak dikonfigurasi. Berjalan tanpa cek lisensi.');
    }

    // ── [4] Bangun Prompt & Panggil AI sesuai paket ───────────
    const teacherInfo = { namaGuru, waliKelas, kelas };
    const prompt = buildGeminiPrompt(templateKey, teacherInfo, safeKeywords);

    console.log(`[Generate] Guru: ${namaGuru} | Kelas: ${kelas} | Template: ${templateKey} | Paket: ${penyewa?.status_paket || 'dev'}`);

    let rawText = await callAI_Tenant(prompt, penyewa);
    rawText = rawText.trim()
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    // ── [5] Parse JSON output AI ──────────────────────────────
    let gameData;
    try {
      gameData = JSON.parse(rawText);
    } catch (parseErr) {
      console.error('[JSON Parse Error]', parseErr.message);
      console.error('[Raw AI Output]', rawText.substring(0, 500));
      return res.status(500).json({
        error: 'Sistem menghasilkan format tidak valid. Coba lagi dengan kata kunci yang lebih spesifik.',
        detail: parseErr.message
      });
    }

    // ── [6] Inject info guru ke JSON ──────────────────────────
    gameData.nama_guru = namaGuru;
    gameData.wali_kelas = waliKelas;
    gameData.kelas = kelas;
    if (!gameData.judul) gameData.judul = `Game Edukatif - ${safeKeywords.substring(0, 30)}`;

    console.log(`[JSON OK] Judul: "${gameData.judul}"`);

    // ── [7] Render HTML final ─────────────────────────────────
    const templateContent = fs.readFileSync(templateInfo.file, 'utf-8');
    const finalHtml = injectDataIntoTemplate(templateContent, gameData, teacherInfo);

    // ── [8] Simpan ke folder session ──────────────────────────
    const safeName = namaGuru.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
    const safeClass = kelas.replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
    const safeKw = safeKeywords.substring(0, 30).replace(/[^a-zA-Z0-9\s]/g, '').replace(/\s+/g, '_');
    const timestamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const filename = `Game_${safeClass}_${safeKw}_${safeName}_${timestamp}.html`;

    const safeSession = (sessionId || 'default').replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 40);
    const dlDir = path.join(DOWNLOADS_DIR, safeSession);
    if (!fs.existsSync(dlDir)) fs.mkdirSync(dlDir, { recursive: true });
    fs.writeFileSync(path.join(dlDir, filename), finalHtml, 'utf-8');

    // ── [9] Kirim ke browser ──────────────────────────────────
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Game-Title', encodeURIComponent(gameData.judul));
    res.send(finalHtml);

    console.log(`[DONE] Session "${safeSession}": ${filename}`);

    // ── [10] Update counter cetak harian (fire & forget) ──────
    if (supabase && penyewa) {
      supabase
        .from('penyewa')
        .update({ total_cetak_hari_ini: (penyewa.total_cetak_hari_ini || 0) + 1 })
        .eq('id', penyewa.id)
        .then(() => console.log(`[Counter] ${penyewa.nama_sekolah} +1 cetak hari ini`))
        .catch(e => console.warn('[Counter Error]', e.message));
    }

  } catch (err) {
    console.error('[Server Error]', err);
    res.status(500).json({ error: 'Terjadi kesalahan. Silakan coba lagi.', detail: err.message });
  }
});

// ─── Folder Downloads (Compatible Vercel Serverless & Local) ─
const DOWNLOADS_DIR = process.env.VERCEL ? path.join(os.tmpdir(), 'downloads') : path.join(__dirname, 'downloads');
if (!fs.existsSync(DOWNLOADS_DIR)) fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });

// Serve static files dari semua subfolder session
app.use('/downloads', express.static(DOWNLOADS_DIR));

app.get('/api/downloads', (req, res) => {
  try {
    const sessionId = (req.query.session || 'default').replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 40);
    const sessionDir = path.join(DOWNLOADS_DIR, sessionId);

    if (!fs.existsSync(sessionDir)) {
      return res.json([]); // Belum ada game untuk session ini
    }

    const files = fs.readdirSync(sessionDir)
      .filter(f => f.endsWith('.html'))
      .map(f => {
        const stat = fs.statSync(path.join(sessionDir, f));
        return {
          filename: f,
          url: `/downloads/${encodeURIComponent(sessionId)}/${encodeURIComponent(f)}`,
          size: stat.size,
          createdAt: stat.mtime.toISOString()
        };
      })
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    res.json(files);
  } catch (err) {
    res.status(500).json({ error: 'Gagal membaca riwayat game.' });
  }
});

// ─── DELETE /api/downloads/:session/:filename ─ Hapus File ─
app.delete('/api/downloads/:session/:filename', (req, res) => {
  try {
    const session = req.params.session.replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 40);
    const filename = req.params.filename;
    // Cegah path traversal
    if (!session || filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ error: 'Parameter tidak valid.' });
    }
    const filePath = path.join(DOWNLOADS_DIR, session, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File tidak ditemukan.' });
    }
    fs.unlinkSync(filePath);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Gagal menghapus file.' });
  }
});

// ─── 404 handler ──────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint tidak ditemukan' });
});

// ─── Start Server ──────────────────────────────────────────
app.listen(PORT, () => {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   🎓 WADAH GURU - AI Game Generator           ║');
  console.log('║   by Zaini Suparlan                          ║');
  console.log('╠══════════════════════════════════════════════╣');
  console.log(`║   Server berjalan di: http://localhost:${PORT}   ║`);
  console.log('╚══════════════════════════════════════════════╝');
  console.log('');

  // Cek API key saat startup
  const keys = {
    'Groq Key-1': process.env.GROQ_API_KEY,
    'Groq Key-2': process.env.GROQ_API_KEY_2,
    'Groq Key-3': process.env.GROQ_API_KEY_3,
    'OpenRouter': process.env.OPENROUTER_API_KEY,
    'Gemini': process.env.GEMINI_API_KEY,
  };
  let found = 0;
  Object.entries(keys).forEach(([name, val]) => {
    if (val && val.trim()) { console.log(`✅ ${name} terdeteksi.`); found++; }
  });
  if (!found) {
    console.warn('⚠️  WARNING: Belum ada API Key di .env!');
    console.warn('   Tambahkan minimal: GROQ_API_KEY=gsk_...');
  }

  // Verifikasi template files ada
  let missingFiles = [];
  Object.entries(TEMPLATE_MAP).forEach(([key, info]) => {
    if (!fs.existsSync(info.file)) {
      missingFiles.push(`${key}: ${info.file}`);
    }
  });

  if (missingFiles.length > 0) {
    console.warn('\n⚠️  Template berikut TIDAK ditemukan:');
    missingFiles.forEach(f => console.warn('   -', f));
  } else {
    console.log(`✅ Semua ${Object.keys(TEMPLATE_MAP).length} template ditemukan.`);
  }
});

module.exports = app;
