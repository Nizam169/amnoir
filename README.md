# ⚡ AMNOIR 3D — Alight Motion Preset Finder & Scraper

Aplikasi web modern bertema **3D Neobrutalisme** untuk mencari dan mengekstrak tautan preset Alight Motion (**5MB Cloud Preset** & **XML File**) secara otomatis dari video, bio akun, link-in-bio, dan komentar/balasan TikTok.

---

## ✨ Fitur Utama

- 🎨 **Desain 3D Neobrutalisme**: Chunky borders, hard 3D drop-shadows, tactile button physics, dan palet warna pop retro.
- ⚡ **Live Real-time SSE Stream**: Indikator langkah 1..5 dan terminal streaming interaktif.
- 🎬 **Video Preview & Stats**: Menampilkan cover video, video player tanpa watermark, statistik views/likes/comments/shares, dan profil kreator TikTok.
- 📦 **Katalog Preset**: Filter kategori 5MB & XML, frame rasio (9:16 dll), status pin & creator verified.
- 📋 **One-Click Copy & Quick Paste**: Tombol tempel dari clipboard & salin link preset instan dengan 3D Toast.
- 📱 **QR Code Modal**: Scan langsung preset menggunakan HP / kamera Alight Motion.
- 💬 **Saluran WhatsApp Integrasi**: Modal dan floating button untuk saluran WhatsApp resmi.
- 🕒 **Riwayat Lokal**: Menyimpan riwayat pencarian terakhir di `localStorage`.
- 🚀 **Vercel Edge Ready**: Siap di-deploy ke Vercel tanpa batas timeout Serverless (menggunakan Edge Runtime).

---

## 💻 Menjalankan Secara Lokal

```bash
cd amnoir
npm run dev
```

Buka di browser: **`http://localhost:3000`**

---

## 🚀 Cara Deploy ke Vercel

### Opsi 1: Lewat Git / GitHub (Rekomendasi 1-Klik)
1. Buat repository baru di GitHub dan push folder ini:
   ```bash
   git init
   git add .
   git commit -m "feat: initial release amnoir 3d"
   git remote add origin <URL_REPO_GITHUB>
   git push -u origin main
   ```
2. Buka [Vercel Dashboard](https://vercel.com/new).
3. Import repository GitHub Anda.
4. Klik **Deploy**! Vercel akan secara otomatis mengonfigurasi Edge Function di `/api/find` dan menyajikan file statis di `public/`.

### Opsi 2: Menggunakan Vercel CLI
```bash
npm i -g vercel
vercel
```

---

## 🛠️ Struktur Proyek

```
amnoir/
├── api/
│   └── find.js         # Vercel Edge Function (Streaming proxy SSE)
├── public/
│   ├── index.html      # UI 3D Neobrutalisme
│   ├── style.css       # Design system 3D Neobrutalisme
│   ├── app.js          # Controller UI & Event Handler
│   ├── amfinder.js     # SSE client stream parser
│   └── qrcode.min.js   # Offline QR Code generator
├── serve.js            # Local dev server
├── vercel.json         # Konfigurasi Vercel deployment
└── package.json        # Manifest proyek
```
