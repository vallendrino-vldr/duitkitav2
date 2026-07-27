# DUITKITA V2 — BRIEFING UNTUK AGENT PENERUS

> Tempel seluruh isi berkas ini sebagai pesan pertama ke agent baru, atau suruh dia
> membaca `HANDOFF.md` di akar proyek sebelum menyentuh kode apa pun.

---

## 0. ATURAN KERJA (WAJIB, JANGAN DILANGGAR)

1. **Bahasa UI 100% Bahasa Indonesia.** Tidak boleh ada satu kata Inggris pun yang dilihat pengguna.
2. **Balas ke user pakai bahasa santai (lo/gue).** User BUKAN programmer. Jelaskan pakai analogi sederhana. Dilarang bikin esai panjang.
3. **KERJA SATU-SATU.** Satu masalah, selesaikan, lapor, tunggu izin. Jangan pernah kerjakan banyak bug sekaligus — token user hampir habis.
4. **JANGAN push ke GitHub tanpa diminta user secara eksplisit.**
5. **Komentar kode ditulis Bahasa Indonesia**, isinya menjelaskan **KENAPA** (alasan/jebakan), bukan mengulang isi baris kode.
6. **Jangan pernah mengarang nilai kunci API.** Kalau butuh kunci, minta user ambil dari dashboard resmi. (Ini pernah terjadi dan membuat aplikasi mati total — lihat §3.1.)

---

## 1. RINGKASAN PROYEK

Aplikasi keuangan pribadi PWA, mobile-first, Bahasa Indonesia.

| | |
|---|---|
| Frontend | React 18 + Vite + TypeScript + Tailwind + Framer Motion + Zustand |
| Backend | Express (TypeScript) — jalan lokal, dan sebagai fungsi serverless di Vercel |
| Database | Supabase (Postgres 17), project ref `axqhiygtzymhoqkkfyvc`, region ap-southeast-1 |
| AI | Google Gemini, model `gemini-3.5-flash-lite` |
| Hosting | Vercel — `duitkitav2.vercel.app` |
| Repo | github.com/vallendrino-vldr/duitkitav2 (branch `main`) |

**Struktur:** monorepo npm workspaces.
```
apps/web/     frontend (Vite)
apps/api/     backend Express
api/index.ts  pembungkus serverless Vercel
vercel.json   konfigurasi deploy
```

---

## 2. PERINTAH DASAR

```bash
npm run dev --workspace web          # frontend :5173
npx tsx apps/api/src/index.ts        # backend  :4000
cd apps/web && npx tsc --noEmit -p tsconfig.json   # cek tipe (WAJIB sebelum selesai)
cd apps/web && npm run build         # build produksi (tsc + vite)
```

Server API mencetak status kunci saat menyala. Kalau ada yang `TIDAK VALID`, hentikan dan perbaiki dulu.

---

## 3. JEBAKAN YANG SUDAH MEMAKAN BANYAK WAKTU — BACA SEMUA

### 3.1 Kunci Supabase pernah PALSU
`SUPABASE_SERVICE_ROLE_KEY` di `.env` dulu berisi JWT **karangan** (payload `{"ref":"service_role"}`, tanpa klaim `role`). Supabase menolaknya dengan "Invalid API key", dan karena SEMUA verifikasi token lewat kunci itu, login + scan + seluruh fitur AI mati sambil menampilkan "Sesi tidak valid".

- Sudah diperbaiki. `apps/api/src/config.ts` punya `periksaKunci()` yang memeriksa klaim `role` dan `ref` saat server menyala.
- **Verifikasi token sekarang memakai `SUPABASE_ANON_KEY`, bukan service_role.** Service role HANYA untuk operasi admin lintas-pengguna.

### 3.2 `.env` dibaca dari folder API sendiri
`import 'dotenv/config'` membaca relatif terhadap `process.cwd()`. Menjalankan server dari akar repo membuat `apps/api/.env` tidak pernah terbaca → semua kunci kosong tanpa peringatan. Sudah diperbaiki di `config.ts` (memakai `__dirname`). **Jangan kembalikan ke `dotenv/config`.**

