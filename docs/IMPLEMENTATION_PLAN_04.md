# Implementation Plan — Chainventory Execution 03 (P1: Identity/Wallet → RBAC → Inventory → Proof Pipeline)

**Version:** 08
**Date:** 2026-08-16
**Status:** DALAM EKSEKUSI — Step 1–4 + hardening C1–C7 selesai; **P1 Step 5 (Proof Pipeline Async) SELESAI (konfirmasi resmi)**: migration `0009` terpasang live, semua modul nyata + 3 endpoint internal + wire movement route, unit 56/56 hijau, **E2E live on-chain PASS**, **jalur QStash signature ASLI terverifikasi** — dikonfirmasi via dashboard Upstash → QStash → Logs (9 delivery, semua `Delivered` ke `/api/internal/proofs/process` & `/confirm`, response 864ms–6s) serta validasi tunnel (JWT `iss=Upstash` ditangkap, accept→200, tamper→403, palsu→403). Infra validasi sementara (echo server/tunnel kedua/polling message) sudah dihapus; QStash bersih dari endpoint/subscription yang menunjuk trycloudflare. **Create Warehouse backend SELESAI (migration `0010`+`0011` live, E2E smoke 5/5 PASS via route asli — lihat Progres v07)**. Berikutnya: UI terdampak Step 1–5, dimulai dari **UI Create Warehouse (DESIGN §27–28)**, lalu UI Join + dashboard inventory + movement form.
**Companion to:** `docs/IMPLEMENTATION_PLAN_03.md` (v03, P0) — versi lama tidak di-overwrite

---

## Progres Eksekusi (diupdate 2026-08-16)

- ✅ **P1 Step 1 — Identity/Wallet (partial)**: migration `0003_wallets_warehouses_deployments.sql` terpasang (`wallets`, `warehouses`, `warehouse_deployments` + RPC `register_wallet`/`verify_wallet`), integrasi Privy (`@privy-io/react-auth` + `@privy-io/server-auth`, `lib/privy/custom-auth.ts` asli, `components/providers/privy-provider.tsx`). **Blocker user**: dashboard Privy `custom_jwt_auth: false` → alur `getCustomAccessToken` belum end-to-end.
- ✅ **Verifikasi RLS wallets end-to-end**: user dibuat via Node + Admin API (secret key ditolak dari PowerShell — "Forbidden use of secret API key in browser"; signup REST kena rate limit). `register_wallet` (primary pertama = true, kedua = false), `verify_wallet` → `verified`, isolasi RLS (alice lihat 2, bob lihat 1, alice baca bob = 0), direct PATCH deny (tabel `wallets` tanpa policy UPDATE — mutasi hanya RPC). Semua PASS; test user dibersihkan.
- ✅ **P1 Step 2 — Wallet sync flow**: `lib/validators/wallet.ts` (zod + viem `isAddress`, chainId default 84532, network guard `SUPPORTED_CHAIN_IDS`), `lib/wallets/sync.ts` (Privy token verify + RPC), `app/api/wallets/sync/route.ts`. 5 unit test. E2E vs dev server (cookie `sb-<ref>-auth-token=base64-...`): 401 tanpa cookie, 200 + primary terdaftar, chainId=1 → 400 `UNSUPPORTED_NETWORK`, address invalid → 400 `INVALID_INPUT`, external wallet OK, duplikat upsert OK.
- ✅ **P1 Step 3a — Migration 0004 RBAC**: `memberships` + `join_requests` + RLS + helper `private.is_member` (di-fix: schema `private` dibuat, grant execute `is_member` ke `authenticated` tapi revoke dari PUBLIC/anon/service_role — tanpanya policy error "permission denied for function is_member"). RLS verified (member lihat list member, non-member 0, INSERT membership 403, PATCH deny 204/state tak berubah).
- ✅ **P1 Step 3b — RBAC server flow**: migration `0005_rbac_server_flow.sql` (helper `private.member_role`/`can_assign_role`/`has_role` + RPC `request_join`/`approve_join`/`reject_join`/`cancel_join`/`leave_warehouse`/`remove_member`). Test alur lengkap PASS (request→approve, duplikat ditolak, owner tak bisa leave, manager tak bisa assign MANAGER, remove owner diblokir, cancel). Edge case: `remove_member` cancel request berstatus `approved`; `request_join` reactivate `rejected`/`cancelled`. Route Handler `app/api/warehouses/membership/route.ts` + `lib/validators/membership.ts` + test. E2E HTTP 7/7 PASS.
- ✅ **P1 Step 4 — Inventory Core**: migration `0006_inventory_core.sql` terpasang (`products`, `inventory_balances`, `stock_movements`, trigger unit-immutable, RLS member-read + insert/update produk STAFF+, index SKU unik/version/idempotency, Realtime). RPC `apply_stock_movement` (row lock + optimistic version + permission matrix sisi DB), `approve_stock_adjustment`, `reject_stock_adjustment`. **Bug idempotency ditemukan & diperbaiki**: `row_var is not null` false pada composite sebagian NULL → ganti `FOUND`; duplikat key kini 200 `IDEMPOTENT`. Route Handler `app/api/warehouses/inventory/products/route.ts` + `movements/route.ts` + `lib/validators/inventory.ts` + test. **Bug kedua**: `getRole` `.maybeSingle()` gagal karena policy `memberships_select_member` mengembalikan semua member → filter `user_id`. Test RPC 15/15 + E2E HTTP 13/13 PASS (401/403/201/200/409, balance 107 v2, unit immutable, outsider 0 baris).
- ▶ **Berikutnya**: P1 Create Warehouse backend SELESAI (migration 0010+0011 live, E2E smoke 5/5 PASS via route asli) + **UI Create Warehouse DIBANGUN** (Progres v08) — tinggal test manual interaktif di browser; lanjut **UI Join Warehouse** (backend siap dari Step 3b, tinggal wire ke `request_join`) dengan urutan skill yang sama. (Pembersihan secret terpapar + verifikasi QStash di produksi tetap tersisa non-blocking.)
- **Validasi saat ini**: `vitest run` (tanpa env-file) 131 PASS / 14 skip di 24 file; dengan `.env.local` live contract tests berjalan (1 pre-existing FAIL `custom-auth.test.ts` — env-dependence desainnya, bukan regresi). Typecheck 0, lint 0, build exit 0. Test user E2E dibersihkan.

### Progres v06 — P1 Step 5: Proof Pipeline Async (2026-08-16)

Migration `supabase/migrations/0009_proof_pipeline.sql` (di-apply live, diverifikasi) + implementasi nyata `lib/proof/`:

