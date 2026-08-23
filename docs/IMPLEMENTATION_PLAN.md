# Implementation Plan — Chainventory (Blockchain Inventory Management System)

**Execution:** 01 — Project Foundation
**Date:** 2026-08-13
**Author:** Lead Engineer (AI agent)
**Status:** Plan for review before implementation

---

## A. Kondisi Repository

- Direktori kerja: `C:\Users\ADVAN\Downloads\CHAINVENTORY BUFF`
- Repo **belum ada kode**. Hanya berisi 7 dokumen spesifikasi:
  `PRD.md`, `DESIGN.md`, `TECHSTACK.md`, `ARSITEKTUR.md`, `WORKFLOW.md`, `TODO.md`, `AGENT.md`
- Bukan git repo (belum `git init`).
- Environment host:
  - Node `v24.15.0`
  - npm `11.12.1` (via `npm.cmd`; `npm.ps1` diblokir execution policy)
  - corepack `0.34.6` tersedia → `pnpm` dapat diaktifkan via corepack
  - git `2.55.0`
  - OS Windows, shell PowerShell 5.1

Kesimpulan: repo kosong → implementasi dimulai dari **scaffold penuh**.

## B. Dokumentasi yang Dibaca

1. `PRD.md` (1597 baris) — product requirements lengkap
2. `DESIGN.md` (1076 baris) — design system & UI/UX spec
3. `TECHSTACK.md` (131 baris) — stack terkunci (Locked)
4. `ARSITEKTUR.md` (271 baris) — arsitektur & trust boundaries (Locked)
5. `WORKFLOW.md` (183 baris) — proses dev (Locked)
6. `TODO.md` (184 baris) — task & progress (Locked)
7. `AGENT.md` (149 baris) — operating manual AI (Locked)

## C. Konflik / Penyelarasan yang Ditemukan

| #   | Konflik                                                               | Dokumen                                                  | Resolusi                                                                                                                                                                                                            |
| --- | --------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Privy sebagai _primary auth_ vs Supabase Auth sebagai identitas utama | PRD header/§5 vs DESIGN §25, TECHSTACK §2, ARSITEKTUR §1 | **TECHSTACK/DESIGN/ARSITEKTUR konsisten & lebih baru + Locked**: Supabase Auth = identitas utama (email/Google, JWT/JWKS), Privy = wallet layer via custom auth token dari sesi Supabase. Dipakai interpretasi ini. |
| 2   | DESIGN §25 menyebut draf awal Privy-as-auth sudah digantikan          | DESIGN.md catatan penyelarasan                           | Flow auth: Warehouse Code → Continue → Supabase Auth → session → Privy custom-auth → embedded wallet. Satu langkah dari sudut pandang user.                                                                         |
| 3   | DESIGN.md status "Review — menunggu penyelarasan §25"                 | DESIGN header                                            | Sudah terselaras oleh konten §25 sendiri. Tidak ada tindakan lebih lanjut.                                                                                                                                          |

Tidak ada konflik lain yang memengaruhi fondasi.

## D. Skill yang Ditemukan

Ditemukan 15 skill lokal di `C:\Users\ADVAN\.agents\skills`:

`brainstorming`, `caveman`, `convex-quickstart`, `design-taste-frontend`, `find-skills`,
`frontend-design`, `grill-me`, `high-end-visual-design`, `improve-codebase-architecture`,
`shadcn`, `supabase`, `supabase-postgres-best-practices`, `ui-ux-pro-max`, `web-design-guidelines`

## E. Skill yang Dipilih & Alasan

| Skill                                                                                    | Dipakai?     | Alasan                                                                                                                                            |
| ---------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| `shadcn`                                                                                 | ✅           | Stack mewajibkan shadcn/ui; skill ini memberi aturan CLI, komposisi, dan theming.                                                                 |
| `supabase`                                                                               | ✅           | Supabase = database + auth + realtime utama; skill berisi checklist keamanan RLS/JWT yang wajib.                                                  |
| `supabase-postgres-best-practices`                                                       | ✅           | Fondasi database (users table, RLS, index) butuh best practices Postgres.                                                                         |
| `brainstorming`                                                                          | ✅ (parsial) | Wajib dibaca sebelum creative work; spec sudah sangat rinci sehingga pertanyaan brainstorming diminimalkan ke keputusan yang benar-benar terbuka. |
| `design-taste-frontend` / `frontend-design` / `high-end-visual-design` / `ui-ux-pro-max` | Tidak        | `DESIGN.md` sudah mendefinisikan design system lengkap & terkunci; skill visual tambahan tidak dibutuhkan untuk fondasi.                          |
| `improve-codebase-architecture`                                                          | Tidak        | Tidak ada codebase untuk di-scan.                                                                                                                 |
| lainnya (caveman, convex, find-skills, grill-me, web-design-guidelines)                  | Tidak        | Tidak relevan untuk tahap ini.                                                                                                                    |