### 3.3 Rute API di Vercel — JANGAN pakai `api/[...slug].ts`
Nama berkas tangkap-semua dibaca Vercel sebagai **SATU segmen** di proyek ini. Akibatnya `/api/health` sampai ke Express tapi `/api/scan/roast` dijawab 404 milik Vercel.

Solusi yang dipakai sekarang (**jangan diubah tanpa pengujian di produksi**):
- Berkas fungsi: `api/index.ts`
- `vercel.json`: `{"source":"/api/:jalur*","destination":"/api/index?__jalur=:jalur*"}`
- `api/index.ts` menyusun ulang `req.url` dengan tiga lapis pengaman.
- Endpoint uji: `GET /api/diag/rute/:a/:b` — kalau ini 200, routing bersarang sehat.

### 3.4 Galat Vercel berbentuk OBJEK → pernah mematikan seluruh aplikasi
Vercel membalas galat platform sebagai `{"error":{"code":"401","message":"Protected deployment"}}`. Objek itu dulu diambil mentah lalu dirender ke JSX → **React error #31** → layar "Terjadi Kesalahan Kritis".

- **JANGAN PERNAH merender nilai galat langsung ke JSX.**
- Selalu lewat `pesanApi()` (`apps/web/src/lib/api.ts`) atau `pesanError()` (`apps/web/src/lib/db.ts`). Keduanya dijamin mengembalikan string.

### 3.5 RLS aktif + izin per-kolom pada `profiles`
- Semua tabel `public` memakai RLS; pengguna hanya bisa menyentuh barisnya sendiri.
- Kolom `security_pin` **dicabut** dari klien. **`select('*')` pada `profiles` PASTI GAGAL** dengan "permission denied".
- Selalu pakai konstanta `PROFILE_COLUMNS` dari `lib/db.ts`.
- Klien hanya boleh `UPDATE` kolom `display_name` pada `profiles`.

### 3.6 `wallets.balance` dihitung TRIGGER
Jangan pernah menulis ke `wallets.balance`. Nilainya dihitung ulang otomatis dari `transactions` + `wallets.initial_balance`. Untuk mengubah saldo awal, tulis ke **`initial_balance`**.
Setelah mengubah/menghapus transaksi, panggil `fetchWallets()` + `fetchTransactions()` agar layar ikut segar.

### 3.7 PIN di-hash di database
Plaintext PIN tidak pernah ada di klien. Gunakan RPC:
- `verify_pin(p_pin)` → boolean
- `change_pin(p_old_pin, p_new_pin)` → boolean
- `admin_set_pin(p_user_id, p_new_pin)` → hanya service_role

### 3.8 Semua overlay WAJIB dibungkus `<Portal>`
Setiap halaman dibungkus `<motion.div>` yang menganimasikan posisi. Elemen ber-`transform` menjadi titik acuan baru, sehingga `position: fixed` di dalamnya TIDAK lagi mengacu ke layar. Gejalanya: overlay melenceng, terpotong, atau tertimpa navbar.
Komponen: `apps/web/src/components/Portal.tsx`.

**Tingkatan z-index (patuhi):** `z-40` navbar · `z-[60]` modal · `z-[70]` overlay layar penuh · `z-[80]` layar kunci PIN. **Jangan pakai `z-50`.**

### 3.9 JANGAN nyalakan-matikan efek visual saat interaksi
Pernah dicoba: animasi dijeda + blur dilepas selama menggulir. Secara angka lebih ringan, **tetapi mata menangkapnya sebagai kedipan** sehingga terasa JAUH lebih rusak. Sudah dibatalkan.
**Aturan: turunkan biaya render secara PERMANEN, jangan bergantian.**

Yang sekarang dipakai (jangan dibalik):
- `.bg-asmr` **tidak dianimasikan** (menganimasikan `background-position` = menggambar ulang satu layar penuh tiap frame).
- Aurora memakai `radial-gradient`, **bukan** `filter: blur` yang bergerak.
- Di perangkat lemah (`useKualitasVisual` → `hemat`): bola 3D tidak berputar, cincin sapu mati, jumlah partikel dikurangi — semuanya **permanen**.

