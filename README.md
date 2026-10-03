# 📦 ⛓️ Chainventory

[![Release](https://img.shields.io/github/v/release/hmwwans12-cpu/Chainventory?sort=semver)](https://github.com/hmwwans12-cpu/Chainventory/releases)
[![CI](https://github.com/hmwwans12-cpu/Chainventory/actions/workflows/ci.yml/badge.svg)](https://github.com/hmwwans12-cpu/Chainventory/actions/workflows/ci.yml)
[![Base Sepolia](https://img.shields.io/badge/chain-Base%20Sepolia-0052FF)](https://sepolia.basescan.org)
[![Bilingual](https://img.shields.io/badge/i18n-EN%20%7C%20ID-green)](<>)
[![License](https://img.shields.io/badge/license-proprietary-red)](<>)

> **Sistem inventaris gudang untuk UMKM — dengan bukti blockchain untuk setiap pergerakan stok penting.**
> _Warehouse inventory management with verifiable on-chain proof for every critical stock movement._

```text
Barang masuk/keluar → tercatat di ledger → proof di-anchor on-chain → bisa diverifikasi siapa pun di BaseScan
```

---

## ✨ Kenapa Chainventory?

| Untuk operasional harian                                        | Untuk kepercayaan & audit                       |
| --------------------------------------------------------------- | ----------------------------------------------- |
| 🏭 Multi-warehouse + multi-user (5 role: Owner → Viewer)        | 🔗 Setiap movement penting punya proof on-chain |
| 📝 Stock in/out, adjustment (4 mata), reversal, bulk CSV import | 🔍 Audit explorer + BaseScan link per transaksi |
| 🔢 SKU auto-generate + threshold stok rendah + notifikasi       | 🛡️ Tak ada yang bisa ubah history diam-diam     |
| 🌏 Antarmuka bilingual penuh (Indonesia / English)              | 📜 Ledger append-only + audit log di database   |

**Dua mode proof** mengikuti umur kontrak gudangmu — otomatis dipilihkan aplikasi:

- 🏛️ **Treasury flow (kontrak v1)** — gas dibayar treasury, user tinggal klik.
- 👛 **Wallet-paid flow (kontrak v2)** — wallet member menandatangani + membayar gas sendiri, dengan estimasi fee transparan sebelum sign.

---

## 🧱 Tech Stack

| Area       | Teknologi                                                                          |
| ---------- | ---------------------------------------------------------------------------------- |
| Frontend   | Next.js 16 App Router · React 19 · TypeScript strict · Tailwind CSS v4 · shadcn/ui |
| Backend    | Supabase (PostgreSQL + Auth + Realtime) · Next.js Route Handlers (BFF)             |
| Blockchain | Base Sepolia · Solidity 0.8.36 · Foundry · OpenZeppelin · viem                     |
| Wallet     | Privy (embedded + external) · custom-auth token dari Supabase                      |
| Async jobs | Upstash QStash (proof pipeline) · Upstash Redis (rate limiting)                    |
| Testing    | Vitest · Testing Library · Playwright · Forge test                                 |
| CI/CD      | GitHub Actions · Vercel                                                            |

## 🏗️ Arsitektur

```text
Browser
  ↓
Next.js Middleware (auth guard)
  ↓
Route Handler (BFF)
  ↓ auth → rate limit → permission → validation
SECURITY DEFINER RPC (PostgreSQL)
  ↓
PostgreSQL (RLS tenant boundary)
```

Mutation sensitif **tidak** melalui direct table access. Semua melalui
SECURITY DEFINER RPC dengan otorisasi internal (role + warehouse active +
product active). RLS menjadi tenant boundary, bukan authorization boundary.

### Proof Pipeline

```text
Stock In/Out
  ↓
apply_stock_movement() RPC (atomic: lock + validate + insert + audit)
  ↓
proof + outbox (dalam transaction yang sama)
  ↓
QStash publish → processor endpoint
  ↓
treasury signer → Base Sepolia tx
  ↓
confirmation polling (2 blocks) → confirmed
```

## 🚀 Quick Start

```bash
# 1. Clone + install
git clone https://github.com/hmwwans12-cpu/Chainventory.git
cd Chainventory
corepack pnpm install

# 2. Setup environment
cp .env.example .env.local
# isi nilai dari Supabase/Privy/Upstash/QStash dashboard

# 3. Database migrations (butuh SUPABASE_ACCESS_TOKEN)
corepack pnpm db:push:verify

# 4. Run (terminal 1: app, terminal 2: proof worker lokal)
corepack pnpm dev
corepack pnpm worker:dev
```

## 🔑 Environment Variables

Lihat `.env.example` untuk daftar lengkap. Kategori:

| Kategori      | Key                                                                                       | Sifat                   |
| ------------- | ----------------------------------------------------------------------------------------- | ----------------------- |
| Supabase      | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` | Wajib                   |
| Privy         | `NEXT_PUBLIC_PRIVY_APP_ID`, `PRIVY_APP_SECRET`                                            | Wajib                   |
| Blockchain    | `BASE_SEPOLIA_RPC_URL`, `WAREHOUSE_FACTORY_ADDRESS`, `TREASURY_PRIVATE_KEY`               | Wajib untuk proof       |
| QStash        | `QSTASH_TOKEN`, `QSTASH_*_SIGNING_KEY`                                                    | Wajib untuk proof async |
| Upstash Redis | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN`                                      | Wajib untuk rate limit  |
| Cron          | `CRON_SECRET`                                                                             | Wajib untuk keep-alive  |

⚠️ `NEXT_PUBLIC_APP_URL` harus di-set ke domain produksi saat deploy Vercel.

## 🛠️ Scripts

```bash
corepack pnpm dev          # Development server
corepack pnpm worker:dev   # Proof outbox worker lokal (QStash tak bisa callback ke localhost)
corepack pnpm build        # Production build
corepack pnpm typecheck    # TypeScript strict check
corepack pnpm lint         # ESLint
corepack pnpm test         # Vitest
corepack pnpm format:check # Prettier
corepack pnpm check:contrast # WCAG contrast check
corepack pnpm db:push:verify # Push migrasi + verifikasi RPC di schema cache

# E2E (butuh secrets E2E_*)
corepack pnpm e2e:verify
corepack pnpm e2e:test
```

## ✅ Testing

| Layer              | Tool            | Status                                     |
| ------------------ | --------------- | ------------------------------------------ |
| Unit + Integration | Vitest          | 533 passed (live-gated skip terisolasi)    |
| Kontrak RPC↔DB     | Vitest (statis) | Paritas 44 RPC × migrasi (overload-aware)  |
| Smart Contract     | Forge           | Factory, Warehouse, EIP-712 suites         |
| E2E                | Playwright      | Main flow, console, smoke                  |
| A11y               | check-contrast  | Otomatis (WCAG AA) + preflight 7/7         |
| Supply chain       | deps-audit      | Gate high/critical + allowlist kedaluwarsa |

## 🔒 Security Model

1. **UI**: role-based button visibility (5 roles: OWNER > MANAGER > STAFF > AUDITOR > VIEWER)
2. **BFF**: `requirePermission()` + `requireRateLimit()` + `requireActiveWarehouse()`
3. **RPC**: SECURITY DEFINER dengan otorisasi internal (`auth.uid()` + role + warehouse active)
4. **RLS**: tenant boundary (warehouse_id scoping) — read-only untuk authenticated
5. **Trigger**: warehouse active · product status role · warehouse_id immutable · unit immutable

Direct table mutation dari authenticated **ditolak** (INSERT/UPDATE/DELETE revoked).

## 🩹 Dependency Patches

- `patches/@privy-io__react-auth@3.37.1.patch` (via `pnpm patch`, tercatat di `pnpm-workspace.yaml` → `patchedDependencies`): menghapus prop `isActive` yang bocor ke elemen `<div>` di modal TransactionDetails Privy (React 19 warning, temuan audit eksternal 2026-09-13). Prop tersebut tidak dipakai styling mana pun (gaya accordion memakai `data-open`; chevron memakai `isactive` lowercase) sehingga penghapusan nol-perubahan visual/perilaku. **Saat upgrade Privy SDK**: cek apakah upstream sudah tidak melempar `isActive` (cari di `dist/**/TransactionDetails-*`); bila sudah, hapus patch + entri `patchedDependencies`, bila belum, rebase patch ke versi baru.

## 📚 Dokumentasi

| Dokumen                                                            | Isi                                 |
| ------------------------------------------------------------------ | ----------------------------------- |
| [PRD.md](PRD.md)                                                   | Product requirements (frozen v2.1)  |
| [ARSITEKTUR.md](ARSITEKTUR.md)                                     | Technical architecture              |
| [DESIGN.md](DESIGN.md)                                             | Design system & UI/UX spec (§1-84)  |
| [TECHSTACK.md](TECHSTACK.md)                                       | Technology decisions                |
| [WORKFLOW.md](WORKFLOW.md)                                         | Development workflow                |
| [AGENT.md](AGENT.md)                                               | Operating manual untuk AI/developer |
| [TODO.md](TODO.md)                                                 | Implementation tracker              |
| [Releases](https://github.com/hmwwans12-cpu/Chainventory/releases) | Catatan rilis per versi             |

## 🚢 Deployment

Deploy ke Vercel:

1. Push ke `main` → CI otomatis (typecheck + lint + test + build)
2. Set environment variables di Vercel Project Settings
3. Set `NEXT_PUBLIC_APP_URL` ke domain produksi
4. Tambahkan domain ke Supabase Auth → URL Configuration

Branch protection: `main` memerlukan check `quality` (strict).
