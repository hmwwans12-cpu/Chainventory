# ADR-0007: Keputusan arsitektur yang ditunda (butuh owner)

- Status: DITUNDA — dicatat 2026-09-16 agar tidak hilang sebagai baris
  TODO tanpa pemilik (temuan audit #7/#10.10). Masing-masing butuh
  keputusan eksplisit owner sebelum v0.6.0; tinjau ulang maksimal
  2026-12-12 (sejajar expiry security-allowlist).
- Konteks: tiga desain besar masih berupa opsi di TODO, bukan keputusan.
  Praktik saat ini (yang berlaku sampai diputuskan lain) dicatat per
  item agar kontributor baru tidak menebak.

1. Pola RPC movement: BFF-only vs authenticated-by-design
   - Praktik saat ini: mutasi lewat Route Handler (BFF) → RPC
     `SECURITY DEFINER` dengan cek `auth.uid()` eksplisit; direct table
     mutation dari client di-REVOKE. Komentar route/client sudah
     disinkronkan ke model BFF-only (TODO P2 docs drift).
   - Opsi yang belum diputuskan: membolehkan client terautentikasi
     memanggil RPC tertentu langsung (lebih sedikit hop) vs tetap
     BFF-only untuk semua movement (satu seam audit, pola saat ini).
   - Keputusan dibutuhkan: ya/tidak + daftar RPC yang dikecualikan bila ya.

2. Trust boundary hash proof (keccak tidak tersedia di plpgsql)
   - Praktik saat ini: JCS RFC 8785 + Keccak-256 dihitung di BFF/TS
     (`lib/proof`), DB menyimpan dan membandingkan string hash;
     verifikasi ulang hash dilakukan di processor TS, bukan di SQL.
   - Opsi yang belum diputuskan: pertahankan (DB = penyimpan, TS =
     verifier) vs pindahkan verifikasi ke extension/PLV8/plpgsql
     kustom. Catatan: `pgcrypto` tidak menyediakan keccak.
   - Keputusan dibutuhkan: penegasan model trust boundary + di mana
     komentar kanonisnya tinggal (saat ini tersebar di ARSITEKTUR).

3. Desain bulk-import job server-side
   - Praktik saat ini: CSV import sinkron chunk-500 via BFF standar +
     outbox proof per movement (MAX_IMPORT_ROWS=1000, MAX_CSV_BYTES=1MB).
   - Opsi yang belum diputuskan: tetap sinkron (cukup untuk skala UMKM
     saat ini) vs job async (QStash/cron) untuk file besar.
   - Keputusan dibutuhkan: ambang batas yang memicu async + desain job.

- Konsekuensi: sampai diputuskan, JANGAN me-refactor ke arah opsi mana
  pun; PR yang menyentuh ketiga area wajib merujuk ADR ini. Saat owner
  memutuskan, tulis ADR lanjutan per item dan tandai item ini selesai.