### 3.10 `prefers-reduced-motion` sengaja dikecualikan untuk hiasan
Kelas `.ambient` / `.ambient-bg` tetap bergerak walau sistem minta kurangi gerak — ini **permintaan eksplisit user**. Animasi fungsional (modal, spinner, transisi) tetap patuh. Jangan "perbaiki" ini.

### 3.11 Kamera
`facingMode: 'environment'` gagal di laptop (tidak ada kamera belakang). Sekarang ada rantai fallback: belakang → depan → apa saja. Stream dipasang lewat `useEffect`, **bukan `setTimeout`** (dulu meleset dan layar jadi hitam).

### 3.12 Safari iOS tidak punya Web Speech API
Tombol catat suara dulu mati total di semua perangkat Apple. Sekarang ada jalur cadangan: rekam dengan `MediaRecorder` → kirim ke `POST /api/scan/voice` → Gemini mendengar sekaligus menyusun datanya.

### 3.13 Kompresi gambar wajib
Semua unggahan gambar HARUS lewat `compressImageDetail()` / `compressImage()` (`apps/web/src/utils/imageCompressor.ts`). Batas keras **75 KB** karena Supabase gratis hanya 1 GB.

### 3.14 Admin boleh memakai halaman pengguna
Aturan lama melempar semua admin ke `/admin`, sehingga pemilik aplikasi tidak bisa memakai fiturnya sendiri. Sudah dicabut. Panel admin tetap tertutup untuk non-admin.

---

## 4. SKEMA DATABASE

```
profiles(id PK→auth.users, email, username UQ, display_name, role['user'|'admin'],
         security_pin /* bcrypt, DICABUT dari klien */, created_at)

wallets(id, user_id→profiles, name, balance /* TRIGGER */, initial_balance, created_at)

transactions(id, user_id, wallet_id, to_wallet_id /* transfer */,
             type['income'|'expense'|'transfer'], amount, category, title,
             receipt_url /* PATH di bucket 'receipts', bukan URL */, created_at)

debts(id, user_id, title, amount, due_date, type['HUTANG'|'PIUTANG'],
      status['unpaid'|'paid'], created_at)

saving_goals(id, user_id, title, target_amount, current_amount, target_date, image_url)

budgets(id, user_id, category, amount_limit, period_month date)
        UNIQUE(user_id, category, period_month)

recurring_transactions(id, user_id, wallet_id, type, amount, category, title,
                       interval_unit['day'|'week'|'month'], interval_count,
                       next_run, last_run, is_active)

user_preferences(user_id PK, theme, font_scale, number_format, language, currency,
                 avatar_url /* PATH bucket */, unlock_method, reminder_days_before,
                 tanggal_mulai_bulan /* integer 1-31, default 1 */)

tabs(id, user_id→profiles, name, icon, created_at)

reminders(id, user_id→profiles, title, description, due_date,
          is_completed, related_entity_type, related_entity_id, created_at)
```

**Fungsi database:** `is_admin()`, `verify_pin()`, `change_pin()`, `admin_set_pin()`, `tx_delta()`, `recalc_wallet()`, `sync_wallet_balance()` (trigger), `handle_new_user()` (trigger), `buat_preferensi_default()` (trigger).

**Storage:** bucket `receipts` — **privat**, maks 2 MB, hanya jpeg/png/webp, satu folder per `user_id`. URL untuk ditampilkan dibuat dengan `urlStruk(path)` di klien, atau `createSignedUrls` di server untuk panel admin.

**Realtime:** aktif untuk `profiles`, `transactions`, `wallets`.

---

## 5. KONVENSI KODE

**Kelas CSS siap pakai** (`apps/web/src/index.css`):
`.page` `.glass` `.glass-strong` `.field` `.label` `.btn` `.btn-primary` `.btn-ghost` `.btn-danger` `.icon-btn` `.skeleton`

**Token warna** (`tailwind.config.js`): `brand-*` (teal) · `accent-*` (ungu) · `ink-*` (gelap) · `danger-*` `warn-*` `ok-*` · `text-micro` · `rounded-4xl` · `ease-expo`

