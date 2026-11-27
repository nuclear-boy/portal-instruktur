# Runbook Publish Portal Instruktur LBT PII

Arsitektur: frontend React/Vite di GitHub Pages, API FastAPI Python di Vercel, data di Upstash Redis.

## 1. Verifikasi lokal

Prasyarat: Node 20+, Python 3.12+, akun Upstash, akun Vercel.

```bash
npm install
npm run api:install
npm run typecheck
npm run build
npm run api:test
```

Buat `.env.local` dari `.env.example`, isi `UPSTASH_REDIS_REST_URL`,
`UPSTASH_REDIS_REST_TOKEN`, `JWT_SECRET` (minimal 32 karakter), dan `VITE_API_BASE_URL=http://localhost:8000`.

```bash
npm run seed:admin
npm run seed:koordinator
```

Jalankan di dua terminal:

```bash
npm run api:dev
```

```bash
npm run dev
```

Smoke test lokal: buka `http://localhost:5173`, login sebagai admin/koordinator, buat observer,
peserta, dan pertemuan, isi nilai RELI, klik **Unduh PDF**. Periksa nama file, isi satu halaman,
dan angka R/E/L/I.

## 2. Siapkan Upstash

1. Buat database Redis di Upstash (region terdekat).
2. Salin REST URL dan REST token.
3. Isi `.env.local` (jangan pernah di-commit):

```env
UPSTASH_REDIS_REST_URL=https://...
UPSTASH_REDIS_REST_TOKEN=...
JWT_SECRET=<acak-minimal-32-karakter>
ALLOWED_ORIGINS=http://localhost:5173,https://USERNAME.github.io
DATA_TTL_SECONDS=2592000
BOOTSTRAP_ADMIN_EMAIL=admin@lbtdes26.com
BOOTSTRAP_ADMIN_PASSWORD=<password-kuat>
BOOTSTRAP_ADMIN_NAME=Admin LBT
BOOTSTRAP_COORDINATOR_EMAIL=koordinator@lbtdes26.com
BOOTSTRAP_COORDINATOR_PASSWORD=<password-kuat>
BOOTSTRAP_COORDINATOR_NAME=Koordinator Tim
VITE_API_BASE_URL=http://localhost:8000
```

Buat secret dengan `openssl rand -hex 32` (atau generator acak lain).

## 3. Seed akun pertama

```bash
npm run seed:admin
npm run seed:koordinator
```

Seed gagal jika Upstash kosong atau email sudah terdaftar. Ulangi hanya setelah memastikan
`.env.local` menunjuk ke database yang benar.

## 4. Deploy API Python ke Vercel

1. Import repository ke Vercel sebagai project terpisah dari frontend.
2. Set **Root Directory** ke `backend/`.
3. Framework preset: **FastAPI** (Vercel mendeteksi `backend/app.py`).
4. Environment variables (Production):
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
   - `JWT_SECRET` (minimal 32 karakter, sama dengan `.env.local`)
   - `ALLOWED_ORIGINS` — daftar origin persis, pisahkan koma. Contoh: `https://USERNAME.github.io`
   - `BOOTSTRAP_ADMIN_EMAIL` — email akun admin agar tidak kedaluwarsa oleh TTL
   - `DATA_TTL_SECONDS=2592000`
5. Deploy. Catat URL backend, mis. `https://portal-api.vercel.app`.
6. Cek `GET https://portal-api.vercel.app/api/health` → `{"ok": true, "usingRedis": true}`, dan cek `GET /docs` → `404` (Swagger otomatis nonaktif di produksi).
7. Cek `POST /api/auth/login` dengan akun koordinator → harus mengembalikan `token`.

Jika Vercel mengembalikan 500 dengan pesan `JWT_SECRET ...` atau `UPSTASH_REDIS_REST_...`,
environment variable belum terbaca. Backend sengaja fail-fast agar tidak menyimpan data di memori serverless.

## 5. Deploy frontend ke GitHub Pages

1. Repository → **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Repository secret: `VITE_API_BASE_URL` = `https://portal-api.vercel.app` (tanpa `/api`).
3. Push ke branch `main`. Workflow `.github/workflows/deploy.yml` akan build dengan
   `VITE_BASE_PATH=/<nama-repo>/` dan deploy.
4. Pastikan `https://USERNAME.github.io` (tanpa `/<nama-repo>/`) terdaftar di `ALLOWED_ORIGINS`
   pada project backend. Jika tidak, login gagal karena CORS.

## 6. Smoke test produksi

Lakukan berurutan:

1. Buka frontend produksi, login sebagai **Admin**. Pastikan Dashboard hanya berisi administrasi
   akun, bukan data peserta/pertemuan. Buat satu akun Koordinator Tim; akun Inlok/Observer harus
   terlihat tetapi tidak dapat diedit. Coba nonaktifkan Koordinator aktif terakhir → harus ditolak.
2. Login sebagai **Koordinator Tim**: ubah identitas kegiatan, tambah lokal, buat akun Inlok/Observer,
   tambah peserta, jadwal, pertemuan, dan pemateri. Pastikan Koordinator tidak dapat mengisi
   sosiogram/penilaian.
3. Login sebagai **Observer**: buka pertemuan → sosiogram → tautkan peserta → isi R/E/L/I → **Simpan**;
   catat absensi dan waktu aktual; isi penilaian pemateri. Hanya penilaian milik sendiri yang boleh
   diubah/dihapus.
4. Unduh PDF dari editor sosiogram dan dari **Laporan** → **PDF Peserta**. Verifikasi nama file
   `<materi>-<YYYY-MM-DD>-L<lokal>.pdf`, satu halaman, dan angka sama dengan rekap monitoring.
5. Login sebagai **Instruktur Lokal**: Dashboard progres, Pertemuan, Monitoring Peserta, Detail Peserta, **Monitoring Pemateri**, Laporan, dan Profil harus bisa dibuka read-only; tombol simpan, peserta, jadwal, pemateri, dan form isi penilaian tidak tersedia.
6. Sebagai Koordinator, hapus satu lokal uji yang berisi peserta/pertemuan/akun → data terkait harus ikut terhapus dan lokal minimum satu tetap tersisa.
7. Uji ubah password dari halaman Profil untuk Admin, Koordinator, Observer, dan Instruktur Lokal → token lama otomatis dicabut dan sesi berlanjut dengan token baru.

## 7. Catatan operasional

- Data kedaluwarsa otomatis setelah `DATA_TTL_SECONDS` (default 30 hari) sejak tulis terakhir.
- Token login berlaku 12 jam dan langsung dicabut otomatis (`tokenVersion`) saat password diganti/direset, peran diubah, atau akun dinonaktifkan.
- Daftar 17 pemateri resmi otomatis ter-seed sekali pakai saat pertama kali diakses (`GET /api/speakers`), atau dapat di-seed via `npm run seed:speakers`.
- Sosiogram, absensi, waktu aktual, dan penilaian pemateri hanya diisi Observer. Instruktur Lokal bersifat read-only lewat Dashboard/Pertemuan/Monitoring/Monitoring Pemateri/Laporan; Koordinator melihat seluruh hasil lintas lokal.
- Admin tidak memiliki akses ke data operasional.
- Perubahan layout PDF dilakukan dengan mengubah konstanta grid di `src/lib/pdf.ts`, lalu ulangi
  `npm run build`.
- Jangan commit `.env.local`, token Upstash, atau ekspor data peserta.
