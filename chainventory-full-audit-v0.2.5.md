# Project Audit Report — Chainventory v0.2.5

**Tanggal:** 2026-08-30  
**Versi:** `0.2.5` (`a420aab` → `fe1bb60`) — 60 routes, Next 16.3 / React 19.2 / TS 5 strict  
**Metode:** `tsc --noEmit` + `eslint` (core-web-vitals + typescript) + `next build` (Turbopack) + `check-contrast.mjs` + `ts-prune` dead-export scan + verifikasi item-per-item terhadap 38 temuan dari audit internal `v0.2.2` (18 item) + `v0.2.3` (20 item). Scope `app/`, `components/`, `lib/`, `hooks/`, `supabase/`, `contracts/` — `.next` & `node_modules` diabaikan.  
**Auditor:** Full-stack + UI/UX + Architecture (3 agen paralel, hasil digabung tanpa edit kode)

---

## 1. Executive Summary

Chainventory adalah inventory SaaS dengan proof blockchain (Base Sepolia, viem, Privy embedded wallet, Supabase RLS + RPC atomik). 3 putaran audit-fix-audit (`v0.2.2`→`v0.2.5`) membawa 38/38 temuan internal ke status **fixed & terverifikasi ke source** (termasuk yang tadinya "belum sempat dicek"). Sisa risiko bukan bug fungsional, melainkan **maintainability & product completeness**.

| Aspek | Skor /10 | Catatan |
|---|---|---|
| **UI/UX** | **9.0** | Seluruh P2 visual (warna negatif, checkbox 44px, header overflow, chart hue, breadcrumb truncate, bell 13→14px) fixed. Sisa polish kecil (radius 3 tier, table min-width jitter). |
| **Functionality** | **8.5** | P0 invitation tuntas. Sisa 3 pola `setState-in-effect` baru fixed di `v0.2.5`; 1 gate RBAC `approve/reject` masih bolong (P1). |
| **Code Quality** | **6.5** | Pola kuat (Zod di setiap handler, `lib/api-handler` guard, `pino` redact) tapi 7 komponen >600 LOC (`members-page 1166`, `product-dialogs 1013`) + EN/ID campur + `as` casts. |
| **Architecture** | **8.5** | BFF + RLS + outbox proof + `FOR UPDATE` lock ordering + idempotency `ON CONFLICT` rapi. Risiko baru: build butuh network Google Fonts → fixed `v0.2.5` via `next/font/local`. |
| **Performance** | **7.0** | Bundle heavy (`recharts` ~120kB, `fumadocs` ~200kB, `motion` ~60kB) belum `dynamic()`; 1000-row table tanpa virtualisasi; bulk N+1 RPC. |
| **Accessibility** | **9.0** | Hit-area 44px, `aria-describedby`, focus ring 3px, `prefers-reduced-motion`, contrast 5.55:1 — semua item a11y fixed. Sisa minor (`scope="col"`, tooltip focus). |
| **Security** | **8.0** | Open redirect & error leak fixed. `approve/reject` tanpa RBAC, export `ids` tanpa rate-limit & tanpa batas, `NEXT_PUBLIC_APP_URL` via `process.env` masih lolos. |
| **Maintainability** | **7.0** | Tracking per-item 3 putaran sangat baik (18+20→100% fixed). Beban: 700+ LOC god components, `translations.ts` 408 baris flat, `pnpm audit` `continue-on-error`. |
| **Overall** | **8.2 / 10** | Naik dari 8.3 (sebelumnya "kurang lengkap") → 8.6 setelah verifikasi 38/38 → stabil 8.2 setelah full scope (arsitektur + deps). **Production-ready dengan catatan P1/P2 di §3-4.** |

**Yang paling bagus:** RPC atomik + outbox proof (re-hash, `manual_review`, backoff 30·2ⁿ, reconcile) + defense 5 lapis (UI role → BFF `requirePermission` → RPC `SECURITY DEFINER` → trigger → RLS SELECT-only) — di atas rata-rata SaaS.

**Yang paling buruk:** `members-page.tsx` 1166 baris + `product-dialogs.tsx` 1013 baris — single file mengunci seluruh domain.

**Yang paling urgent:** P1 `approve/reject` tanpa `hasPermission` + `export?ids=` tanpa `requireRateLimit` + `ids` tanpa limit.

---

## 2. Project Architecture

### Struktur Folder

```
app/                — Next App Router (3 route groups + api)
  (auth)/           — login, signup, forgot, reset, onboarding/create|join
  (dashboard)/      — layout SidebarProvider+SiteHeader, 8 segment (dashboard, inventory/products|movements, transactions, members, analytics, blockchain, notifications, settings, console) + error.tsx + loading.tsx per segment
  (marketing)/      — layout, page (Hero→Problem→Features→HowItWorks→Blockchain→Security→FAQ→CTA→Footer), about/features/faq, docs/[[...slug]] (fumadocs)
  layout.tsx        — RootLayout: localFont self-hosted, PrivyProvider, Toaster, skip-link
  api/              — 28 route handlers (console 8, internal 6, warehouses 8, faucet, health, wallet, users)
  actions/          — auth.ts, update-profile.ts (server actions legacy)
components/         — 91 file: analytics 5, auth 6, blockchain 1, console 7, dashboard 4, faucet 1, inventory 7, layout 2, marketing 12, members 1, notifications 2, providers 2, realtime 2, shared 14, ui 22, warehouses 4
lib/                — ~112 non-test TS (analytics, auth/permissions 23 PERMISSIONS, blockchain, console, proof/pipeline, realtime, security/rate-limit, supabase/*, validators, warehouses, inventory/csv, i18n)
hooks/              — use-mobile, use-online, use-unread-notifications, use-sign-out
contracts/          — Foundry (WarehouseFactory EIP712, Warehouse, deployments/base-sepolia.json, out/ artifacts)
supabase/           — 44 migrations (0001_users_and_rls → 0044_fix_accept_invitation_idempotency)
content/docs/       — fumadocs MDX, docs/, e2e/, public/templates/products-import.csv
```

### Architecture Pattern

**Hybrid BFF (Next Route Handlers) + Supabase Postgres (RLS + RPC) + Privy wallet + viem Base Sepolia.** Dokumen `DESIGN.md` 1168 baris (§1-84.8 spacing frozen, `StatCard` single source, status semantics) + `PRD.md` 1625 baris + `TECHSTACK.md` + `ARSITEKTUR.md` (340 baris, 3 trust boundaries, §12 RPC inventory hardened) saling konsisten.

- **Next App Router:** 3 route groups isolasi, `proxy.ts` (Next 16 rename middleware), `SidebarProvider` cookie, `Suspense` di dashboard layout, `metadata/viewport/sitemap/robots`, `fumadocs-mdx` di `next.config.mjs`.
- **Supabase:** BFF adalah boundary utama (`requireUser` → `getMemberRole` → `hasPermission` → `requireActiveWarehouse` → `requireRateLimit` → Zod → RPC). RLS hanya tenant boundary. `0037 REVOKE INSERT/UPDATE/DELETE ON products` + `SECURITY DEFINER` RPC + `FOR UPDATE` lock ordering `product→balance→reversal original` konsisten.
- **Privy:** Supabase `getCustomAccessToken` → Privy `customAuth` (`privy-provider.tsx:51`), `supportedChains:[BASE_SEPOLIA]`, server verify `lib/privy/custom-auth.ts`, `lib/wallets/sync.ts` fail-closed.
- **Proof Pipeline:** factory `enqueue/leaseNext/requeue/complete` + `processor` lease→re-hash→treasury→`proof_requeue` backoff 5× + `proof_complete` + QStash `deduplicationId`, `hash.ts` JCS+keccak256, `confirmation` + `reconcile` cron.

### State Management

Server-first (list pages RSC), `useSearchParams` + `useTransition` untuk filter/pagination, `unreadStore` singleton `useSyncExternalStore` (poll 60s + realtime), 2 context saja (`LocaleProvider`, `PrivyProvider`), tanpa Redux/Zustand — minimal tepat. Tidak ada optimistic UI sebelum DB commit (ARSITEKTUR §6).