**Wajib:**
- Setiap operasi database lewat `safeMutate` / `safeMutateOne` dari `lib/db.ts`; `catch` memakai `toast.error(pesanError(e, '...'))`.
- Toast sukses **hanya setelah** operasi terbukti berhasil.
- Ikon hanya dari `lucide-react`. **Dilarang emoji sebagai ikon.**
- Area sentuh minimal **44px**. Kontras teks minimal `text-white/70`.
- Animasi hanya `transform` / `opacity`. Jangan animasikan `width`/`height`/`top`/`left`.
- Semua hooks di atas, tanpa early return sebelum hook terakhir.
- TypeScript ketat: `noUnusedLocals` + `noUnusedParameters` aktif.
- Uang: `Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0})`

**Berkas kunci:**
```
apps/web/src/lib/db.ts              safeMutate, pesanError, PROFILE_COLUMNS
apps/web/src/lib/api.ts             api (axios+token), pesanApi, unggahStruk, urlStruk
apps/web/src/lib/AuthProvider.tsx   useAuth() → {status,profile,session,signOut}
apps/web/src/lib/adminApi.ts        panggilan panel admin
apps/web/src/lib/useLiveData.ts     realtime + polling
apps/web/src/lib/useKualitasVisual.ts  deteksi perangkat lemah
apps/web/src/store/useFinanceStore.ts  Zustand + persist
apps/api/src/config.ts              muat .env + validasi kunci
apps/api/src/app.ts                 Express app (tanpa listen)
apps/api/src/middleware/auth.ts     requireUser / requireAdmin
```

**Status auth** (`AuthProvider`) hanya 4: `loading` · `signedOut` · `locked` · `ready`. Ini mencegah "layar putih" yang dulu terjadi karena kombinasi state yang tidak merender apa pun. **Jangan tambah state baru di sini.**

---

## 6. SUDAH SELESAI (jangan dikerjakan ulang)

Keamanan DB (RLS + PIN hash + storage privat) · Perbaikan auth & layar putih · Rute API produksi · Scan struk + AI Roast · Kamera (fallback + tata letak) · Catat suara (Safari iOS + pemahaman kalimat) · Panel admin (CRUD user, reset PIN, monitor storage, akordion per-pengguna + foto) · Edit/hapus transaksi · Profil + unggah avatar · Transfer antar dompet + saldo awal · Galeri struk · Anggaran · Transaksi berulang · Laporan + ekspor CSV · Preferensi (backup/reset) · PWA auto-update + tombol pasang · Kartu ATM 3D · Performa ponsel · Tata letak responsif (dock di HP, sidebar di laptop) · Migrasi Data Excel/PDF.

---

## 7. ANTRIAN BERIKUTNYA (urutan disepakati user)

- ~~**C. Migrasi DB sekali jalan**~~ ✅ SELESAI
- ~~**D. Attachment struk per transaksi**~~ ✅ SELESAI
- ~~**E. Custom tanggal mulai bulanan**~~ ✅ SELESAI
- ~~**F. Laporan mingguan + filter tanggal custom**~~ ✅ SELESAI
- ~~**G. Tab/Profil Kategori**~~ ✅ SELESAI
- ~~**H. Buku Kas & Analisis**~~ ✅ SELESAI
- ~~**I. Reminders**~~ ✅ SELESAI
- ~~**J. Import PDF/XLSX "magic"**~~ ✅ SELESAI
- ~~**K. Perbaikan UI/UX & Kalender**~~ ✅ SELESAI — (Dropdown Profil Import, Edit Dompet, Kalender, Hapus Tema/Bahasa).

---

## 8. STATUS TERAKHIR (SIAP HANDOFF KE CLAUDE CODE)

- **Commit terakhir sudah ter-push**: perbaikan catat suara Safari iOS + upgrade pemahaman AI.
- **Tugas K (UI/UX & Kalender)** baru saja diselesaikan.
- ⛔ **User meminta JANGAN push ke GitHub sampai ia menyuruh secara eksplisit.**

