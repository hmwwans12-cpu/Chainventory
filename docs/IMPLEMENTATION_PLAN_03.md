# Implementation Plan — Chainventory Execution 02 (P0 Supabase + P0 Blockchain)

**Version:** 03 (revisi setelah audit user & perbaikan temuan)
**Date:** 2026-08-14
**Status:** APPROVED UNTUK EKSEKUSI (setelah perbaikan keep-alive terautentikasi)
**Companion to:** `docs/IMPLEMENTATION_PLAN.md` (v01) dan `docs/IMPLEMENTATION_PLAN_02.md` (v02) — versi lama tidak di-overwrite

## Progres Eksekusi (diupdate 2026-08-14)

> **Update 2026-08-15:** P1 telah dieksekusi sesuai `docs/IMPLEMENTATION_PLAN_04.md` (v04) — Step 1–4 selesai (Identity/Wallet partial, RBAC, Inventory Core), Step 5 (Proof Pipeline) tersisa. Detail progres ada di header v04; dokumen ini mencatat hasil Execution 02 (P0) di bagian bawah.

- ✅ **Instruksi dashboard user**: `docs/DASHBOARD_SETUP.md` (project Free, JWKS/JWT keys, API keys baru publishable/secret vs legacy, checklist).
- ✅ **Env diselaraskan ke key model Supabase 2026**: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` + `SUPABASE_SECRET_KEY` (baru) sebagai primary, legacy `ANON_KEY`/`SERVICE_ROLE_KEY` tetap sebagai fallback di `lib/supabase/config.ts`. Semua konsumen (client, server, middleware, health, keep-alive) memakai helper. typecheck/lint/test/build hijau.
- ✅ **Project Supabase nyata dibuat user** (ref `yxsieqqiksqckfrqozlb`, Free). JWKS **asymmetric ES256 aktif** (terverifikasi `/auth/v1/.well-known/jwks.json`, kid `c01d624d-...`). `.env.local` terisi (gitignored, tidak di-commit).
- ⚠️ **Keamanan (keputusan user 2026-08-14)**: user mengirim treasury private key + secret Supabase ke chat. Ditandai: dianjurkan regenerasi. **User memilih "pakai apa adanya"** — dicatat sebagai keputusan eksplisit user; rotasi tetap disarankan sebelum produksi.
- ✅ **Migration SQL**: `supabase/migrations/0001_users_and_rls.sql` (users 1:1 auth.users, bootstrap trigger, RLS, GRANT eksplisit, keepalive_ping), `0002_realtime_publication.sql` (whitelist Realtime), `README.md` (expand–migrate–contract). Additive murni.
- ✅ **Foundry**: toolchain 1.7.1; `contracts/` (foundry.toml, remappings, forge-std 1.16.2, OZ 5.7.0); `src/WarehouseFactory.sol`, `src/Warehouse.sol`, interfaces; script deploy; registry template `contracts/deployments/base-sepolia.json`.
- ✅ **Forge tests: 26/26 PASS** (unit + fuzz: EIP-712 valid/expired/wrong-chain/wrong-factory/bad-signature, nonce, replay, one-active-warehouse, duplicate proof, access control, ownership+factory sync). `forge lint` exit 0. Base Sepolia `evm_version=cancun`.
- ✅ **`lib/blockchain/chains.ts`** (viem `fallback` transport retry/failover) + **`lib/blockchain/contracts.ts`** (registry loader ABI+address, fail-fast).
- ▶ Berikutnya: terapkan migration ke project nyata (supabase db push/link), verifikasi health/keep-alive dengan kredensial nyata, fund treasury Base Sepolia (faucet) → verifikasi saldo minimum → deploy+verify Factory → isi registry.

---

## 1. Kondisi Repo Saat Ini

- Next.js 16.3.0 + TS strict + Tailwind v4 + shadcn/base-nova, pnpm, App Router, Turbopack. `git init` selesai, **belum ada commit**.
- Design system, app shell, landing page, dashboard route group, auth pages (login/signup), RBAC matrix, Supabase client/server/middleware, `app/api/health/route.ts`, stub Privy (`lib/privy/custom-auth.ts`) sudah ada.
- **Audit user (2026-08-14):** user menginstall dep & menjalankan typecheck/lint/test/build sendiri — semua PASS sesuai laporan v01.
- **Temuan 1 (SUDAH DIPERBAIKI):** `signupAction` redirect `/onboarding` yang tidak ada → dibuat `app/(auth)/onboarding/page.tsx` (pilihan Create/Join Warehouse, PRD §5.3, DESIGN §26) + `onboarding/create` dan `onboarding/join` (placeholder form, lengkap di P1). Build ulang: `/onboarding`, `/onboarding/create`, `/onboarding/join` muncul di route list.
- **Temuan 2 (SUDAH DIPERBAIKI):** celah RBAC → ditambahkan `canAssignRole(actor, targetRole)` di `lib/auth/permissions.ts` (helper gabungan `hasPermission(MEMBER_MANAGE)` + `canManageRole(targetRole)`), JSDoc tegas pada `MEMBER_MANAGE`/`MEMBER_REMOVE`, dan test baru (5 → 10 test, semua PASS).
- **Perbaikan keep-alive (SUDAH DIPERBAIKI — syarat approve):** ARSITEKTUR §7.3 menuntut endpoint internal **terautentikasi**, bukan `/api/health` yang public. Dipilih opsi (a):
  - `app/api/internal/keep-alive/route.ts` (baru) — memverifikasi `Authorization: Bearer <CRON_SECRET>` via `timingSafeEqual`, lalu menjalankan health check database read-only (pakai anon key, bukan service-role). 401 jika secret salah/tidak dikonfigurasi; 200 dengan status `ok`/`degraded` jika valid.
  - `/api/health` tetap public untuk Developer Console/monitoring eksternal.
  - `vercel.json` (baru) — Vercel Cron harian `0 6 * * *` → `/api/internal/keep-alive`. Vercel otomatis mengirim `Authorization: Bearer <CRON_SECRET>` dari env `CRON_SECRET`.
  - `CRON_SECRET` (server-only, min 16 char) ditambahkan ke `lib/env.ts` + `.env.example`.
  - Build ulang: `/api/internal/keep-alive` muncul di route list.
- Validasi terkini setelah perbaikan: typecheck exit 0, lint exit 0, test 10/10 PASS, build exit 0 (25 route). Tidak ada warning tersisa.

## 2. Dokumentasi yang Dibaca Ulang

- `PRD.md` §5.3 (signup → onboarding), §6 (create warehouse), §9.2 (role escalation ban), §42.
- `ARSITEKTUR.md` §2 (arsitektur), §4 (data model), §5 (contract flow), §7.3 (keep-alive cron), §8 (testing).
- `TECHSTACK.md` §2 (JWKS asymmetric = prasyarat Privy), §3 (authorization order).
- `WORKFLOW.md` §4 (database migration + expand–migrate–contract), §5 (smart contract), §9 (release).
- `TODO.md` P0 — Supabase Foundation & P0 — Blockchain Foundation.
- `AGENT.md` — invariant contract v1 immutable, treasury, nonce/idempotency, RLS defense-in-depth.

## 3. Konflik/Penyelarasan yang Ditemukan

Tidak ada konflik baru. Penyelarasan/keputusan:

1. **Urutan treasury → deployment** diadopsi persis (konsisten WORKFLOW §5 & TODO P0).
2. **JWKS hanya via dashboard Supabase** → tidak bisa murni CLI; perlu akses dashboard user.
3. **Realtime** dibatasi daftar tabel eksplisit.
4. **Expand–migrate–contract** diterapkan sejak migration pertama; migration 0001 additive murni.
5. **Temuan 2 mengunci** bahwa semua operasi assign/approve/remove role di P1 wajib lewat `canAssignRole` — endpoint Membership P1 harus menggunakannya, bukan `hasPermission` saja.

## 4. Skill yang Dipakai dan Alasannya

| Skill | Alasan |
|---|---|
| `supabase` | Seluruh work-stream Supabase: migration framework, RLS, JWT/JWKS, Realtime, GRANT Data API, keamanan auth. |
| `supabase-postgres-best-practices` | Migration `users` + RLS + trigger bootstrap + index yang benar sejak awal. |
| `brainstorming` | Kepatuhan alur kerja: rencana disepakati sebelum implementasi. |

Lainnya (`caveman`, `design-*`, `ui-ux-*`, `shadcn`, `web-design-guidelines`, `grill-me`, `improve-codebase-architecture`, `convex-quickstart`, `customize-opencode`, `find-skills`, `frontend-design`, `high-end-visual-design`) tidak relevan untuk work-stream ini.

## 5. Architecture yang Akan Dipakai

### Work-stream A — P0 Supabase Foundation

```
Browser ──JWT──▶ Next.js (Proxy + Route Handler) ──▶ Supabase (Auth + Postgres + RLS + Realtime)
```

- Project Supabase Free nyata. Koneksi via env (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`).
- JWT signing key asymmetric/JWKS via Dashboard (prasyarat wajib Privy custom-auth).
- Tabel `users` (1:1 ke `auth.users`, FK, profile bootstrap trigger + function), RLS di semua tabel aplikasi.
- Migration framework `supabase/migrations/` timestamped; aturan additive (expand) sejak awal.
- GRANT eksplisit `anon`/`authenticated` + RLS aktif untuk tabel yang boleh diakses Data API; tabel ledger/proof/outbox tidak terekspos.
- Realtime publication hanya untuk tabel yang dibutuhkan; subscription per-warehouse mengikuti RLS.
- Keep-alive: Vercel Cron harian → `GET /api/health`.