### Dependency

`next 16.3 / react 19.2 / supabase-js 2.112 / privy 3.37 / viem 2.55 / zod 4.4 / rhf 7.85 / recharts 3.10 / motion 13.1 / base-ui 1.7 / fumadocs 16.14 / lucide 1.31 / pino 10.3` — semua terpakai, 3 heavy but justified (recharts, fumadocs, motion).

### Hal Sudah Bagus

- Atomic `inventory_balances version` + `STALE_STOCK`/`INSUFFICIENT_STOCK` terpisah, outbox proof immutable + re-hash, `manual_review` tidak auto-retry, 2 konfirmasi, reconcile harian.
- 5 lapis defense, idempotency `ON CONFLICT DO NOTHING` + fingerprint SHA-256, `debounce 400` + `nextRealtimeStatus` state machine 15s, `pino` redact, `skip-link`, `FIXED_LOCALE="en-US"` anti hydration mismatch, 44 migrations terurut.

### Hal Bermasalah

- 7 komponen >600 LOC, EN/ID campur, `as Record<string,unknown>` di membership route, `target ES2017` kuno, `proxy.ts` matcher tidak generate dari `PERMISSIONS`, `next.config.mjs` tanpa `optimizePackageImports`/`headers()` CSP, `lib/env.ts skipValidation` longgar.

---

## 3. Critical Issues — P0/P1

### [P1] `approve`/`reject` Stock Adjustment Tanpa RBAC Gate

**Category:** Security / Logic  
**Location:** `app/api/warehouses/inventory/movements/route.ts:274-372` (`case "approve"` `275-346`, `case "reject"` `348-372`)  
**Component:** `POST ?action=approve|reject`

**Problem:** `case "apply"` memanggil `getMemberRole` + `hasPermission(STOCK_IN|OUT|ADJUSTMENT|REVERSAL)` + `requireActiveWarehouse`. `approve`/`reject` hanya `select movement.warehouse_id` + `requireActiveWarehouse` — tidak ada `hasPermission(STOCK_APPROVE_ADJUSTMENT)` sama sekali. UI menyembunyikan tombol via `canApprove = hasPermission(role, PERMISSIONS.STOCK_APPROVE_ADJUSTMENT)` (`movements-page.tsx:173`) tapi BFF tidak enforce.

**Impact:** `STAFF`/`VIEWER` tanpa hak approve dapat `curl -X POST /api/warehouses/inventory/movements?action=approve -d '{"movementId":"…"}'` dan meng-approve adjustment miliknya sendiri bila tahu `movementId`. RPC mungkin punya check internal, tapi trust boundary didokumentasikan sebagai BFF-required (ARSITEKTUR §3, TODO P1-11/12 masih open). Critical untuk ledger.

**Why:** Dua branch tambah belakangan, copy-paste `apply` tanpa permission block.

**Recommendation:** Tambah di awal `approve` & `reject`:
```ts
const role = await getMemberRole(supabase, movement.data.warehouse_id, auth.user.id);
if (!role || !hasPermission(role, PERMISSIONS.STOCK_APPROVE_ADJUSTMENT)) return forbidden("Insufficient permission.");
```
Tambah contract test `approve.test.ts` yang coba STAFF approve → 403.

**Priority:** **P1**

---

### [P1] `GET /api/warehouses/export` Tanpa Rate-Limit & Tanpa Batas `ids`

**Category:** Security / Performance  
**Location:** `app/api/warehouses/export/route.ts:48-53, 88-97`  
**Component:** `exportSelected` (`products-page.tsx:190`)

**Problem:** Handler `export?type=products&ids=uuid,uuid,...` split `ids` + filter `filter(/^[0-9a-f-]{36}$/i)` tanpa limit jumlah. Tidak ada `requireRateLimit` sama sekali (semua handler lain pakai). Attacker member dengan `MOVEMENT_READ` dapat `GET /api/warehouses/export?ids=<5000 UUID>` → `WHERE id IN (5000)` query berat, loop exfiltrasi 5000×N tanpa 429.

**Impact:** Data exfiltration & DB load. Vercel Hobby timeout 10s tapi query besar tetap cost.

**Recommendation:** Tambah `await requireRateLimit("export", auth.user.id, request)` + `if (ids.length > 200) return invalid("Too many ids (max 200).")` + pagination hint.

**Priority:** **P1**

---

### [P1] Timeout Mismatch `maxDuration 120` vs `pollUntilConfirmed 150s`

**Category:** Logic / Reliability  
**Location:** `app/api/warehouses/create/route.ts:60` (`maxDuration =120`) vs `components/warehouses/create-warehouse-form.tsx:437-451` (`MAX_ATTEMPTS 30 * 5000ms =150s`)

**Problem:** Route Handler Vercel kill di 120s, tapi client poll 150s. Deploy `submitted` tanpa finalisasi → baris `warehouses` `submitted` menggantung, user lihat "still confirming" selamanya.

**Impact:** Warehouse submit terlihat gagal padahal sudah on-chain; `idempotencyKey` + `finalizeIfMined` menutupi tapi UX "indefinitely confirming".

**Recommendation:** Samakan `pollUntilConfirmed` ke `24*5000=120s` atau naikkan `maxDuration` ke `150` + tambah `waitForWarehouseDeployment` dengan `AbortSignal.timeout`. Dokumentasikan reconcile job sebagai fallback.

**Priority:** **P1**

---

## 4. Functional Bugs