- ✅ **Skema proof**: `proofs` (payload jsonb immutable, `payload_version`, `payload_hash`, status lifecycle `pending→leased→submitted→confirming→confirmed|manual_review`), `proof_outbox` (status/lease/attempt), `audit_logs`. RLS: `proofs` SELECT member; `audit_logs` SELECT OWNER/MANAGER; `proof_outbox` TANPA policy (server-only). Semua RPC `proof_lease/complete/requeue/mark_manual/set_confirmation/republish/reconcile_candidates` revoke dari `public`/`anon`/`authenticated`, grant **hanya** `service_role`. `apply_stock_movement` (13-arg, `p_movement_id`/`p_proof_payload`/`p_proof_payload_hash`) dan `approve_stock_adjustment` (uuid, jsonb, text) membuat baris proof+outbox DALAM TRANSAKSI yang sama; PostgREST resolve panggilan 10-arg via default (diverifikasi C7 contract test). Proof `recordProof` pada approve (bukan apply) untuk adjustment.
- ✅ **Hash immutable**: payload dibangun di BFF (`buildProofPayload`, semua numeric canonical decimal string, address lowercase) → `hashProofPayload` (JCS RFC 8785 + Keccak-256) → disimpan. Processor RE-HASH dari payload tersimpan sebelum submit; mismatch → `manual_review`, TIDAK submit. **Bug ditemukan & diperbaiki**: `toCanonicalDecimal` strip trailing-zero mengkorup bagian integer (`"10"→"1"`) → strip hanya pada bagian pecahan.
- ✅ **QStash delivery**: `@upstash/qstash` + `@upstash/redis` terinstall. `publishProofJob` (dedup per proof, `retries:0`), `scheduleProofRetry` (backoff 30·2ⁿ⁻¹, ≤5 attempt → manual_review), `scheduleProofConfirmation` (delay 5/10/20/40/80s, ≤6 round). Retry bisnis dikelola DB (attempt_count), QStash dipakai sekali-lewat; reconciliation harian = safety net.
- ✅ **Processor**: `proof_lease` (atomik, duplicate-delivery safe) → re-hash → resolve actor (`payload.actorWallet` fallback `warehouses.on_chain_owner_wallet`) → treasury `recordProof` (viem walletClient, `proofIdToBytes32` = keccak(uuid), timestamp dari `occurredAt`) → `proof_complete(submitted)` + schedule confirm; failure → `proof_requeue` + `scheduleProofRetry`.
- ✅ **Confirmation terpisah**: `confirmProof(proofId, round)` — polling `getTransactionConfirmations` sampai ≥2 → `confirmed`; reverted → `manual_review`; di bawah 2 → `confirming` + schedule round berikutnya; melewati `CONFIRM_MAX_ROUNDS` → `manual_review`.
- ✅ **Reconciliation**: `proof_reconcile_candidates()` (republish failed-expired / orphan tanpa outbox / confirm macet) + `reconcileProofs()` (republish/insert outbox/publish, re-schedule confirm dengan dedup unik). Vercel Cron `0 4 * * *` → `/api/internal/proofs/reconcile`.
- ✅ **Auth internal**: `verifySignatureAppRouter` (wrapper Next.js resmi, clone request body) untuk process/confirm (403 tanpa signature valid); reconcile menerima Vercel Cron `CRON_SECRET` (constant-time `timingSafeEqual`) ATAU signature QStash (`Receiver`).
- ✅ **Route movement**: build payload+hash hanya bila warehouse ter-deploy (`contract_address`), RPC 13-arg, publish QStash SETELAH commit (hanya movement baru, bukan idempotent), respons `proofPending` jujur dari baris proof.
- ✅ **Unit test**: `payload.test` (canonical decimal + payload builder), `processor.test` (10 — lease no-op, hash mismatch no-submit, submit+complete+confirm-schedule, actor fallback, retry backoff, max-attempt manual, no-txhash manual), `confirmation.test` (9), `reconcile.test` (6), `verify-request.test` (7). Total `lib/proof/` 56 PASS; typecheck/lint/build hijau.
- ✅ **E2E live on-chain (`lib/proof/proof-pipeline.contract.test.ts`, env-gated, PASS 2×)**: user auth nyata → warehouse ter-deploy (`0xdF9cA75707f6109d447dA0eE943Ef09733da2926`, P0) + produk → `apply_stock_movement` 13-arg via PostgREST (session JWT, RLS aktif) → movement+`proofs`+`proof_outbox` DIBUAT SATU TRANSAKSI (`proof_pending=true`) → QStash publish (skip lokal: loopback ditolak QStash) → `processProof` (re-hash cocok → submit treasury `recordProof`) → verifikasi ON-CHAIN `isProofRecorded=true` (polling sampai tx mined) → `confirmProof` polling → 2 confirmations → status `confirmed`. Bukti on-chain:
  - tx `0xb35b0a47d5db433331e5bccb4dec367589aaae89c84a272683100a831e2ec5e1` → https://sepolia.basescan.org/tx/0xb35b0a47d5db433331e5bccb4dec367589aaae89c84a272683100a831e2ec5e1
  - tx `0x511359341ebc144809a29fe6450d5f8d31d69974c894c3348aea23b24379b55c` → https://sepolia.basescan.org/tx/0x511359341ebc144809a29fe6450d5f8d31d69974c894c3348aea23b24379b55c
  - (trial pertama tx `0x7a0a56bac5fcb56bd87cf506b9dd2beb76fdb38864678cf88a4ee0328c9a217d`)
- ✅ **Jalur QStash SIGNATURE ASLI terverifikasi** (`lib/proof/proof-pipeline.qstash-delivery.test.ts` — test tunggal-tunnel dipertahankan; validasi awal via 2 quick tunnel + echo server, kemudian **dikonfirmasi resmi** lewat dashboard Upstash → QStash → Logs: 9 delivery semua `Delivered` ke `/api/internal/proofs/process` & `/confirm`, response 864ms–6s). Bukti validasi:
  - **Signature asli ditangkap & di-decode** (saat validasi awal): JWT `iss=Upstash`, klaim `body`=SHA-256 → QStash menandatangani body dengan JWT asli.
  - **Signature asli + body SAMA** → endpoint nyata 200. **Signature asli + body DI-TAMPER** → 403 (body-hash mismatch). **Palsu** (tanpa signature / `v1=deadbeef`) → 403.
  - **Pipeline penuh via callback QStash asli** (bukan invoke langsung): publish → tunnel-app → `verifySignatureAppRouter` → submit on-chain → `submitted`+tx_hash → `isProofRecorded=true` → job konfirmasi asli → `confirmed`. Bukti on-chain:
    - tx `0x02ebdd0943db16dbfc3f5ee3fe842be32cbd23e4af8d41a39e9ff8ed19a3f265` → https://sepolia.basescan.org/tx/0x02ebdd0943db16dbfc3f5ee3fe842be32cbd23e4af8d41a39e9ff8ed19a3f265
  - Log dev server: `POST /api/internal/proofs/process 200` → `proof submitted on-chain`; `POST /api/internal/proofs/confirm 200` → `proof confirmed on-chain`.
