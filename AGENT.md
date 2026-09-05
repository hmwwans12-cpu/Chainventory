# AGENT.md

**Status:** Locked
**Last Updated:** 2026-09-05
**Companion to:** `PRD.md`, `ARSITEKTUR.md`, `TECHSTACK.md`, `WORKFLOW.md`, `TODO.md`

Operating manual bagi developer/AI agar seluruh keputusan pada dokumen lain tidak dilanggar saat implementasi.

---

## 1. Urutan Membaca Dokumen

Sebelum mengubah apa pun:

1. Baca `PRD.md`.
2. Baca `ARSITEKTUR.md`.
3. Baca `TECHSTACK.md` untuk dependency, provider, dan deployment.
4. Baca `DESIGN.md` sebelum mengubah UI/UX.
5. Baca `WORKFLOW.md` dan task terkait pada `TODO.md`.

Jika ada konflik, gunakan urutan prioritas:

```text
PRD.md
→ ARSITEKTUR.md
→ TECHSTACK.md
→ DESIGN.md
→ WORKFLOW.md
→ TODO.md
```

**Jangan membuat keputusan produk atau arsitektur baru diam-diam.** Laporkan konflik atau kebutuhan change request.

---

## 2. Invariant yang Tidak Boleh Dilanggar

- V1 hanya memakai **Base Sepolia** (`chainId 84532`).
- Supabase PostgreSQL adalah source of truth operasional inventory.
- Blockchain hanya menyimpan proof per movement; bukan seluruh data stok.
- Proof wajib untuk Stock In, Stock Out, Stock Adjustment, dan Stock Reversal.
- Stok tidak boleh negatif.
- Quantity wajib `NUMERIC(24,3)`; tidak boleh memakai JavaScript floating point.
- Numeric hash payload harus canonical decimal string → JCS RFC 8785 → Keccak-256.
- `idempotencyKey` database berbeda dari `deploymentNonce` on-chain. Keduanya tidak pernah menjadi satu field/mekanisme.
- Factory memakai EIP-712, on-chain nonce, expiry, Base Sepolia chain ID, dan Factory address.
- Treasury hanya sponsor test gas/Proof Recorder; bukan Owner warehouse.
- Owner warehouse dan primary wallet tidak boleh desync. Migrasi wallet Owner harus melalui transfer ownership on-chain.
- Movement, proof, dan audit log append-only; koreksi memakai adjustment/reversal, bukan edit/delete.
- Product unit tidak dapat berubah setelah movement pertama; Route Handler memberi error UX, database trigger adalah enforcement final.
- Kontrak Factory/Warehouse immutable pada v1.
- Proof Job Processor wajib menghitung ulang hash sebelum submit ke chain; mismatch tidak pernah dikirim ke blockchain (lihat §5).

---

## 3. Authorization dan Security

Setiap Route Handler mutation harus berurutan:

```text
Verify Supabase JWT
→ verify warehouse membership
→ verify canonical role permission
→ rate limit user + IP
→ validate Zod input
→ idempotency check
→ business/database operation
→ audit/log response
```

- Route Handler adalah primary authorization boundary.
- RLS adalah defense-in-depth; tetap wajib aktif dan diuji.
- Browser tidak boleh menerima service-role key, Privy secret, QStash token, RPC secret, atau treasury private key.
- Jangan gunakan service-role untuk request user normal.
- Mutation stok hanya melalui PostgreSQL RPC/function atomik.
- Mutation sensitif fail-closed jika Upstash rate limit unavailable.
- Read-only endpoint boleh fail-open dengan warning log.
- Manager hanya dapat mengelola/approve Staff, Auditor, dan Viewer.
- Hanya Owner dapat menetapkan Manager/Owner, suspend warehouse, atau transfer ownership.
- Developer Console memakai allowlist developer environment variable; role Owner warehouse tidak memberi akses otomatis.

---

## 4. Inventory dan Concurrency