| # | Location | Component | Problem | Impact | Why | Recommendation | Priority |
|---|---|---|---|---|---|---|---|
| F-01 | `components/warehouses/create-warehouse-form.tsx:182-188` + `components/inventory/product-dialogs.tsx:476-502` | `CreateWarehouse` + `StockMovementDialog` | `STALE_STOCK` auto-close `setTimeout(1200)` tanpa `ref` cleanup; bila dialog unmount, `setState` on unmounted + `onSuccess` fire setelah navigasi | Stale refresh, warning React | Copy-paste tanpa `completeTimerRef` pattern yang sudah fixed di `create-warehouse-form:188` | Pakai `useRef<number>` + `clearTimeout` on `useEffect` cleanup (sudah ada contoh yang benar) | **P2** |
| F-02 | `lib/analytics/aggregate.ts:72-102` | `fillDailyGaps` | `end = new Date()` pakai browser TZ, server RPC `now()` UTC. User UTC+7 `range=7` lihat 6 hari + today off-by-one midnight | Chart 7 hari jadi 6 | Client `new Date` vs DB `now()` | Derive `end` dari `payload.daily[0].day` max atau kirim `endDate` dari server | **P2** |
| F-03 | `components/inventory/products-page.tsx:151-162` | `toggleSelectAll` | `if(next.size && products.every(...))` pakai `next.size` truthiness, bukan `prev`. Dengan 2/12 terpilih di page 1, kondisi false → tambah semua visible (Set dedup sembunyikan bug) tapi intent toggle-off-all jadi clear hanya visible, bukan semua | Bulk archive keep hidden-page selection tidak sengaja | Logika `Set` + `size` campur | Ganti `if (products.every(p=>selected.has(p.id))) clearVisible else addVisible` tanpa cek `size` | **P2** |
| F-04 | `app/api/warehouses/inventory/products/bulk/route.ts:88-97, 182-190` | `bulkCreate` | `bulkCreateProductsSchema` sudah validasi, lalu `bulkProductRowSchema.safeParse(row)` redundant. Error duplicate SKU dalam CSV lolos schema, pertama sukses, kedua `mapDbError("duplicate key")→"This record already exists"` tanpa indeks baris | User tidak tahu baris mana duplicate | Validasi intra-CSV tidak ada | Tambah `Map<sku, index>` check sebelum loop, push `failed` dengan `index` yang jelas | **P2** |
| F-05 | `lib/inventory/csv.ts:52-53,134-139` vs `bulk-add-dialog.tsx:117` | `parseProductsCsv` | `parseCsvMatrix` return `{overflow:true}` di 1000 baris (fixed `v0.2.5` di bulk-add-dialog) tapi `movement export` dan jalur lain masih ignore | Truncate sunyi di jalur lain | Handler lupa cek flag | **Sudah fixed** di `bulk-add-dialog:122` (toast + invalid entry) — **PASS** pertahankan | **P2 (fixed)** |
| F-06 | `components/inventory/movements-page.tsx:236` | `loadMore` | Tidak guard `hasMore===false`; spam "Load more" setelah `hasMore=false` (button masih render via `LoadMore` sampai fetch selesai). `loadingMore` race antara `setLoadingMore(false)` dan `setHasMore` | Duplikat page | Button masih enabled saat `hasMore` false | Guard `if (loadingMore || !hasMore) return` + disable prop di `LoadMore` | **P2** |
| F-07 | `lib/faucet/claim.ts:51-68` + `app/api/faucet/claim/route.ts:46-52` | `faucet` | `checkFaucetRateLimit` `resetMs - Date.now()` asumsikan epoch, padahal Upstash return ms-until-reset → negative. API map semua fail ke `400 INVALID_INPUT` bukan `429` | Client tidak lihat `Retry-After`, tidak bedakan cooldown vs validasi | Salah pahami Upstash shape | Perbaiki `resetMs` handling + return `429` dengan `Retry-After` header untuk cooldown | **P2** |
| F-08 | `components/inventory/products-page.tsx:291-297` | `search useEffect` | `// eslint-disable-next-line exhaustive-deps` + deps `[searchInput, warehouseId, statusFilter]` tanpa `applyFilters`. Closure `searchParams` stale setelah `router.replace(?q=foo)`, keystroke kedua bangun `params` dari query lama, drop `status` | Filter hilang saat ketik cepat | Suppress deps | Masukkan `applyFilters` ke deps via `useCallback` stabil atau bangun `params` dari `window.location.search` fresh | **P2** |
| F-09 | `components/inventory/movements-page.tsx:681-686` | `onSuccess` | `router.refresh(); fetchPage(...).then(setMovements)` duplikat source. Jika realtime fire di antaranya, `fetchPage` timpa data fresher (lost-update) | Stale list | Dua path refresh | Pilih satu: `router.refresh()` saja atau `fetchPage` saja | **P3** |
| F-10 | `app/invite/[token]/page.tsx:36-43` | `accept_invitation` | Render `error.message` langsung dari RPC ke user | Bocor `warehouse not accepting invites` detail DB | Tidak pakai `mapDbError` | Ganti `mapDbError(error.message).userMessage` | **P2** |

**Yang sudah fixed & terverifikasi (tidak perlu diulang):** `product-dialogs` close-guard `busy?null:…`, `notification-preferences` single-flight (`pendingRef/busyRef`), `applyMovement` reason guard di `movements/route:119`, 44px hit-area, `formatChartDay` central, `pageTitle` guard `href!=="/"`.

---

## 5. UI/UX Audit

### Layout

| # | File:Line | Problem | Impact | Recommendation |
|---|---|---|---|---|
| L-01 | `components/ui/double-bezel-card.tsx:40,49` | `radius="2rem"` (32px) `inner calc(2rem-6px)=26px` — 2.7× canonical `rounded-lg 12px` (`globals.css:48`). Marketing 32px vs dashboard `PanelCard 12px` vs `Card 16px` | Visual split: hero terasa "hardware" beda bahasa dari app | Kunci `DoubleBezel` ke `rounded-lg` (12px) atau dokumenkan exception `DESIGN.md §9` variant bezel saja |
| L-02 | `components/ui/card.tsx:15` | `rounded-xl 16px` vs `PanelCard rounded-lg 12px` — 2 radius untuk surface sama. Skeletons `dashboard/loading:9` & `console/loading:16` pakai `rounded-xl` | Corner mismatch side-by-side | Normalisasi `Card → rounded-lg`, allowlist `Toast/CommandMenu` saja |
| L-03 | `app/(auth)/layout.tsx:23` | `max-w-sm rounded-xl p-6 sm:p-8` — 16px + padding jump 24→32 di `sm` | Auth terasa lebih soft dari `PanelCard p-4` | Ganti `rounded-lg p-6` |
| L-04 | `components/members/members-page.tsx:288` | Invite code pill `flex gap-2 border px-3 py-1.5` single row tanpa `flex-wrap/min-w-0` — OWNER lihat "Transfer Ownership" + pill 340px → overflow 375px | Horizontal scroll iPhone SE | `flex-wrap min-w-0` + `truncate` pada code |
| L-05 | `components/inventory/products-page.tsx:309` | Filter bar `w-64` di 375px + `px-4` → 83px sisa untuk selects → wrap 2 baris, sticky bulk bar `z-10` di bawah `SiteHeader z-30` | Bulk bar ketutup header saat scroll | Bulk bar `z-30` + `shadow-elevated` |
| L-06 | `components/blockchain/blockchain-page.tsx:244` | Contract card `flex-wrap gap-4` + stats `flex gap-4` — 4 cols (total/confirmed/pending/failed) 280px + label 120px → ragged right, 3 vs 4 cols jitter saat `failed=0` | Visual jitter | `grid grid-cols-3 sm:grid-cols-4` fix kolom |
| L-07 | `components/marketing/hero.tsx:228,244` | Badge `absolute right-4 rotate-2` di `max-w-md 448px` — di 320px overflow 12px | Clip SE | `right-2 sm:right-4` / `hidden sm:flex` |

### Typography

| # | File:Line | Problem | Impact | Fix |
|---|---|---|---|---|
| T-01 | `marketing/hero.tsx:85` | `h1 44px leading-[1.05] tracking-tight` — `Space Grotesk` descender `g/p` risk clip 3 baris di 375px | Dense | `leading-[1.08]` atau `lg:leading-[1.05]` |
| T-02 | `ui/table.tsx:72,86` | `TableHead 12px uppercase` + `TableCell 14px` good, tapi `sku font-mono 12px 400` kecil untuk scan tabular | Legibility | Keep header 12, data `text-sm` (SKU `text-xs→sm`) |
| T-03 | `notifications/bell 14px` vs `page-view 14px` | Bell body `12px` vs page `14px` — denser dropdown (384px) — **sengaja compact**, now consistent title `14px` (fixed `v0.2.4`) | Accept | Dokumenkan density intent |
| T-04 | `shared/status-badge:41` | `pending bg-secondary/20` di dawn-pink 20% opacity — badge 12px low contrast | Muted | Naikkan `bg-secondary/25` |

### Buttons & Interaction

| # | File:Line | Problem | Rekomendasi |
|---|---|---|---|
| B-01 | `ui/button.tsx:6` | `destructive` tinted `bg-destructive/15` — kurang prominent untuk Archive 5 products vs warning | Bulk archive solid `bg-destructive text-destructive-foreground` untuk Van Restorff |
| B-02 | `auth/login-form:70` | Submit `disabled+text swap` tanpa spinner/`aria-busy` — layout shift 2px | Tambah `<Loader2 animate-spin>` + `aria-busy` (sudah di members/products, belum di auth) — **sisa 1 file belum** |
| B-03 | `products-page:468` | Checkboxes 20px + `before:-inset-[12px]=44px` **FIXED** | PASS — jadi pola |
| B-04 | `site-header:158` | Account trigger `min-h-11` **FIXED** | PASS |
| B-05 | `movements-page:764` | Approve/Reject `toast.success` **FIXED** | PASS — tambah `aria-busy` minor |

### User Flow