- ✅ **Hardening dari validasi ini**: `verifySignatureAppRouter` SDK melempar `SignatureError` (body tampered / signature sampah) yang bocor jadi HTTP 500 → wrapper `verifyQStashAppRouter` (`lib/proof/verify-request.ts`) mengubah semua jalur gagal verifikasi → 403 fail-closed; dipakai di route process & confirm. `verifyQStashSignature` (reconcile) selaras dengan kontrak SDK (tanpa `url`).
- ✅ **Cleanup pasca-validasi**: semua proses cloudflared dimatikan (tidak ada listener 3000/3001); QStash diperiksa via API — `/v2/schedules` `[]`, `/v2/topics` `[]`, tidak ada endpoint (v2 tanpa `/v2/endpoints`) → tidak ada subscription/endpoint yang menunjuk URL trycloudflare; kode echo server, polling `GET /v2/messages/{id}` (asumsi `state` salah), dan `decodeJwtPayload` **dihapus** dari repo — test `qstash-delivery` kini versi tunggal-tunnel tanpa echo server; verifikasi grep bersih.
- ✅ **Perbaikan nyata dari E2E**: `TREASURY_PRIVATE_KEY` tanpa prefix `0x` ditolak viem → normalisasi di `treasury.ts`; `toCanonicalDecimal` korup integer (`"10"→"1"`) → strip trailing-nol hanya pada pecahan; kegagalan schedule QStash tidak boleh memutus state machine DB (reconciliation = safety net) → try/catch di processor/confirmation.
- ⏳ **Tersisa** (non-blocking): rotasi secret yang sempat terpapar di chat (`QSTASH_CURRENT_SIGNING_KEY`/`NEXT`, `UPSTASH_REDIS_REST_TOKEN`, Management API token) — ditangani pemilik di luar sesi ini; verifikasi ulang delivery di produksi (domain publik Vercel) — mekanisme signature & callback sudah terbukti setara via tunnel.

### Progres v07 — P1 Create Warehouse backend + E2E smoke via route asli (2026-08-16)

- ✅ **Migration `0010_warehouse_create_flow.sql`** (di-apply live via Management API, diverifikasi): 3 fungsi SECURITY DEFINER — `create_warehouse_and_deployment` (12-arg: validasi owner+code, lock global anti-race, row lock per owner, insert `warehouses` pending + `warehouse_deployments` submitted + membership OWNER + audit, satu transaksi; return `created_warehouse_id`/`created_deployment_id`), `update_warehouse_deployment_status` (state machine + verifier + rekonsiliasi), `rollback_warehouse_creation`. Realtime publish `warehouse_deployments`.
- ✅ **Route `POST /api/warehouses/create`** (prepare→submit dua tahap, EIP-712): `prepare` = cek owner (409 bila sudah punya warehouse aktif), baca nonce live on-chain, idempotencyKey; `submit` = validasi signature EIP-712, relay treasury ke Factory (bila sudah mined → finalisasi), finalisasi status; resubmit idempotent aman (satu deployment per key). Pemegang: EOA via Privy (custom JWT + wallet sign); treasury relay.
- ✅ **Bug nyata ditangkap E2E & diperbaiki**:
  - RPC error `column reference "warehouse_id" is ambiguous` (OUT param bentrok kolom INSERT) → output di-rename `created_*` (+ `drop function` karena return type berubah).
  - `contract_address` tetap null di DB: trigger `enforce_warehouse_identity_immutable` (0007) memblokir update kolom identitas via Data API untuk role `authenticated` → migration `0011_warehouse_create_fixes.sql`: trigger di-relax dengan GUC transaksi-lokal `app.allow_identity_write` (hanya di-set fungsi SECURITY DEFINER server flow) + RPC baru `set_warehouse_contract_address` (SECURITY DEFINER, owner-check) → route memanggil RPC (bukan table update langsung).
