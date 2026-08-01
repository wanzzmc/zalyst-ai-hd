# Zalyst AI HD Image Enhancer

Website AI HD Image Enhancer bergaya **Neo Brutalism**, dibangun dengan HTML5, CSS3, dan Vanilla JavaScript (ES6+) di frontend, serta Node.js (Vercel Serverless Functions) di backend.

## ✨ Fitur

- Upload gambar via drag & drop, klik, atau paste dari clipboard (JPG/PNG/WEBP, maks 20MB)
- Preview instan sebelum diproses
- 4 pilihan model AI (radio card): AI HD V1–V4
- Alur proses: **Upload ke GitHub Repo → Ambil RAW URL → Kirim ke AI → Tampilkan hasil**
- Progress bar & step indicator realtime
- Before & After comparison slider, zoom, dan fullscreen
- Tombol Download HD Image (unduh langsung, tanpa tab baru) + Copy URL, Open Image, Compare Again
- History tersimpan di LocalStorage (bertahan setelah refresh)
- Toast notification, ripple button, confetti saat sukses
- Rate limiting sederhana di backend
- SEO-ready: meta tags, Open Graph, Twitter Card, robots.txt, sitemap.xml, manifest.json, favicon

## 📁 Struktur Project

```
/
├── index.html
├── style.css
├── script.js
├── manifest.json
├── robots.txt
├── sitemap.xml
├── assets/
│   └── favicon.svg
├── api/
│   ├── upload.js      # Upload gambar ke GitHub Repository
│   └── enhance.js     # Forward ke endpoint AI sesuai model
├── package.json
├── vercel.json
├── .env.example
└── README.md
```

## 🔐 Environment Variables

**Jangan pernah menaruh token asli di dalam kode atau di `.env.example`.**

Buat token GitHub baru (Settings → Developer settings → Personal access tokens → scope `repo`), lalu set variabel berikut:

- **Lokal** (untuk `vercel dev`): salin `.env.example` menjadi `.env` dan isi nilainya di sana. File `.env` sudah otomatis diabaikan Git — jangan pernah commit file ini.
- **Produksi (Vercel)**: buka **Vercel Dashboard → Project → Settings → Environment Variables**, lalu tambahkan:

| Key | Value |
|---|---|
| `GITHUB_TOKEN` | token GitHub kamu (scope `repo`) |
| `GITHUB_OWNER` | `wanzzmc` |
| `GITHUB_REPO` | `zalyst-uploads` |
| `GITHUB_BRANCH` | `main` |
| `RATE_LIMIT_MAX` | `10` (opsional) |
| `RATE_LIMIT_WINDOW_MS` | `60000` (opsional) |

> ⚠️ Jika kamu pernah membagikan token GitHub di tempat lain (chat, screenshot, dsb), anggap token itu bocor dan **segera revoke lalu buat token baru**.

## 🚀 Menjalankan & Deploy

```bash
npm install
vercel
```

atau langsung ke production:

```bash
vercel --prod
```

Untuk development lokal dengan serverless functions aktif:

```bash
vercel dev
```

## 🧠 Model AI

| Model | Endpoint | Deskripsi |
|---|---|---|
| AI HD V1 | `/faa/superhd` | Meningkatkan kualitas gambar menjadi HD |
| AI HD V2 | `/faa/hdv2` | Teknologi ala Remini, lebih tajam & realistis |
| AI HD V3 | `/faa/hdv3` | AI Upscale 4X Resolution |
| AI HD V4 | `/faa/hdv4` | AI Super Resolution |

Pemetaan model → endpoint dilakukan sepenuhnya di backend (`api/enhance.js`), frontend hanya mengirim nama model (`hdv1`–`hdv4`).

## 🛡️ Keamanan

- Validasi MIME type & ukuran file di server (bukan hanya di client)
- Nama file upload disanitasi dengan UUID + timestamp
- `GITHUB_TOKEN` hanya dibaca di `api/upload.js`, tidak pernah dikirim ke browser
- Rate limiter sederhana per-IP di kedua endpoint API
- Header keamanan dasar (`X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`) via `vercel.json`

## 📝 Catatan

- Sesuaikan `sitemap.xml` dan meta `og:url` dengan domain Vercel kamu setelah deploy.
- Ganti `/assets/og-cover.png` dengan gambar cover 1200×630 milikmu sendiri jika ingin preview link yang lebih menarik di media sosial.