### Pesan Khusus Untuk Claude Code (Penerus)
Halo Claude. Proyek ini sudah berjalan sangat jauh dan aplikasinya sudah mendekati final. Tolong perhatikan hal-hal berikut:
1. **Jangan Berhalusinasi & Bertanya Terlalu Banyak**. Bekerjalah sesuai alur.
2. **Lihat aturan di bagian atas file ini**. UI harus 100% Bahasa Indonesia. Dark mode mutlak (`ink-900`/`ink-950`).
3. Dilarang pakai `cat`, `grep`, `sed` untuk modifikasi script kompleks di terminal. Gunakan tool editor kamu sendiri.
4. Lanjutkan instruksi/tugas berikutnya yang diminta User.

### Sisa tugas milik user (bukan agent)
1. **Cabut token GitHub** yang pernah ditempel di percakapan.
2. **Ganti kata sandi akun admin** (`admin@duitkita.com`, masih `123456` bawaan setup awal).
3. Jangan sebarkan berkas `.env.vercel` (berisi service_role key).

### Catatan kecil yang diketahui & tidak berbahaya
- URL API menyisakan query `?jalur=...` (sisa mekanisme rewrite). Tidak mengganggu.
- Beberapa halaman baru (Transfer, Anggaran, Berulang, Laporan, Galeri Struk, Import, Kalender) belum diuji QA menyeluruh secara manual oleh user, tapi secara teknis bebas dari error TypeScript.

---

## 9. UPDATE LOG AGENT

### [2026-07-27] AUDIT SILANG oleh Claude atas pekerjaan agent Gemini
- **Status**: Selesai ✅ — klaim tugas C–K **terbukti asli**, bukan laporan kosong.
- **Diverifikasi langsung ke database**: tabel `tabs` & `reminders` ada, RLS aktif +
  punya policy di **10/10** tabel, kolom `tanggal_mulai_bulan` (`user_preferences`)
  dan `tab_id` (`transactions`, `wallets`) benar-benar ada.
- **Diverifikasi ke kode**: typecheck web 0 galat, API 0 galat, build produksi sukses.
  Seluruh rute baru (`/cashbook`, `/import`, `/calendar`) sudah terpasang di `App.tsx`.
- **Diperiksa kepatuhan aturan**: tidak ada `select('*')` pada `profiles`, tidak ada
  penulisan ke `wallets.balance`. `Calendar.tsx` & `ReminderBell.tsx` memang tidak
  memanggil database langsung (lewat store/hook), jadi absennya `safeMutate` di situ wajar.
- **DITEMUKAN & DIPERBAIKI — 1 celah keamanan**: fungsi pemicu baru
  `sync_debt_to_reminders()`, `sync_recurring_to_reminders()`, dan
  `buat_preferensi_default()` dibuat dengan `SECURITY DEFINER` tetapi `search_path`-nya
  bisa diubah pemanggil DAN bisa dipanggil langsung lewat `/rest/v1/rpc/...`.
  Fungsi pemicu tidak boleh begitu. Sudah dikunci lewat migrasi
  `phase6_kunci_fungsi_pemicu_pengingat` dan diverifikasi (`search_path=public`,
  `bisa_dipanggil_user=false`).
  **Aturan untuk agent berikutnya: setiap fungsi pemicu baru WAJIB
  `set search_path = public` + `revoke all ... from anon, authenticated, public`.**
- **Sisa peringatan Supabase yang WAJAR** (jangan "diperbaiki"): `is_admin`,
  `verify_pin`, `change_pin` memang sengaja bisa dipanggil pengguna yang sudah login.
  `rls_auto_enable` milik platform Supabase, bukan kita.
- **Belum diaktifkan (keputusan user)**: Leaked Password Protection di Supabase Auth.


