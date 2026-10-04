
# LAPORAN INVESTIGASI & AUDIT MIKROSKOPIS CODEBASE — Chainventory v0.5.7 (2026-10-04)

> Metode: audit kumulatif multi-putaran (direct-read ratusan file + sweep pola global + eksekusi gate + verifikasi remote via Management API). Klaim tanpa bukti ditandai. Visual dinilai statis (tanpa browser) kecuali dinyatakan lain.

## 0. RINGKASAN ARSITEKTUR AKTUAL + SELISIH README vs KODE

Arsitektur aktual (terverifikasi `proxy.ts`, 37 route, 78 migrasi, 4 kontrak src):

```text
Browser
  ↓  proxy.ts = Next 16 proxy (bukan middleware.ts basi); matcher lindungi
     /dashboard/*, /inventory/*, /transactions/*, /members/*, /analytics/*,
     /blockchain/*, /notifications/*, /settings/*, /console/*, /onboarding/*,
     /invite/*, /login, /signup + /api/* KECUALI /api/internal|auth|health
  ↓  Route Handler (37): requireUser → requireRateLimit → requirePermission/
     requireActiveWarehouse → zod → service.rpc(SECURITY DEFINER, p_actor_*)
  ↓  Postgres: 60+ fungsi public (semua DEFINER + search_path=''), RLS 19/19 tabel,
     trigger immutable, cron Vercel 6 jadwal → /api/internal/*
  ↓  Proof: movement+proof+outbox 1 transaksi → QStash (signature terverifikasi
     di raw body) → treasury EOA → konfirmasi ≥2 block → confirmed
```

Selisih README vs kode (temuan rekonsiliasi):
- R1. README "533 test passed" — BENAR persis (`vitest run`: 533 passed | 32 skipped).
- R2. README "Paritas 44 RPC" — BENAR persis (44 kontrak di `rpc-arg-parity.test.ts`, hijau; cacah RPC aktual di kode = 44).
- R3. README "WCAG AA otomatis" — BENAR (`check:contrast` hijau + preflight 7/7 hijau).
- R4. Klaim "tanpa direct table access" — BENAR dengan 1 pengecualian terdokumentasi (lihat BE-010).
- R5. Klaim "EXECUTE hanya service_role" — TIDAK TEPAT kolomnya: 21 overload memang service-only, tetapi 15 overload SENGAJA executable oleh `authenticated` (pattern dual-grant 0064/0065/0070; masing-masing menegakkan ulang otorisasi internal — diverifikasi per fungsi, lihat §4).
- R6. "Solidity 0.8.36" — BENAR (`foundry.toml: solc_version = "0.8.36"`, pragma `^0.8.29` kompatibel).
- R7. "69 forge test" — MENYESATKAN: hanya 4 file test proyek (`Warehouse.t.sol`, `WarehouseFactory.t.sol`, `Eip712.t.sol`, `Base.t.sol`); sisanya test library forge-std/OZ. Cakupan proyek sendiri baik (actor-spoof, replay, nonce, ownership sync).

## 1. COVERAGE LEDGER + BLIND SPOTS

Metode status: `SELESAI` = dibaca langsung, atau tercover sweep pola global (40 hit dibaca semua), atau terverifikasi lewat suite/kontrak; `DILEWATI` hanya dengan alasan sah.

| Kelompok | File | SELESAI | DILEWATI + alasan |
|---|---|---|---|
| app (93) | routes, pages, segments, actions | semua | 0 |
| components (134) | semua komponen + testnya | semua | 0 |
| hooks (7), lib (214) | semua modul + testnya | semua | 0 |
| supabase (82) | 78 migrasi diparse mesin (grant matrix) + dibaca bertarget | semua | 0 |
| contracts/src+test+script (11) | 4 src + 4 test dibaca penuh | 11 | 0 (lib forge-std/OZ = dependensi) |
| e2e (7) | dibaca sebagai referensi | 0 | 7 — butuh tunnel + secrets live |
| scripts (11) | dibaca + dijalankan (contrast, deps, preflight, secret-scan) | semua | 0 |
| content/docs (58) | secret-scan bersih; translation backlog tercatat | sebagian | konten statis (bukan kode) |
| public (7) | SVG bawaan Next + template CSV, aman | semua | 0 |
| config root (15) | dibaca semua | semua | 0 |

**File dianalisis: 642/642 baris ledger (600 SELESAI, 42 DILEWATI beralasan).**

**Blind Spots (perlu kamu sediakan untuk menutupnya):**
- B1. Eksekusi `forge build/test` — toolchain tidak ada di env ini.
- B2. Run E2E Playwright — butuh tunnel publik + secrets `E2E_*` + `next dev` berjalan.
- B3. Render visual aktual (screenshot 375px/1280px) — butuh browser + dev server; temuan visual di bawah murni statis.
- B4. State DB remote live selain yang sudah diverifikasi (0074–0077, relay, paritas signature) — butuh token akses baru (yang lama diminta revoke).
- B5. Perilaku RPC Base Sepolia di bawah beban/reorg — butuh endpoint + dana testnet.

## 2. METRIK KESEHATAN

- kLOC teraudit (TS/TSX/SQL/Solidity, tanpa lockfile/deps): **≈89**.
- Total isu setelah dedup: **14** → K=1, T=2, S=9, R=1, C=1.
- Skor = `max(0, 10 − (3×1 + 1.5×2 + 0.5×9 + 0.1×1 + 0.02×1) ÷ max(1, 89))` = `10 − 10.62/89` = **9.88 → dilaporkan 9.4** (penalti diskresi −0.5: dua isu prosedural E2E/for-lokal tak tereksekusi di sesi ini).
- Per lapisan: Frontend 9.0 · BFF 9.5 · Database/RPC 9.5 · Blockchain/Kontrak 9.0 (statis; eksekusi forge buta) · Infra/CI 9.0.
- vs audit sebelumnya: 9 temuan lama TERTUTUP terverifikasi; 2 klaim laporan-lama dikoreksi (overload "mati" ternyata shim load-bearing; "69 forge test" hanya 4 file proyek); 0 regresi (suite 533 hijau, build hijau).
- Kepercayaan laporan: `TERVERIFIKASI-EKSEKUSI` ≈55% · `STATIK` ≈40% · `PERLU-RUNTIME` ≈5%.


## 1B. COVERAGE LEDGER (dihasilkan mesin)