- **Create warehouse:** `preparing→finalizing` + `DeploymentSteps` + `indeterminate` bar + `role="alert"` retry/dashboard — **GOOD**. Timer leak fixed `v0.2.4` via `completeTimerRef`.
- **Join warehouse:** validasi `^WH-[A-Z0-9-]+$` client mirror, success timeline 3 step `grid-cols-3` — good. **Gap:** `requestAnother` reset `fieldError` tapi tidak `requestedCode` clear? Minor.
- **Dashboard:** `Promise.all` 7 sources, `formatChartDay` fixed, `rangeHint` via `translate` params — **GOOD**. Gap: `topProducts.length===0` sembunyikan card (gap grid) — tampilkan `EmptyState size=sm`.
- **Members:** invite code + email invite + `TransferOwnershipDialog` — **GOOD**. Gap: `select` warehouse di sidebar vs page duplikat.
- **Bulk add:** preview `Valid/Invalid` + `⊘` 1000 rows toast **FIXED**, label guard **FIXED** — good. Gap: grid 12 col cramped 375px (R-02) — stack `sm:grid-cols-12`.

---

## 6. Responsive Audit

| Breakpoint | Temuan | Lokasi | Solusi |
|---|---|---|---|
| **320px SE** | Badge hero overflow 12px | `hero:228` | `right-2 sm:right-4` |
| **375px** | Invite code pill overflow, filter bar wrap, bulk grid 12 col 28px/col → input 57px | `members 288`, `products 309`, `bulk-add 259` | `flex-wrap`, `grid-cols-6 sm:12`, Name `col-span-6` |
| **768px md** | Hero `gap-14 56px` masih 1-col (LG 1024) → CTA below fold | `hero:69` | `gap-8 md:gap-10 lg:gap-14` |
| **640px** | Table `min-w` jitter 640 vs 720 vs 760 vs 820 | `transactions 720`, `movements 820` | Normalisasi `720` kecuali blockchain `640` |
| **Dialog** | `DialogContent w-[calc(100%-2rem)] 343px` di 375px — bulk `max-w-2xl 672→343` | `ui/dialog:53`, `bulk-add 40` | Bulk responsive collapse |

**Desktop/Tablet PASS**, Mobile **2 overflow** sisa (invite pill, bulk grid) — **P2**.

**Viewport:** `width=device-width initialScale=1` + `themeColor` light/dark array **FIXED** — PASS.

---

## 7. Accessibility Audit

| # | File:Line | Problem | Impact | Fix |
|---|---|---|---|---|
| A-01 | `globals.css:208` | `outline-color: color-mix(var(--ring)50%)` + `prefers-reduced-motion` kill — **PASS**, contrast 5.55:1 AA | — | — |
| A-02 | `ui/button:7` | `focus-visible:ring-3` 3px **PASS**, tapi `SelectItem focus:bg-accent` + `DropdownMenuItem focus:bg-accent` tanpa ring — hanya warna | Keyboard tab list hanya color shift | Tambah `focus-visible:ring-3` di `select:119` & `dropdown-menu:94,168` |
| A-03 | `auth/login:36` | Banner `id="login-error"` + `aria-describedby="login-error"` **FIXED**, tapi `FormField` clone `aria-describedby` ke `${id}-error` override manual `login-error` | Screen reader lose global error | Use `FormField error={error}` single wiring, hapus manual |
| A-04 | `layout:98` + `dashboard/layout:58` | Dua `id="main-content"` (root `<main id>` + `SidebarInset id`) — duplicate ID nest | Invalid HTML, skip-link ganda | Dashboard `id="dashboard-main"` |
| A-05 | `ui/table:67` | `th` tanpa `scope="col"`, tanpa `TableCaption sr-only` | Assoc header hilang | Add `scope="col"` + `sr-only` caption |
| A-06 | `blockchain-page:363` | Tooltip `span` truncate non-interactive, tidak keyboard focus | Keyboard tidak lihat error | Trigger jadi `button` + `aria-describedby` |
| A-07 | `ui/sidebar:402` | `SidebarGroupLabel` div pakai `focus-visible:ring` tidak perlu | Noise | Hapus ring di label |
| A-08 | `app/layout:86` | Inject `localStorage theme` via `dangerouslySetInnerHTML` — tanpa `nonce`, tapi non-HTML string aman | Info | Tambah `nonce` bila CSP ada |

**Skor Aksesibilitas keseluruhan: 9/10 — 2 minor tersisa (A-02, A-04).**

---

## 8. State & Logic Audit

- **Duplicate mirror:** `notification-bell 46-66` `notifications+ref+unreadRef` + custom `setNotifications` wrapper — fragile, seharusnya `useReducer`. **P3.**
- **Prop drilling:** `warehouseId` 3-4 level (`page→ProductsPage→Dialog→api`) — helper `warehouse-url` kurangi tapi rantai tetap. Rekomendasi `WarehouseContext` di `dashboard/layout`. **P2 (debt).**
- **Global vs local:** `unreadStore` singleton + poll 60s vs bell realtime — last writer wins ±1 drift. **P3.**
- **Rerenders:** `members-page 1166` 24 hooks, `products-page` inline `renderActions` per product tanpa `memo` — 12/page mask, 1000-row bulk preview tanpa virtualisasi. **P3.**
- **Debounce:** `use-warehouse-realtime` debounce 400 per mount, no `maxWait` → burst >400ms starve. Tambah `maxWait 2000`. **P3.**
- **Missing cache:** `fetchAnalytics` per request tanpa `revalidate 60` atau `cache()` — dashboard DB hit tiap nav. **P3.**
- **Warehouse switcher:** sidebar global vs page local `Select` duplikat. **P3.**

---

## 9. API & Data Flow Audit

- **Rate-limit:** `lib/security/rate-limit 75` fail-closed benar, tapi `faucet/claim` return `400` bukan `429` (F-07). **P2.**
- **Swallow:** `products/route:131 publishProofJob().catch(()=>undefined)` silent — reconciliation safety net tapi tanpa `logger.warn`. **P3.**
- **BFF bypass:** `movements-page:187` `supabase.from("stock_movements")` langsung client via RLS, bukan API — bocor bila RLS misconfig. Sisa list via RSC server — inkonsisten. **P2.**
- **Cache none:** `aggregate.ts` + `contracts.ts loadRegistry readFileSync` tiap call — cache di module scope. **P3.**
- **Race:** `fingerprint` hitung setelah `await actorWallet+product` 2× `await` → `different fingerprint` untuk concurrent same version → `IDEMPOTENCY_CONFLICT` tidak trigger. **P3.**
- **Intent poll:** `product-dialogs:378` `15×3s=45s` + `idempotencyKey.current` reuse bila dialog tutup → `IDEMPOTENCY_CONFLICT` kedua kali. Reset key on close. **P3.**

---

## 10. Performance Audit

| Area | Temuan | Impact | Rekomendasi | Priority |
|---|---|---|---|---|
| **Bundle heavy** | `recharts` ~120kB + `fumadocs` ~200kB + `motion` ~60kB + `base-ui` — semua eager | First load >350kB gz | `next/dynamic` `ssr:false` untuk `recharts` & `fumadocs` MDX, `motion` lazy hanya marketing | **P2** |
| **Eager dialogs** | `products-page 705` import `ProductForm/BulkAdd/StockMovement/Detail/Archive` sync | Ship 5 dialog padahal user mungkin tidak buka | `dynamic(() => import('./bulk-add-dialog'))` | **P2** |
| **Unvirtualized list** | `movements:868` `setMovements([...prev, ...items])` hingga 1000 row → 1000 `TableRow` + `li` DOM (hidden `md:hidden` tetap di DOM) | Memory + paint 1000×2 | `react-window` atau pagination hard limit + `virtual` | **P2** |
| **CSV parse main thread** | `csv.ts:52` 1 MB parse O(n) di main thread | Block UI 1000 baris | Chunk `setTimeout` atau Worker | **P3** |
| **Console summary** | `lib/console/data:48` select seluruh `warehouses/proofs/outbox` lalu `countBy` di JS | 10k rows transfer untuk 4 bucket | `select count exact` RPC | **P2** |
| **Balance client** | `lib/blockchain/balance 14` `createPublicClient` per call tanpa cache | HTTP pool baru tiap dashboard | Cache transport di `lib/blockchain/chains.ts` | **P3** |
| **Images** | Landing tanpa `next/image` untuk preview card (pure CSS) | No issue | — | — |
| **Split** | `next.config` tanpa `optimizePackageImports` | Tree-shake `lucide/recharts` tidak optimal | Tambah `experimental.optimizePackageImports: ["lucide-react","recharts","@base-ui/react"]` | **P3** |

