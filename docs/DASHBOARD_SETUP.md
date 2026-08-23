# Supabase Dashboard Setup — Chainventory

**Date:** 2026-08-14
**Priguna oleh:** user (punya akses dashboard Supabase)
**Rujukan:** TECHSTACK.md §2 (JWKS wajib sebelum Privy custom-auth), ARSITEKTUR.md §7.3 (keep-alive).

Ikuti urutan bernomor di bawah persis. Jangan kirim nilai kunci lewat chat —
isikan langsung ke `.env.local` (sudah di-`.gitignore`).

---

## Status (diupdate 2026-08-14) — ✅ SELESAI

- Project Free `chainventory` dibuat: ref **`yxsieqqiksqckfrqozlb`** (URL `https://yxsieqqiksqckfrqozlb.supabase.co`).
- **JWKS asymmetric aktif**: ES256 (P-256), kid `c01d624d-...`; `/auth/v1/.well-known/jwks.json` merespons — prasyarat TECHSTACK §2 TERPENUHI.
- `.env.local` terisi (publishable/secret key + CRON_SECRET + treasury), gitignored.
- **Catatan keamanan:** beberapa secret sempat terkirim di chat (secret key, service_role, legacy JWT secret, treasury private key). Disarankan rotasi; user memilih melanjutkan apa adanya. Rotasi sebelum produksi tetap direkomendasikan.

---

## Konteks penting (baca dulu)

1. **Project Supabase baru (dibuat sejak Okt 2025) sudah memakai JWT asymmetric/JWKS secara default.** Jika project kamu baru dibuat sekarang, langkah "migrasi ke JWKS" kemungkinan besar sudah otomatis — kamu tinggal **verifikasi** di langkah 4, bukan migrate.
2. Supabase sedang mengganti kunci lama (`anon`, `service_role`) dengan kunci baru (`publishable`, `secret`). Untuk project baru, gunakan yang baru: `sb_publishable_...` dan `sb_secret_...`.

---

## Langkah bernomor

### Langkah 1 — Buat project Supabase Free

1. Buka https://supabase.com/dashboard dan login.
2. Klik **New project** (kanan atas).
3. Isi:
   - **Organization:** pilih organisasi yang ada (atau buat baru).
   - **Name:** `chainventory`
   - **Database Password:** buat password kuat → **simpan di password manager** (dipakai kalau perlu koneksi langsung ke Postgres).
   - **Region:** pilih terdekat (mis. Singapore / Southeast Asia untuk Indonesia).
   - **Plan:** Free.
4. Klik **Create new project** dan tunggu sampai provision selesai (biasanya < 2 menit).
5. Catat **Project URL** dari halaman project (format: `https://<ref>.supabase.co`) — ini `NEXT_PUBLIC_SUPABASE_URL`.

### Langkah 2 — (opsional, dianjurkan) Siapkan kunci baru publishable + secret

> Project baru umumnya sudah punya publishable key. Periksa dulu; buat hanya jika belum ada.

1. Di project kamu, buka **Settings (⚙) → API Keys**.
2. Pada tab **Publishable and secret API keys**:
   - Kalau sudah ada **Publishable key** (`sb_publishable_...`) → pakai itu.
   - Kalau belum → klik **Create new API keys** → salin nilai **Publishable key**.
3. Untuk server, klik **Create new API keys** sekali lagi (atau pakai yang sudah ada) → salin nilai **Secret key** (`sb_secret_...`).
   - **Secret key = server-only.** Jangan pernah taruh di kode browser, `NEXT_PUBLIC_*`, chat, atau repo.

### Langkah 3 — Ambil nilai yang akan diisi ke `.env.local`

Dari **Settings → API Keys** (atau dialog **Connect** di dashboard):