### Work-stream B — P0 Blockchain Foundation (urutan wajib)

```
1. Foundry + OpenZeppelin Contracts
2. RPC adapter (primary/fallback + retry/failover)  ← perkuat lib/blockchain/chains.ts
3. Treasury test wallet + funding faucet Base Sepolia
4. Verifikasi saldo minimum treasury
5. Factory immutable + Warehouse immutable + EIP-712 + deploymentNonce + one-active-warehouse + Owner/Proof Recorder + idempotent proof
6. Forge unit/fuzz tests
7. Deploy Base Sepolia + verifikasi
8. Contract registry (address, ABI, deployment block, version)
```

- Treasury EOA test wallet; membayar gas, **tidak memiliki** warehouse. Private key server-only (`TREASURY_PRIVATE_KEY`).
- Solidity 0.8.x + OpenZeppelin (`EIP712`, `ReentrancyGuard`, access control). Factory & Warehouse `immutable` v1. `deploymentNonce` per owner address; satu warehouse aktif per owner; `Proof Recorder` ditetapkan saat deploy; proof idempotent by `proofId`.
- Registry di `contracts/deployments/base-sepolia.json`.
- `lib/blockchain/chains.ts` dilengkapi retry/failover logic antar RPC primary/fallback.

## 6. File/Folder yang Akan Dibuat/Dimodifikasi