**Critical vs Minor:** Virtualized list + `recharts` dynamic adalah **critical** untuk scale; `CSV` worker adalah **minor**.

---

## 11. Security Audit

| Item | Severity | Status | Lokasi | Rekom |
|---|---|---|---|---|
| Env exposure | ✅ Clean | `lib/env 114` `skipValidation` longgar tapi `.env` tidak commit, `NEXT_PUBLIC_*` hanya publishable | Info | Ganti `skipValidation: !!process.env.SKIP_ENV_VALIDATION` |
| RLS invitations | ✅ Correct | `supabase/migrations 0042` | — | — |
| Token strength | ✅ Clean | `lib/warehouses/invite` single-use | — | — |
| **Approve without RBAC** | **Likely** | `movements/route:274` | **P1** | Tambah `hasPermission` |
| **Export ids no RL/ no limit** | **Confirmed** | `export/route:48` | **P1** | `requireRateLimit` + `>200` guard |
| Invite `process.env.NEXT_PUBLIC_APP_URL` langsung | Likely | `members/invite/route:72` | Ganti `env.NEXT_PUBLIC_APP_URL` | **P2** |
| `getClientIp` `x-forwarded-for` spoof | Potential | `rate-limit:144` | Doc trust Vercel | **P3** |
| `safeNext` `/\n` bypass | Potential | `invite/page:45` | Allowlist path | **P3** |
| QStash `Receiver.verify` no `Message-Id` freshness | Info | `verify-request:30` | Rely JWT exp | — |
| XSS `JSON.stringify` `</script>` | Potential | `faq/page:33` `dangerouslySetInnerHTML` | `.replace(/</g,"\\u003c")` | **P3** |
| `NEXT_PUBLIC_PRIVY_APP_ID` via `process.env` di client | Info | `privy-provider:36` | Pakai `env` import | **P3** |
| No CSP | Info | `proxy.ts` | Tambah `headers()` CSP | **P3** |

---

## 12. Code Quality Audit

| Area | Temuan | Lokasi | Rekomendasi |
|---|---|---|---|
| **Component size** | `members-page 1166`, `product-dialogs 1013`, `movements-page 868`, `create-warehouse-form 776`, `sidebar 671`, `products-page 705`, `create/route 505`, `dashboard/page 456`, `translations 408` — 7 >600 LOC | — | Split: `members/dialogs/*`, `stock-movement-dialog.tsx`, `use-warehouse-deploy.ts`, `ListToolbar`, `load-dashboard.ts` |
| **Duplicate code** | Toolbar `flex gap-4` 4×, `low` logic 2× (desktop/mobile), `manageable/assignable` 2×, `proof payload` 3× (`products/route`, `bulk/route`, `intents/route`), `shortenAddress` 3× | — | Extract `useInventoryQueryParams`, `<ProductRow>`, `getAssignableRoles`, `build-intent-payload`, `lib/format/address.ts` |
| **Naming** | Bilingual `ARSITEKTUR.md` vs code EN, route `blockchain` vs nav `Audit Explorer` | — | Alias `/audit` atau rename folder |
| **Type safety** | 5× `as Record<string,unknown>` + `as` casts di `dashboard/page:189`, `members/page:87`, `as` di `membership/route:165` | — | Ganti Zod validators + `supabase --gen types` |
| **Abstraction** | `StatusBadge` tone map campur movement/role, `EmptyState` vs inline `<p>` di dashboard recent | — | `statusBadgeVariants` CVA, `EmptyState size=sm` |
| **Coupling** | UI → DB direct `supabase.from("stock_movements")` di `product-dialogs:340` + `ProductDetailSheet 835` — langgar BFF | — | `GET /api/.../movements?limit=5` |
| **Consistency** | `skipValidation` dev longgar, `INTENT_RPC_MESSAGES` duplikat `domain/errors` | — | Merge ke `domain/errors` |
| **Comments** | TODO/FIXME 0 di app code — **excellent** hygiene | — | Pertahankan |

---

## 13. Dead Code & Cleanup

| Item | Status | Action |
|---|---|---|
| `scripts/check-analyze.mjs` (34 LOC) vs `scripts/analyze-routes.mjs` (26 LOC) — duplikat `next experimental-analyze` | **Dead duplicate** | Hapus satu, simpan `preflight.mjs` |
| `public/next.svg, vercel.svg, globe.svg, window.svg` | **Unused** (Next starter) | Hapus 4 SVG, keep `templates/products-import.csv` |
| `lib/warehouses/chain.ts` — re-export `baseSepolia` saja? | Potential | Cek `grep import.*chain.ts` — bila hanya re-export, hapus |
| `hooks/use-mobile.ts` vs `useIsMobile` | **Alive** (`sidebar.tsx` import) | Keep |
| `lib/inventory/status-meta.ts` vs `lib/blockchain/proof-meta.ts` | **Alive** (v0.2.4 baru, 4 file pakai) | Keep |
| Unused imports/variables | **Clean** — `eslint` green kecuali 3 yang baru fixed | — |
| `fumadocs` trio | **Heavy but used** (`docs/[[...slug]]`) | Keep, tapi `dynamic` |
| `pino` di client `api-handler` | Server-only, tapi import di Route Handlers saja — aman | Keep |

**Potential dead — requires verification:** `lib/warehouses/chain.ts`, `scripts/check-analyze.mjs`.

---

## 14. Dependency Audit

| Package | Versi | Impact | Verdict |
|---|---|---|---|
| `next 16.3 / react 19.2` | Core | Keep, sudah `proxy.ts` migrasi |
| `viem 2.55` | Large, tree-shake | Keep |
| `@privy-io/react-auth 3.37` + `@privy-io/node 0.28` | Heavy (wagmi/metamask transitive) | Keep — produk choice |
| `@supabase/ssr 0.12 / supabase-js 2.112` | Medium | Keep |
| `fumadocs-* 16.14` | **Heavy ~200kB** docs only | Keep tapi `dynamic` |
| `motion 13.1` | ~60kB | Keep marketing, lazy |
| `@base-ui/react 1.7` alpha | Medium | Keep (shadcn base-nova) |
| `recharts 3.10` | **~120kB gz** analytics only | Keep tapi `dynamic ssr:false` |
| `zod 4.4` (tapi pnpm store ada 3× `3.22,3.25,4.4` dari openzeppelin/fumadocs) | Medium | Dedup via `pnpm.overrides`, sudah ada? Cek `pnpm-workspace.yaml` |
| `react-hook-form 7.85 + resolvers 5.7` | Medium | Keep |
| `pino 10.3` | Small | Keep |
| `tailwind-merge/clsx/cva` | Tiny | Keep |
| `lucide 1.31` | Tree-shake | Keep |
| `ws` ×4, `axios` via privy→wagmi | Vuln high via `privy→wagmi→cdp-sdk→axios` — `ci.yml` `continue-on-error:true` | **P2** Tambah `overrides {axios>=1.7.4, ws>=8.17.1}` + `continue-on-error:false` |
| Dev: `eslint 9, tailwind 4, vitest 4.1, playwright 1.62` | — | Keep |

**No unused, no deprecated, 3 heavy but justified** — fokus `dynamic` + budget gate, bukan hapus.

---

## 15. Missing Features

### Must Have