| Variabel (nama di project kita) | Nilai yang diambil | Dari mana |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL `https://<ref>.supabase.co` | Halaman project / Connect |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_...` | API Keys → Publishable and secret tab |
| `SUPABASE_SECRET_KEY` | `sb_secret_...` (server-only) | API Keys → Publishable and secret tab |

> Jika karena suatu alasan hanya tersedia kunci legacy, ambil `anon` (untuk client) dan `service_role` (untuk server) dari tab **Legacy API Keys**. Project ini tetap mendukung keduanya, tetapi kunci baru adalah jalur yang disarankan.

### Langkah 4 — Verifikasi JWT Signing Keys (JWKS) — PRASYARAT WAJIB (TECHSTACK §2)

JWT signing key **asymmetric/JWKS** harus aktif **sebelum** Privy custom-auth diintegrasikan.

1. Di project kamu, buka menu **Authentication** (sidebar kiri).
2. Klik **JWT** (submenu Authentication → JWT Keys).
   - *(Di dashboard terbaru menu ini ada di Authentication → JWT; kalau tidak ada, coba Settings → JWT Signing Keys — dashboard lama mengarahkan ke menu baru.)*
3. Lihat bagian **Signing keys**:
   - **Project baru:** harus sudah tampil asymmetric key (algoritma **RSA** atau **Elliptic Curves/ECDSA**) dengan status aktif/standby. → Jika sudah asymmetric, **JWKS sudah aktif, lanjut ke Langkah 5.**
   - **Project lama (symmetric HS256):** klik **Migrate JWT secret**, tunggu dibuatkannya standby key asymmetric, lalu klik **Rotate keys**, dan (setelah app terverifikasi) **Revoke** legacy secret.
4. Verifikasi endpoint JWKS publik berfungsi:
   - Buka `https://<ref>.supabase.co/auth/v1/.well-known/jwks.json` di browser.
   - Harus mengembalikan JSON dengan daftar kunci (`keys`), bukan error.
   - JWKS inilah yang dipakai Privy untuk memverifikasi token dari sesi Supabase.

### Langkah 5 — Konfigurasi Auth (email + Google)

1. Buka **Authentication → Providers** (atau **Sign In / Providers**).
2. **Email:** aktifkan **Email** provider. Matikan opsi "Confirm email" bila ingin demo tanpa konfirmasi (opsional untuk dev; nyalakan kembali sebelum produksi).
3. **Google:** aktifkan **Google**, isi **Client ID** + **Client Secret** dari Google Cloud Console (proyek OAuth dengan redirect URI Supabase). *Opsional untuk fase ini; bisa menyusul.*

### Langkah 6 — Buat `.env.local` (JANGAN di-commit)

Di root project `CHAINVENTORY BUFF/`:

```
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_SUPABASE_URL=<Project URL>
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<sb_publishable_...>
SUPABASE_SECRET_KEY=<sb_secret_...>
CRON_SECRET=<string acak >= 16 karakter, server-only>
```

- File `.env.local` sudah di-`.gitignore` (pola `.env*`, kecuali `.env.example`).
- **Jangan kirim isi `.env.local` atau nilai kunci di chat.**

### Langkah 7 — Konfirmasi ke saya

Setelah selesai, kabari bahwa project sudah dibuat + JWKS sudah asymmetric + `.env.local` terisi. Saya akan:
1. Menjalankan migration SQL (`users` + RLS) via Supabase CLI/panel SQL.
2. Menjalankan health check + keep-alive dengan kredensial nyata.
3. Melanjutkan verifikasi End-to-End Supabase.

---

## Checklist ringkas

- [ ] Project Free `chainventory` dibuat
- [ ] Project URL dicatat
- [ ] Publishable key (`sb_publishable_...`) diambil
- [ ] Secret key (`sb_secret_...`) diambil (server-only)
- [ ] **JWKS asymmetric terverifikasi** (menu Authentication → JWT; `/auth/v1/.well-known/jwks.json` merespons)
- [ ] Email provider diaktifkan (Google optional)
- [ ] `.env.local` terisi dan tersimpan aman
