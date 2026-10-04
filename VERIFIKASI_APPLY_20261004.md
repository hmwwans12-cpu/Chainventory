# Apply Staging 0078+0079 — Laporan Langsung (2026-10-04)

Atas instruksi eksplisit owner (staging `yxsieqqiksqckfrqozlb`, backup
dikonfirmasi). Dieksekusi via Supabase Management API (tanpa DB password
di `.env.local`) dengan skrip sekali-pakai di Temp (split sadar
`$tag$`, abort saat error pertama). Token hanya di env proses, tak pernah
dicetak ke output/file/repo.

## Hasil

- `supabase link` + `migration list`: 0001–0077 + 2 timestamped SUDAH
  applied; **pending tepat `0078`, `0079`** (tidak lebih).
- **0078: 7/7 statement OK.** 3 trigger `BEFORE TRUNCATE` live
  (`pg_trigger` tgtype 34 = BEFORE+TRUNCATE, statement-level).
  Bukti menyala: `TRUNCATE public.audit_logs` → `ERROR 42501: audit_logs
is append-only (TRUNCATE forbidden)` dari
  `private.forbid_truncate_append_only()`. (Catatan: `TRUNCATE proofs`
  gagal lebih dulu dengan 0A000 karena FK `proof_outbox` — trigger tak
  sempat diuji di tabel itu, tapi fungsi + trigger identik.)
- **0079: 35/35 statement OK.** Verifikasi akhir DB: `weak_remaining = 0`
  (nol DEFINER dengan `search_path=public`/tanpa-set dari 87 total).

## Koreksi penting terhadap laporan Batch C (jujur, bukan disembunyikan)

1. **Bug regex DROP** (`(if\s+exists\s+)?\s+` — spasi ganda membuat SEMUA
   `DROP ... IF EXISTS` tak tercocokkan): model statis over-count 112/54
   padahal yang benar 90/33. Diperbaiki di skrip + test
   (`drop\s+function\s+(?:if\s+exists\s+)?` tanpa `\s+` ganda).
2. **DB-truth mengoreksi model**: dari 54 ALTER awal, 1 gagal live
   (`verify_wallet(uuid)` — sudah di-drop 0061), ~20 entri mati
   (overload lama yang memang ter-drop), 3 fungsi terlewat model
   (transfer_ownership, update_member_role, confirm_ownership 4-arg —
   arkeologi definisi-berlapis, DB yang benar). Final = **31 fungsi lemah
   nyata + 2 sudah teraplikasi + 2 protektif = 35 ALTER**, SEMUA
   terverifikasi aman atas BODY ASLI dari DB (41.861 char, nol bare-ref,
   nol EXECUTE) — bukan atas model statis.
3. **Drift staging**: `purge_expired_idempotency_keys` (0053) tidak ada
   SAMA SEKALI di DB (bukan DEFINER pun tidak) — di-DEFER dengan alasan
   di test; selidiki terpisah. `proof_set_confirmation`/`proof_requeue`
   3-arg sudah terkunci sebelum sesi (sumber penguncian tak teridentifikasi
   — kemungkinan apply manual; catat).
4. File `0079` ditulis ulang ke 35 ALTER yang terbukti ada (aman di-retry
   dan aman untuk `db push` prod nanti — semua target eksis bila prod ≡
   staging history).

## Catatan histori migrasi (PENTING untuk push berikutnya)

Apply via Management API **tidak mencatat `schema_migrations`**:
`migration list` masih menandai 0078/0079 pending. `db push` berikutnya
akan menjalankannya ulang — AMAN karena semua statement idempotent
(`CREATE OR REPLACE`, `DROP IF EXISTS`, `ALTER ... SET`), lalu histori
tercatat. Jangan hapus file 0078/0079.

## Keamanan kredensial

- `sbp_…` personal token dipakai hanya via env proses sekali-pakai.
- `sb_secret_…` yang sempat tertempel di chat: **ROTATE SEGERA**
  (dashboard → API → revoke), begitu pula token personal di atas
  (masa pakai hitungan menit, tapi sudah di log).
- `secret:scan` repo: clean. Tidak ada secret masuk file repo.
- Sisa yang TIDAK saya sentuh: prod, e2e, deploy kontrak.

## Gate pasca-apply

`typecheck` ✅ `lint` ✅ `format:check` ✅ `test` **628 passed | 0 failed**
✅ `i18n:check` ✅ `check:contrast` ✅ `encoding:check` (706) ✅
`deps:audit` ✅ `secret:scan` ✅ `build` 61/61 ✅ `preflight` 7/7 ✅.
Commit `fcfc19a`.