### [2026-07-27] Perbaikan UI/UX & Fitur Kalender (Tugas K)
- **Status**: Selesai ✅
- **Deskripsi**: Penambahan halaman kalender, edit dompet, dan pemolesan UX di berbagai komponen.
- **Perubahan**:
  - Halaman `ImportData.tsx`: Menambahkan dropdown pilihan Buku Keuangan / Tab sebelum memigrasi data. Pratinjau tabel sekarang memisahkan nominal Pemasukan (Hijau `+`) dan Pengeluaran (Merah `-`). Menambahkan Modal Konfirmasi Impor sebelum mengeksekusi Bulk Insert.
  - Dompet: Menambahkan modal `WalletEditor.tsx` untuk mengedit nama dompet dan saldo awal, serta menghapus dompet. Dipasang Ikon Pensil di menu dompet dalam `AtmCard.tsx`.
  - Struk (`Receipts.tsx`): Pesan kosong diperjelas, dan ketika struk diklik, kini muncul opsi "Edit Transaksi" yang otomatis memanggil komponen `TransactionEditor.tsx`.
  - Kalender: Menambahkan `Calendar.tsx` sebagai tampilan interaktif rangkuman harian Pemasukan dan Pengeluaran di satu bulan. Saat hari diklik, akan muncul daftar transaksinya. Halaman ini dimasukkan ke dalam daftar fitur di menu Navigasi Atur (`Settings.tsx`).
  - Pembersihan: Menghapus opsi *Theme* dan *Language* dari `Preferences.tsx` (dibuat permanen Dark Mode & ID). Mengubah seluruh terminologi 'Profil' menjadi 'Buku Keuangan' di `TabSwitcher.tsx` agar tidak bertabrakan dengan Profil Akun.

### [2026-07-27] Import Data PDF/XLSX "Magic" (Tugas J)
- **Status**: Selesai ✅
- **Deskripsi**: Fitur migrasi data dari aplikasi kompetitor (Excel/PDF) secara pintar dan *real-time*.
- **Perubahan**:
  - Halaman `ImportData.tsx` lengkap dengan UI drag-and-drop file XLSX/PDF.
  - Tabel *Smart Preview* sebelum insert, untuk pengecekan data (mendukung *inline-edit*).
  - Skrip Parser `utils/importer.ts` (menggunakan `xlsx`) untuk mengekstrak Tanggal, Kategori, Nominal, Jenis Transaksi, Nama Dompet, dan URL Struk.
  - *Fallback PDF*: menggunakan `pdfjs-dist` dengan pesan pemberitahuan rekomendasi pengunggahan XLSX (karena file PDF lampiran berisi screenshot, sehingga OCR lokal kurang efektif untuk struk).
  - Algoritma *Auto-create Wallet*: Jika dompet yang tertera di dokumen belum ada di Tab pengguna saat ini, sistem akan membuatnya secara otomatis di balik layar sebelum memasukkan transaksi.
  - Modul *Upload & Compress on the fly*: Backend membaca tautan eksternal *receipt*, men-*download* foto *receipt*, memadatkannya ke WebP, lalu mengunggahnya ke *storage bucket* DuitKita.
  - Algoritma Insert *Chunking* berukuran 50 baris per eksekusi, lengkap dengan *Progress Bar* demi mencegah memori/browser membeku.
- **Error/Kendala**:
  - Sempat terjadi error *build* TypeScript pada proses *fetch profile* dan *activeTabId*, tapi sudah diperbaiki dengan operator pengecekan *null*. *Build production* bersih dari error.

### [2026-07-27] Pengingat Jatuh Tempo / Reminders (Tugas I)
- **Status**: Selesai ✅
- **Deskripsi**: Sistem pengingat tagihan berulang dan hutang yang jatuh tempo.
- **Perubahan**:
  - Menambahkan kolom `reminder_days_before` di tabel `user_preferences`.
  - Membuat trigger SQL `sync_debt_to_reminders` dan `sync_recurring_to_reminders` pada skema Supabase, yang otomatis mengisi data di tabel `reminders`.
  - Menambahkan logika di `Preferences.tsx` untuk mengatur `reminder_days_before` (H-0 s.d H-14).
  - Membuat hook `useReminders.ts` untuk memantau data notifikasi, yang difilter sesuai pengaturan H-n.
  - Meminta izin *Push Notification* ke Browser dan mencatat notifikasi di `localStorage` (`notified_reminders`) untuk anti-spam.
  - Membuat komponen `ReminderBell.tsx` di pojok kanan Navbar (sebelah `TabSwitcher`) lengkap dengan badge merah untuk melihat daftar pengingat yang aktif.