- ✅ **E2E smoke `lib/warehouses/create.smoke.test.ts` (5/5 PASS, opt-in `CREATE_SMOKE_RUN=1`, route ASLI + Base Sepolia nyata)**: user auth baru + wallet EOA (`0x3426E090d7F232637355eF5Dd0f533d9c01C96fA`) → `prepare` → sign EIP-712 (EOA test) → `submit` via relay → Factory deploy → **status `confirmed`**; `warehouses.contract_address` (`0x721e6ec587a49b2f977431dc253250366b5df11a`) **SAMA** dengan `activeWarehouse(owner)` on-chain (MATCH: true, polling anti-RPC-lag); create kedua owner sama → **409 CONFLICT** (bukan 500); resubmit idempotent → tx sama, 1 deployment.
  - tx `0x9745008efe688ff6ac84c0210a3dc7904be9dfabaa6ebd172d5021af0fdf4274` → https://sepolia.basescan.org/tx/0x9745008efe688ff6ac84c0210a3dc7904be9dfabaa6ebd172d5021af0fdf4274
  - warehouse `0x721e6ec587a49b2f977431dc253250366b5df11a` → https://sepolia.basescan.org/address/0x721e6ec587a49b2f977431dc253250366b5df11a
  - (run pengembangan #1/#2 dengan EOA acak dibersihkan dari DB; warehouse wallet uji dibiarkan sebagai bukti on-chain)
- ✅ **Validasi**: typecheck 0, lint 0, suite `vitest run` 131 PASS / 14 skip di 24 file.

### Progres v08 — UI Create Warehouse (DESIGN §27–28, 2026-08-16)

- ✅ **Halaman `/onboarding/create`** diwujudkan (sebelumnya placeholder): form Warehouse Name + Company/PT Name (opsional) + Warehouse Type (Select), di dalam kartu auth; Warehouse Code & contract address **auto-generated** (server) — user tidak input manual.
- ✅ **Deployment UX §28**: stepper vertikal 5 langkah (Preparing warehouse → Authorization signed → Deployment submitted → Waiting for confirmation → Finalizing warehouse) dengan state jujur pending/active(spinner)/done(check); hint membedakan tahap "menunggu signature wallet" vs "menunggu konfirmasi on-chain"; live region screen-reader (`aria-live`), `aria-current="step"`.
- ✅ **Sign EIP-712 via Privy**: `useSignTypedData` (embedded wallet, `address` = primary wallet dari `prepare`) atau `eth_signTypedData_v4` via provider untuk wallet eksternal; best-effort switch chain ke 84532; payload di-echo persis dari response `prepare`.
- ✅ **Error handling**: 409 "already have an active warehouse" → panel jelas + tombol dashboard (bukan bug); authorization expired/stale → auto re-prepare + tanda tangan ulang (1×); kegagalan lain → **"Warehouse deployment failed. No warehouse was created. [Try Again]"** (§28); 401 → redirect login; submit async (202) → polling idempotent hingga `confirmed` (timeout polling → panel "Deployment is still confirming" + dashboard).
- ✅ **Komponen**: `components/warehouses/create-warehouse-form.tsx`, `deployment-steps.tsx`, helper `lib/warehouses/create-client.ts` (+ 5 unit test). Dashboard empty state "Create Warehouse" di-repoint ke `/onboarding/create`.
- ✅ **Validasi**: typecheck 0, lint 0, build OK, suite `vitest run` 136 PASS / 14 skip di 25 file; halaman terverifikasi tersaji 200 via dev server (SSR shell + gate sign-in + footer). ⏳ **Alur interaktif (login Privy + tanda tangan wallet + deploy) menunggu test manual di browser.**

### Progres v05 — Hardening Arsitektur (grill-me 2026-08-15, blockers sebelum Step 5)

Architecture review (laporan `architecture-review-*.html`) menemukan 7 deepening opportunities. User menetapkan **dua blocker** yang wajib beres SEBELUM Step 5 dimulai, plus urutan kerja sisanya. Status per candidate:

- ✅ **C1 — Route-handler seam collapse**: `lib/api-handler.ts` (parse→auth→role→permission→dispatch + error→HTTP terpusat: `rpcErrorStatus(error_code)` + satu regex fallback `fromPostgrestError`, bukan regex per-handler); refactor 4 handler (`wallets/sync`, `warehouses/membership`, `inventory/products`, `inventory/movements`) jadi tipis; `proofPending` frozen TIDAK lagi diekspos di response movements (parsial C4). Typecheck/lint/build hijau.
- ✅ **C2 — Permission matrix TS vs SQL (BLOCKER, drift reject-join sudah ditemukan)**: SQL security-definer `private.can_assign_role` = satu-satunya sumber kebenaran. `reject_join` yang hardcode `private.has_role(... 'OWNER') OR has_role(... 'MANAGER')` diganti helper `private.can_manage_join_requests(...)` yang TURUN DARI `can_assign_role` (bukan list role hardcode) → konsisten dengan `JOIN_REQUEST_APPROVE` TS. RBAC **contract test** live (TS vs SQL 25 kombinasi + behavior, 29/29) + Vitest env-gated `lib/auth/rbac-contract.test.ts`. Detail akibat drift di §7.14. *(migration 0008)*
- ✅ **C4 — Proof pipeline seam (BLOCKER)**: `proofPending` frozen `false` TIDAK lagi diekspos di response movements route. Modul `lib/proof/` dibangun: `jcs.ts` (RFC 8785, test vector RFC), `hash.ts` (Keccak-256, `hash_version=1`), `types.ts`/`pipeline.ts`/`mock.ts` (seam outbox→submit→confirm mockable). 17 unit test PASS. *(persiapan Step 5 — adaptor QStash/treasury nyata menyusul)*
- ✅ **C3 — Wallet sync pipeline**: `useWalletSync` hook (`lib/wallets/use-wallet-sync.ts`, "use client") benar-benar memanggil `/api/wallets/sync` saat wallet berubah (state syncing/synced/error, dedupe via ref); verifier Privy fail-closed (tanpa token → `PRIVY_VERIFICATION_FAILED`, bukan warning) dan dibuat injectable adapter (`PrivyVerifier` param di `syncWallet`). `lib/wallets/sync-client.ts` murni (`parseCaip2ChainId` CAIP-2→number, `walletToSyncBody` yang lowercase address, `syncWallets` dedupe `skip`). 16 unit test (sync 6 + sync-client 10). Konsekuensi: E2E lama tanpa token kini 401 (intended).
- ✅ **C5 — Dead auth abstractions**: `lib/auth/session.ts` dihapus (`getCurrentUser`/`isAuthenticated` digantikan `requireUser` di api-handler); `isAtLeast`/`ROLE_RANK` mati dihapus dari permissions.ts; daftar protected route = satu sumber `lib/routes.ts` (dipakai middleware; matcher `proxy.ts` tetap literal karena Next static-parse `config`, dijaga sinkron oleh test `lib/routes.test.ts`).
- ✅ **C6 — Wallet address validation**: `lib/validators/address.ts` = satu `addressSchema` bersama (`isAddress` + lowercase deterministik via `.transform`) dipakai wallet sync (`lib/validators/wallet.ts`) dan movement (`actorWallet` via `emptyToNullAddressSchema`, "" → null). Konsisten dengan RPC `register_wallet` (`lower(p_address)`) dan perbandingan on-chain. 8 unit test. Assert RPC `p_address` di `sync.test.ts` dikoreksi ke lowercase.
- ✅ **C7 — Migration 0007 vs 0006**: audit: 0007 memakai `create or replace` untuk `apply_stock_movement` + `approve_stock_adjustment` → supersede 0006 untuk body fungsi (bukan additive). `reject_stock_adjustment` tidak disentuh (konsisten). **Behaviour contract test permanen** `lib/inventory/apply-stock-movement.contract.test.ts` (env-gated: `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` + `SUPABASE_PUBLISHABLE_KEY`) menjalankan 15 asersi terhadap DB LIVE lewat jalur runtime (PostgREST + JWT user session, RLS aktif): RBAC per tipe movement (outsider FORBIDDEN, VIEWER ditolak, STAFF boleh stock_in/out tapi tidak adjustment, OWNER adjustment), optimistic lock STALE_STOCK, INSUFFICIENT_STOCK, idempotency IDEMPOTENT (movement sama), reversal + over-reversal INVALID_REVERSAL, status pending_approval untuk adjustment, INVALID_INPUT, NOT_FOUND. PASS live.

**Gate menuju Step 5**: ✅ HIJAU — seluruh candidate 1–7 selesai & tervalidasi (typecheck/lint/test/build hijau + RBAC contract test `lib/auth/rbac-contract.test.ts` + behaviour contract test `lib/inventory/apply-stock-movement.contract.test.ts`).

> **Catatan kredensial (2026-08-16)**: Management API token dirotasi → `sbp_…` baru (valid, `rbac-contract.test.ts` PASS live). QStash/Upstash kredensial telah tersedia & terpasang di `.env.local`. ⚠️ Karena kredensial sempat terpapar di chat, **wajib rotasi** `QSTASH_CURRENT_SIGNING_KEY`/`QSTASH_NEXT_SIGNING_KEY`, `UPSTASH_REDIS_REST_TOKEN`, dan Management API token — dijadwalkan setelah E2E Step 5 selesai (2026-08-16).

---

## Progres Singkat (konteks dari Execution 02)

- ✅ P0 Supabase Foundation SELESAI: project `yxsieqqiksqckfrqozlb`, JWKS ES256 aktif, migration 0001 (users+RLS) + 0002 (Realtime) terpasang & teruji, health/keep-alive terverifikasi dengan kredensial nyata.
- ✅ P0 Blockchain Foundation SELESAI: Factory `0x5e44f80585Ec50CBB64a76b3ffD099A156502e10` + Warehouse ter-deploy, 26/26 Forge test, smoke E2E on-chain pass, **source terverifikasi di BaseScan** (Factory + Warehouse, "already verified"). Registry `contracts/deployments/base-sepolia.json` terisi.
- ▶ **P1 dimulai setelah rencana ini di-review & di-approve user.**

---

## 1. Kondisi Repo Saat Ini

- Next.js 16.3.0 + TS strict + Tailwind v4 + shadcn/base-nova, pnpm, App Router, Turbopack.
- Auth foundation ada: Supabase email/password login+signup (`app/actions/auth.ts`), `lib/supabase/*` (client/server/middleware, publishable/secret 2026), `lib/auth/session.ts`, RBAC `lib/auth/permissions.ts` (+ `canAssignRole`, 10 test).
- Privy = **stub** (`lib/privy/custom-auth.ts` — throws "belum diimplementasi"; `isPrivyConfigured()` cek env).
- Blockchain: `lib/blockchain/chains.ts` (viem fallback RPC), `lib/blockchain/contracts.ts` (registry loader, fail-fast, test 1).
- Onboarding routes ada (page/create/join) tapi form Create/Join Warehouse masih placeholder (P1).
- Dashboard routes ada sebagai placeholder: inventory/products, inventory/movements, members, transactions, blockchain, analytics, notifications, settings.
- `lib/validators/auth.ts` ada; belum ada validator untuk produk/membership/join/proof.
- Validasi terkini: typecheck 0, lint 0, test 11/11 (Vitest) + 26/26 (Forge), build 25 routes — hijau.

## 2. Dokumentasi yang Dibaca Ulang

- `PRD.md` §5–§16 (auth, create warehouse, membership, inventory, proof), §19 (wallet ownership), §22 (audit log), §31–§38 (anti-abuse, proof lifecycle), §44–§45 (high-risk confirmation, SKU unique).
- `ARSITEKTUR.md` §1–§7 (arsitektur, data model, contract flow, proof pipeline async, rate limiting, developer console).
- `TECHSTACK.md` §1–§2 (JCS+Keccak, Privy custom-auth), §6 (fail-closed/fail-open).
- `WORKFLOW.md` §3 (apply_stock_movement), §6 (proof pipeline), §5 (contract flow).
- `DESIGN.md` §25 (auth flow), §26 (onboarding), §28/§38/§40/§54/§58/§64/§73 (UX states).
- `AGENT.md` — invariant: v1 immutable, treasury bukan owner, nonce/idempotency, RLS defense-in-depth, unit immutable, proof idempotent.
- `TODO.md` P1 — Identity/Wallet, Membership/RBAC, Product/Inventory Core, Proof Pipeline Async.
- `supabase/migrations/0001`, `0002` — skema yang sudah terpasang (jangan konflik).

## 3. Konflik/Penyelarasan yang Ditemukan

1. **Privy = wallet layer, bukan identity**: Supabase Auth tetap identitas utama; Privy hanya embedded/external wallet via custom-auth dari sesi Supabase (TECHSTACK §2). Stub `custom-auth.ts` diganti implementasi asli.
2. **Ownership transfer on-chain via Proof Job Processor** (async), bukan Route Handler: wallet lama otorisasi → tx on-chain confirmed → `warehouse.on_chain_owner_wallet` + `wallets.is_primary` diperbarui atomik (ARSITEKTUR §4.4, §5).
3. **`idempotencyKey` ≠ `deploymentNonce`**: idempotencyKey DB (TTL 24 jam) untuk dedup request; deploymentNonce on-chain untuk replay protection. Tidak pernah satu field (PRD §7.5, Invariant D).
4. **Proof hash = JCS RFC 8785 + Keccak-256**, semua numeric jadi canonical decimal string (`BigInt`, tanpa scientific notation). `hash_version = 1`; old hash tidak pernah diinterpretasi ulang (PRD §16).
5. **Trigger unit immutability = enforcement final**; Route Handler hanya validasi UX awal (ARSITEKTUR §4.3, TODO P1).
6. **Semua mutation sensitif lewat `apply_stock_movement` RPC**; browser/Route Handler dilarang raw INSERT/UPDATE ke `inventory_balances`/`stock_movements`/`proofs`/`proof_outbox` (AGENT §4).
7. **RBAC**: seluruh assign/approve/remove role wajib `canAssignRole` (sudah ada + test) — bukan `hasPermission` saja (Temuan 2 v03).
8. **Developer Console = allowlist env**, bukan role Owner (ARSITEKTUR §7.4).
9. **Skema tabel P1 belum terdefinisi lengkap di docs** → bagian §7 menetapkan keputusan skema konkret untuk disetujui user (kolom/status/enum).

## 4. Skill yang Dipakai dan Alasannya

| Skill | Alasan |
|---|---|
| `supabase` | Migration baru (wallets/warehouses/memberships/products/inventory/proof), RLS policies, RPC `apply_stock_movement`, Realtime, auth providers. |
| `supabase-postgres-best-practices` | Trigger unit immutability, row lock + conditional update, NUMERIC(24,3), index, RPC function authoring yang benar. |
| `brainstorming` | Kepatuhan alur kerja: rencana disepakati sebelum implementasi. |
| `shadcn` | Form/komponen UI P1 (login/wallet/join/movement) sesuai design system yang ada. |

## 5. Architecture yang Akan Dipakai

```
Browser ──Supabase session──▶ Next.js (Proxy + Route Handler + Server Actions)
         │                         │
         ├─ Privy custom-auth ─────┤ (token tukar dari sesi Supabase → embedded/external wallet)
         │                         │
         ▼                         ▼
  Privy Wallet (Base Sepolia)   Supabase (Auth + Postgres + RLS + RPC + Realtime)
                                    │
                                    ├─ Proof Pipeline Async ──▶ QStash ──▶ Proof Job Processor
                                    │                              │
                                    └─ Treasury signer (viem) ─────┘ → Factory/Warehouse (Base Sepolia)
```

- **P1 Identity/Wallet**: Supabase auth (email + Google via dashboard) → sesi → Privy custom-auth → embedded wallet otomatis + external wallet opsional → network guard Base Sepolia (84532). Tabel `wallets` (riwayat + satu primary). Create warehouse: backend validasi → baca `deploymentNonce` on-chain → EIP-712 → user sign via Privy → treasury relay → Factory deploy → `warehouses` + `warehouse_deployments` tercatat.
- **P1 Membership/RBAC**: `memberships` + `join_requests`; join by warehouse code; approve/reject via `canAssignRole`; leave/remove; suspend/reactivate; audit log append-only.
- **P1 Inventory Core**: `products`/`inventory_balances`/`stock_movements`; SKU unique per warehouse; NUMERIC(24,3); trigger unit immutability; RPC `apply_stock_movement` (row lock, expected version, INSUFFICIENT_STOCK/STALE_STOCK); Stock In/Out/Adjustment/Reversal; low-stock alert; archive.
- **P1 Proof Pipeline Async**: `proofs` + `proof_outbox`; payload immutable + `hash_version=1`; JCS RFC 8785 + Keccak-256 (numeric → canonical decimal string); proof+outbox dalam transaksi yang sama dengan movement; QStash publish setelah DB commit; signature verification; job lease + duplicate-delivery safety; re-hash sebelum submit (mismatch → manual_review); submit dengan treasury signer; confirmation job (2 confirmations); retry max 5 exponential; reconciliation harian.

## 6. Scope Eksekusi 03 (Urutan Wajib — Ikut TODO P1)

1. **P1 Identity/Wallet** — Privy asli, tabel `wallets`, satu primary, network guard, ownership transfer, `warehouses`+`warehouse_deployments`, create warehouse (EIP-712 relay), Developer Console allowlist.
2. **P1 Membership/RBAC** — `memberships`, `join_requests`, join by code, approve/reject, escalation ban via `canAssignRole`, leave/remove, suspend, audit log.
3. **P1 Inventory Core** — `products`, `inventory_balances`, `stock_movements`, trigger unit, RPC `apply_stock_movement`, In/Out/Adjustment/Reversal, low-stock, archive.
4. **P1 Proof Pipeline Async** — `proofs`, `proof_outbox`, JCS+Keccak payload, QStash, job processor, submit treasury, confirmation, retry, reconciliation.
5. **(Opsional, tergantung prioritas user)** UI form Create/Join Warehouse + halaman dashboard dasar yang menghubungkan langkah 1–4 (inventory/members/transactions). Full UI P2 tetap di scope P2.

> Catatan: Setiap langkah berakhir dengan typecheck/lint/test/build hijau + migration terpasang & terverifikasi sebelum lanjut ke langkah berikutnya.

## 7. Keputusan Skema (UNTUK DISETUJUI USER — docs tidak merinci)

> Semua tabel P1 mengikuti aturan RLS defense-in-depth: RLS aktif, policy `TO authenticated` + predicate ownership, GRANT eksplisit. Numeric = `NUMERIC(24,3)`. Timestamp = `timestamptz`. ID = `uuid default gen_random_uuid()`.

### 7.1 `wallets`
- `id uuid pk`, `user_id uuid not null references public.users(id) on delete cascade`, `address text not null`, `wallet_type text not null check ('embedded'|'external')`, `is_primary boolean not null default false`, `verification_state text not null default 'unverified'` (`'unverified'|'verified'`), `verified_at timestamptz`, `created_at`, `updated_at`.
- Unique `(user_id, address)`; **satu primary per user** via partial unique index `unique (user_id) where is_primary`.
- RLS: pemilik (`user_id = auth.uid()`) bisa SELECT; mutasi hanya lewat server flow (verify/transfer).

### 7.2 `warehouses`
- `id uuid pk`, `warehouse_code text not null unique` (auto-generated, non-predictable, e.g. `CHV-XXXXXXXX`), `name text not null`, `company_name text`, `warehouse_type text`, `owner_user_id uuid not null references public.users(id)`, `on_chain_owner_wallet text not null` (address **wallet owner** yang tercatat di kontrak — bukan alamat kontrak), `contract_address text` (alamat kontrak warehouse), `status text not null default 'active' check ('active'|'suspended')`, `created_at`, `suspended_at`, `updated_at`.
- Satu aktif per user (off-chain) via partial unique `unique (owner_user_id) where status = 'active'`; on-chain enforcement tetap via Factory.
- RLS: member/pemilik bisa SELECT; mutasi via server.

### 7.3 `warehouse_deployments`
- `id uuid pk`, `warehouse_id uuid references warehouses(id)`, `factory_address text not null`, `chain_id int not null`, `owner_address text not null`, `warehouse_code_hash bytea/hex text not null`, `deployment_nonce bigint not null`, `expiry bigint not null`, `signature bytes text not null`, `status text not null default 'pending'` (`'pending'|'submitting'|'submitted'|'confirmed'|'failed'`), `tx_hash text`, `error text`, `idempotency_key text unique not null`, `created_at`, `updated_at`.
- Idempotency: `idempotency_key` unique + TTL 24 jam (di-purge job atau filter created_at).

### 7.4 `memberships`
- `id uuid pk`, `warehouse_id uuid not null references warehouses(id) on delete cascade`, `user_id uuid not null references public.users(id) on delete cascade`, `role text not null` (OWNER/MANAGER/STAFF/AUDITOR/VIEWER), `status text not null default 'active'` (PENDING|ACTIVE|SUSPENDED — konsisten `MEMBERSHIP_STATUS`), `joined_at timestamptz`, `created_at`, `updated_at`.
- Unique `(warehouse_id, user_id)`.

### 7.5 `join_requests`
- `id uuid pk`, `warehouse_id uuid not null references warehouses(id) on delete cascade`, `user_id uuid not null references public.users(id) on delete cascade`, `status text not null default 'pending'` (`'pending'|'approved'|'rejected'|'cancelled'`), `role text` (NULL saat pending; diisi saat approve sesuai matrix), `decided_by uuid references public.users(id)`, `decided_at timestamptz`, `reason text`, `created_at`, `updated_at`.
- Unique `(warehouse_id, user_id)` untuk menghindari join ganda.

### 7.6 `products`
- `id uuid pk`, `warehouse_id uuid not null references warehouses(id) on delete cascade`, `sku text not null`, `name text not null`, `category text`, `unit text not null`, `low_stock_threshold numeric(24,3) not null default 0`, `status text not null default 'active'` (`'active'|'archived'`), `created_at`, `updated_at`.
- **Unique (warehouse_id, sku)** — SKU unique per warehouse.
- Trigger: unit immutable setelah movement pertama.

### 7.7 `inventory_balances`
- `id uuid pk`, `warehouse_id uuid not null references warehouses(id) on delete cascade`, `product_id uuid not null references products(id) on delete cascade`, `quantity numeric(24,3) not null default 0`, `version bigint not null default 0`, `updated_at timestamptz`, `updated_by uuid references public.users(id)`.
- Unique `(warehouse_id, product_id)`. Hanya diubah via RPC.

### 7.8 `stock_movements` (ledger append-only)
- `id uuid pk`, `warehouse_id uuid not null`, `product_id uuid not null references products(id)`, `movement_type text not null check ('stock_in'|'stock_out'|'adjustment'|'reversal')`, `quantity numeric(24,3) not null`, `actor_user_id uuid references public.users(id)`, `actor_wallet text`, `role_at_time text`, `reason text`, `reference text`, `reversal_of uuid references stock_movements(id)`, `status text not null default 'committed'` (`'pending_approval'|'committed'|'rejected'`), `approved_by uuid references public.users(id)`, `approved_at timestamptz`, `expected_balance_version bigint`, `created_at`.
- **Tidak ada UPDATE/DELETE dari UI**; koreksi = movement baru.

### 7.9 `proofs`
- `id uuid pk`, `warehouse_id uuid not null`, `warehouse_address text not null`, `movement_id uuid references stock_movements(id)`, `payload jsonb not null` (immutable), `payload_version int not null default 1`, `payload_hash text not null` (0x-hex Keccak-256), `status text not null default 'pending'` (`'pending'|'submitted'|'confirming'|'confirmed'|'retrying'|'manual_review'|'failed'`), `tx_hash text`, `confirmation_count int not null default 0`, `attempt_count int not null default 0`, `error text`, `created_at`, `updated_at`.
- `payload_hash` unique.

### 7.10 `proof_outbox`
- `id uuid pk`, `proof_id uuid not null references proofs(id) on delete cascade`, `status text not null default 'pending'` (`'pending'|'leased'|'sent'|'failed'`), `lease_expires_at timestamptz`, `lease_token text`, `attempt_count int not null default 0`, `next_attempt_at timestamptz`, `created_at`, `updated_at`.

### 7.11 `audit_logs`
- `id uuid pk`, `warehouse_id uuid references warehouses(id)`, `actor_user_id uuid references public.users(id)`, `action text not null`, `entity text not null`, `entity_id text`, `before_state jsonb`, `after_state jsonb`, `related_tx_hash text`, `status text`, `created_at timestamptz`.
- Append-only dari normal UI (PRD §22). RLS: OWNER/MANAGER read; INSERT via trigger/RPC (bukan client).

### 7.12 RPC `apply_stock_movement`
- Signature (usulan): `apply_stock_movement(p_warehouse_id uuid, p_product_id uuid, p_movement_type text, p_quantity numeric, p_expected_balance_version bigint, p_reason text, p_reference text, p_reversal_of uuid, p_idempotency_key text, p_actor_wallet text) returns table (movement_id uuid, balance_version bigint, proof_pending boolean, error_code text, message text)`.
- Logika: validasi role (via `memberships` + `canAssignRole` matrix sisi DB) → `SELECT ... FOR UPDATE` produk+balance → cek version (STALE_STOCK) → cek stok cukup (INSUFFICIENT_STOCK) → tulis movement → update balance/version → audit log → buat proof + outbox (payload JCS+hash) → commit satu transaksi.

### 7.13 Schema Hardening (grill-me 2026-08-15 → migration 0007, SUDAH TERAPAN)
Keputusan user atas temuan review skema (T1–T6). Semua terverifikasi live (verify-0007 7/7, harden-rpc E2E 18/18, regresi suite lama tetap lulus):

- **T1 (approve_stock_adjustment race)**: `approve_stock_adjustment` kini `SELECT ... FOR UPDATE` pada movement SELALU, lalu conditional `UPDATE ... WHERE status='pending_approval' RETURNING`; `not found` → `raise 'movement already processed'`. Double-approve paralel → yang kedua ditolak.
- **T2/T6 (reversal)**: `apply_stock_movement` cek target committed + cumulative `sum(quantity) where reversal_of=target and status='committed'`; parsial diizinkan tapi `already_reversed + quantity > original_qty` → `INVALID_REVERSAL`. Semantik qty reversal = mengurangi saldo (konsisten dgn 0006 & test legacy; korreksi keluar dibuat via stock_in baru).
- **T3 (products archive)**: trigger `products_status_role` (BEFORE UPDATE OF status) blokir perubahan status oleh role `authenticated` yg bukan MANAGER/OWNER (Route Handler tetap cek dulu; trigger = defense-in-depth). Cek pakai `auth.role()` — **jangan** `session_user`/`current_user` (Supabase selalu `authenticator`/`postgres`; `auth.role()` baca `request.jwt.claims`).
- **T4 (join_requests)**: policy `join_requests_select_admin` = SELECT pending hanya `private.member_role(warehouse_id, auth.uid()) IN ('OWNER','MANAGER')` (bukan semua member aktif).
- **T5 (warehouses identity)**: trigger `warehouses_identity_immutable` (BEFORE UPDATE) tolak perubahan `warehouse_code`/`owner_user_id`/`on_chain_owner_wallet`/`contract_address` oleh role `authenticated`; `name`/`company_name`/`warehouse_type`/`status` tetap editable owner. Kolom identitas hanya lewat fungsi security-definer (server flow / ownership transfer async).

### 7.14 RBAC drift reject-join (v05, migration 0008) — akibat konkret
Temuan: `reject_join` SQL memakai `private.has_role(... 'OWNER') OR has_role(... 'MANAGER')` (0005:252-253), sementara konsep TS-nya `JOIN_REQUEST_APPROVE` (permissions.ts) — dua mekanisme untuk satu pertanyaan "siapa boleh menolak join".

- **Akibat saat ini: TIDAK ada window escalation.** `JOIN_REQUEST_APPROVE` TS hanya dimiliki OWNER/MANAGER (MANAGER_PERMS + OWNER_PERMS), dan SQL juga hanya membolehkan OWNER/MANAGER. Setiap kombinasi role menghasilkan keputusan yang sama → tidak ada role yang bisa reject padahal seharusnya tidak. Verifikasi via RBAC contract test.
- **Risiko masa depan (alasan fix):** dua sumber kebenaran terpisah. Jika matrix berubah (mis. STAFF diberi `JOIN_REQUEST_APPROVE`), TS ikut berubah TAPI SQL `has_role` hardcode tetap kaku → reject-join menyimpang dari policy baru secara diam-diam. Kelas bug yang sama dengan escalation ban (PRD §9.2, AGENT §3) yang paling dijaga di project ini.
- **Fix:** helper `private.can_manage_join_requests(p_warehouse_id, p_user_id)` yang TURUN dari `private.can_assign_role(actor_role, 'VIEWER')` (role terendah yang bisa dikelola) — satu sumber matrix, bukan list role. `reject_join` memakainya; `approve_join` tetap `can_assign_role` langsung.
- **RBAC contract test** membandingkan hasil `can_assign_role` TS vs SQL live untuk seluruh kombinasi (5×5=25) → drift TS/SQL terdeteksi otomatis di CI.

## 8. Dependency Baru yang Diperlukan

| Paket | Alasan | Kategori |
|---|---|---|
| `@privy-io/react-auth` | PrivyProvider client + embedded/external wallet UI | runtime |
| `@privy-io/server-auth` | verifikasi custom-auth token server-side | runtime |
| `@upstash/redis` | rate limiting fail-closed, job lease | runtime |
| `@upstash/qstash` | async proof job delivery signed | runtime |
| `jcs` (RFC 8785) atau implementasi kecil sendiri | JSON canonicalization untuk payload proof | runtime (keputusan: pakai `jcs` yang teruji; fallback implementasi manual jika size constraint) |
| `viem` (sudah ada) | treasury signer submit proof, baca nonce on-chain | existing |
| CLI `supabase` (sudah ada) | migration local/CI | dev |

> Kredensial yang butuh user (Free tier): **Privy app** (`NEXT_PUBLIC_PRIVY_APP_ID` + `PRIVY_APP_SECRET`), **Upstash** (`UPSTASH_REDIS_REST_URL` + token, `QSTASH_TOKEN` + signing keys), dan **Google OAuth** di Supabase dashboard. Env baru ditambahkan ke `.env.example` (server-only) + `lib/env.ts`.

## 9. Risiko Implementasi

1. **Privy custom-auth flow kompleks**: salah langkah = wallet tak muncul. Mitigasi: implementasi bertahap (token exchange dulu → embedded wallet → external), test manual di dev server.
2. **JCS + hash konsistensi**: payload canonicalization harus identik antara BFF (buat) dan re-hash (verifikasi) → satu helper `lib/proof/jcs.ts` + `lib/proof/hash.ts` + unit test vector.
3. **`apply_stock_movement` race**: row lock + conditional update harus benar; uji concurrency via integration test (dua movement paralel).
4. **Trigger unit immutability vs RPC**: urutan movement/unit race — trigger = final; RPC lock product dulu.
5. **QStash/Redis belum tersedia di awal**: proof pipeline dikembangkan dengan mock/interface; kredensial nyata saat tiba titik itu.
6. **RPC dalam RLS**: RPC `apply_stock_movement` harus `SECURITY DEFINER` + validasi role eksplisit di dalam (jangan andalkan RLS saja); pastikan tidak ada path ekspos melalui Data API langsung.
7. **Migration bertumpuk**: 0003+ harus additive terhadap 0001/0002 yang sudah terpasang; uji expand–migrate–contract.
8. **Secret/expiry**: `PRIVY_APP_SECRET`, `QSTASH_*`, treasury key server-only; `.env.example` tanpa nilai; CI secret scan.
9. **Ownership transfer**: tx on-chain sebelum DB update (async processor); jangan pernah UI menganggap primary berganti sebelum confirmed.

## 10. Security Concern (dari awal)

- Privy secret, QStash keys, treasury key → server-only; browser tak pernah memegang private key treasury.
- RLS aktif semua tabel; `TO authenticated` + predicate ownership; mutasi sensitif hanya lewat RPC security-definer dengan role check eksplisit.
- `proof_outbox`/`proofs` tidak diekspos ke Data API browser (mutasi via server processor).
- `canAssignRole` wajib di semua assign/approve/remove (PRD §9.2).
- Proof payload immutable; re-hash sebelum submit; mismatch → manual_review (jangan kirim).
- Owner tak bisa leave sebelum transfer ownership; remove member high-risk → konfirmasi eksplisit.
- Developer Console allowlist env; secret tak pernah ditampilkan.
- Expiry nonce EIP-712 + idempotencyKey TTL; rate limit create/deploy/movement.

## 11. Testing Strategy

**Supabase (migration + RLS + RPC):**
- Migration baru terpasang ke project nyata (Management API) + diverifikasi kolom/policy/trigger/index.
- Uji RLS antar-role (OWNER/MANAGER/STAFF/VIEWER vs tabel memberships/join_requests/products/movements/proofs).
- Uji `apply_stock_movement`: stock in/out, INSUFFICIENT_STOCK, STALE_STOCK (wrong version), negative stock, reversal, adjustment pending_approval→committed.
- Uji trigger unit immutability (direct/bypass UPDATE ditolak).
- Integration test Vitest untuk membership helper & escalation ban (lanjut dari permissions.test.ts).

**Blockchain/P1 (tanpa deploy baru):**
- Wallet flow test manual di dev server (embedded wallet muncul, network guard).
- Create warehouse: relay smoke test ke Factory nyata dengan user EOA baru (jika gas cukup) atau local fork.
- Proof: unit test JCS+hash vector (RFC 8785 test cases), submit via treasury signer ke Warehouse nyata (recordProof) bila memungkinkan.

**Validasi per langkah:** typecheck 0, lint 0, test hijau, build exit 0. Definition of Done WORKFLOW §10.

---

## Keputusan yang Diminta User (sebelum/selama eksekusi)

1. ✅ **Approve skema §7** — disetujui; migration 0003–0006 mengikuti §7 (plus `idempotency_key` di `stock_movements` untuk dedup PRD §32).
2. ✅ **Kredensial Privy** — sudah diberikan (`NEXT_PUBLIC_PRIVY_APP_ID` + `PRIVY_APP_SECRET` di `.env.local`). **MASIH PERLU user**: aktifkan JWT/custom-auth + Base Sepolia testnet di dashboard privy.io (`custom_jwt_auth: false` saat ini → blokir alur custom-auth penuh).
3. ⏳ **Kredensial Upstash** (Redis + QStash free) → `UPSTASH_REDIS_REST_URL`/token, `QSTASH_TOKEN` + signing keys. Dibutuhkan saat P1 Step 5 (proof pipeline).
4. ⏳ **Google OAuth** di Supabase dashboard (opsional; email/password sudah jalan).
5. ⏳ **Prioritas UI:** back-end + API + test per langkah diadopsi; UI dasar per halaman terdampak menyusul setelah Step 5.