| # | Fitur | Ref | Status | Gap |
|---|---|---|---|---|
| **M-1** | **Owner wallet migration end-to-end** | `PRD §19`, `TODO:215` | **Partial** — `Warehouse.transferOwnership()` kontrak ada, `TransferOwnershipDialog` hanya DB `transferOwnership({newOwnerId})` tanpa Privy sign → `on_chain_owner_wallet` tidak sync | Belum ada `POST /warehouses/membership/transfer` dengan EIP-712 sign + treasury relay |
| **M-2** | **Factory v2 cutover** | `TODO:217` | Registry `base-sepolia.json 0x3811…8Bf48` v2 deploy, env masih v1 | Runbook + set `WAREHOUSE_FACTORY_ADDRESS` preview→prod |
| **M-3** | **Live Upstash/Redis fail-closed verify** | `TODO:214` | Unit test ada, live prod belum | `vitest lib/security/rate-limit.live.test.ts` dengan `UPSTASH_REDIS_REST_URL` |
| **M-4** | **RLS bypass live contract test** | `TODO:220` | Auto-skip tanpa `SUPABASE_SECRET_KEY` | `pnpm test rls-bypass` vs preview DB |

### Should Have

| # | Fitur | Ref | Status |
|---|---|---|---|
| S-1 | **XLSX + JSON export** | `PRD §23` | Hanya CSV — tambah `exceljs` `type=xlsx` |
| S-2 | **Product pagination server-side keyset** | `PRD §29` | `perPage=12` prop tapi query `ilike` in-memory — perlu cursor |
| S-3 | **Command palette add Stock In/Out/Product** | `PRD §26` | 10 nav saja, kurang 3 quick-action |
| S-4 | **Dark mode cookie + fumadocs scoping** | `TODO:264` | `ThemeToggle` localStorage tanpa SSR cookie → flicker |
| S-5 | **Inactivity cron 23/27/30d** | `PRD §20` | `lifecycle` route ada, `vercel.json` hanya `keep-alive` cron |

### Nice Have

N-1 Screenshot landing, N-2 grouping notif dedup, N-4 `effective-schema.md`, N-5 `CHV-` vs `WH-` docs, N-6 i18n ID full.

### Avoid

- Realtime presence avatars (overkill untuk free-tier), - AI chatbot inventory (scope creep), - Multi-warehouse analytics cross-join (heavy).

---

## 16. UI/UX Removal Recommendations

| UI | Location | Alasan | Rekomendasi |
|---|---|---|---|
| **Duplicate warehouse switcher** (sidebar global + page local `Select`) | `app-sidebar:87` vs `products-page:327, movements-page:287` | Dua sumber truth, 2 render, 2 state | **Remove** page-level `Select`, keep sidebar global + `useCurrentWarehouse()` |
| **Extra radius tier `2rem` bezel** | `double-bezel-card:40` | 32px vs 12px app — split bahasa | **Remove** atau lock ke `12px` |
| **Dense stats gradient** `from-primary/5 to-card` `shadow-xs` tiap `StatCard` | `dashboard/page:283` | Gradient + shadow tiap card → visual noise di grid 4 | **Simplify** ke `bg-card border` flat, gradient hanya hero |
| **Inline `<p>` empty** di `recentTransactions/Movements/Activity` `top-products` | `dashboard/*` | Beda tinggi, tanpa CTA | **Remove** inline, ganti `EmptyState size=sm` |
| **Redundant `gap-5/p-5`** di luar spacing scale `4/8/12/16/24` | Banyak file | Luar `DESIGN.md §84.1` | **Remove** `gap-5/p-5`, pakai `gap-4/6` |
| **Raw `h-12` di `create-warehouse` submit** vs `h-11` sistem | `create-warehouse-form:790` | 48px vs 44px system | **Simplify** ke `h-11` atau dokumenkan CTA exception |

---

## 17. UI/UX Addition Recommendations

| UI | Lokasi | Alasan |
|---|---|---|
| **ListToolbar primitive** `flex gap-4` | 4 halaman list | Gantikan duplikat toolbar (products/movements/members/transactions) dengan 1 komponen |
| **`<ProductRow>` row component** | `products-page` desktop+mobile | Hilangkan duplikat `low` logic desktop vs `li` |
| **`shortenAddress` helper** `lib/format/address.ts` | `profile-wallet`, `members`, `blockchain` | 3× `slice(0,6)…` duplikat |
| **`toast.success()` helpers** | 20× `toast.add` | `notifySuccess("Product archived")` konsisten |
| **`TableCaption sr-only`** | `ui/table` | Aksesibilitas header assoc |
| **Pagination `useTransition` pending** | `transactions-page:89` | `goTo` `router.replace` tanpa spinner — tambah `isPending` + `Loader2` seperti products |
| **"Resend invite" cooldown** | `forgot-password-form 28` | `Check email` tanpa resend → user stuck |
| **Tabs → `?tab=` URL sync** | `console:39` | Sharing `Health` tab hilang |
| **Warehouse code copy feedback** `aria-live` | `members:224` | Sudah ada toast, tambah inline `Copied` 1.5s |
| **Faucet `Retry-After` header UI** | `faucet/claim:60` | Setelah fix F-07, tampilkan countdown `Available in 08:32:14` sudah ada — sambungkan ke header |

---

## 18. Design System Recommendations

| Token | Saat Ini | Rekomendasi |
|---|---|---|
| **Colors** | `Dawn Pink #E4D5C7` bg, `Fun Green #186049` primary, `Tradewind #6AB29B` secondary, `warning #8A5A0B` 5.1:1, `muted #1E5B46` 5.55:1 — **PASS AA** | Pertahankan. Tambah `statusBadgeVariants` CVA `tone→class` agar tidak bypass token via inline `bg-warning/15` |
| **Typography** | `Space Grotesk` display + `Plus Jakarta Sans` body (412878 vercel), `text-2xl` h1, `text-sm` body, `tabular-nums` data — **GOOD** | Skala `12/14/16/18/24/30/44/60` sudah, tambah `text-[13px]` exception hanya di `page-header` bila perlu — jangan di bell |
| **Spacing** | `DESIGN §84.1` micro 4/8, component 12/16, section 24/32 — tapi code masih `gap-5/p-5` liar + `density --space-unit 4px` dead | Hapus dead token atau wire `calc(var(--space-unit)*4)`, lint `gap-5` via `preflight` |
| **Radius** | `sm 6, md 8, lg 12, xl 16` — tapi `Card 16`, `DoubleBezel 32` | Kunci `rounded-lg 12` app, `rounded-xl 16` overlay (`Dialog/Toast/Command`), `2rem` hanya marketing bezel (document exception) |
| **Shadows** | `--shadow-card 0 1px 2px`, `shadow-elevated 0 2px 8px`, `shadow-modal 0 12px 32px` — tapi `StatCard` pakai `shadow-xs` Tailwind | Map: `PanelCard → shadow-card`, `Dialog → shadow-modal`, expose `shadow-card` utility, hapus `shadow-xs` |
| **Buttons** | `h-11 44px` + `before:-inset` 46-58px hit — **GOOD**, variant `default/outline/secondary/ghost/destructive/link` | Buat `destructive` solid untuk bulk archive, tinted untuk secondary |
| **Inputs** | `h-11` + `focus-visible:ring-3` — **GOOD** | Pertahankan, tambah `aria-describedby` wiring via `FormField` saja (hapus manual) |
| **Cards** | `PanelCard solid/dashed/tinted` + `Card` — overlap | Dokumen: `PanelCard` untuk list containers, `Card` untuk stat/chart |
| **Tables** | Header `h-11` + Body `h-14` frozen `h-10/h-14` — **GOOD** | Tambah `scope="col"` + `sr-only` caption |
| **Modal** | `Dialog w-[calc(100%-2rem)] max-w-lg 85vh` — **GOOD** | Pertahankan, bulk `max-w-2xl` responsive collapse ke `sm` 1-col |
| **Toast** | `ring-1 shadow-lg` custom `toast.tsx` 229 LOC — good | Tambah helpers `notifySuccess` |
| **Badge** | `h-5 text-xs` + `StatusBadge` tone 6 — **GOOD** (suspended kini amber) | Ekstrak `statusBadgeVariants` |
| **Navigation** | Sidebar `OPERATIONS/GOVERNANCE/SYSTEM/DEVELOPER` grouped, `Nav 44px` — **GOOD** | Generate `proxy.ts` matcher dari `NAV_SECTIONS` |