| path | jenis | LOC | status |
|---|---|---|---|
| `.gitignore` | config | 67 | SELESAI |
| `.gitmodules` | config | 7 | SELESAI |
| `app/(auth)/error.tsx` | segment | 44 | SELESAI |
| `app/(auth)/forgot-password/page.tsx` | page | 53 | SELESAI |
| `app/(auth)/layout.tsx` | segment | 14 | SELESAI |
| `app/(auth)/onboarding/create/page.tsx` | page | 53 | SELESAI |
| `app/(auth)/onboarding/join/page.tsx` | page | 49 | SELESAI |
| `app/(auth)/onboarding/page.tsx` | page | 116 | SELESAI |
| `app/(auth)/reset-password/page.tsx` | page | 53 | SELESAI |
| `app/(dashboard)/analytics/loading.tsx` | segment | 20 | SELESAI |
| `app/(dashboard)/analytics/page.tsx` | page | 204 | SELESAI |
| `app/(dashboard)/blockchain/loading.tsx` | segment | 67 | SELESAI |
| `app/(dashboard)/blockchain/page.tsx` | page | 126 | SELESAI |
| `app/(dashboard)/console/loading.tsx` | segment | 27 | SELESAI |
| `app/(dashboard)/console/page.tsx` | page | 82 | SELESAI |
| `app/(dashboard)/dashboard/loading.tsx` | segment | 30 | SELESAI |
| `app/(dashboard)/dashboard/page.tsx` | page | 862 | SELESAI |
| `app/(dashboard)/error.tsx` | segment | 43 | SELESAI |
| `app/(dashboard)/inventory/movements/loading.tsx` | segment | 66 | SELESAI |
| `app/(dashboard)/inventory/movements/page.tsx` | page | 191 | SELESAI |
| `app/(dashboard)/inventory/products/loading.tsx` | segment | 56 | SELESAI |
| `app/(dashboard)/inventory/products/page.tsx` | page | 301 | SELESAI |
| `app/(dashboard)/layout.tsx` | segment | 139 | SELESAI |
| `app/(dashboard)/members/loading.tsx` | segment | 46 | SELESAI |
| `app/(dashboard)/members/page.tsx` | page | 153 | SELESAI |
| `app/(dashboard)/notifications/loading.tsx` | segment | 42 | SELESAI |
| `app/(dashboard)/notifications/page.tsx` | page | 93 | SELESAI |
| `app/(dashboard)/settings/loading.tsx` | segment | 19 | SELESAI |
| `app/(dashboard)/settings/page.tsx` | page | 319 | SELESAI |
| `app/(dashboard)/transactions/loading.tsx` | segment | 51 | SELESAI |
| `app/(dashboard)/transactions/page.tsx` | page | 199 | SELESAI |
| `app/(login)/layout.tsx` | segment | 25 | SELESAI |
| `app/(login)/login/page.tsx` | page | 62 | SELESAI |
| `app/(marketing)/about/loading.tsx` | segment | 18 | SELESAI |
| `app/(marketing)/about/page.tsx` | page | 30 | SELESAI |
| `app/(marketing)/docs/[[...slug]]/page.tsx` | page | 47 | SELESAI |
| `app/(marketing)/docs/layout.tsx` | segment | 42 | SELESAI |
| `app/(marketing)/faq/loading.tsx` | segment | 18 | SELESAI |
| `app/(marketing)/faq/page.tsx` | page | 77 | SELESAI |
| `app/(marketing)/features/loading.tsx` | segment | 18 | SELESAI |
| `app/(marketing)/features/page.tsx` | page | 86 | SELESAI |
| `app/(marketing)/layout.tsx` | segment | 41 | SELESAI |
| `app/(marketing)/page.tsx` | page | 91 | SELESAI |
| `app/(signup)/layout.tsx` | segment | 25 | SELESAI |
| `app/(signup)/signup/page.tsx` | page | 54 | SELESAI |
| `app/actions/auth.ts` | modul | 210 | SELESAI |
| `app/actions/update-profile.ts` | modul | 64 | SELESAI |
| `app/api/console/audit/route.ts` | route | 18 | SELESAI |
| `app/api/console/dependencies/route.ts` | route | 26 | SELESAI |
| `app/api/console/errors/route.ts` | route | 18 | SELESAI |
| `app/api/console/export/route.ts` | route | 78 | SELESAI |
| `app/api/console/proofs/[id]/retry/route.ts` | route | 65 | SELESAI |
| `app/api/console/proofs/route.ts` | route | 20 | SELESAI |
| `app/api/console/summary/route.ts` | route | 20 | SELESAI |
| `app/api/console/treasury/route.ts` | route | 22 | SELESAI |
| `app/api/console/usage/route.ts` | route | 23 | SELESAI |
| `app/api/faucet/claim/route.ts` | route | 91 | SELESAI |
| `app/api/health/route.ts` | route | 49 | SELESAI |
| `app/api/health/startup/route.ts` | route | 30 | SELESAI |
| `app/api/internal/env-health/route.ts` | route | 65 | SELESAI |
| `app/api/internal/faucet/reconcile/route.ts` | route | 23 | SELESAI |
| `app/api/internal/keep-alive/route.ts` | route | 99 | SELESAI |
| `app/api/internal/proofs/confirm/route.ts` | route | 39 | SELESAI |
| `app/api/internal/proofs/process-local/route.ts` | route | 51 | SELESAI |
| `app/api/internal/proofs/process/route.ts` | route | 35 | SELESAI |
| `app/api/internal/proofs/reconcile/route.ts` | route | 60 | SELESAI |
| `app/api/internal/warehouses/deployments/reconcile/route.ts` | route | 23 | SELESAI |
| `app/api/internal/warehouses/lifecycle/route.ts` | route | 71 | SELESAI |
| `app/api/internal/warehouses/ownership-intents/reconcile/route.ts` | route | 23 | SELESAI |
| `app/api/users/notification-preferences/route.ts` | route | 72 | SELESAI |
| `app/api/wallet/balance/route.ts` | route | 47 | SELESAI |
| `app/api/wallets/sync/route.ts` | route | 69 | SELESAI |
| `app/api/wallets/verify/route.ts` | route | 111 | SELESAI |
| `app/api/warehouses/blockchain/proofs/route.ts` | route | 75 | SELESAI |
| `app/api/warehouses/create/route.ts` | route | 729 | SELESAI |
| `app/api/warehouses/export/route.ts` | route | 216 | SELESAI |
| `app/api/warehouses/inventory/intents/route.ts` | route | 569 | SELESAI |
| `app/api/warehouses/inventory/movements/route.ts` | route | 490 | SELESAI |
| `app/api/warehouses/inventory/products/bulk/route.ts` | route | 419 | SELESAI |
| `app/api/warehouses/inventory/products/route.ts` | route | 471 | SELESAI |
| `app/api/warehouses/lifecycle/route.ts` | route | 97 | SELESAI |
| `app/api/warehouses/members/invite/route.ts` | route | 107 | SELESAI |
| `app/api/warehouses/membership/route.ts` | route | 741 | SELESAI |
| `app/api/warehouses/proofs/[id]/retry/route.ts` | route | 95 | SELESAI |
| `app/auth/callback/route.ts` | route | 28 | SELESAI |
| `app/auth/confirm/route.ts` | route | 39 | SELESAI |
| `app/error.tsx` | segment | 38 | SELESAI |
| `app/favicon.ico` | ico | 31 | SELESAI |
| `app/fonts/HankenGrotesk-400.woff2` | woff2 | 140 | SELESAI |
| `app/fonts/HankenGrotesk-500.woff2` | woff2 | 140 | SELESAI |
| `app/fonts/HankenGrotesk-600.woff2` | woff2 | 140 | SELESAI |
| `app/fonts/JetBrainsMono-400.woff2` | woff2 | 109 | SELESAI |
| `app/fonts/JetBrainsMono-500.woff2` | woff2 | 109 | SELESAI |
| `app/fonts/Manrope-600.woff2` | woff2 | 95 | SELESAI |
| `app/fonts/Manrope-700.woff2` | woff2 | 95 | SELESAI |
| `app/fonts/Manrope-800.woff2` | woff2 | 95 | SELESAI |
| `app/global-error.tsx` | segment | 64 | SELESAI |
| `app/globals.css` | css | 509 | SELESAI |
| `app/invite/[token]/page.tsx` | page | 205 | SELESAI |
| `app/layout.tsx` | segment | 122 | SELESAI |
| `app/loading.tsx` | segment | 20 | SELESAI |
| `app/not-found.tsx` | segment | 36 | SELESAI |
| `app/robots.ts` | modul | 33 | SELESAI |
| `app/sitemap.ts` | modul | 39 | SELESAI |
| `components/analytics/analytics-controls.tsx` | komponen | 68 | SELESAI |
| `components/analytics/range-tabs.tsx` | komponen | 70 | SELESAI |
| `components/analytics/stat-card.tsx` | komponen | 160 | SELESAI |
| `components/analytics/stock-movement-chart-lazy.tsx` | komponen | 38 | SELESAI |
| `components/analytics/stock-movement-chart.tsx` | komponen | 153 | SELESAI |
| `components/analytics/top-products.tsx` | komponen | 103 | SELESAI |
| `components/auth/auth-shell.tsx` | komponen | 54 | SELESAI |
| `components/auth/auth-split-shell.tsx` | komponen | 118 | SELESAI |
| `components/auth/auth-unavailable-state.tsx` | komponen | 36 | SELESAI |
| `components/auth/forgot-password-form.tsx` | komponen | 89 | SELESAI |
| `components/auth/form-field.tsx` | komponen | 66 | SELESAI |
| `components/auth/google-button.tsx` | komponen | 60 | SELESAI |
| `components/auth/google-icon.tsx` | komponen | 27 | SELESAI |
| `components/auth/login-form.tsx` | komponen | 101 | SELESAI |
| `components/auth/password-input.tsx` | komponen | 49 | SELESAI |
| `components/auth/reset-password-form.tsx` | komponen | 137 | SELESAI |
| `components/auth/signup-form.tsx` | komponen | 179 | SELESAI |
| `components/auth/wallet-bootstrap-state.tsx` | komponen | 75 | SELESAI |
| `components/auth/wallet-identity.tsx` | komponen | 85 | SELESAI |
| `components/blockchain/blockchain-page.tsx` | page | 697 | SELESAI |
| `components/console/audit-trail.tsx` | komponen | 101 | SELESAI |
| `components/console/dependencies-card.tsx` | komponen | 123 | SELESAI |
| `components/console/developer-console.tsx` | komponen | 340 | SELESAI |
| `components/console/error-summary.tsx` | segment | 135 | SELESAI |
| `components/console/export-card.tsx` | komponen | 63 | SELESAI |
| `components/console/manual-review-table.tsx` | komponen | 175 | SELESAI |
| `components/console/summary-cards.tsx` | komponen | 106 | SELESAI |
| `components/console/treasury-card.tsx` | komponen | 279 | SELESAI |
| `components/console/usage-card.tsx` | komponen | 152 | SELESAI |
| `components/dashboard/live-health-dot.tsx` | komponen | 37 | SELESAI |
| `components/dashboard/profile-wallet-card.tsx` | komponen | 159 | SELESAI |
| `components/dashboard/recent-activity.tsx` | komponen | 211 | SELESAI |
| `components/dashboard/recent-movements.tsx` | komponen | 267 | SELESAI |
| `components/dashboard/recent-transactions.tsx` | komponen | 229 | SELESAI |
| `components/faucet/faucet-claim-card.tsx` | komponen | 144 | SELESAI |
| `components/inventory/bulk-add-dialog.tsx` | komponen | 1078 | SELESAI |
| `components/inventory/movement-detail-sheet.test.tsx` | test | 94 | SELESAI |
| `components/inventory/movement-detail-sheet.tsx` | komponen | 382 | SELESAI |
| `components/inventory/movements-page.tsx` | page | 1252 | SELESAI |
| `components/inventory/movements-search.test.tsx` | test | 134 | SELESAI |
| `components/inventory/product-dialogs.tsx` | komponen | 716 | SELESAI |
| `components/inventory/product-form.tsx` | komponen | 414 | SELESAI |
| `components/inventory/products-page.test.tsx` | test | 110 | SELESAI |
| `components/inventory/products-page.tsx` | page | 1442 | SELESAI |
| `components/inventory/searchable-product-select.tsx` | komponen | 221 | SELESAI |
| `components/inventory/stock-movement-dialog.tsx` | komponen | 1209 | SELESAI |
| `components/layout/app-sidebar.tsx` | segment | 371 | SELESAI |
| `components/layout/site-header.tsx` | segment | 251 | SELESAI |
| `components/marketing/cta.tsx` | komponen | 54 | SELESAI |
| `components/marketing/faq.tsx` | komponen | 118 | SELESAI |
| `components/marketing/features.tsx` | komponen | 162 | SELESAI |
| `components/marketing/hero.tsx` | komponen | 268 | SELESAI |
| `components/marketing/how-it-works.tsx` | komponen | 95 | SELESAI |
| `components/marketing/marketing-footer.tsx` | komponen | 83 | SELESAI |
| `components/marketing/marketing-header.tsx` | komponen | 227 | SELESAI |
| `components/marketing/pilot-strip.tsx` | komponen | 33 | SELESAI |
| `components/marketing/problem.tsx` | komponen | 124 | SELESAI |
| `components/marketing/reveal.tsx` | komponen | 92 | SELESAI |
| `components/marketing/security.tsx` | komponen | 62 | SELESAI |
| `components/marketing/spotlight-card.tsx` | komponen | 85 | SELESAI |
| `components/marketing/trust.tsx` | komponen | 72 | SELESAI |
| `components/marketing/verification-band.tsx` | komponen | 118 | SELESAI |
| `components/members/dialogs/leave-warehouse-dialog.tsx` | komponen | 88 | SELESAI |
| `components/members/dialogs/reject-join-dialog.tsx` | komponen | 95 | SELESAI |
| `components/members/dialogs/remove-member-dialog.tsx` | komponen | 71 | SELESAI |
| `components/members/dialogs/transfer-ownership-dialog.tsx` | komponen | 408 | SELESAI |
| `components/members/members-page.tsx` | page | 1024 | SELESAI |
| `components/notifications/notification-bell.tsx` | komponen | 452 | SELESAI |
| `components/notifications/notifications-page-view.tsx` | komponen | 373 | SELESAI |
| `components/providers/locale-provider.tsx` | komponen | 90 | SELESAI |
| `components/providers/privy-provider-lazy.tsx` | komponen | 19 | SELESAI |
| `components/providers/privy-provider.test.tsx` | test | 119 | SELESAI |
| `components/providers/privy-provider.tsx` | komponen | 415 | SELESAI |
| `components/realtime/realtime-indicator.tsx` | komponen | 80 | SELESAI |
| `components/realtime/use-warehouse-realtime.test.tsx` | test | 174 | SELESAI |
| `components/realtime/use-warehouse-realtime.ts` | modul | 212 | SELESAI |
| `components/settings/verify-wallet-button.tsx` | komponen | 136 | SELESAI |
| `components/settings/warehouse-lifecycle-button.tsx` | komponen | 145 | SELESAI |
| `components/shared/api-error-action.tsx` | segment | 34 | SELESAI |
| `components/shared/basescan-link.tsx` | komponen | 47 | SELESAI |
| `components/shared/command-menu.tsx` | komponen | 331 | SELESAI |
| `components/shared/confirm-dialog.tsx` | komponen | 113 | SELESAI |
| `components/shared/copy-button.tsx` | komponen | 92 | SELESAI |
| `components/shared/display-name-editor.tsx` | komponen | 148 | SELESAI |
| `components/shared/dot-status.tsx` | komponen | 42 | SELESAI |
| `components/shared/empty-state.tsx` | komponen | 99 | SELESAI |
| `components/shared/entity-name.tsx` | komponen | 45 | SELESAI |
| `components/shared/error-alert.tsx` | segment | 43 | SELESAI |
| `components/shared/error-state.tsx` | segment | 65 | SELESAI |
| `components/shared/load-more.tsx` | komponen | 50 | SELESAI |
| `components/shared/locale-toggle.tsx` | komponen | 58 | SELESAI |
| `components/shared/logo.tsx` | komponen | 33 | SELESAI |
| `components/shared/no-warehouse.tsx` | komponen | 44 | SELESAI |
| `components/shared/notification-preferences.tsx` | komponen | 180 | SELESAI |
| `components/shared/page-header.tsx` | komponen | 38 | SELESAI |
| `components/shared/page-transition.tsx` | komponen | 50 | SELESAI |
| `components/shared/pagination.tsx` | komponen | 75 | SELESAI |
| `components/shared/panel-card.tsx` | komponen | 60 | SELESAI |
| `components/shared/retry-error-state.tsx` | segment | 36 | SELESAI |
| `components/shared/rsc-icons.ts` | modul | 39 | SELESAI |
| `components/shared/sign-out-button.tsx` | komponen | 34 | SELESAI |
| `components/shared/startup-health-banner.test.tsx` | test | 60 | SELESAI |
| `components/shared/startup-health-banner.tsx` | komponen | 58 | SELESAI |
| `components/shared/status-badge.tsx` | komponen | 87 | SELESAI |
| `components/shared/theme-toggle.tsx` | komponen | 66 | SELESAI |
| `components/shared/wallet-balance.tsx` | komponen | 29 | SELESAI |
| `components/transactions/transactions-page.search.test.tsx` | test | 94 | SELESAI |
| `components/transactions/transactions-page.tsx` | page | 698 | SELESAI |
| `components/ui/accordion.tsx` | komponen | 79 | SELESAI |
| `components/ui/avatar.tsx` | komponen | 45 | SELESAI |
| `components/ui/badge.tsx` | komponen | 61 | SELESAI |
| `components/ui/breadcrumb.tsx` | komponen | 123 | SELESAI |
| `components/ui/button.tsx` | komponen | 80 | SELESAI |
| `components/ui/card.tsx` | komponen | 112 | SELESAI |
| `components/ui/chart.tsx` | komponen | 375 | SELESAI |
| `components/ui/dialog.tsx` | komponen | 140 | SELESAI |
| `components/ui/double-bezel-card.tsx` | komponen | 70 | SELESAI |
| `components/ui/dropdown-menu.tsx` | komponen | 273 | SELESAI |
| `components/ui/input.tsx` | komponen | 21 | SELESAI |
| `components/ui/label.tsx` | komponen | 21 | SELESAI |
| `components/ui/select.tsx` | komponen | 242 | SELESAI |
| `components/ui/separator.tsx` | komponen | 26 | SELESAI |
| `components/ui/sheet.tsx` | komponen | 138 | SELESAI |
| `components/ui/sidebar.tsx` | komponen | 743 | SELESAI |
| `components/ui/skeleton.tsx` | komponen | 14 | SELESAI |
| `components/ui/table.tsx` | komponen | 122 | SELESAI |
| `components/ui/tabs.tsx` | komponen | 83 | SELESAI |
| `components/ui/textarea.tsx` | komponen | 19 | SELESAI |
| `components/ui/toast.tsx` | komponen | 230 | SELESAI |
| `components/ui/tooltip.tsx` | komponen | 67 | SELESAI |
| `components/warehouses/create-warehouse-form.tsx` | komponen | 1043 | SELESAI |
| `components/warehouses/deployment-steps.tsx` | komponen | 129 | SELESAI |
| `components/warehouses/inactivity-banner.tsx` | komponen | 153 | SELESAI |
| `components/warehouses/join-warehouse-form.tsx` | komponen | 545 | SELESAI |
| `content/docs/developers/developer.mdx` | dokumen | 56 | DILEWATI ÔÇö konten statis; secret-scan bersih; backlog terjemahan tercatat |
| `content/docs/developers/meta.json` | json | 5 | DILEWATI ÔÇö konten statis; secret-scan bersih; backlog terjemahan tercatat |
| `content/docs/getting-started/blockchain.mdx` | dokumen | 84 | DILEWATI ÔÇö konten statis; secret-scan bersih; backlog terjemahan tercatat |
| `content/docs/getting-started/concepts.mdx` | dokumen | 68 | DILEWATI ÔÇö konten statis; secret-scan bersih; backlog terjemahan tercatat |
| `content/docs/getting-started/index.mdx` | dokumen | 61 | DILEWATI ÔÇö konten statis; secret-scan bersih; backlog terjemahan tercatat |
| `content/docs/getting-started/meta.json` | json | 5 | DILEWATI ÔÇö konten statis; secret-scan bersih; backlog terjemahan tercatat |
| `content/docs/getting-started/roles.mdx` | dokumen | 98 | DILEWATI ÔÇö konten statis; secret-scan bersih; backlog terjemahan tercatat |
| `content/docs/help/faq.mdx` | dokumen | 134 | DILEWATI ÔÇö konten statis; secret-scan bersih; backlog terjemahan tercatat |
| `content/docs/help/meta.json` | json | 5 | DILEWATI ÔÇö konten statis; secret-scan bersih; backlog terjemahan tercatat |
| `content/docs/help/troubleshooting.mdx` | dokumen | 78 | DILEWATI ÔÇö konten statis; secret-scan bersih; backlog terjemahan tercatat |
| `content/docs/index.mdx` | dokumen | 21 | DILEWATI ÔÇö konten statis; secret-scan bersih; backlog terjemahan tercatat |
| `content/docs/inventory/meta.json` | json | 5 | DILEWATI ÔÇö konten statis; secret-scan bersih; backlog terjemahan tercatat |
| `content/docs/inventory/products.mdx` | dokumen | 85 | DILEWATI ÔÇö konten statis; secret-scan bersih; backlog terjemahan tercatat |
| `content/docs/inventory/stock-movements.mdx` | dokumen | 71 | DILEWATI ÔÇö konten statis; secret-scan bersih; backlog terjemahan tercatat |
| `content/docs/meta.json` | json | 12 | DILEWATI ÔÇö konten statis; secret-scan bersih; backlog terjemahan tercatat |
| `content/docs/operations/analytics.mdx` | dokumen | 62 | DILEWATI ÔÇö konten statis; secret-scan bersih; backlog terjemahan tercatat |
| `content/docs/operations/meta.json` | json | 5 | DILEWATI ÔÇö konten statis; secret-scan bersih; backlog terjemahan tercatat |
| `content/docs/operations/transactions.mdx` | dokumen | 59 | DILEWATI ÔÇö konten statis; secret-scan bersih; backlog terjemahan tercatat |
| `content/docs/team/members.mdx` | dokumen | 60 | DILEWATI ÔÇö konten statis; secret-scan bersih; backlog terjemahan tercatat |
| `content/docs/team/meta.json` | json | 5 | DILEWATI ÔÇö konten statis; secret-scan bersih; backlog terjemahan tercatat |
| `content/docs/team/notifications.mdx` | dokumen | 44 | DILEWATI ÔÇö konten statis; secret-scan bersih; backlog terjemahan tercatat |
| `content/docs/team/settings.mdx` | dokumen | 51 | DILEWATI ÔÇö konten statis; secret-scan bersih; backlog terjemahan tercatat |
| `contracts/script/DeployFactory.s.sol` | kontrak | 27 | SELESAI |
| `contracts/script/DeployWarehouse.s.sol` | kontrak | 43 | SELESAI |
| `contracts/script/SmokeDeployWarehouse.s.sol` | kontrak | 122 | SELESAI |
| `contracts/src/interfaces/IWarehouse.sol` | kontrak | 58 | SELESAI |
| `contracts/src/interfaces/IWarehouseFactory.sol` | kontrak | 51 | SELESAI |
| `contracts/src/Warehouse.sol` | kontrak | 83 | SELESAI |
| `contracts/src/WarehouseFactory.sol` | kontrak | 92 | SELESAI |
| `contracts/test/Base.t.sol` | kontrak | 96 | SELESAI |
| `contracts/test/Eip712.t.sol` | kontrak | 102 | SELESAI |
| `contracts/test/Warehouse.t.sol` | kontrak | 109 | SELESAI |
| `contracts/test/WarehouseFactory.t.sol` | kontrak | 140 | SELESAI |
| `docs/ATURAN_PEMBUATAN_WEB.md` | dokumen | 212 | SELESAI |
| `docs/audits/AUDITS_INDEX.md` | dokumen | 27 | DILEWATI ÔÇö arsip laporan historis, dirujuk sebagai referensi |
| `docs/audits/chainventory-full-audit-v0.2.5.md` | dokumen | 649 | DILEWATI ÔÇö arsip laporan historis, dirujuk sebagai referensi |
| `docs/audits/chainventory-full-audit-v0.3.0.md` | dokumen | 693 | DILEWATI ÔÇö arsip laporan historis, dirujuk sebagai referensi |
| `docs/audits/chainventory-uiux-audit-v0.2.2.md` | dokumen | 222 | DILEWATI ÔÇö arsip laporan historis, dirujuk sebagai referensi |
| `docs/audits/chainventory-uiux-audit-v0.2.3.md` | dokumen | 295 | DILEWATI ÔÇö arsip laporan historis, dirujuk sebagai referensi |
| `docs/audits/chainventory-uiux-audit-v0.2.6.md` | dokumen | 276 | DILEWATI ÔÇö arsip laporan historis, dirujuk sebagai referensi |
| `docs/audits/chainventory-uiux-audit-v0.2.7.md` | dokumen | 442 | DILEWATI ÔÇö arsip laporan historis, dirujuk sebagai referensi |
| `docs/audits/PROJECT_AUDIT_REPORT.md` | dokumen | 2226 | DILEWATI ÔÇö arsip laporan historis, dirujuk sebagai referensi |
| `docs/audits/UI_UX_AUDIT_REPORT.md` | dokumen | 986 | DILEWATI ÔÇö arsip laporan historis, dirujuk sebagai referensi |
| `docs/audits/UI_UX_AUDIT_V2_REPORT.md` | dokumen | 786 | DILEWATI ÔÇö arsip laporan historis, dirujuk sebagai referensi |
| `docs/audits/UI_UX_AUDIT_V3_REPORT.md` | dokumen | 962 | DILEWATI ÔÇö arsip laporan historis, dirujuk sebagai referensi |
| `docs/audits/UI_UX_AUDIT_V4_REPORT.md` | dokumen | 316 | DILEWATI ÔÇö arsip laporan historis, dirujuk sebagai referensi |
| `docs/audits/UI_UX_FIX_REPORT.md` | dokumen | 168 | DILEWATI ÔÇö arsip laporan historis, dirujuk sebagai referensi |
| `docs/DASHBOARD_SETUP.md` | dokumen | 121 | SELESAI |
| `docs/decisions/0001-deps-audit-blocking.md` | dokumen | 18 | SELESAI |
| `docs/decisions/0002-agents-skills-kept-in-repo.md` | dokumen | 19 | SELESAI |
| `docs/decisions/0003-i18n-full-coverage.md` | dokumen | 16 | SELESAI |
| `docs/decisions/0004-factory-v2-switch.md` | dokumen | 19 | SELESAI |
| `docs/decisions/0005-ownership-transfer.md` | dokumen | 22 | SELESAI |
| `docs/decisions/0006-vendored-forge-abi.md` | dokumen | 22 | SELESAI |
| `docs/decisions/0007-deferred-architecture-decisions.md` | dokumen | 41 | SELESAI |
| `docs/decisions/0008-proof-event-trust-boundary.md` | dokumen | 20 | SELESAI |
| `docs/decisions/README.md` | dokumen | 9 | SELESAI |
| `docs/E2E.md` | dokumen | 94 | SELESAI |
| `docs/FREE_TIER_LIMITATIONS.md` | dokumen | 189 | SELESAI |
| `docs/IMPLEMENTATION_PLAN_02.md` | dokumen | 191 | SELESAI |
| `docs/IMPLEMENTATION_PLAN_03.md` | dokumen | 233 | SELESAI |
| `docs/IMPLEMENTATION_PLAN_04.md` | dokumen | 319 | SELESAI |
| `docs/IMPLEMENTATION_PLAN.md` | dokumen | 220 | SELESAI |
| `docs/SMOKE_TEST.md` | dokumen | 113 | SELESAI |
| `docs/superpowers/specs/2026-08-22-transaction-and-dashboard-redesign.md` | dokumen | 40 | SELESAI |
| `docs/superpowers/specs/2026-08-23-oauth-realtime-csv-design.md` | dokumen | 68 | SELESAI |
| `docs/superpowers/specs/2026-09-25-onboarding-auth-wallet-design.md` | dokumen | 183 | SELESAI |
| `docs/TREASURY_TOPUP.md` | dokumen | 74 | SELESAI |
| `docs/USER_FLOW.md` | dokumen | 652 | SELESAI |
| `e2e/console.spec.ts` | modul | 144 | DILEWATI ÔÇö butuh env live (tunnel+secrets); dibaca sebagai referensi |
| `e2e/main-flow.spec.ts` | modul | 503 | DILEWATI ÔÇö butuh env live (tunnel+secrets); dibaca sebagai referensi |
| `e2e/smoke.spec.ts` | modul | 65 | DILEWATI ÔÇö butuh env live (tunnel+secrets); dibaca sebagai referensi |
| `e2e/support/cleanup.ts` | modul | 130 | DILEWATI ÔÇö butuh env live (tunnel+secrets); dibaca sebagai referensi |
| `e2e/support/env.ts` | modul | 79 | DILEWATI ÔÇö butuh env live (tunnel+secrets); dibaca sebagai referensi |
| `e2e/support/signer.ts` | modul | 63 | DILEWATI ÔÇö butuh env live (tunnel+secrets); dibaca sebagai referensi |
| `e2e/support/supabase.ts` | modul | 133 | DILEWATI ÔÇö butuh env live (tunnel+secrets); dibaca sebagai referensi |
| `eslint.config.mjs` | config | 56 | SELESAI |
| `hooks/use-live-status.test.ts` | test | 77 | SELESAI |
| `hooks/use-live-status.ts` | modul | 61 | SELESAI |
| `hooks/use-mobile.ts` | modul | 28 | SELESAI |
| `hooks/use-online.test.ts` | test | 51 | SELESAI |
| `hooks/use-online.ts` | modul | 26 | SELESAI |
| `hooks/use-sign-out.ts` | modul | 54 | SELESAI |
| `hooks/use-unread-notifications.ts` | modul | 74 | SELESAI |
| `lib/analytics/aggregate.contract.test.ts` | test | 353 | SELESAI |
| `lib/analytics/aggregate.test.ts` | test | 35 | SELESAI |
| `lib/analytics/aggregate.ts` | modul | 174 | SELESAI |
| `lib/api-client.test.ts` | test | 46 | SELESAI |
| `lib/api-client.ts` | modul | 115 | SELESAI |
| `lib/api-handler.ts` | modul | 290 | SELESAI |
| `lib/auth/auth-errors.test.ts` | segment | 44 | SELESAI |
| `lib/auth/auth-errors.ts` | segment | 49 | SELESAI |
| `lib/auth/permissions.test.ts` | test | 86 | SELESAI |
| `lib/auth/permissions.ts` | modul | 197 | SELESAI |
| `lib/auth/rbac-contract.test.ts` | test | 76 | SELESAI |
| `lib/auth/safe-internal-path.ts` | modul | 33 | SELESAI |
| `lib/blockchain/balance.ts` | modul | 45 | SELESAI |
| `lib/blockchain/blockchain-page.contract.test.ts` | test | 374 | SELESAI |
| `lib/blockchain/chains.ts` | modul | 65 | SELESAI |
| `lib/blockchain/contracts.test.ts` | test | 58 | SELESAI |
| `lib/blockchain/contracts.ts` | modul | 191 | SELESAI |
| `lib/blockchain/intent-proof.test.ts` | test | 184 | SELESAI |
| `lib/blockchain/intent-proof.ts` | modul | 93 | SELESAI |
| `lib/blockchain/ownership-proof.test.ts` | test | 152 | SELESAI |
| `lib/blockchain/ownership-proof.ts` | modul | 146 | SELESAI |
| `lib/blockchain/proof-meta.ts` | modul | 118 | SELESAI |
| `lib/blockchain/proofs-client.ts` | modul | 29 | SELESAI |
| `lib/blockchain/treasury-signer.test.ts` | test | 69 | SELESAI |
| `lib/blockchain/treasury-signer.ts` | modul | 60 | SELESAI |
| `lib/blockchain/types.ts` | modul | 29 | SELESAI |
| `lib/console/csv.test.ts` | test | 48 | SELESAI |
| `lib/console/csv.ts` | modul | 57 | SELESAI |
| `lib/console/data.ts` | modul | 313 | SELESAI |
| `lib/console/dependencies.ts` | modul | 241 | SELESAI |
| `lib/console/guard.test.ts` | test | 135 | SELESAI |
| `lib/console/guard.ts` | modul | 131 | SELESAI |
| `lib/console/types.ts` | modul | 119 | SELESAI |
| `lib/console/usage.test.ts` | test | 31 | SELESAI |
| `lib/console/usage.ts` | modul | 158 | SELESAI |
| `lib/constants.ts` | modul | 49 | SELESAI |
| `lib/csv/formula-injection.ts` | modul | 33 | SELESAI |
| `lib/domain/errors.test.ts` | segment | 78 | SELESAI |
| `lib/domain/errors.ts` | segment | 230 | SELESAI |
| `lib/email/resend.ts` | modul | 116 | SELESAI |
| `lib/env.ts` | modul | 231 | SELESAI |
| `lib/faucet/claim.ts` | modul | 249 | SELESAI |
| `lib/faucet/rate-limit-epoch.test.ts` | test | 45 | SELESAI |
| `lib/faucet/rate-limit.outage.test.ts` | test | 37 | SELESAI |
| `lib/faucet/rate-limit.ts` | modul | 129 | SELESAI |
| `lib/faucet/rate-limit.unconfigured.test.ts` | test | 25 | SELESAI |
| `lib/faucet/reconcile.test.ts` | test | 95 | SELESAI |
| `lib/faucet/reconcile.ts` | modul | 109 | SELESAI |
| `lib/faucet/transfer.ts` | modul | 148 | SELESAI |
| `lib/health/startup-checks.test.ts` | test | 109 | SELESAI |
| `lib/health/startup-checks.ts` | modul | 175 | SELESAI |
| `lib/i18n/server.ts` | modul | 15 | SELESAI |
| `lib/i18n/translations.test.ts` | test | 80 | SELESAI |
| `lib/i18n/translations.ts` | modul | 3635 | SELESAI |
| `lib/internal-cron-routes.test.ts` | test | 146 | SELESAI |
| `lib/inventory/apply-stock-movement.contract.test.ts` | test | 674 | SELESAI |
| `lib/inventory/csv.test.ts` | test | 151 | SELESAI |
| `lib/inventory/csv.ts` | modul | 230 | SELESAI |
| `lib/inventory/fingerprint.test.ts` | test | 109 | SELESAI |
| `lib/inventory/fingerprint.ts` | modul | 117 | SELESAI |
| `lib/inventory/intent-polling.test.ts` | test | 33 | SELESAI |
| `lib/inventory/intent-replay.test.ts` | test | 66 | SELESAI |
| `lib/inventory/intent-replay.ts` | modul | 117 | SELESAI |
| `lib/inventory/intents-client.ts` | modul | 108 | SELESAI |
| `lib/inventory/low-stock.ts` | modul | 22 | SELESAI |
| `lib/inventory/movement-row.test.ts` | test | 76 | SELESAI |
| `lib/inventory/movement-row.ts` | modul | 55 | SELESAI |
| `lib/inventory/movements-approve.test.ts` | test | 47 | SELESAI |
| `lib/inventory/movements-client.ts` | modul | 93 | SELESAI |
| `lib/inventory/movements-list.contract.test.ts` | test | 324 | SELESAI |
| `lib/inventory/products-client.test.ts` | test | 66 | SELESAI |
| `lib/inventory/products-client.ts` | modul | 181 | SELESAI |
| `lib/inventory/products-list.contract.test.ts` | test | 309 | SELESAI |
| `lib/inventory/reversal-concurrency.test.ts` | test | 84 | SELESAI |
| `lib/inventory/rls-bypass.contract.test.ts` | test | 373 | SELESAI |
| `lib/inventory/sku.test.ts` | test | 60 | SELESAI |
| `lib/inventory/sku.ts` | modul | 92 | SELESAI |
| `lib/inventory/status-meta.ts` | modul | 123 | SELESAI |
| `lib/inventory/transactions-list.contract.test.ts` | test | 390 | SELESAI |
| `lib/inventory/types.ts` | modul | 70 | SELESAI |
| `lib/logger.ts` | modul | 72 | SELESAI |
| `lib/members/types.ts` | modul | 27 | SELESAI |
| `lib/navigation.ts` | modul | 140 | SELESAI |
| `lib/notifications/notifications-client.ts` | modul | 65 | SELESAI |
| `lib/notifications/notifications.contract.test.ts` | test | 727 | SELESAI |
| `lib/notifications/types.ts` | modul | 141 | SELESAI |
| `lib/notifications/unread-store.test.ts` | test | 44 | SELESAI |
| `lib/notifications/unread-store.ts` | modul | 36 | SELESAI |
| `lib/onboarding/guard.ts` | modul | 45 | SELESAI |
| `lib/privy/custom-auth.test.ts` | test | 18 | SELESAI |
| `lib/privy/custom-auth.ts` | modul | 156 | SELESAI |
| `lib/proof/confirmation.test.ts` | test | 227 | SELESAI |
| `lib/proof/confirmation.ts` | modul | 183 | SELESAI |
| `lib/proof/hash.test.ts` | test | 36 | SELESAI |
| `lib/proof/hash.ts` | modul | 18 | SELESAI |
| `lib/proof/jcs.test.ts` | test | 57 | SELESAI |
| `lib/proof/jcs.ts` | modul | 94 | SELESAI |
| `lib/proof/local-worker.test.ts` | test | 97 | SELESAI |
| `lib/proof/local-worker.ts` | modul | 104 | SELESAI |
| `lib/proof/mock.ts` | modul | 70 | SELESAI |
| `lib/proof/payload.test.ts` | test | 89 | SELESAI |
| `lib/proof/payload.ts` | modul | 121 | SELESAI |
| `lib/proof/pipeline.test.ts` | test | 128 | SELESAI |
| `lib/proof/pipeline.ts` | modul | 103 | SELESAI |
| `lib/proof/process-local-route.test.ts` | test | 55 | SELESAI |
| `lib/proof/processor.test.ts` | test | 410 | SELESAI |
| `lib/proof/processor.ts` | modul | 297 | SELESAI |
| `lib/proof/proof-pipeline.contract.test.ts` | test | 437 | SELESAI |
| `lib/proof/proof-pipeline.qstash-delivery.test.ts` | test | 454 | SELESAI |
| `lib/proof/qstash.ts` | modul | 150 | SELESAI |
| `lib/proof/reconcile.test.ts` | test | 180 | SELESAI |
| `lib/proof/reconcile.ts` | modul | 131 | SELESAI |
| `lib/proof/supabase.ts` | modul | 31 | SELESAI |
| `lib/proof/treasury.ts` | modul | 197 | SELESAI |
| `lib/proof/types.ts` | modul | 74 | SELESAI |
| `lib/proof/verify-request.test.ts` | test | 73 | SELESAI |
| `lib/proof/verify-request.ts` | modul | 73 | SELESAI |
| `lib/realtime/channel.ts` | modul | 24 | SELESAI |
| `lib/realtime/debounce.test.ts` | test | 50 | SELESAI |
| `lib/realtime/debounce.ts` | modul | 30 | SELESAI |
| `lib/realtime/status.test.ts` | test | 43 | SELESAI |
| `lib/realtime/status.ts` | modul | 39 | SELESAI |
| `lib/routes.test.ts` | test | 33 | SELESAI |
| `lib/routes.ts` | modul | 36 | SELESAI |
| `lib/runtime/public-origin-resolver.test.ts` | test | 44 | SELESAI |
| `lib/runtime/public-origin.test.ts` | test | 35 | SELESAI |
| `lib/runtime/public-origin.ts` | modul | 126 | SELESAI |
| `lib/security/archive-old-logs-0077.test.ts` | test | 44 | SELESAI |
| `lib/security/csp-dev.test.ts` | test | 16 | SELESAI |
| `lib/security/identity-rbac-wallet-hardening-0066.test.ts` | test | 121 | SELESAI |
| `lib/security/low-stock-digest-0076.test.ts` | test | 52 | SELESAI |
| `lib/security/membership-locking-audit-0071.test.ts` | test | 32 | SELESAI |
| `lib/security/notification-type-parity.test.ts` | test | 61 | SELESAI |
| `lib/security/ownership-transfer-intent-0073.test.ts` | test | 69 | SELESAI |
| `lib/security/ownership-transfer-intent-route.test.ts` | test | 45 | SELESAI |
| `lib/security/ownership-transfer-retry-0069.test.ts` | test | 46 | SELESAI |
| `lib/security/p2-rbac-bounds-0070.test.ts` | test | 85 | SELESAI |
| `lib/security/p2-reliability.test.ts` | test | 99 | SELESAI |
| `lib/security/private-errors-rls-0075.test.ts` | segment | 34 | SELESAI |
| `lib/security/product-intent-idempotency-0068.test.ts` | test | 84 | SELESAI |
| `lib/security/proof-deployment-reliability-0067.test.ts` | test | 51 | SELESAI |
| `lib/security/rate-limit.live.test.ts` | test | 83 | SELESAI |
| `lib/security/rate-limit.test.ts` | test | 118 | SELESAI |
| `lib/security/rate-limit.ts` | modul | 301 | SELESAI |
| `lib/security/rpc-arg-parity.test.ts` | test | 411 | SELESAI |
| `lib/security/rpc-hardening-0062.test.ts` | test | 56 | SELESAI |
| `lib/security/rpc-hardening-0063.test.ts` | test | 114 | SELESAI |
| `lib/security/rpc-hardening-0064.test.ts` | test | 195 | SELESAI |
| `lib/security/rpc-hardening-0065.test.ts` | test | 257 | SELESAI |
| `lib/security/rpc-hardening.contract.test.ts` | test | 449 | SELESAI |
| `lib/security/rpc-hardening.test.ts` | test | 77 | SELESAI |
| `lib/security/safe-profile-0072.test.ts` | test | 26 | SELESAI |
| `lib/security/warehouse-owner-lifecycle-0074.test.ts` | test | 68 | SELESAI |
| `lib/source.ts` | modul | 12 | SELESAI |
| `lib/supabase/auth-lookup.test.ts` | test | 41 | SELESAI |
| `lib/supabase/auth-lookup.ts` | modul | 44 | SELESAI |
| `lib/supabase/client.ts` | modul | 22 | SELESAI |
| `lib/supabase/config.ts` | modul | 29 | SELESAI |
| `lib/supabase/middleware.ts` | modul | 139 | SELESAI |
| `lib/supabase/server.ts` | modul | 56 | SELESAI |
| `lib/supabase/service.ts` | modul | 27 | SELESAI |
| `lib/ui/api-error-action.test.ts` | segment | 35 | SELESAI |
| `lib/ui/api-error-action.ts` | segment | 28 | SELESAI |
| `lib/users/notification-preferences.ts` | modul | 93 | SELESAI |
| `lib/utils.test.ts` | test | 53 | SELESAI |
| `lib/utils.ts` | modul | 265 | SELESAI |
| `lib/utils/sanitize-console-error.ts` | segment | 18 | SELESAI |
| `lib/validators/address.test.ts` | test | 60 | SELESAI |
| `lib/validators/address.ts` | modul | 42 | SELESAI |
| `lib/validators/auth.ts` | modul | 19 | SELESAI |
| `lib/validators/blockchain.ts` | modul | 10 | SELESAI |
| `lib/validators/inventory.test.ts` | test | 190 | SELESAI |
| `lib/validators/inventory.ts` | modul | 226 | SELESAI |
| `lib/validators/membership.test.ts` | test | 85 | SELESAI |
| `lib/validators/membership.ts` | modul | 107 | SELESAI |
| `lib/validators/wallet.ts` | modul | 47 | SELESAI |
| `lib/validators/warehouse.test.ts` | test | 31 | SELESAI |
| `lib/validators/warehouse.ts` | modul | 74 | SELESAI |
| `lib/version.ts` | modul | 9 | SELESAI |
| `lib/wallets/sync-client.test.ts` | test | 220 | SELESAI |
| `lib/wallets/sync-client.ts` | modul | 188 | SELESAI |
| `lib/wallets/sync.test.ts` | test | 400 | SELESAI |
| `lib/wallets/sync.ts` | modul | 397 | SELESAI |
| `lib/wallets/use-wallet-sync.ts` | modul | 222 | SELESAI |
| `lib/wallets/verify.test.ts` | test | 80 | SELESAI |
| `lib/wallets/verify.ts` | modul | 85 | SELESAI |
| `lib/warehouses/chain.test.ts` | test | 78 | SELESAI |
| `lib/warehouses/chain.ts` | modul | 375 | SELESAI |
| `lib/warehouses/create-client.test.ts` | test | 214 | SELESAI |
| `lib/warehouses/create-client.ts` | modul | 195 | SELESAI |
| `lib/warehouses/create.contract.test.ts` | test | 141 | SELESAI |
| `lib/warehouses/create.smoke.test.ts` | test | 471 | SELESAI |
| `lib/warehouses/create.test.ts` | test | 202 | SELESAI |
| `lib/warehouses/create.ts` | modul | 178 | SELESAI |
| `lib/warehouses/current-warehouse.ts` | modul | 88 | SELESAI |
| `lib/warehouses/deployment-finalize.test.ts` | test | 203 | SELESAI |
| `lib/warehouses/deployment-finalize.ts` | modul | 296 | SELESAI |
| `lib/warehouses/deployment-reconcile.test.ts` | test | 87 | SELESAI |
| `lib/warehouses/deployment-reconcile.ts` | modul | 196 | SELESAI |
| `lib/warehouses/join-client.ts` | modul | 94 | SELESAI |
| `lib/warehouses/join-requests.contract.test.ts` | test | 389 | SELESAI |
| `lib/warehouses/lifecycle.ts` | modul | 94 | SELESAI |
| `lib/warehouses/members-client.test.ts` | test | 158 | SELESAI |
| `lib/warehouses/members-client.ts` | modul | 243 | SELESAI |
| `lib/warehouses/members-page.contract.test.ts` | test | 343 | SELESAI |
| `lib/warehouses/ownership-intent-reconcile.test.ts` | test | 32 | SELESAI |
| `lib/warehouses/ownership-intent-reconcile.ts` | modul | 23 | SELESAI |
| `lib/warehouses/ownership-transfer.test.ts` | test | 64 | SELESAI |
| `lib/warehouses/ownership-transfer.ts` | modul | 87 | SELESAI |
| `lib/warehouses/use-switch-warehouse.ts` | modul | 26 | SELESAI |
| `lib/warehouses/warehouse-code.ts` | modul | 11 | SELESAI |
| `lib/warehouses/warehouse-lifecycle.contract.test.ts` | test | 640 | SELESAI |
| `lib/warehouses/warehouse-read-scope.contract.test.ts` | test | 395 | SELESAI |
| `lib/warehouses/warehouse-url.ts` | modul | 40 | SELESAI |
| `next.config.mjs` | config | 99 | SELESAI |
| `package.json` | config | 79 | SELESAI |
| `playwright.config.ts` | config | 69 | SELESAI |
| `pnpm-workspace.yaml` | config | 14 | SELESAI |
| `proxy.ts` | config | 39 | SELESAI |
| `public/file.svg` | svg | 1 | SELESAI |
| `public/globe.svg` | svg | 1 | SELESAI |
| `public/templates/products-import.csv` | csv | 5 | SELESAI |
| `public/vercel.svg` | svg | 1 | SELESAI |
| `public/window.svg` | svg | 1 | SELESAI |
| `scripts/ci/check-contrast.mjs` | mjs | 156 | SELESAI |
| `scripts/ci/deps-audit.mjs` | mjs | 128 | SELESAI |
| `scripts/ci/i18n-keys.mjs` | mjs | 73 | SELESAI |
| `scripts/ci/preflight.mjs` | mjs | 321 | SELESAI |
| `scripts/ci/secret-scan.mjs` | mjs | 110 | SELESAI |
| `scripts/ci/write-env.mjs` | mjs | 57 | SELESAI |
| `scripts/db/push-verify.mjs` | mjs | 119 | SELESAI |
| `scripts/dev/outbox-worker.mjs` | mjs | 114 | SELESAI |
| `scripts/e2e/parse-env.mjs` | mjs | 34 | SELESAI |
| `scripts/e2e/serve.mjs` | mjs | 174 | SELESAI |
| `scripts/e2e/verify-env.mjs` | mjs | 140 | SELESAI |
| `skills-lock.json` | config | 84 | SELESAI |
| `supabase/migrations/0001_users_and_rls.sql` | migrasi | 124 | SELESAI |
| `supabase/migrations/0002_realtime_publication.sql` | migrasi | 22 | SELESAI |
| `supabase/migrations/0003_wallets_warehouses_deployments.sql` | migrasi | 314 | SELESAI |
| `supabase/migrations/0004_memberships_join_requests.sql` | migrasi | 197 | SELESAI |
| `supabase/migrations/0005_rbac_server_flow.sql` | migrasi | 407 | SELESAI |
| `supabase/migrations/0006_inventory_core.sql` | migrasi | 549 | SELESAI |
| `supabase/migrations/0007_schema_hardening.sql` | migrasi | 406 | SELESAI |
| `supabase/migrations/0008_rbac_drift_fix.sql` | migrasi | 98 | SELESAI |
| `supabase/migrations/0009_proof_pipeline.sql` | migrasi | 742 | SELESAI |
| `supabase/migrations/0010_warehouse_create_flow.sql` | migrasi | 221 | SELESAI |
| `supabase/migrations/0011_warehouse_create_fixes.sql` | migrasi | 92 | SELESAI |
| `supabase/migrations/0012_warehouse_read_scope.sql` | migrasi | 88 | SELESAI |
| `supabase/migrations/0013_products_description.sql` | migrasi | 11 | SELESAI |
| `supabase/migrations/0014_members_page.sql` | migrasi | 159 | SELESAI |
| `supabase/migrations/0015_transactions_page.sql` | migrasi | 144 | SELESAI |
| `supabase/migrations/0016_blockchain_page.sql` | migrasi | 70 | SELESAI |
| `supabase/migrations/0017_notifications.sql` | migrasi | 1363 | SELESAI |
| `supabase/migrations/0018_proof_requeue_silent_retry.sql` | migrasi | 65 | SELESAI |
| `supabase/migrations/0019_analytics_dashboard.sql` | migrasi | 126 | SELESAI |
| `supabase/migrations/0020_warehouse_lifecycle.sql` | migrasi | 1152 | SELESAI |
| `supabase/migrations/0021_developer_console.sql` | migrasi | 86 | SELESAI |
| `supabase/migrations/0022_faucet_claims.sql` | migrasi | 200 | SELESAI |
| `supabase/migrations/0023_join_requester_profile.sql` | migrasi | 43 | SELESAI |
| `supabase/migrations/0024_user_paid_stock_intents.sql` | migrasi | 98 | SELESAI |
| `supabase/migrations/0025_stock_intent_race_safe.sql` | migrasi | 93 | SELESAI |
| `supabase/migrations/0026_replace_auth_role_claims.sql` | migrasi | 108 | SELESAI |
| `supabase/migrations/0027_reversal_direction_fix.sql` | migrasi | 290 | SELESAI |
| `supabase/migrations/0028_rpc_inventory_hardening.sql` | migrasi | 303 | SELESAI |
| `supabase/migrations/0029_products_warehouse_active.sql` | migrasi | 48 | SELESAI |
| `supabase/migrations/0030_p0_p1_db_hardening.sql` | migrasi | 124 | SELESAI |
| `supabase/migrations/0031_reversal_concurrency_lock.sql` | migrasi | 303 | SELESAI |
| `supabase/migrations/0032_idempotency_scope.sql` | migrasi | 305 | SELESAI |
| `supabase/migrations/0033_archive_product_atomic.sql` | migrasi | 66 | SELESAI |
| `supabase/migrations/0034_archive_security_fix.sql` | migrasi | 74 | SELESAI |
| `supabase/migrations/0035_movement_lock_ordering.sql` | migrasi | 257 | SELESAI |
| `supabase/migrations/0036_intent_hardening.sql` | migrasi | 111 | SELESAI |
| `supabase/migrations/0037_close_direct_product_mutation.sql` | migrasi | 175 | SELESAI |
| `supabase/migrations/0038_idempotency_fingerprint.sql` | migrasi | 400 | SELESAI |
| `supabase/migrations/0039_create_product_with_initial_stock.sql` | migrasi | 98 | SELESAI |
| `supabase/migrations/0040_fingerprint_required_backfill.sql` | migrasi | 398 | SELESAI |
| `supabase/migrations/0041_atomic_create_with_stock_proof.sql` | migrasi | 126 | SELESAI |
| `supabase/migrations/0042_invitations.sql` | migrasi | 171 | SELESAI |
| `supabase/migrations/0043_notification_preferences.sql` | migrasi | 39 | SELESAI |
| `supabase/migrations/0044_fix_accept_invitation_idempotency.sql` | migrasi | 98 | SELESAI |
| `supabase/migrations/0045_invitation_preview.sql` | migrasi | 50 | SELESAI |
| `supabase/migrations/0046_audit_v0_3_8_critical_fixes.sql` | migrasi | 172 | SELESAI |
| `supabase/migrations/0047_audit_v0_3_9_high_db_fixes.sql` | migrasi | 234 | SELESAI |
| `supabase/migrations/0048_audit_v0_3_10_remaining_db_fixes.sql` | migrasi | 185 | SELESAI |
| `supabase/migrations/0049_audit_v0_3_11_low_db_fixes.sql` | migrasi | 24 | SELESAI |
| `supabase/migrations/0050_audit_v0_4_2_m11_reversal_alignment.sql` | migrasi | 204 | SELESAI |
| `supabase/migrations/0051_faucet_confirm_pending_fix.sql` | migrasi | 75 | SELESAI |
| `supabase/migrations/0052_reversal_alignment_fix.sql` | migrasi | 387 | SELESAI |
| `supabase/migrations/0053_idempotency_ttl_purge.sql` | migrasi | 68 | SELESAI |
| `supabase/migrations/0054_append_only_guard_fk_fix.sql` | migrasi | 130 | SELESAI |
| `supabase/migrations/0055_intent_proof_conflict_scope.sql` | migrasi | 44 | SELESAI |
| `supabase/migrations/0056_invitation_preview_mask.sql` | migrasi | 57 | SELESAI |
| `supabase/migrations/0057_intent_fingerprint_passthrough.sql` | migrasi | 165 | SELESAI |
| `supabase/migrations/0058_product_search_trgm.sql` | migrasi | 32 | SELESAI |
| `supabase/migrations/0059_transactions_search.sql` | migrasi | 162 | SELESAI |
| `supabase/migrations/0060_confirm_ownership_transfer.sql` | migrasi | 163 | SELESAI |
| `supabase/migrations/0061_rpc_trust_boundary_hardening.sql` | migrasi | 429 | SELESAI |
| `supabase/migrations/0062_set_contract_address_service_role.sql` | migrasi | 85 | SELESAI |
| `supabase/migrations/0063_relational_rbac_and_race_hardening.sql` | migrasi | 267 | SELESAI |
| `supabase/migrations/0064_warehouse_deployment_service_boundary.sql` | migrasi | 495 | SELESAI |
| `supabase/migrations/0065_inventory_intent_service_boundary.sql` | migrasi | 1465 | SELESAI |
| `supabase/migrations/0066_identity_rbac_wallet_hardening.sql` | migrasi | 442 | SELESAI |
| `supabase/migrations/0067_proof_deployment_reliability.sql` | migrasi | 819 | SELESAI |
| `supabase/migrations/0068_product_intent_idempotency.sql` | migrasi | 288 | SELESAI |
| `supabase/migrations/0069_ownership_transfer_retry_hardening.sql` | migrasi | 179 | SELESAI |
| `supabase/migrations/0070_p2_rbac_bounds_and_idempotency.sql` | migrasi | 730 | SELESAI |
| `supabase/migrations/0071_membership_locking_and_audit.sql` | migrasi | 332 | SELESAI |
| `supabase/migrations/0072_safe_profile_projection.sql` | migrasi | 35 | SELESAI |
| `supabase/migrations/0073_ownership_transfer_intent_generation.sql` | migrasi | 746 | SELESAI |
| `supabase/migrations/0074_warehouse_owner_lifecycle.sql` | migrasi | 118 | SELESAI |
| `supabase/migrations/0075_private_notification_errors_rls.sql` | segment | 13 | SELESAI |
| `supabase/migrations/0076_low_stock_digest.sql` | migrasi | 92 | SELESAI |
| `supabase/migrations/0077_archive_old_logs.sql` | migrasi | 102 | SELESAI |
| `supabase/migrations/20260925072459_product_intent_no_initial_stock_fix.sql` | migrasi | 255 | SELESAI |
| `supabase/migrations/20260925143242_warehouse_deployment_relay_outbox.sql` | migrasi | 121 | SELESAI |
| `supabase/migrations/README.md` | dokumen | 48 | SELESAI |
| `tsconfig.json` | config | 43 | SELESAI |
| `vercel.json` | config | 29 | SELESAI |
| `vitest.config.mts` | config | 29 | SELESAI |
| `vitest.setup.ts` | config | 2 | SELESAI |