## F. Architecture yang Akan Digunakan

Sesuai `TECHSTACK.md` + `ARSITEKTUR.md`:

- **Next.js App Router + TypeScript strict**, App dir di root.
- **BFF pattern**: Next.js Route Handlers sebagai satu-satunya jalur mutation; browser tidak mutasi DB langsung.
- **Auth**: Supabase Auth (email/Google, asymmetric JWT) → sesi di cookie server-side → Privy custom-auth (wallet layer) → embedded/external wallet.
- **Database**: Supabase PostgreSQL + RLS (defense-in-depth), service layer abstrak.
- **Realtime**: Supabase Realtime per warehouse (disiapkan arsitekturnya di tahap ini).
- **Blockchain**: viem, Base Sepolia (84532), Factory immutable + Warehouse immutable (disiapkan lapisan abstraksi/config di tahap ini, implementasi di tahap berikutnya).
- **Async proof pipeline**: QStash + outbox (diarsitekturkan, diimplementasi nanti).
- **UI**: Tailwind CSS + shadcn/ui + Radix, Lucide icons, Motion (framer-motion), Gooey Toast, design tokens DESIGN.md.
- **Validation**: `@t3-oss/env-nextjs` + Zod (fail-fast saat startup/build).
- **Logging**: pino structured + request ID + redaction.
- **Rate limit**: Upstash Redis + `@upstash/ratelimit` (diarsitekturkan, guard disiapkan).
- **Package manager**: pnpm (via corepack).

### Trust zones (ARSITEKTUR §1)

```
Browser/UI ──HTTP+JWT──▶ Route Handler (BFF) ──▶ Supabase DB+RLS+Outbox
                              │
                              └─▶ (async) Treasury → Base Sepolia
```

Client: tidak boleh menentukan role, tidak hitung hash proof, tidak mutasi DB langsung.

## G. File/Folder yang Akan Dibuat

```
├── app/
│   ├── (marketing)/                 # landing page route group
│   │   ├── page.tsx
│   │   ├── faq/page.tsx
│   │   ├── features/page.tsx
│   │   ├── about/page.tsx
│   │   └── layout.tsx
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   ├── signup/page.tsx
│   │   └── layout.tsx
│   ├── (dashboard)/
│   │   ├── dashboard/page.tsx
│   │   ├── inventory/...
│   │   ├── transactions/...
│   │   ├── members/...
│   │   ├── settings/...
│   │   └── layout.tsx                 # app shell (sidebar+topbar)
│   ├── api/
│   │   ├── health/route.ts
│   │   └── (protected)/...            # BFF route handlers
│   ├── layout.tsx                     # root layout (fonts, providers)
│   ├── globals.css
│   ├── not-found.tsx
│   ├── loading.tsx
│   └── error.tsx
├── components/
│   ├── ui/                            # shadcn/ui
│   ├── layout/ (sidebar, topbar, mobile-nav, breadcrumb)
│   ├── marketing/ (landing sections)
│   ├── auth/ (login form, signup form, warehouse-code)
│   ├── shared/ (empty-state, error-state, page-header, status-badge)
│   └── notifications/ (notification bell)
├── lib/
│   ├── env.ts                         # t3-env + Zod
│   ├── supabase/ (client, server, middleware)
│   ├── auth/ (session helpers, permissions, rbac matrix)
│   ├── blockchain/ (config base-sepolia, rpc adapter stub)
│   ├── logger/ (pino)
│   ├── validators/ (zod schemas)
│   ├── utils/ (cn, formatters, canonical decimal)
│   ├── rate-limit/ (upstash guard)
│   └── constants/
├── hooks/
├── types/
├── public/ (favicon, robots, sitemap)
├── supabase/migrations/               # SQL migrations
├── .env.example
├── .env.local.example  (dibuat .gitignore)
├── components.json
├── eslint.config.mjs
├── prettier.config.mjs
├── tsconfig.json
├── next.config.ts
├── vitest.config.ts
├── playwright.config.ts
├── docs/
│   └── IMPLEMENTATION_PLAN.md
└── .github/workflows/ci.yml
```

