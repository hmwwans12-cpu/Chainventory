# AGENT.md

**Status:** Locked
**Last Updated:** 2026-08-13
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