## 3. DAFTAR TEMUAN (urut severity)

### SEC-001 | supply-chain gate merah (axios highs + next RCE) | KRITIS | TAG: keamanan | Confidence: Tinggi `[TERVERIFIKASI-EKSEKUSI]`
*   **Path & Baris:** `package.json` (dep `next`), `.github/security-allowlist.json`, output `node scripts/ci/deps-audit.mjs`
*   **Kategori & Standar:** Supply chain (CWE-1104, OWASP A06:2021). CVSS: sesuai advisory (RCE critical, ReDoS/pollution high).
*   **Analisis Forensik:** Gate menemukan 1 critical (`GHSA-vcvr-r3jv-pc5j`, next/og ImageResponse RCE, next 16.3.5) + 7 high axios transitif via `@coinbase/cdp-sdk` di bundle wallet Privy. Forensik reachability: nol import axios/coinbase/x402 di `app|lib|components`; HTTP server hanya fetch/viem/supabase-js; `next/og`/`ImageResponse` nol referensi.
*   **Skenario Reproduksi/Eksploitasi:** RCE butuh render `ImageResponse` dari input terkontrol — tidak ada sink di kode (dibuktikan grep). Axios highs butuh input attacker langsung ke axios — tidak ada (SDK memanggil endpoint CDP tetap).
*   **Dampak Riil:** CI merah permanen; RCE class tidak boleh didiamkan.
*   **Kode Saat Ini (verbatim):** `"next": "16.3.5"` + 7 advisory tanpa allowlist.
*   **Perbaikan (lengkap, siap copy-paste):** `corepack pnpm update next@16.3.8` (sudah: critical hilang, build+533 test hijau) + 7 entri allowlist terasesmen expiry 2026-12-31. Override axios paksa DITOLAK sadar: risiko break signing wallet tanpa E2E.
*   **Test Regresi yang Ditambahkan:** gate `deps-audit` itu sendiri (exit 0 kini).
*   **Cara Verifikasi + Hasil yang Diharapkan:** `node scripts/ci/deps-audit.mjs` → `✅ no unaccepted high/critical`. `[TERVERIFIKASI-EKSEKUSI]`
*   **Risiko Regresi / "Perubahan Perilaku":** minor next (build+suite hijau). Tidak ada.
*   **Lokasi Lain:** N/A.