---

## 19. Frontend Upgrade Recommendations

**Jangan "desain modern" generik — perubahan konkret:**

1. **Redesign dashboard hierarchy:** `ProfileWalletCard` (klikable besar) saat ini di atas stats — benar, tapi stats `grid 4` + `lowStock` second grid `md:grid-cols-2` → reflow. Gabungkan lowStock/pending ke grid utama sebagai `StatCard` dengan `tone warning` + `delta` agar 4→6 tanpa `-mt`.
2. **Simplify navigation:** Hapus page `Select` warehouse, sisa sidebar `WarehouseContext`. Satu truth.
3. **Improve responsive layout:** Normalisasi `min-w` tabel `720` semua, `bulk-add` grid `6 sm:12`, hero badge `right-2 sm:4`.
4. **Create reusable system:** `ListToolbar`, `<ProductRow>`, `useInventoryQueryParams`, `shortenAddress`, `toast-helpers`, `statusBadgeVariants`.
5. **Standardize spacing:** Lint `gap-5/p-5` → `gap-4/6`, wire `density` atau hapus.
6. **Improve typography:** `h1 44px leading 1.05 → 1.08`, SKU `12→14`, bell body 12 vs 14 dokumentasikan.
7. **Improve form UX:** Auth submit spinner + `aria-busy`, gender `Select` required + `FormField error`, `CopyButton` `aria-live` "Copied".
8. **Improve feedback:** `LoadMore` guard `hasMore`, `transactions` pagination `useTransition` pending, `approve/reject` `aria-busy`.
9. **Improve skeletons:** `rounded-lg` untuk card, `rounded-md` untuk row — samakan target.
10. **Improve empty states:** Ganti inline `<p>` di `recent*` dengan `EmptyState size=sm`.
11. **Improve error states:** `settings` wallet `ErrorState` dengan retry, `console` tabs sync `?tab=`.
12. **Improve mobile nav:** Bulk bar `z-30`, invite pill `flex-wrap`, hero badge responsive.

---

## 20. BEFORE → AFTER

### 1) Members `SUSPENDED` Tone

**Before:** `members-page.tsx:686` mobile `failed` (merah destruktif) vs desktop `suspended` (abu) — data sama warna beda per breakpoint. User lihat suspended jadi error terminal di HP.

**After:** `suspended` `bg-warning/10 text-warning border` di kedua breakpoint, `inactive` `bg-muted text-muted-foreground`. Suspended terasa "pause" bukan "failed".

**Reason:** Semantik warna konsisten, reduce panic, tetap beda dari `inactive`.

### 2) Approve/Reject Silent

**Before:** `movements-page:764` dialog tutup tanpa toast, user tidak tahu commit sukses sebelum realtime 400ms.

**After:** `toast.success "Movement approved · 10 pcs for SKU"` + `router.refresh` — feedback instan, parity dengan members.

**Reason:** Closed loop, Fitts + WCAG feedback.

### 3) Checkboxes 36px

**Before:** `size-5 20px + before:-inset-2 8px =36px` (<44px AAA) di 3 lokasi.

**After:** `before:-inset-[12px] 12px =44px` exact — WCAG 2.5.8 pass, `preflight` green.

**Reason:** Target 44px adalah AAA, 36 adalah fail — terutama di mobile `mt-1` tanpa hit.

### 4) CSV 1000+ Rows Silent Truncate

**Before:** `parseCsvMatrix overflow:true` tapi `bulk-add-dialog` ignore — 1001 rows → 1000 import tanpa warning.

**After:** Toast `warning "Only first 1,000 rows imported"` + `invalid` entry `Row 0: … truncated`.

**Reason:** Cegah data loss diam-diam.

### 5) Chart Green-on-Green

**Before:** `stockIn #186049` + `stockOut #6AB29B` (dua hijau) + `top-products` bar sama — deuteranopia tidak beda.

**After:** `stockOut` → `var(--warning) #8A5A0B` amber di `stock-movement-chart` & `top-products` — hue berbeda, legend tetap.

**Reason:** 8% pria deuteranomaly butuh hue, bukan hanya tone.

### 6) Build Offline

**Before:** `app/layout.tsx` `next/font/google` fetch Google saat build — sandbox/container terisolasi `Failed to fetch Plus Jakarta Sans` → build gagal.

**After:** `next/font/local` + 8 TTF self-host `app/fonts/` — 0 network, reproducible, + `localFont` variable sama.

**Reason:** Build robustness, Vercel/self-hosted parity.

---

## 21. PRIORITY ROADMAP

### Phase 1 — Critical Fixes (1-2 hari)

- P1 approve/reject RBAC gate `movements/route:274` (`hasPermission STOCK_APPROVE_ADJUSTMENT`)
- P1 export `ids` limit 200 + `requireRateLimit` (`export/route:48`)
- P1 `maxDuration` ↔ `pollUntilConfirmed` 120 vs 150 sync (`create/route:60` vs `create-warehouse-form:437`)
- F-07 faucet `resetMs` & `429` + `Retry-After` (`faucet/claim`)
- A-04 duplicate `id="main-content"` → `dashboard-main`
- F-01 `STALE_STOCK` timeout `ref` cleanup

### Phase 2 — UX Improvement (3-5 hari)

- F-02 `fillDailyGaps` TZ fix (UTC)
- F-03 `toggleSelectAll` + F-08 search `exhaustive-deps`
- F-06 `loadMore` guard + R-02 bulk grid responsive + R-04 hero badge + L-04 invite pill
- B-02 auth spinner + A-02 ring di `SelectItem/DropdownMenuItem`
- A-03 `FormField` vs manual `aria-describedby` unifikasi
- Missing states: dashboard `recent*` → `EmptyState`, analytics `topProducts` empty, settings wallet `ErrorState`, console tabs `?tab=`

### Phase 3 — UI Redesign (1 minggu)

- Normalisasi radius: `Card 16→12`, `Auth 16→12` atau dokumen exception; `DoubleBezel 32` lock
- Shadow token map `shadow-card/elevated/modal`
- Design tokens: `statusBadgeVariants` CVA, `spacing` lint `gap-5`, `TONE_CLASS` map
- Tabel `scope="col"` + `TableCaption sr-only` + `min-w 720` normalisasi

### Phase 4 — Architecture & Code Quality (1-2 minggu)

- Split `members-page 1166→4` + `product-dialogs 1013→3` + `create-warehouse-form 776→hook` + `products-page 705→toolbar/table/mobile` + `create/route 505→deploy-service`
- `WarehouseContext` hapus prop drilling, `useInventoryQueryParams` dedup, `shortenAddress` helper, `toast-helpers`
- Extract `lib/proof/build-payload` dedup 3×, `lib/supabase/factory` single, `lib/redis/client` share
- `lib/i18n` split `locales/{en,id}.json` + `TranslationKey` type, `supabase --gen types` ganti `as` casts

### Phase 5 — Performance & Polish (1 minggu)

- `recharts` + `fumadocs` `next/dynamic ssr:false`, `motion` lazy marketing only, `next.config optimizePackageImports`
- Virtualize `movements` 1000 rows (`react-window`), chunk `csv` Worker, `console/data` DB aggregation `count exact`, cache `loadRegistry` + `balance` transport, `analytics revalidate 60`

---

## 22. QUICK WINS — High Impact, Low Effort (≤1 jam total)

