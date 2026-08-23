# Implementation Plan — Chainventory Execution 02 (P0 Supabase + P0 Blockchain)

**Version:** 02
**Date:** 2026-08-14
**Status:** DRAFT — menunggu review (belum dieksekusi)
**Companion to:** `docs/IMPLEMENTATION_PLAN.md` (Execution 01, versi lama — tidak di-overwrite)

---

## 1. Kondisi Repo Saat Ini (hasil verifikasi Execution 01)

- Next.js 16.3.0 + TS strict + Tailwind v4 + shadcn/base-nova, pnpm, App Router, Turbopack. `git init` selesai, **belum ada commit**.
- Design system, app shell, landing page, dashboard route group, auth pages (login/signup), RBAC matrix, Supabase client/server/middleware, health endpoint `app/api/health/route.ts` sudah ada.
- Validasi ulang 2026-08-14: `typecheck` exit 0, `lint` exit 0, `build` exit 0 (21 routes + `ƒ /api/health` + `ƒ Proxy`), tanpa warning tersisa.
- **Koreksi jujur (temuan verifikasi A):** file stub Privy **belum pernah dibuat** pada Execution 01 padahal dicatat ✅. Sudah dikoreksi dengan `lib/privy/custom-auth.ts` (stub eksplisit bertanda "TEMPORARY STUB", lempar error, penanda TODO P1). Tidak ada gap lain yang ditemukan.
- `docs/IMPLEMENTATION_PLAN.md` (v01) tidak diubah lebih jauh selain menandai scope 01 selesai.

## 2. Dokumentasi yang Dibaca Ulang

- `PRD.md` — lifecycle, invariant, idempotency, proof pipeline.
- `ARSITEKTUR.md` §2 (arsitektur), §4 (data model), §5 (contract flow), §7.3 (keep-alive cron), §8 (testing).
- `TECHSTACK.md` §2 (JWKS asymmetric = prasyarat Privy), §3 (authorization order).
- `WORKFLOW.md` §4 (database migration + expand–migrate–contract), §5 (smart contract), §9 (release).
- `TODO.md` P0 — Supabase Foundation & P0 — Blockchain Foundation.
- `AGENT.md` — invariant contract v1 immutable, treasury, nonce/idempotency, RLS defense-in-depth.

## 3. Konflik/Penyelarasan yang Ditemukan

Tidak ada konflik baru dengan spesifikasi. Penyelarasan/keputusan:

1. **Urutan treasury → deployment** (instruksi user) konsisten dengan WORKFLOW §5 & TODO P0: wallet & funding dibuat dan diverifikasi saldo **sebelum** implementasi kontrak. Diadopsi persis.
2. **Health check + keep-alive:** sudah ada `/api/health` (read-only, fail-open). Vercel Cron harian akan memanggilnya; endpoint ini tetap publik-read (tidak ada secret). Sesuai ARSITEKTUR §7.3.
3. **Realtime:** hanya diaktifkan untuk tabel yang dibutuhkan (users, warehouses, memberships, join_requests, products, inventory_balances, stock_movements, proofs, notifications). Mengikuti TODO "Konfigurasi Realtime hanya untuk tabel yang dibutuhkan".
4. **Expand–migrate–contract:** diterapkan sejak migration pertama; migration bersifat additive/expand, tidak ada rename/drop incompatible dalam satu langkah.
5. **JWT asymmetric/JWKS:** pengaturan ini dilakukan di Supabase Dashboard (Auth → JWT Signing Keys). Tidak bisa dikerjakan murni lewat CLI; perlu akses dashboard/akses token user (lihat Risiko #1).

## 4. Skill yang Dipakai dan Alasannya

| Skill | Alasan |
|---|---|
| `supabase` | Prasyarat wajib untuk seluruh work-stream Supabase: migration framework, RLS, JWT/JWKS, Realtime, GRANT Data API, keamanan auth. |
| `supabase-postgres-best-practices` | Menulis migration `users` + RLS + trigger profile bootstrap + index yang benar sejak awal (expand-migrate-contract, PK/Role/RLS policy). |
| `brainstorming` (sudah dimuat) | Memastikan desain/rencana disepakati sebelum implementasi (kepatuhan alur kerja). |
| `find-skills` (opsional saat eksekusi) | Jika butuh skill spesifik untuk Foundry/Foundry toolchain. |

Skill `caveman`, `design-*`, `ui-ux-*`, `web-design-guidelines`, `grill-me`, `improve-codebase-architecture`, `convex-quickstart`, `customize-opencode`, `high-end-visual-design`, `frontend-design`, `shadcn` tidak relevan untuk work-stream ini.

## 5. Architecture yang Akan Dipakai

### Work-stream A — P0 Supabase Foundation

```
Browser ──JWT──▶ Next.js (Proxy + Route Handler) ──▶ Supabase (Auth + Postgres + RLS + Realtime)
```

- **Project:** Supabase Free baru (`chainventory`). Koneksi via env (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`).
- **JWT:** signing key asymmetric/JWKS via Dashboard. `auth.users` → tabel `users` (1:1, FK, `ON DELETE CASCADE`/restrict sesuai kebijakan), profile bootstrap trigger + function.
- **Migration framework:** `supabase/migrations/` dengan timestamped SQL; CLI `supabase db push`/`db pull`; aturan additive (expand) sejak awal.
- **RLS:** aktif di semua tabel aplikasi. Policy diuji sebagai user biasa (`anon`/`authenticated`), bukan service-role.
- **GRANT Data API:** `anon`/`authenticated` diberi GRANT eksplisit + RLS aktif (mengikuti skill supabase: tabel baru tidak otomatis terekspos).
- **Realtime:** publication PostgreSQL hanya untuk tabel yang dibutuhkan; subscription per-warehouse mengikuti RLS.
- **Keep-alive:** Vercel Cron (`vercel.json` / `next.config` cron) harian → `GET /api/health`.

### Work-stream B — P0 Blockchain Foundation (urutan wajib)

```
1. Foundry + OpenZeppelin Contracts
2. RPC adapter (primary/fallback)  ← sudah ada stub `lib/blockchain/chains.ts`, diperkuat
3. Treasury test wallet + funding faucet Base Sepolia
4. Verifikasi saldo minimum treasury
5. Factory immutable + Warehouse immutable + EIP-712 + deploymentNonce + one-active-warehouse + Owner/Proof Recorder + idempotent proof
6. Forge unit/fuzz tests
7. Deploy ke Base Sepolia + verifikasi (etherscan/basepay)
8. Contract registry (address, ABI, deployment block, version)
```

- **Treasury:** EOA test wallet (anvil/`cast wallet new` / node ethers). Treasury membayar gas; **tidak memiliki** warehouse. Private key hanya di env server (`TREASURY_PRIVATE_KEY`).
- **Kontrak:** Solidity 0.8.x + OpenZeppelin (`EIP712`, `Ownable`/access-control custom, `ReentrancyGuard`). Factory `immutable`; Warehouse `immutable` v1. `deploymentNonce` per owner address di Factory; enforce satu warehouse aktif per owner; `Proof Recorder` ditetapkan pada deployment; proof idempotent by `proofId`.
- **Registry:** `supabase/contracts/` (atau `contracts/` root) berisi `foundry.toml`, `src/`, `test/`, `script/`, dan `registry.json`/`deployments/` (address, chainId, ABI, block, version, tx hash).
- **Penyelarasan env:** `WAREHOUSE_FACTORY_ADDRESS`, `BASE_SEPOLIA_RPC_URL`, fallback, `TREASURY_PRIVATE_KEY` (sudah ada di `lib/env.ts` + `.env.example`).

## 6. File/Folder yang Akan Dibuat/Dimodifikasi

### Work-stream A (Supabase)
```
supabase/
├── migrations/
│   ├── 0001_users_and_rls.sql          # users + trigger bootstrap + RLS + GRANT
│   ├── 0002_realtime_publication.sql   # publication Realtime tabel yang dibutuhkan
│   └── README.md                       # aturan expand–migrate–contract
├── config.toml                         # hanya jika CLI init lokal diperlukan
└── seed.sql (opsional, dev)
```
Modifikasi: `.env.example`/`.env.local` (project URL/keys dari project nyata), `app/api/health/route.ts` (verifikasi nyata ke Supabase read-only), `lib/supabase/*` (sudah ada; hanya penyesuaian config), `app/api/health/cron` (opsional route untuk cron terautentikasi).

### Work-stream B (Blockchain)
```
contracts/
├── foundry.toml
├── remappings.txt
├── src/
│   ├── WarehouseFactory.sol          # immutable
│   ├── Warehouse.sol                 # immutable
│   └── interfaces/ (IWarehouse, IWarehouseFactory, EIP712 types)
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
Modifikasi: `lib/blockchain/chains.ts` (RPC adapter primary/fallback fungsional), `lib/blockchain/contracts.ts` (ABI + address loader dari registry), `.env.example` (TREASURY_ADDRESS misal).

## 7. Dependency Baru yang Diperlukan

**Runtime JS:** (belum ada kebutuhan baru untuk Supabase work-stream; untuk blockchain work-stream runtime: `viem` sudah ada; `ethers` tidak diperlukan — konsisten memakai viem).
**Dev/JS:** `@supabase/supabase-js` (sudah ada); CLI global: `supabase` (npm `-g`/`npx supabase`) — perlu diinstall di mesin.
**Solidity/Foundry:**
- `forge-std` (Git submodule / `forge install foundry-rs/forge-std`)
- `@openzeppelin/contracts` (npm atau `forge install OpenZeppelin/openzeppelin-contracts`)
- Foundry toolchain (`foundryup`/`forge` binary) — perlu diinstall.
**Ops:** Vercel Cron (Hobby) untuk keep-alive; akun Supabase free; faucet Base Sepolia untuk treasury.

> Semua install menunggu review rencana ini. Toolchain Foundry + CLI Supabase tidak ada di mesin (hasil audit env 2026-08-14).

## 8. Risiko Implementasi

1. **Akses dashboard Supabase & kredensial:** membuat project Free, konfigurasi JWKS, dan ambil anon/service key butuh akun dashboard Supabase (atau CLI login + access token). Jika tidak tersedia, work-stream A terblokir pada langkah "buat project nyata". *Mitigasi: sediakan panduan langkah dashboard; pekerjaan migration SQL + RLS + trigger dapat ditulis dan diuji lokal (supabase start / Postgres) meski eksekusi project nyata menunggu kredensial.*
2. **Toolchain belum ada:** `supabase` CLI, Foundry (`forge`/`cast`/`anvil`), Docker tidak terinstall. *Mitigasi: install bertahap (npm global / foundryup); verifikasi `--version` sebelum dipakai. Docker tidak wajib bila memakai Supabase cloud.*
3. **Faucet Base Sepolia:** funding treasury butuh faucet yang mungkin rate-limited/queue (mis. Alchemy/Coinbase faucet). Saldo minimum untuk deploy+proof. *Mitigasi: buat EOA, request faucet, verifikasi via RPC; dokumentasi prosedur funding.*
4. **JWKS hanya di dashboard:** tidak bisa fully CLI. Risiko salah urutan (Privy butuh JWKS). *Mitigasi: lakukan sebelum integrasi Privy; dokumentasi langkah Dashboard.*
5. **Kontrak v1 immutable:** kesalahan desain tidak bisa di-patch. *Mitigasi: Forge unit/fuzz test menyeluruh (signature, nonce, expiry, wrong chain/factory, duplicate proof, ownership) sebelum deploy; gunakan deployment di Base Sepolia testnet.*
6. **Realtime salah scope:** mengaktifkan tabel berlebihan memboroskan resource free-tier. *Mitigasi: publication dibatasi daftar eksplisit.*
7. **Expand–migrate–contract:** risiko jika migration pertama sudah mengandung breaking change. *Mitigasi: migration 0001 bersifat additive murni (buat tabel/RLS/policy), tidak ada rename/drop.*
8. **Env/secret:** treasury private key dan service-role tidak boleh bocor. *Mitigasi: hanya di env server; `.env*` gitignore; CI secret scan sudah ada.*

## 9. Security Concern (dari awal)

- Service-role key, treasury private key, Privy secret, RPC secret → **server-only**, dilarang `NEXT_PUBLIC_*`.
- Browser tidak pernah memegang private key treasury; semua deployment/proof lewat server (Proof Job Processor).
- RLS aktif di semua tabel; `TO authenticated` + predicate ownership (bukan `auth.role()` deprecated); UPDATE butuh `USING` + `WITH CHECK`; view pakai `security_invoker` bila ada.
- GRANT eksplisit `anon`/`authenticated` hanya untuk tabel yang memang boleh diakses; tabel ledger/proof/outbox **tidak** terekspos ke browser (mutation hanya lewat RPC).
- JWT signing asymmetric/JWKS; service-role tidak dipakai untuk request user normal.
- Vercel Cron keep-alive memanggil endpoint read-only, tidak mengekspos operasi sensitif.
- Kontrak: `Proof Recorder` dibatasi, proof idempotent by `proofId`, treasury tidak menjadi owner warehouse; audit log untuk status perubahan proof.
- Dependency Solidity di-pin (forge-std, openzeppelin) + commit lockfile/remappings.

## 10. Testing Strategy

**Work-stream A (Supabase):**
- Migration diuji lokal: `supabase db reset` + seed → verifikasi tabel, trigger bootstrap users (insert ke `auth.users` analog menghasilkan row `users`), RLS policy sebagai `anon`/`authenticated` (bukan service-role).
- Uji RLS: akses langsung ditolak untuk tabel tanpa policy; UPDATE tanpa `WITH CHECK` ditolak; akses user lain tidak bocor.
- Health check: jalankan server, panggil `/api/health` → JSON status + dependencies; cron dry-run manual.
- Integration test (Vitest + Supabase client) untuk profile bootstrap & membership helper bila relevan.

**Work-stream B (Blockchain):**
- Forge unit/fuzz: EIP-712 signature valid/expired/wrong chain/wrong factory, `deploymentNonce` increment, one-active-warehouse enforcement, duplicate `proofId` ditolak, ownership/Proof Recorder access control, reentrancy.
- Smoke test Base Sepolia setelah deploy: deploy factory, create warehouse (relay via script), verify owner + recorder, catat address/block/ABI ke registry.
- Verifikasi registry: address terverifikasi di explorer (jika explorer API tersedia); ABI & version sesuai `deployments/base-sepolia.json`.

**CI (sudah ada `.github/workflows/ci.yml`):**
- Ditambah job contract test (`forge test`) bila toolchain tersedia di CI runner; maintain lint/typecheck/test/build.

**Definition of Done (WORKFLOW §10):**
- Migration + RLS lulus uji, service-role tidak dipakai user flow.
- Treasury funding tervalidasi saldo sebelum deploy kontrak.
- Forge tests hijau; kontrak terdeploy & terverifikasi; registry terisi.
- Lint, typecheck, build, test, CI hijau; tidak ada secret/out-of-scope change.

---

## Scope Eksekusi 02 (menunggu review)

1. ▶ Koreksi Execution 01 (selesai saat verifikasi: stub Privy dibuat)
2. ▶ P0 — Supabase Foundation (project Free, JWKS, users+RLS, migration framework, Realtime, health+keep-alive)
3. ▶ P0 — Blockchain Foundation (urutan wajib: toolchain → RPC → treasury+funding → saldo minimum → kontrak → Forge tests → deploy+verifikasi → registry)

**Catatan:** Eksekusi tidak dimulai sampai rencana ini direview & disetujui. Bagian yang butuh kredensial/aksi user (dashboard Supabase, faucet, explorer) akan diminta saat titik itu tercapai.