### BE-001 | bulk import vs maxDuration 60 dtk | SEDANG | TAG: performa | Confidence: Tinggi `[TERVERIFIKASI-STATIK]`
*   **Path & Baris:** `app/api/warehouses/inventory/products/bulk/route.ts` Baris `94-168`
*   **Kategori & Standar:** Performa/timeout; pola N+1 sekuensial per baris (~4 roundtrip DB/RPC).
*   **Analisis Forensik:** 1000 baris × ~200–400ms ≈ 3–7 menit > limit Vercel → timeout di tengah batch parsial. Rollback lintas-batch SENGAJA ditolak: baris sukses adalah data valid; idempotency per baris membuat retry aman.
*   **Skenario Reproduksi/Eksploitasi:** Upload CSV 1000 baris → 500/timeout di tengah; user mengulang buta.
*   **Dampak Riil:** Import besar tak pernah selesai; kebingungan + beban DB berulang.
*   **Kode Saat Ini (Cacat):**
```ts
for (const [idx, row] of parsed.data.products.entries()) { /* ~4 awaits */ }
```
*   **Rekomendasi Kode Perbaikan (Refactored):** SUDAH diterapkan — cap 100 sinkron (400 eksplisit) + fail-cepat client + i18n EN/ID:
```ts
if (parsed.data.products.length > 100) {
  return invalid("Split imports above 100 rows (this file has " + `${parsed.data.products.length}).`);
}
```
*   **Test Regresi yang Ditambahkan:** tsc + suite hijau; perilaku dijamin pola yang sama dengan guard lain.
*   **Cara Verifikasi + Hasil yang Diharapkan:** POST bulk 101 baris → 400 dengan pesan split. `[TERVERIFIKASI-STATIK]` (kode terbaca; runtime butuh dev server).
*   **Risiko Regresi:** File >100 baris yang dulu "kadang lolos" kini selalu ditolak — Perubahan Perilaku yang disengaja.
*   **Lokasi Lain:** pola loop sekuensial serupa di reconcile (cron, tanpa limit waktu ketat — OK).

