# Portal Instruktur LBT PII

Portal terpusat untuk Leadership Basic Training Pelajar Islam Indonesia: login, pendataan instruktur, peserta, pertemuan, pemateri, monitoring, laporan, dan Sosiogram RELI.

## Arsitektur

- **Frontend**: React + Vite + TypeScript (GitHub Pages)
- **API**: FastAPI (Python 3.12) di Vercel Python
- **Data**: Upstash Redis (REST), dengan TTL otomatis
- **Auth**: email/password, bcrypt, JWT 12 jam

```
Browser → Frontend (GitHub Pages) → API FastAPI (Vercel Python) → Upstash Redis
```

Data **tidak disimpan di repo**. `.gitignore` menolak `.env`, `data/`, ekspor, dan backup. Data hanya ada di Upstash. Akun Admin yang emailnya sama dengan `BOOTSTRAP_ADMIN_EMAIL` tidak kedaluwarsa; akun lain, `lbt:meta`, dan data operasional otomatis kedaluwarsa sesuai `DATA_TTL_SECONDS` (default 30 hari). Indeks akun sengaja permanen agar Admin tetap tercantum; ID akun lain yang sudah terhapus diabaikan otomatis. Data lokal dapat dihapus dari halaman **Lokal & Tim**.

## Role & Struktur Lokal

Organisasi dimulai dengan 5 lokal (`Lokal 1`–`Lokal 5`). Koordinator Tim dapat menambah, mengubah, atau menghapus lokal; penghapusan lokal juga menghapus peserta, pertemuan, dan akun Inlok/Observer di lokal tersebut.

| Role | Kode | Hak |
|---|---|---|
| Admin | `admin` | Tepat satu akun; hanya membuat/mengelola akun Koordinator Tim, melihat seluruh akun dan status login, tanpa akses data operasional |
| Koordinator Tim | `koordinator` | Semua lokal; kelola lokal, akun Inlok/Observer, peserta, jadwal, pertemuan, pemateri, dan melihat laporan |
| Instruktur Lokal | `instruktur_lokal` | Cakupan satu lokal; akses baca Dashboard progres, Pertemuan, Monitoring Peserta, Monitoring Pemateri, Laporan, dan Profil |
| Observer | `observer` | Cakupan satu lokal; sosiogram, absensi, waktu aktual, penilaian pemateri, dan laporan lokalnya |

## Penilaian Pemateri

Setiap pertemuan dapat memiliki lembar penilaian pemateri dari observer dengan skala 1–5:

- **Penampilan**: suara, cara berpakaian, sikap & gaya, ekspresi wajah
- **Bahasa**: tata bahasa, kosa kata, kemudahan memahami kalimat, sistematika kalimat
- **Materi**: penguasaan materi, sistematika pembahasan, metode penyampaian, persiapan

Selain skor per aspek, observer menambahkan catatan umum dan rekomendasi. Hasil penilaian tersedia untuk koordinator seluruh lokal, instruktur lokal (lokalnya), dan dapat diunduh sebagai PDF.

## Jalankan Lokal dengan API Sungguhan

Portal ini tidak memiliki mode demo. Frontend dan API dijalankan terpisah; data disimpan di
Upstash. Siapkan `.env.local` seperti di bagian **Setup Lokal**, lalu jalankan dua terminal:

```bash
npm run api:dev
npm run dev
```

Buka `http://localhost:5173` dan login dengan akun hasil seed. API lokal ada di
`http://localhost:8000`, dan `VITE_API_BASE_URL` harus menunjuk ke alamat itu.

Untuk langkah publish lengkap, lihat `DEPLOY.md`.

## Setup Lokal

Prasyarat: Node 20+, Python 3.12+, akun Upstash, akun Vercel (untuk API).

1. Install dependency frontend dan Python:

   ```bash
   npm install
   npm run api:install
   ```