### [2026-07-27] Buku Kas & Analisis (Tugas H)
- **Status**: Selesai ✅
- **Deskripsi**: Halaman khusus seperti rekening koran/ledger untuk melihat saldo berjalan (*running balance*).
- **Perubahan**:
  - Membuat `Cashbook.tsx` (di menu Laporan/Analisis) untuk menampilkan histori keluar-masuk uang.
  - Perhitungan Saldo Berjalan (*running balance*) otomatis mengikuti urutan waktu transaksi.
  - Filter by Tab/Profil (`activeTabId`) dan per-Dompet khusus (dropdown).
  - Fitur ekspor CSV khusus untuk Buku Kas (diurutkan dari lama ke baru agar mudah dipakai di Excel) lengkap dengan baris sisipan Saldo Awal dan Saldo Akhir.
  - Memasukkan perbaikan *Bug fix*: Sinkronisasi `tab_id` pada halaman "Laporan & Statistik" (`Reports.tsx`) yang sebelumnya terlupakan pada tugas G.

### [2026-07-27] Tab/Profil Kategori (Tugas G)
- **Status**: Selesai ✅
- **Deskripsi**: Fitur *workspaces* / Profil sehingga user bisa memisahkan Keuangan Pribadi dan Usaha secara mandiri.
- **Perubahan**:
  - Menambah global state `activeTabId` di Zustand (`useFinanceStore.ts`).
  - Pembuatan UI dropdown `TabSwitcher.tsx` di `UserLayout.tsx` untuk pindah-pindah profil, termasuk pop-up/modal buatan sendiri untuk membuat/edit profil.
  - Mengubah pemanggilan `fetchWallets`, `fetchTransactions` agar mengirim filter `.eq('tab_id', activeTabId)`.
  - Menambahkan *Foreign Key* `tab_id` pada seluruh entitas yang memerlukan sinkronisasi (`wallets`, `transactions`, dll).
  - Melakukan refaktor menyeluruh pada semua komponen: Dasbor (`Dashboard`), Daftar Transaksi, Tambah Transaksi (`Add`), Anggaran (`Budget`), Target Tabungan, Transaksi Berulang (`Recurring`), dsb agar memasukkan data sesuai profil aktif.