### Work-stream A (Supabase)
```
supabase/
├── migrations/
│   ├── 0001_users_and_rls.sql          # users + trigger bootstrap + RLS + GRANT
│   ├── 0002_realtime_publication.sql   # publication Realtime tabel yang dibutuhkan
│   └── README.md                       # aturan expand–migrate–contract
└── seed.sql (opsional, dev)
```
Modifikasi: `.env.example`/`.env.local` (project URL/keys), `app/api/health/route.ts` (verifikasi nyata read-only ke Supabase — tetap public), `lib/supabase/*` (penyesuaian config bila perlu).

### Work-stream B (Blockchain)
```
contracts/
├── foundry.toml
├── remappings.txt
├── src/
│   ├── WarehouseFactory.sol          # immutable
│   ├── Warehouse.sol                 # immutable
│   └── interfaces/ (IWarehouse, IWarehouseFactory)
├── test/
│   ├── WarehouseFactory.t.sol
│   ├── Warehouse.t.sol
│   └── Eip712.t.sol
├── script/
│   ├── DeployFactory.s.sol
│   └── helpers (fund treasury, deploy)
└── deployments/
    └── base-sepolia.json              # registry: address, block, ABI path, version
```
Modifikasi: `lib/blockchain/chains.ts` (retry/failover), `lib/blockchain/contracts.ts` (ABI + address loader dari registry), `.env.example` (TREASURY_ADDRESS dll).

## 7. Dependency Baru yang Diperlukan

- **Dev/JS:** CLI `supabase` (install via npm global / `npx supabase`).
- **Solidity/Foundry:** `forge-std` (`forge install foundry-rs/forge-std`), `@openzeppelin/contracts` (`forge install OpenZeppelin/openzeppelin-contracts`), Foundry toolchain (`foundryup`/binary).
- **Ops:** akun Supabase Free + akses dashboard (JWT signing/JWKS), faucet Base Sepolia untuk treasury, Vercel Cron (Hobby) untuk keep-alive.
- Runtime JS tidak ada kebutuhan baru (viem sudah ada).

> Toolchain Foundry + CLI Supabase TIDAK terinstall di mesin (hasil audit env 2026-08-14) — perlu diinstall di awal eksekusi, menunggu persetujuan rencana.

## 8. Risiko Implementasi