- **Browser dan Route Handler biasa dilarang melakukan raw `INSERT`/`UPDATE` pada `inventory_balances`, `stock_movements`, `proofs`, atau `proof_outbox`.** Seluruh mutation inventory hanya melalui PostgreSQL RPC/function atomik yang telah ditentukan.
- Client mengirim `idempotencyKey` dan `expected_balance_version`.
- Database function mengunci product/balance row, memvalidasi saldo/version/permission, lalu membuat movement, update balance, audit, proof, dan outbox dalam satu transaksi.
- Kembalikan `INSUFFICIENT_STOCK` bila saldo kurang.
- Kembalikan `STALE_STOCK` beserta saldo/version terbaru bila version tidak cocok.
- Jangan melakukan read stock → hitung → write stock dalam query terpisah.
- Stock In/Out oleh Owner, Manager, Staff langsung committed.
- Adjustment/Reversal memerlukan approval Owner/Manager sebelum committed.
- Warehouse suspended menolak semua mutation warehouse.

---

## 5. Blockchain dan Async Job

- Request user **tidak boleh** mengirim atau menunggu transaksi blockchain.
- Route Handler hanya membuat movement/proof/outbox atomik dan segera merespons `proof pending`.
- **BFF membangun payload proof kanonis dan hash saat proof/outbox dibuat.** Payload serta hash bersifat immutable.
- **Sebelum submit, Proof Job Processor wajib menghitung ulang hash dari payload tersimpan dan membandingkannya.** Mismatch harus dihentikan sebagai `manual_review` dengan audit log, bukan dikirim ke blockchain.
- QStash memanggil internal Proof Job Processor; selalu verifikasi signature QStash.
- Processor menggunakan lease database dan aman terhadap duplicate delivery.
- Submit proof → simpan tx hash/status `submitted`.
- Confirmation job terpisah mengecek receipt sampai dua confirmation, lalu `confirmed`.
- Retry memakai exponential backoff maksimal lima kali; berikutnya `manual_review`.
- Hanya Developer Console dapat menjadwalkan ulang manual review.
- QStash/RPC gagal tidak membatalkan stok committed; outbox tetap direkonsiliasi.
- Proof contract harus idempotent pada `proofId`.

---

## 6. Database, Migration, dan Realtime

- Semua tabel relevan menggunakan foreign key, index, UTC timestamp, dan RLS.
- Terapkan migration additive sebelum kode yang bergantung padanya.
- Migration breaking memakai expand → migrate/backfill → contract pada release terpisah.
- Jangan melakukan rename/drop/constraint breaking dalam satu deploy.
- Seluruh authenticated page bersifat dynamic; jangan pakai ISR/shared cache untuk data user.
- Realtime hanya subscribe data warehouse yang diizinkan; bersihkan subscription saat account/warehouse berubah.
- UI harus menyediakan state `Live`, `Reconnecting`, dan `Data may be outdated`.

---

## 7. Logging, Environment, dan Dependency

- Validasi environment dengan `@t3-oss/env-nextjs` + Zod saat startup/build.
- Gunakan Pino structured logging dengan request ID, action, warehouse ID, status, latency, dan error code.
- Jangan log JWT, private key, session cookie, signature mentah, atau secret.
- Dependency baru harus punya alasan jelas, kompatibel free tier, dipelihara aktif, dan tidak menduplikasi capability yang ada.
- Jangan menambah layanan berbayar, mainnet, atau persistent worker tanpa change request.
- Free-tier limitation harus tetap terlihat: Supabase pause risk, Upstash fail-closed untuk mutation, QStash job dependency, dan RPC/faucet availability.

---

## 8. Testing dan Handoff

Sebelum menyatakan task selesai:

- Jalankan lint, typecheck, test terkait, dan build.
- Tambahkan test untuk business rule, permission, error state, dan regression.
- Untuk database: uji RLS, trigger, constraint, idempotency, race condition.
- Untuk contract: Forge unit/fuzz test; untuk perubahan relevan jalankan Base Sepolia smoke test.
- Untuk UI: uji loading, empty, error, disabled, permission denied, stale/offline, mobile, dan accessibility.
- Periksa diff agar tidak ada secret, data sensitif, atau perubahan di luar scope.
- Perbarui dokumentasi bila keputusan/desain/arsitektur berubah.
- **Laporkan batasan, test yang dijalankan, dan risiko tersisa secara jujur.**