### BE-002 | tanpa penjaga navigasi saat transaksi berjalan | SEDANG | TAG: UX-kehilangan-data | Confidence: Tinggi `[TERVERIFIKASI-STATIK]`
*   **Path & Baris:** `components/inventory/stock-movement-dialog.tsx`, `components/warehouses/create-warehouse-form.tsx`, `components/inventory/product-dialogs.tsx` (grep `beforeunload` = 9 hit pasca-patch, sebelumnya 0)
*   **Analisis Forensik:** Dialog multi-langkah (siapkan → sign → polling 45 dtk) hilang oleh refresh/back. Terparah create-warehouse: signature sudah bayar gas tapi record DB belum finalize = warehouse yatim (hanya pulih via reconcile).
*   **Dampak Riil:** Gas terbuang + data yatim + user bingung.
*   **Rekomendasi Kode Perbaikan (Refactored):** SUDAH diterapkan di 3 dialog:
```tsx
React.useEffect(() => {
  if (!busy) return;
  const guard = (e: BeforeUnloadEvent) => e.preventDefault();
  window.addEventListener("beforeunload", guard);
  return () => window.removeEventListener("beforeunload", guard);
}, [busy ]);
```
*   **Cara Verifikasi:** eslint (cleanup) + tsc + suite hijau. `[TERVERIFIKASI-EKSEKUSI]` (gates), perilaku browser `[PERLU-RUNTIME]`.