1. **Akses dashboard Supabase & kredensial:** project Free, JWKS, anon/service key butuh akun dashboard. User menyatakan punya akses dashboard. Migration SQL + RLS + trigger dapat ditulis & diuji lokal (Postgres/supabase start) meski project nyata menunggu kredensial.
2. **Toolchain belum ada:** Supabase CLI, Foundry, Docker tidak terinstall. Install bertahap; verifikasi `--version`; Docker tidak wajib bila memakai Supabase cloud.
3. **Faucet Base Sepolia:** rate-limit/queue. Buat EOA, request faucet, verifikasi via RPC; dokumentasikan prosedur.
4. **JWKS hanya via dashboard:** lakukan sebelum integrasi Privy; dokumentasikan langkah.
5. **Kontrak v1 immutable:** kesalahan tidak bisa di-patch → Forge unit/fuzz menyeluruh sebelum deploy; deploy di testnet.
6. **Realtime salah scope:** boros free-tier → publication dibatasi daftar eksplisit.
7. **Expand–migrate–contract:** migration 0001 additive murni; tidak ada rename/drop incompatible.
8. **Env/secret:** treasury private key & service-role tidak boleh bocor; hanya env server; `.env*` gitignore; CI secret scan sudah ada.

## 9. Security Concern (dari awal)

- Service-role key, treasury private key, Privy secret, RPC secret → server-only, dilarang `NEXT_PUBLIC_*`.
- Browser tidak pernah memegang private key treasury; deployment/proof lewat server.
- RLS aktif di semua tabel; `TO authenticated` + predicate ownership (bukan `auth.role()` deprecated); UPDATE butuh `USING` + `WITH CHECK`; view pakai `security_invoker` bila ada.
- GRANT eksplisit hanya tabel yang boleh diakses Data API; ledger/proof/outbox tidak terekspos ke browser (mutation hanya via RPC).
- JWT signing asymmetric/JWKS; service-role tidak dipakai request user normal.
- Vercel Cron keep-alive memanggil endpoint read-only.
- Kontrak: Proof Recorder dibatasi; proof idempotent by proofId; treasury bukan owner; audit log untuk status proof.
- RBAC: seluruh operasi assign/approve/remove role wajib lewat `canAssignRole` (mengunci larangan escalation PRD §9.2).
- Dependency Solidity di-pin (forge-std, openzeppelin) + commit lockfile/remappings.

## 10. Testing Strategy

**Work-stream A (Supabase):**
- Migration diuji lokal (`supabase db reset` + seed): tabel users, trigger bootstrap, RLS policy sebagai `anon`/`authenticated` (bukan service-role).
- Uji RLS: akses langsung ditolak untuk tabel tanpa policy; UPDATE tanpa `WITH CHECK` ditolak; data antar user tidak bocor.
- Health check: jalankan server, panggil `/api/health` → JSON status + dependencies; cron dry-run manual.
- Integration test (Vitest + Supabase client) untuk profile bootstrap & membership helper bila relevan.

**Work-stream B (Blockchain):**
- Forge unit/fuzz: EIP-712 signature valid/expired/wrong chain/wrong factory, `deploymentNonce` increment, one-active-warehouse enforcement, duplicate `proofId` ditolak, ownership/Proof Recorder access control, reentrancy.
- Smoke test Base Sepolia setelah deploy: deploy factory, create warehouse (relay via script), verify owner + recorder, catat address/block/ABI ke registry.
- Verifikasi registry: address terverifikasi di explorer (bila tersedia); ABI & version sesuai `deployments/base-sepolia.json`.

**CI (sudah ada):** tambah job contract test (`forge test`) bila toolchain tersedia di CI runner; maintain lint/typecheck/test/build.

**Definition of Done (WORKFLOW §10):**
- Migration + RLS lulus uji; service-role tidak dipakai user flow.
- Treasury funding tervalidasi saldo sebelum deploy kontrak.
- Forge tests hijau; kontrak terdeploy & terverifikasi; registry terisi.
- Lint, typecheck, build, test, CI hijau; tidak ada secret/out-of-scope change.

---

## Scope Eksekusi 02 (APPROVED)

1. ✅ Perbaikan temuan (selesai sebelum rencana ini): onboarding routes + `canAssignRole` + test + keep-alive terautentikasi.
2. ▶ P0 — Supabase Foundation (project Free, JWKS, users+RLS, migration framework, Realtime, health public + keep-alive internal terautentikasi).
3. ▶ P0 — Blockchain Foundation (urutan wajib: toolchain → RPC → treasury+funding → saldo minimum → kontrak → Forge tests → deploy+verifikasi → registry).

**Catatan:** Bagian yang butuh kredensial/aksi user (dashboard Supabase/JWKS, faucet, explorer) akan diminta saat titik itu tercapai. Kredensial dashboard Supabase yang user miliki akan dipakai untuk langkah JWKS dan pengambilan key.

---

## Hasil Eksekusi (Execution 02, Selesai — 2026-08-14)

