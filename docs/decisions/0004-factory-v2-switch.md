# ADR-0004: Switch Factory v1 → v2

- Status: dieksekusi parsial (2026-09-13) — runbook + switch lokal selesai;
  switch Vercel Production menunggu aksi manual (di luar jangkauan agen).
- Konteks: temuan audit #6 — Factory v2 (`0x3811…8Bf48`, solc 0.8.36)
  terdeploy tapi `WAREHOUSE_FACTORY_ADDRESS` masih menunjuk v1.
  Terverifikasi on-chain: kedua factory live, `proofRecorder()` sama
  (treasury), broadcast receipt cocok, source repo single-commit sehari
  sebelum deploy v2.
- Keputusan:
  1. Switch = perubahan env, BUKAN migrasi data: warehouse eksisting
     (kontrak immutable) tetap dilayani jalur treasury v1; hanya
     deployment BARU yang memakai v2 (member-paid intents).
  2. Runbook lengkap di WORKFLOW.md §5.1 (verifikasi, langkah lokal +
     Vercel, rollback = kembalikan env).
  3. `.env.local` lokal sudah menunjuk v2.
- Konsekuensi: langkah Vercel + redeploy + smoke test warehouse baru
  wajib dilakukan manusia dan dicatat tanggalnya di TODO item 7.