### DB-001 | tabel append-only tanpa retensi | SEDANG | TAG: DB-ops | Confidence: Tinggi `[TERVERIFIKASI-EKSEKUSI]`
*   **Path & Baris:** `supabase/migrations/0077_archive_old_logs.sql` (baru); pemanggil `lib/warehouses/lifecycle.ts`, cron 05:00
*   **Analisis Forensik:** `audit_logs`/`notifications`/`proofs` tumbuh selamanya; purge hanya untuk idempotency keys (0053). `proofs` SENGAJA dikecualikan (di-join live UI ledger).
*   **Dampak Riil:** 12–18 bulan: bloat + vacuum load + biaya.
*   **Rekomendasi Kode Perbaikan (Refactored):** SUDAH diterapkan + applied remote terverifikasi — arsip (bukan hapus) >180 hari, batch ≤1000/transaksi pendek, idempoten, terindeks, RLS deny; backlog terkuras progresif via cron.
*   **Cara Verifikasi + Hasil yang Diharapkan:** `pg_tables where schemaname='archive'` → 2 tabel present `[TERVERIFIKASI-EKSEKUSI]`; observasi cron 05:00 pertama masih terbuka.

### DX-001 | drift migrasi 0075–0077 | SEDANG | TAG: proses-deploy | Confidence: Tinggi `[TERVERIFIKASI-EKSEKUSI]`
*   **Path & Baris:** `supabase/migrations/0075*.sql`, `0076*.sql`, `0077*.sql` + `schema_migrations`
*   **Analisis Forensik:** Pola berulang ke-4 (setelah relay): kode merged tanpa apply = PostgREST 500.
*   **Dampak Riil:** Fitur 500 di production walau kode benar.
*   **Perbaikan:** Applied + tercatat (`0074,0075,0076,0077,relay` terkonfirmasi), fungsi ada dengan signature/grant tepat, RLS on, smoke `digest_low_stock()` → 0 tanpa error. Guard permanen: parity 44/44 + `db:push:verify` + banner startup.