### P0 Supabase Foundation — SELESAI
- **Project nyata:** `yxsieqqiksqckfrqozlb` ("ChaInventory", ap-southeast-1, Postgres 17.6, JWKS ES256 asymmetric aktif). Kredensial: publishable + secret key (model key 2026) dipakai; `anon`/`service_role` legacy JWT dicadangkan sebagai fallback.
- **Migration terpasang** (via Management API, karena CLI butuh DB password): `0001_users_and_rls.sql` (tabel `users` 1:1 auth.users + trigger bootstrap + RLS + `keepalive_ping` security-definer) dan `0002_realtime_publication.sql` (Realtime publication). Diverifikasi: kolom, `relrowsecurity=true`, trigger, policy `users_select_own`/`users_update_own`, fungsi `handle_new_user`/`set_updated_at`/`keepalive_ping`, `keepalive_ping()` → `true`.
- **Uji RLS antar user (pass):** 2 user dibuat via Admin API; Alice bisa SELECT/UPDATE baris sendiri, SELECT baris Bob kosong, UPDATE baris Bob berdampak 0 baris (RLS mencegah modifikasi). User test dibersihkan.
- **Health + keep-alive terverifikasi:** `/api/health` → 200 `supabase:true`; `/api/internal/keep-alive` → 401 tanpa secret / secret salah, 200 `database:true` dengan `CRON_SECRET` benar.

### P0 Blockchain Foundation — SELESAI
- **Toolchain:** Foundry + OZ 5.7 (`evm_version=cancun` karena `mcopy`), Base Sepolia (chain 84532).
- **RPC:** Infura `bd704d…` primer, drpc.org fallback (sempat 500).
- **Treasury:** `0x463841123df8f45F2d58bBFCD276493750Bbf004` = Proof Recorder. Danaan 0.1 ETH; sisa `0.099987339664320199 ETH`.
- **Forge tests:** 26/26 PASS (unit + fuzz EIP-712, nonce, one-active-warehouse, proof idempotent, access control).
- **Deploy:** `WarehouseFactory` di `0x5e44f80585Ec50CBB64a76b3ffD099A156502e10` (tx `0x7c28a92b…fd1a`, block 45470275). Diverifikasi via RPC: `proofRecorder()`, EIP-712 domain (`name=Chainventory, version=1, chainId=84532`). **BaseScan source verification belum** (butuh `BASESCAN_API_KEY`).
- **Smoke test E2E (pass):** user EOA `0x70E7558d…745e` sign EIP-712 off-chain; treasury relay; warehouse `0xdF9cA75707f6109d447dA0eE943Ef09733da2926` (tx `0xa1e265fc…b48c4`, block 45470381). Semua assertion on-chain pass: `owner`=user, `proofRecorder`=treasury, `factory`, `activeWarehouse`, `deploymentNonce=1`, `hasActiveWarehouse=true`; deploy kedua REVERT `"Factory: owner has active warehouse"`.
- **Registry:** `contracts/deployments/base-sepolia.json` terisi (address/ABI path/block/version/proofRecorder) + test `lib/blockchain/contracts.test.ts` memverifikasi loader resolve address nyata. Fix kecil: `lib/logger.ts` pakai `env.LOG_LEVEL ?? "info"` agar vitest tidak crash saat `.env.local` tak dimuat.
- **Validasi:** typecheck 0, lint 0, test 11/11 (Vitest) + 26/26 (Forge), build 25 routes — semua hijau.

### Isu / Lanjutan
- **BASE_SCAN_API_KEY sudah tersedia** → source contract terverifikasi di BaseScan: Factory `0x5e44…e10` (https://sepolia.basescan.org/address/0x5e44f80585Ec50CBB64a76b3ffD099A156502e10#code) dan Warehouse smoke test `0xdF9cA7…` (https://sepolia.basescan.org/address/0xdF9cA75707f6109d447dA0eE943Ef09733da2926#code), keduanya status "already verified" via BaseScan API (compiler v0.8.29, EVM cancun, optimizer 200). `BASESCAN_API_KEY` ditambahkan ke `.env.example` (server-only) dan `.env.local` (gitignored). DESIGN.md §39 "View on BaseScan" kini menunjuk ke source terverifikasi.
- Eksposur secret (treasury key + Supabase) di chat sesuai keputusan user "pakai apa adanya"; rotasi tetap disarankan sebelum produksi.
- **P0 selesai 100%** (termasuk source verification). **P1 dieksekusi via `docs/IMPLEMENTATION_PLAN_04.md` (v04)** — Step 1–4 selesai, Step 5 (Proof Pipeline) tersisa.