---

## 9. Changelog v0.4.x (Audit Remediation)

Rilis v0.4.x adalah hasil remediasi audit menyeluruh (5-lapis: lib/app/components/supabase/hooks) plus temuan `audidi.md`. Setiap rilis backward-compatible kecuali disebut sebaliknya.

| Versi | Tanggal | Sorotan |
|---|---|---|
| **v0.3.9** | 2026-09-04 | 12 CRITICAL fixes: self-approval guard (DB), GRANT SELECT untuk 4 tabel unreachable (DB), security headers (CSP/HSTS), 6 dialog `onOpenChange` desync, 3 controlled-state race, `meta.icon` undefined crash, invite page restore, rate limit + allowlist untuk invite/proof retry, idempotencyKey required, RBAC untuk intent submit/finalize, BigInt length cap. |
| **v0.3.10** | 2026-09-04 | 12 HIGH DB/code fixes: per-warehouse proofs hash uniqueness, append-only DB triggers, wallets CHECK constraints, `membership_role` ENUM scaffold, proxy.ts narrower matcher + getUser try/catch, env empty-string Zod preprocess, BASESCAN_API_KEY validation, submitStockIntent early-success branch, mountedRef + safeSetBusy, invite dialog state reset, isValidEmail helper, sessionStorage useEffect, use-unread-notifications try/catch. |
| **v0.3.11** | 2026-09-04 | 6 HIGH API + 4 MEDIUM DB fixes: warehouse_summaries view GRANT, notification preferences Zod + rate limit, wallet balance 4s timeout, bulk import proof publish logging, membership route RBAC defense-in-depth, ownership-transfer rate-limit bucket, `notify_managers_once` TOCTOU, `proof_set_confirmation` status transitions, `proofs.movement_id` ON DELETE RESTRICT. |
| **v0.4.1** | 2026-09-05 | 12 MEDIUM + 5 LOW fixes: dashboard `force-dynamic`, `safeInternalPath` helper (open-redirect), bulk import SKU dedupe, e2e parser improvements, ErrorAlert sweep, `bulkChangeCategory` throw on !r.ok, `users.email_lowercase_check`, use-sign-out top-level import, playwright `E2E_REUSE_SERVER`, tsconfig ES2022. |
| **v0.4.2** | 2026-09-05 | 3 audidi items + M-11 + refactor + pre-existing fixes: `lib/csv/formula-injection.ts` shared helper, `lib/faucet/transfer.ts` discriminated-union + closure-scoped `broadcasted` (no double-pay), `apply_stock_movement` reversal warehouse alignment, `ConfirmDialog` primitive, 4 pre-existing test failures fixed (`vitest.config.mts` `SKIP_ENV_VALIDATION=1`), 2 pre-existing lint errors fixed. |
| **v0.4.3** | 2026-09-05 | Refactor overdue: 7 pre-existing lint warnings cleared (4 unused imports, 1 missing useEffect dep, 2 unused helpers), 4 member dialogs migrated to `ConfirmDialog` primitive (remove, reject, transfer, leave), `ConfirmDialogVariant` extended to include outline/secondary/ghost/link, `common.cancel` + `common.confirm` i18n keys added (EN + ID). |
| **v0.4.4** | 2026-09-05 | Polish: `useOptimistic` adoption for approvals + role changes, bundle audit + dynamic imports, documentation refresh. |

**Status after v0.4.4:** lint 0 errors 0 warnings, 247/247 vitest tests pass, typecheck clean.

**Open work (post-audit, bukan bug):**
- `useOptimistic` di expansion (sedang berjalan di v0.4.4)
- Pagination paradigm consistency (URL vs LoadMore)
- Dashboard widget i18n (low priority — dashboard users biasanya single-locale)
- Localized date formatting (`Intl.DateTimeFormat` per locale)
- Bundle size audit (visualizer + dynamic imports untuk heavy components)

**Backlog dari `audidi.md` yang tersisa:** semua selesai.

