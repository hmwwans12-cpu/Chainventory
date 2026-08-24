# Chainventory

**Inventory management with blockchain verification on Base Sepolia.**

Inventory SaaS untuk UMKM — multi-warehouse, RBAC 5 role, proof on-chain untuk setiap movement penting, dan audit explorer. Dibangun sebagai aplikasi web modern dengan Next.js 16, Supabase, dan Foundry.

---

## Tech Stack

| Area       | Teknologi                                                                          |
| ---------- | ---------------------------------------------------------------------------------- |
| Frontend   | Next.js 16 App Router · React 19 · TypeScript strict · Tailwind CSS v4 · shadcn/ui |
| Backend    | Supabase (PostgreSQL + Auth + Realtime) · Next.js Route Handlers (BFF)             |
| Blockchain | Base Sepolia · Solidity 0.8.36 · Foundry · OpenZeppelin · viem                     |
| Wallet     | Privy (embedded + external) · custom-auth token dari Supabase                      |
| Async jobs | Upstash QStash (proof pipeline) · Upstash Redis (rate limiting)                    |
| Testing    | Vitest · Testing Library · Playwright · Forge test                                 |
| CI/CD      | GitHub Actions · Vercel                                                            |

## Arsitektur

```
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

```
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

Untuk Stock In/Out manual, user dapat memilih **user-paid intent flow v2**:
wallet member menandatangani proof on-chain sendiri (bukan treasury).

## Quick Start

```bash
# 1. Clone + install
git clone https://github.com/hmwwans12-cpu/Chainventory.git
cd Chainventory
corepack pnpm install

# 2. Setup environment
cp .env.example .env.local
# isi nilai dari Supabase/Privy/Upstash/QStash dashboard

# 3. Database migrations (butuh SUPABASE_ACCESS_TOKEN)
npx supabase db push --linked

# 4. Run
corepack pnpm dev
```

## Environment Variables

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

## Scripts

```bash
corepack pnpm dev          # Development server
corepack pnpm build        # Production build
corepack pnpm typecheck    # TypeScript strict check
corepack pnpm lint         # ESLint
corepack pnpm test         # Vitest
corepack pnpm format:check # Prettier
corepack pnpm check:contrast # WCAG contrast check

# Database (butuh SUPABASE_ACCESS_TOKEN)
npx supabase db query --project-ref <ref> --linked --file <file.sql>

# E2E (butuh secrets E2E_*)
corepack pnpm e2e:verify
corepack pnpm e2e:test
```

## Testing

| Layer              | Tool                | Jumlah     |
| ------------------ | ------------------- | ---------- |
| Unit + Integration | Vitest              | 211+ tests |
| Contract (DB)      | Vitest (live-gated) | 25+ tests  |
| Smart Contract     | Forge               | 26 tests   |
| E2E                | Playwright          | 18 tests   |
| A11y               | check-contrast      | automated  |

## Security Model

1. **UI**: role-based button visibility (5 roles: OWNER > MANAGER > STAFF > AUDITOR > VIEWER)
2. **BFF**: `requirePermission()` + `requireRateLimit()` + `requireActiveWarehouse()`
3. **RPC**: SECURITY DEFINER dengan otorisasi internal (`auth.uid()` + role + warehouse active)
4. **RLS**: tenant boundary (warehouse_id scoping) — read-only untuk authenticated
5. **Trigger**: warehouse active · product status role · warehouse_id immutable · unit immutable

Direct table mutation dari authenticated **ditolak** (INSERT/UPDATE/DELETE revoked).

## Dokumentasi

| Dokumen                        | Isi                                 |
| ------------------------------ | ----------------------------------- |
| [PRD.md](PRD.md)               | Product requirements (frozen v2.1)  |
| [ARSITEKTUR.md](ARSITEKTUR.md) | Technical architecture              |
| [DESIGN.md](DESIGN.md)         | Design system & UI/UX spec (§1-84)  |
| [TECHSTACK.md](TECHSTACK.md)   | Technology decisions                |
| [WORKFLOW.md](WORKFLOW.md)     | Development workflow                |
| [AGENT.md](AGENT.md)           | Operating manual untuk AI/developer |
| [TODO.md](TODO.md)             | Implementation tracker              |

## Deployment

Deploy ke Vercel:

1. Push ke `main` → CI otomatis (typecheck + lint + test + build)
2. Set environment variables di Vercel Project Settings
3. Set `NEXT_PUBLIC_APP_URL` ke domain produksi
4. Tambahkan domain ke Supabase Auth → URL Configuration

Branch protection: `main` memerlukan check `quality` (strict).