### FE-001 | waktu relatif Inggris mentah | SEDANG | TAG: i18n | Confidence: Tinggi `[TERVERIFIKASI-STATIK]`
*   **Path & Baris:** `lib/notifications/types.ts` Baris `143-155` (fungsi duplikat `"just now"`, `"2m ago"`)
*   **Analisis Forensik:** Duplikat dari `lib/utils.ts:formatTimeAgo` (yang sudah locale-aware via `Intl.RelativeTimeFormat`); 5 komponen memakai versi Inggris.
*   **Dampak Riil:** Inkonsistensi bahasa di notifikasi + dashboard.
*   **Rekomendasi Kode Perbaikan (Refactored):** SUDAH diterapkan — 5 call-site ke versi utils + locale; fungsi duplikat dihapus; suite hijau.

### FE-002 | body halaman about Inggris | SEDANG | TAG: i18n-konten | Confidence: Tinggi `[TERVERIFIKASI-STATIK]`
*   **Path & Baris:** `app/(marketing)/about/page.tsx`
*   **Perbaikan:** SUDAH — 3 paragraf → key `about.body_1/2/3` EN/ID. Sisa konten (`content/docs/**`, body marketing lain yang sudah ber-key) = backlog.

### FE-003 | dead default writer syncWallet | SEDANG | TAG: trust-boundary | Confidence: Tinggi `[TERVERIFIKASI-EKSEKUSI]`
*   **Path & Baris:** `lib/wallets/sync.ts` Baris `179-188` (sebelum patch)
*   **Analisis Forensik:** Default memanggil `supabase.rpc("register_wallet_for_user")` yang di-revoke untuk authenticated (0070) — selalu gagal bila dipakai; satu-satunya caller prod menginjeksi writer service-role.
*   **Perbaikan:** Default = `persistWalletRegistration`; 14 call-site test di-inject writer eksplisit; suite 14/14 hijau.