### [2026-07-27] Laporan Mingguan & Kustom (Tugas F)
- **Status**: Selesai ✅
- **Deskripsi**: Menambahkan opsi untuk memfilter laporan berdasarkan rentang waktu Mingguan (per 7 hari) dan Kustom (pilih tanggal secara spesifik) pada halaman Laporan Keuangan.
- **Perubahan**:
  - Halaman Laporan ([Reports.tsx](file:///c:/Users/Administrator/Documents/duitkitav2/apps/web/src/pages/Reports.tsx)):
    - Menambahkan `Segment Control` untuk memilih antara tipe Bulanan, Mingguan, dan Kustom.
    - Menambahkan antarmuka pemilih tanggal (chevron untuk mingguan, dan dua input tipe `date` untuk kustom).
    - Menyesuaikan penamaan file CSV hasil ekspor agar mencerminkan rentang kustom.
    - Menyesuaikan logika perbandingan periode (untuk panah naik/turun merah/hijau): pada periode kustom, data dibandingkan dengan rentang mundur sepanjang jumlah hari yang sama.
- **Error/Kendala**:
  - Nihil. Kompilasi tipe berjalan aman.

### [2026-07-27] Custom Tanggal Siklus Bulanan (Tugas E)
- **Status**: Selesai ✅
- **Deskripsi**: Menambahkan fitur tanggal siklus kustom sehingga laporan bulanan dan anggaran tidak harus terpaku pada tanggal 1. Hal ini membantu para pekerja yang baru menerima gaji di tanggal tertentu (misalnya tanggal 25) untuk lebih presisi dalam mengelola keuangannya.
- **Perubahan**:
  - Utilitas Kustom ([dateUtils.ts](file:///c:/Users/Administrator/Documents/duitkitav2/apps/web/src/utils/dateUtils.ts)):
    - Membuat fungsi `rentangSiklus` yang menghitung waktu mulai dan selesai (Opsi A maju) untuk mengakomodasi siklus seperti (25 Agustus - 25 September untuk Laporan Agustus).
  - Halaman Preferensi ([Preferences.tsx](file:///c:/Users/Administrator/Documents/duitkitav2/apps/web/src/pages/Preferences.tsx)):
    - Menambahkan `tanggal_mulai_bulan` ke dalam antarmuka `Preferensi` dan array pemanggilan database.
    - Menambahkan UI `<select>` untuk pengguna memilih tanggal 1-31.
  - Komponen Laporan ([Reports.tsx](file:///c:/Users/Administrator/Documents/duitkitav2/apps/web/src/pages/Reports.tsx)) & Anggaran ([Budget.tsx](file:///c:/Users/Administrator/Documents/duitkitav2/apps/web/src/pages/Budget.tsx)):
    - Merefaktor `rentangBulan` bawaan untuk mengonsumsi `rentangSiklus` berdasarkan nilai preferensi tanggal yang dimuat sebelum siklus digambar.
- **Error/Kendala**:
  - Nihil. Kompilasi tipe (`npx tsc --noEmit`) berhasil penuh dan siap untuk build.

### [2026-07-27] Attachment Struk per Transaksi (Tugas D)
- **Status**: Selesai ✅
- **Deskripsi**: Menambahkan fungsionalitas bagi pengguna untuk melampirkan berkas struk secara manual (tanpa scan AI) pada form Tambah Transaksi dan mengelola struk (unggah/ganti/hapus) pada Editor Transaksi.
- **Perubahan**:
  - Halaman Tambah Transaksi ([Add.tsx](file:///c:/Users/Administrator/Documents/duitkitav2/apps/web/src/pages/Add.tsx)):
    - Menambahkan input berkas manual tersembunyi yang diletakkan pada form input manual.
    - Menambahkan logika kompresi berkas (`compressImage`) pada unggahan manual agar ukuran di bawah 75 KB.
    - Menampilkan pratinjau mini gambar yang dilampirkan beserta ukuran dan tombol hapus lampiran (`X`).
  - Editor Transaksi ([TransactionEditor.tsx](file:///c:/Users/Administrator/Documents/duitkitav2/apps/web/src/components/TransactionEditor.tsx)):
    - Mengintegrasikan fungsi `compressImage` dan `unggahStruk` untuk pembaruan media struk.
    - Menambahkan state `pendingEditReceipt` dan `isDeletingReceipt` untuk melacak status lampiran saat pengeditan.
    - Memperbarui antarmuka pengguna pada blok struk untuk mendukung 3 keadaan: memilih struk baru, menghapus struk saat ini, atau mengganti struk saat ini.
- **Error/Kendala**:
  - Nihil. build check (`npx tsc --noEmit`) dan produksi build (`npm run build`) berjalan dengan sukses dan bersih.

### [2026-07-27] Migrasi DB Sekali Jalan (Tugas C)
- **Status**: Selesai ✅
- **Deskripsi**: Menambahkan kolom preferensi awal bulan dan dua tabel baru untuk persiapan fitur kategori dan pengingat.
- **Perubahan**:
  - Database:
    - Menambahkan kolom `tanggal_mulai_bulan` (`integer`, default `1`, constraint `1-31`) di tabel `public.user_preferences`.
    - Membuat tabel `public.tabs` untuk pemisah kategori transaksi.
    - Membuat tabel `public.reminders` untuk pengingat jatuh tempo.
    - Mengaktifkan RLS (Row Level Security) pada tabel `tabs` dan `reminders` dengan kebijakan CRUD pengguna masing-masing, serta admin akses penuh.
  - Berkas Lokal:
    - Memodifikasi [schema.sql](file:///c:/Users/Administrator/Documents/duitkitav2/schema.sql) untuk menyertakan skema SQL migrasi baru ini.
    - Memodifikasi [HANDOFF.md](file:///c:/Users/Administrator/Documents/duitkitav2/HANDOFF.md) pada daftar tugas dan status terakhir.
- **Error/Kendala**:
  - Sempat terjadi kendala otentikasi akun Supabase pada tool MCP yang mengarah ke project lain, tetapi langsung teratasi setelah user memperbarui otentikasi. Eksekusi query sukses tanpa error.
