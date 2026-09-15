# ADR-0003: i18n full coverage (bukan sembunyikan toggle)

- Status: diterima (2026-09-13, keputusan user eksplisit)
- Konteks: temuan audit #22 — toggle ID/EN tampil tapi cakupan hanya
  7 file; user ID mendapat UI campur yang lebih membingungkan daripada
  tanpa opsi bahasa. Opsi yang dipertimbangkan: (a) sembunyikan toggle,
  (b) terjemahkan semua halaman inti.
- Keputusan: (b) terjemahkan semua halaman inti (products, movements,
  transactions, dialogs, members, blockchain, analytics, console,
  dashboard, notifikasi, shared). ~430 key baru + gate
  `scripts/ci/i18n-keys.mjs` (referensi key harus terdaftar; paritas
  en↔id tetap dikunci `translations.test.ts`).
- Konsekuensi: setiap copy UI baru wajib lewat `t()` + kedua locale,
  atau CI gagal. String yang disengaja tidak diterjemahkan (data user,
  enum, hash, role) didokumentasikan per-file saat migrasi.