| # | Perubahan | File:Line | Impact | Effort |
|---|---|---|---|---|
| Q-01 | `approve/reject` tambah 4 baris `hasPermission` | `movements/route:274` | **P1 security** | 5m |
| Q-02 | `export` tambah `requireRateLimit` + `ids.length>200` | `export/route:48` | **P1 exfil** | 10m |
| Q-03 | `loadMore` guard `if(!hasMore\|\|loadingMore) return` | `movements-page:236` | Cegah duplikat | 1m |
| Q-04 | `toggleSelectAll` ganti `if(products.every(...))` | `products-page:151` | Bulk select benar | 2m |
| Q-05 | `searchEffect` deps `[applyFilters]` + `useCallback` deps fix | `products-page:291` | Filter tidak hilang | 5m |
| Q-06 | `TableHead scope="col"` + `sr-only caption` | `ui/table:67` | A11y AA | 3m |
| Q-07 | `SiteHeader` duplicate `id="main-content"` → `dashboard-main` | `layout:95` vs `dashboard/layout:58` | Valid HTML | 2m |
| Q-08 | `SelectItem` + `DropdownMenuItem` `focus-visible:ring-3` | `select:119`, `dropdown:94` | Keyboard visible | 3m |
| Q-09 | `bulk-add` grid `grid-cols-6 sm:grid-cols-12` | `bulk-add:259` | Mobile usable | 5m |
| Q-10 | Hero badge `right-4 → right-2 sm:right-4` | `hero:228` | SE 320 tidak clip | 1m |
| Q-11 | `faucet` `resetMs` fix + `429 Retry-After` | `faucet/claim:51` | Rate-limit UX | 10m |
| Q-12 | `invite pill` `flex-wrap min-w-0 truncate` | `members:288` | No overflow 375 | 2m |

**Total estimasi: 45 menit untuk 12 win — langsung naik 0.5 poin Overall.**

---

## 23. TOP 20 IMPROVEMENTS — Ranked by Impact

| Rank | Improvement | Category | Impact | Effort | Priority |
|---|---|---|---|---|---|
| **1** | RBAC gate `approve/reject` | Security | High | Low | **P1** |
| **2** | Export `ids` limit + rate-limit | Security | High | Low | **P1** |
| **3** | Split `members-page 1166` + `product-dialogs 1013` | Code Quality | High | Med | **P1** |
| **4** | `recharts`/`fumadocs` `dynamic` + `optimizePackageImports` | Performance | High | Low | **P2** |
| **5** | Virtualize `movements` 1000 rows | Performance | High | Med | **P2** |
| **6** | `WarehouseContext` hapus prop drilling | Architecture | High | Med | **P2** |
| **7** | `maxDuration` vs poll 120/150 sync | Reliability | High | Low | **P1** |
| **8** | Faucet 400→429 + `Retry-After` | Logic | High | Low | **P2** |
| **9** | `STALE_STOCK` timeout cleanup | Logic | Med | Low | **P2** |
| **10** | TZ fix `fillDailyGaps` UTC | Logic | Med | Low | **P2** |
| **11** | Search `exhaustive-deps` + `toggleSelectAll` | Logic | Med | Low | **P2** |
| **12** | Offline fonts self-host (`v0.2.5` done) | Reliability | Med | Low | **P2 (done)** |
| **13** | Recent `EmptyState` + analytics top empty | UX | Med | Low | **P3** |
| **14** | Transactions pagination `useTransition` pending | UX | Med | Low | **P3** |
| **15** | `loadMore` guard + bulk grid responsive | Responsive | Med | Low | **P2** |
| **16** | `aria-describedby` unifikasi + `scope col` | A11y | Med | Low | **P2** |
| **17** | `Duplicate id main-content` | A11y | Med | Low | **P2** |
| **18** | `invite` `process.env` → `env.*` + `mapDbError` | Security | Med | Low | **P2** |
| **19** | `console/data` DB aggregation | Performance | Med | Low | **P2** |
| **20** | `pnpm overrides` `axios/ws` + `continue-on-error:false` | Security | Med | Low | **P2** |

---

## 24. FINAL VERDICT

### Apa yang sudah bagus?

- **Ledger & proof:** Atomik `version` + `insufficient` terpisah + `FOR UPDATE` ordering + outbox `manual_review` 5× backoff — di atas rata-rata SaaS, layak jadi case study.
- **Defense depth:** 5 lapis (UI→BFF→RPC→trigger→RLS) konsisten, `fromPostgrestError` tidak bocor, `rate-limit` fail-closed, `pino` redact.
- **A11y & polish:** 44px hit, `aria-describedby`, `prefers-reduced-motion`, contrast 5.55:1, `FIXED_LOCALE`, `themeColor` dark, chart amber — semua dari audit internal benar-benar nyampe ke kode (38/38).
- **Tracking:** TODO 269 baris + per-item verify 3 putaran — maintainability 9.5/10 sebelum full scope, tetap 7/10 setelah scope penuh karena god components.

### Apa yang paling buruk?

- **God components 700-1166 LOC** — `members-page` + `product-dialogs` + `movements-page` + `create-warehouse-form` + `products-page` mengunci 60% domain di 5 file. Review PR akan selalu conflict, onboarding dev baru lambat. Ini **tech debt #1**, bukan bug.
- **Dual heavy docs/chart:** `fumadocs` 200kB + `recharts` 120kB eager di first load — Hobby 1MB budget terancam.
- **Security P1 2 titik** (`approve` tanpa RBAC, `export` tanpa RL/limit) — satu-satunya blocker production.

### Apa yang paling urgent?

1. P1 `approve/reject` RBAC (5m) 2. P1 `export` limit+RL (10m) 3. P1 `maxDuration` sync (5m) — **20 menit untuk hilangkan blocker.**

### Apa yang sebenarnya tidak perlu disentuh?

- **Marketing hero/CTA/FAQ** — sudah `motion` + `text-balance` + `DoubleBezel` konsisten, tidak perlu redesign.
- **Supabase migrations 44** — urutan + `REVOKE` sudah rapi, jangan refactor.
- **Contracts `WarehouseFactory` EIP712** — tidak perlu sentuh sebelum Factory v2 cutover.
- **Tailwind v4 + `globals.css` tokens** — sudah AA, jangan ganti palette.

### Apa yang harus dihapus?

- `public/{next,vercel,globe,window}.svg` starter, `scripts/{check-analyze,analyze-routes}.mjs` duplikat, `lib/warehouses/chain.ts` re-export bila memang alias.

### Apa yang harus ditambahkan?

- 4 **Must Have** (owner migration E2E, Factory v2 runbook, live Upstash verify, RLS bypass live test) + 5 **Should Have** (XLSX export, keyset pagination, command quick-actions, dark cookie, lifecycle cron). Semua ada di §15.

### Apakah project sudah production-ready?

**Ya, dengan syarat 20 menit P1 fix.** Tanpa fix, **hampir ready** (8.2/10). Dengan fix, **8.7/10** — siap demo investor + Vercel Hobby deploy. Untuk scale 10k proofs, butuh Phase 5 virtualize + DB aggregation.

### Apa yang akan membuat project terlihat jauh lebih profesional?

Bukan redesign besar — **tiga hal kecil:**

1. **Pecah god components** → PR kecil, review cepat, terlihat engineering mature.
2. **`recharts` dynamic + `optimizePackageImports`** → Lighthouse first load 350→220kB, terasa instan.
3. **`WarehouseContext` + `ListToolbar` + `statusBadgeVariants`** → hapus 4× duplikat toolbar, prop drilling hilang, design system terlihat "sengaja".

Tiga itu saja sudah naik dari "side project rapi" ke "SaaS team — production codebase".

> **Catatan terakhir:** Audit ini sengaja jujur dan actionable, bukan pujian. Tujuan bukan "tidak error", melainkan `lebih usable + lebih konsisten + lebih modern + lebih maintainable + lebih performant + lebih scalable + lebih production-ready` — dan Chainventory v0.2.5 sudah 80% di sana. Sisa 20% adalah debt yang murah tapi berdampak tinggi di atas.

---

> *Report digenerate audit-only, tanpa perubahan kode. Sumber: 91 components, 84 app files, 112 lib modules, 44 migrations, `package.json`, `DESIGN.md`, `PRD.md`, `TODO.md` — `.next`/`node_modules` diabaikan.*