## H. File/Folder yang Akan Dimodifikasi

Tidak ada file existing yang dimodifikasi (repo kosong). Dokumen spesifikasi tidak diubah.

## I. Dependency yang Diperlukan

**Runtime:**
`next`, `react`, `react-dom`, `@supabase/supabase-js`, `@supabase/ssr`,
`@supabase/auth-helpers` (tidak — gunakan @supabase/ssr), `@prisma` (tidak — gunakan Supabase langsung),
`@t3-oss/env-nextjs`, `zod`, `react-hook-form`, `@hookform/resolvers`,
`tailwind-merge`, `clsx`, `class-variance-authority`, `@radix-ui/*` (via shadcn),
`lucide-react`, `motion` (framer-motion), `sonner` atau custom Gooey Toast,
`viem`, `pino`, `date-fns` (opsional)

**Dev:**
`typescript`, `eslint`, `eslint-config-next`, `prettier`, `vitest`, `@vitejs/plugin-react`,
`@testing-library/react`, `@testing-library/jest-dom`, `jsdom`, `playwright`,
`@types/*`, `dotenv`

> Install bertahap. Tahap ini hanya install yang dibutuhkan fondasi (Next/React/Supabase/t3-env/zod/ui libs). Viem, pino, rate-limit, recharts, papaparse diinstall ketika modul terkait diimplementasi.

## J. Risiko Implementasi

1. **Privy custom-auth** butuh project Supabase dengan JWKS asymmetric — prasyarat env eksternal yang belum ada. Fondasi auth dibuat dengan mock/abstraksi; integrasi penuh menunggu kredensial.
2. **Nama direktori mengandung spasi** (`CHAINVENTORY BUFF`) → `create-next-app` butuh nama project valid; pakai nama project internal (`chainventory`) dan scaffold via temp lalu pindahkan, atau pakai flag yang sesuai.
3. `npm.ps1` diblokir execution policy → semua command npm/pnpm harus lewat `npm.cmd` / `corepack pnpm` / `cmd /c`.
4. PP Grotesk font (berlisensi) — tidak tersedia gratis; fallback ke stack grotesque yang sepadan (`Space Grotesk`/`Inter`-style) via `next/font/google`, variabel CSS tetap `--font-display` agar mudah diganti saat aset font tersedia.
5. Dark mode bukan prioritas MVP (DESIGN §5) — token disiapkan, UI light-first.
6. Supabase project nyata belum ada → migration SQL ditulis, eksekusi ditunda sampai project tersedia.

## K. Security Concern (dari awal)

- Tidak ada secret di client: JWT Supabase, Privy secret, service-role, treasury key, RPC secret → hanya env server (`@t3-oss/env-nextjs`, non-`NEXT_PUBLIC_`).
- Route Handler = primary authorization boundary: JWT → membership → role → rate limit → business logic (urutan wajib AGENT §3).
- RLS defense-in-depth di semua tabel aplikasi.
- Browser dilarang mutasi langsung `inventory_balances`, `stock_movements`, `proofs`, `proof_outbox`.
- Input divalidasi Zod; query parameterized.
- Mutation sensitif fail-closed; read-only fail-open + warning.
- Audit log append-only.
- `.env.example` tanpa secret; `.env*` di gitignore.

## L. Testing Strategy

- **Tahap ini:** typecheck (tsc), lint (eslint), build (`next build`). Setup Vitest + Testing Library (config minimal + 1 contoh unit test util). Playwright config disiapkan, E2E menyusul.
- **Tahap berikut:** integration (auth, RLS, RBAC matrix), database (race condition, atomic stock), blockchain (EIP-712, nonce), pipeline proof.

---

## Scope Eksekusi 01 (sesuai PROMPT §18)

1. ✅ Membaca seluruh MD
2. ✅ Membaca skill relevan
3. ✅ Audit repository
4. ✅ Implementation plan ini
5. ✅ Scaffold + foundation
6. ✅ Design system
7. ✅ Application shell
8. ✅ Landing page
9. ✅ Authentication architecture (Supabase Auth + Privy wallet stub)
10. ✅ Validation (typecheck/lint/test/build — semua PASS)

Fitur inventory/blockchain kompleks **tidak** diimplementasi pada eksekusi ini.
Migration SQL database (users, RLS, profile bootstrap) ditulis di tahap berikut
saat project Supabase tersedia (lihat plan §J.6).