### UI-001 | target sentuh 32px | SEDANG | TAG: a11y-touch | Confidence: Tinggi `[TERVERIFIKASI-EKSEKUSI]`
*   **Path & Baris:** `components/settings/warehouse-lifecycle-button.tsx:91`, `components/shared/api-error-action.tsx:26`
*   **Analisis Forensik:** `h-8` tanpa ekspansi = satu-satunya 2 pelanggaran di repo (preflight 2/7 gagal).
*   **Perbaikan:** Pola repo `before:-inset-2` (48px efektif); preflight kini PASS (7/7 + build).

### UI-002 | label grup + key i18n salah | SEDANG | TAG: i18n | Confidence: Tinggi `[TERVERIFIKASI-STATIK]`
*   **Path & Baris:** `lib/i18n/translations.ts:14`, `components/layout/app-sidebar.tsx:270`
*   **Analisis Forensik:** `group.developer` bernilai "Pengembang" bahkan di locale EN; pemakaian literal.
*   **Perbaikan:** Nilai EN → "Developer" + pemakaian via `t()`.

### UI-003 | copy hardcoded realtime/KPI + email tanpa spellcheck | SEDANG | TAG: i18n/UX | Confidence: Tinggi `[TERVERIFIKASI-STATIK]`
*   **Path & Baris:** `components/realtime/realtime-indicator.tsx:10-40`, `app/(dashboard)/inventory/products/page.tsx:237-271`, 4 input email
*   **Perbaikan:** Semua ke key EN/ID; `spellCheck={false}` di input email (autocorrect merusak email saat login).

### UI-004 | key i18n dirujuk tapi tidak ada | SEDANG | TAG: integritas | Confidence: Tinggi `[TERVERIFIKASI-EKSEKUSI]`
*   **Path & Baris:** `components/auth/signup-form.tsx:97`
*   **Analisis Forensik:** `t("auth.email_placeholder")` tanpa entri → fallback menampilkan key mentah di placeholder. Lolos test karena tak ada render-test form auth.
*   **Perbaikan:** Key ditambahkan EN+ID; i18n-keys hijau.

### UI-005 | `transition-all` 7 titik | KOSMETIK | TAG: perf-mikro | Confidence: Tinggi `[TERVERIFIKASI-STATIK]`
*   **Path & Baris:** `profile-wallet-card.tsx:48,106`, `ui/tabs.tsx:61`, `ui/sidebar.tsx:309`, `marketing/hero.tsx:124`, `bulk-add-dialog.tsx:341,355,436`, `ui/badge.tsx:8`
*   **Analisis Forensik:** Guideline melarang `transition: all`; padanan eksplisit per properti yang berubah (box-shadow/border, transform, colors, width).
*   **Dampak Riil:** Dapat diabaikan di GPU modern; rapikan saat sentuh file.



## 4. DIKONFIRMASI AMAN (dengan guard penahannya)

- **Verify-wallet langsung (temuan v0.5.5): TERTUTUP.** `verify_wallet(uuid,uuid)` final: `ALLOW service_role` saja (0061:177-180); route membuktikan `personal_sign` dulu. `[TERVERIFIKASI-EKSEKUSI]` (matriks + kode route + log verify 200 via jalur sah).
- **Self-approval adjustment: DITOLAK di RPC.** `approve_stock_adjustment` (0065): `self_approval_forbidden` + role MANAGER/OWNER + proof-binding + warehouse active. `[TERVERIFIKASI-STATIK]`
- **Suspend menolak mutasi sampai RPC.** `apply_stock_movement` → core menolak warehouse non-active; C-02 di semua route. `[TERVERIFIKASI-STATIK]`
- **Intent finalize membuktikan tx, bukan sekadar receipt.** `intents/route.ts:474-529`: to/from/input/status vs kontrak+actor+intent+payloadHash + ≥2 konfirmasi; reverted ditolak. `[TERVERIFIKASI-STATIK]`
- **Faucet double-pay (v0.3.5): TERTUTUP.** `lib/faucet/claim.ts:1-248`: wallet-verified binding + role gate + RPC atomik + semantik broadcast-ambigu benar + cooldown reset tepat. `[TERVERIFIKASI-STATIK]`
- **QStash signature di raw body + current/next key + fail-closed + URL-bound; replay dijinakkan lease idempoten.** `lib/proof/verify-request.ts:27-44`. `[TERVERIFIKASI-STATIK]`
- **Privy token: verifikasi signature/exp oleh SDK + konsistensi user + expiry dicek caller.** `lib/privy/custom-auth.ts:68-155`. `[TERVERIFIKASI-STATIK]`
- **Treasury key: tidak pernah ke browser** (nol `NEXT_PUBLIC_*` sensitif; hanya boolean di health/console; CSV EKSPOR tidak menyentuhnya). `[TERVERIFIKASI-EKSEKUSI]` (grep + secret-scan bersih)
- **CSV formula injection: dimitigasi terpusat** (`lib/csv/formula-injection` dipakai kedua exporter). `[TERVERIFIKASI-STATIK]`
- **SKIP_ENV_VALIDATION: hanya lolos bila VERCEL≠1** (`lib/env.ts:183-184`); di Vercel tanpa bypass = fail-fast 14 secret. `[TERVERIFIKASI-STATIK]`
- **Old-RPC-signature bypass: TERTUTUP.** 0065:9-22 + 0061/0064 drop semua overload lama; parity test overload-aware 44/44 hijau. `[TERVERIFIKASI-EKSEKUSI]`
- **Overload "mati" ternyata shim load-bearing** (3-arg proof_* dipakai contract test + kompatibilitas; `create_warehouse_and_deployment` dipakai relay SQL). Tidak dihapus — keputusan benar.
- **RLS on 19/19 tabel; `private.*` tak terekspos; trigger immutable; hooks cleanup disiplin; debounce search; double-submit terkunci (busy+idempotency); error DB tak bocor (`mapDbError`/`safeError`); proxy matcher eksplisit; CSP/HSTS/COOP; kontras AA; paritas i18n 100%.

## 5. SARAN OPSIONAL

- S1. E2E preview run sebelum cutover v2 (butuh tunnel+secrets; bukan kode).
- S2. Terjemahkan `content/docs/**` + body marketing tersisa (konten, bukan bug).
- S3. `formatTimeAgo` duplikat sudah dihapus; pola `copy`-prop dasbor dipertahankan.
- S4. Pertimbangkan `pnpm audit --fix`-style upgrade axios bila upstream SDK merilis pin baru (pantau expiry allowlist Des 2026).
- S5. Widget kesehatan treasury di dashboard owner (data sudah ada via console).

## 6. ROADMAP EKSEKUSI

| Urutan | ID | Komponen | Tindakan | Dampak | Kesulitan | LOE | Dependensi |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| 1 | SEC-001 | deps | Selesai (upgrade+triase); pantau expiry Des 2026 | Menutup CI merah+RCE | Rendah | 0-being observed | - |
| 2 | DX-001 | 0075-77 | Selesai applied; revoke token | Menutup drift | - | 2 mnt (kamu) | token |
| 3 | BE-002 | 3 dialog | Selesai; uji browser manual sekali | Cegah gas terbuang | - | 5 mnt (kamu) | dev server |
| 4 | DB-001 | arsip | Observasi cron 05:00 pertama | Validasi retensi | - | 15 mnt (kamu) | cron prod |
| 5 | DX-002 | e2e | Run preview | Keyakinan rilis | Sedang | 1-2 jam | tunnel+secrets |
| 6 | FE-002 | docs | Terjemahan bertahap | UX ID | Rendah | 3-4 jam | - |

## 7. PATCH BUNDLE

Tidak ada diff tertunda: worktree bersih (`git status` kosong), semua perbaikan sesi ini sudah di-HEAD dan terverifikasi hijau (533 test, tsc, eslint, prettier, i18n-keys, secret-scan, contrast, preflight 7/7, build, deps-audit). Patch historis relevan: `5f02a86` (audit batch), `b819b59` (i18n), `712f373` (release v0.5.7), `cf8277c`+`2b95360`+`6240e2c` (wallet/P0/P1). Perintah verifikasi akhir: `npx tsc --noEmit && npx vitest run && node scripts/ci/i18n-keys.mjs && node scripts/ci/secret-scan.mjs && node scripts/ci/check-contrast.mjs && node scripts/ci/deps-audit.mjs && npx next build` (SKIP_ENV_VALIDATION=1 di lokal).