2. Buat database Redis di [Upstash](https://upstash.com) dan salin REST URL + token.

3. Salin `.env.example` menjadi `.env.local`, lalu isi:

   ```env
   UPSTASH_REDIS_REST_URL=https://...
   UPSTASH_REDIS_REST_TOKEN=...
   JWT_SECRET=rahasia-acak-panjang-minimal-32-karakter
   ALLOWED_ORIGINS=http://localhost:5173
   BOOTSTRAP_ADMIN_EMAIL=admin@contoh.com
   BOOTSTRAP_ADMIN_PASSWORD=password-kuat
   BOOTSTRAP_ADMIN_NAME=Admin LBT
   BOOTSTRAP_COORDINATOR_EMAIL=koordinator@contoh.com
   BOOTSTRAP_COORDINATOR_PASSWORD=password-kuat
   BOOTSTRAP_COORDINATOR_NAME=Koordinator Tim
   VITE_API_BASE_URL=http://localhost:8000
   ```

4. Buat akun pertama:

   ```bash
   npm run seed:admin
   npm run seed:koordinator
   ```

5. Jalankan API dan frontend di dua terminal:

   ```bash
   npm run api:dev
   ```

   ```bash
   npm run dev
   ```

   Cek `http://localhost:8000/api/meta` harus mengembalikan JSON `meta`.

## Deploy API ke Vercel

1. Import repo ini ke Vercel sebagai **project terpisah**.
2. Set **Root Directory** ke `backend/`. Vercel mendeteksi FastAPI dari `backend/app.py`.
3. Tambahkan environment variables:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
   - `JWT_SECRET` (minimal 32 karakter)
   - `ALLOWED_ORIGINS` (contoh: `https://nama-user.github.io`)
   - `BOOTSTRAP_ADMIN_EMAIL` (agar akun admin tetap permanen)
   - `DATA_TTL_SECONDS` (opsional)
4. Deploy. API tersedia di `https://project.vercel.app/api`.
5. Jalankan seed dari lokal dengan `.env.local` yang menunjuk ke Upstash yang sama.

## Deploy Frontend ke GitHub Pages

1. Buka **Settings → Pages**, pilih **GitHub Actions** sebagai source.
2. Tambahkan repository secret `VITE_API_BASE_URL` berisi URL backend Vercel, mis. `https://project.vercel.app` (tanpa `/api`).
3. Push ke branch `main`. Workflow `.github/workflows/deploy.yml` akan build dan deploy.
4. Pastikan origin GitHub Pages (`https://username.github.io`) ada di `ALLOWED_ORIGINS` pada project backend, jika tidak API akan menolak CORS.

Catatan: `VITE_BASE_PATH` di workflow otomatis memakai `/<nama-repo>/`.

## Monitoring

- Tab tracking peserta memiliki grafik line performa harian: R/E/L/I pada sumbu kiri 0–10, total RELI pada sumbu kanan 0–40, dan benchmark rata-rata lokal.
- Legenda grafik interaktif untuk menampilkan atau menyembunyikan setiap seri.
- Warna R/E/L/I memakai satu palet kanonis yang sama di Monitoring, laporan, PDF, dan editor sosiogram.

## Sosiogram RELI

Fitur dari `Sosiogram RELI.html` dipertahankan di halaman **Pertemuan → Sosiogram**:

- denah huruf U, dua kolom, grid
- tambah/hapus kursi dan kotak, drag, resize
- nilai RELI 4×4 per kursi, dibatasi 0–10 saat input, paste, impor JSON, dan penyimpanan API
- tautkan kursi ke data peserta
- tally 4×28
- mode kabel komunikasi + frekuensi
- rekap & grafik
- cetak/unduh laporan sosiogram tanpa denah, dengan grouped bar chart RELI per peserta (angka R/E/L/I, label 2 baris) dan heatmap komunikasi
- pilihan **Peserta per grafik**: 6, 8, atau 12 dengan default 8; berlaku untuk pratinjau HTML, cetak, dan PDF
- tabel komunikasi `Nama | Teman | Pemateri` dan heatmap Peserta × (Peserta + Pemateri); frekuensi dihitung dari kabel keluar dan semua box dihitung sebagai Pemateri
- unduh PDF hasil RELI A4 landscape (tombol **Unduh PDF** di editor sosiogram atau **PDF Peserta** di halaman Laporan). Nama file: `<materi>-<YYYY-MM-DD>-L<nomor_lokal>.pdf`, mis. `Orientasi-Kepemimpinan-Dasar-2026-10-30-L1.pdf`. Isinya: identitas pertemuan, grouped bar chart R/E/L/I per peserta dengan skala 0–10, tabel komunikasi, dan heatmap komunikasi.
- Laporan Rekap Perkembangan Peserta (Koordinator dan Inlok) memuat grouped bar chart RELI per lokal serta tabel dan heatmap komunikasi per lokal.
- impor/ekspor JSON
- tema gelap/terang

File asli disimpan di `reference/Sosiogram RELI.html` sebagai cadangan.

## Keamanan Data

- Jangan commit `.env.local`, token Upstash, atau ekspor data.
- `JWT_SECRET` harus acak dan panjang.
- Token Upstash hanya ada di environment backend Vercel dan `.env.local`, bukan di frontend.
- Login dibatasi 5 percobaan / 15 menit per IP+email.
- Semua pengguna dapat mengubah password sendiri lewat halaman Profil.
- Hapus lokal dari halaman **Lokal & Tim** akan menghapus peserta, pertemuan, dan akun Inlok/Observer di lokal itu; minimal satu lokal harus tersisa.
- Admin tidak dapat menghapus atau menonaktifkan Koordinator Tim aktif terakhir.
- Data pribadi peserta tidak boleh masuk repo GitHub.

## Perintah

```bash
npm run dev              # frontend Vite
npm run api:dev          # API FastAPI lokal di port 8000
npm run build            # typecheck + build produksi
npm run typecheck        # cek TypeScript
npm run api:test         # contract test Python
npm run seed:admin       # buat admin pertama
npm run seed:koordinator # buat akun koordinator
npm run admin:permanent  # konversi/perbarui admin existing agar tidak kedaluwarsa
```

`admin:permanent` membaca `BOOTSTRAP_ADMIN_EMAIL` dan, jika diisi, `BOOTSTRAP_ADMIN_PASSWORD` dari `.env.local`. Password tidak ditulis ke source; nilai tersebut di-hash bcrypt sebelum disimpan.
