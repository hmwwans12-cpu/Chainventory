# Chainventory — UI/UX Audit (v0.2.2 → target v0.2.3)

Tanggal audit: 2026-08-28
Status build: ✅ `node node_modules/next/dist/bin/next build` (Turbopack, 60 routes)
Contrast: ✅ WCAG AA (`scripts/ci/check-contrast.mjs`)

Audit mencakup: buttons & inputs, forms & validasi, navigasi & mobile, warna & aksesibilitas, data & edge cases.

---

## Ringkasan

| Severity | Jumlah | Ringkasan |
|----------|--------|-----------|
| **P0** (kritis) | 0 | Tidak ada crash / kebocoran data / korupsi ledger |
| **P1** (fungsional) | 2 | Data loss CSV, gender signup gagal |
| **P2** (bug nyata) | 12 | Inkonsistensi fitur, warna, format, race |
| **P3** (polish) | 9 | Aksesibilitas, konsistensi minor |

---

# BUGS NYATA

## P1 — Fungsional (pecahnya fitur / kehilangan data)

### 1. CSV bulk import diam-diam membuang `initial_qty` (data loss)
`components/inventory/bulk-add-dialog.tsx:122`
Row hasil parse CSV dipetakan dengan `initialQty: null`, menimpa nilai `initial_qty` yang diekstrak `parseProductsCsv` (`lib/inventory/csv.ts`). Akibatnya kolom "initial stock-in" pada CSV **tidak pernah tercatat** — preview "N with initial stock-in" (baris 373–374) tak akan pernah benar.

**Fix:** jangan null-kan `initialQty` untuk baris hasil CSV (pertahankan nilai parse), dan beri input opsional initial quantity untuk baris manual.

### 2. Gender signup gagal untuk 2 dari 4 opsi
`components/auth/signup-form.tsx:73-76` vs `lib/validators/auth.ts:13`
UI menawarkan `OTHER` dan `UNDISCLOSED`, tapi `signupSchema.gender` hanya mengizinkan `MALE|FEMALE`. User memilih "Other"/"Prefer not to say" selalu dapat error "Select your gender." dan form reset.

**Fix:** perluas `genderEnum` (samakan dgn kolom DB) ATAU hapus dua opsi yang tak bisa dikirim.

---

## P2 — Bug nyata / inkonsistensi fitur

### 3. Warna kontradiktif antara desktop & mobile (data sama, warna beda)
`components/inventory/movements-page.tsx:468` (desktop `text-warning`) vs `:588` (mobile `text-destructive`)
`components/transactions/transactions-page.tsx:239` vs `:344`
Jumlah negatif dirender amber di tabel desktop tapi merah di kartu mobile — untuk nilai yang sama di list yang sama. **Pilih satu tone** (destructive/merah adalah konvensi "negatif/buruk").

### 4. Move dialog close-guard terbalik vs komentarnya sendiri
`components/inventory/product-dialogs.tsx:630`
`onOpenChange={(next) => (busy && !phase ? null : onOpenChange(next))}` — komentar bilang "block closing while signing", tapi kode memblokir saat busy **dan** phase kosong, justru memperbolehkan close saat `signing`.
**Fix:** `busy ? null : onOpenChange(next)`.

### 5. Display-name editor tak bisa dibuka ulang setelah simpan
`components/shared/display-name-editor.tsx:44`
`return` early saat `state.success` sebelum cek `editing` — setelah sukses simpan, tombol pensil mati sampai reload.
**Fix:** cek `editing` dulu, reset `state.success` saat dibuka ulang.

### 6. Notifikasi preferences race condition
`components/shared/notification-preferences.tsx:29-58`
PATCH optimistik berurutan bisa tiba tidak urut (klik link email=off lalu persistence email=on → UI dengar "off" tapi server simpan "on"). Path failure `setPrefs(initial)` membuang toggle lain yang sempat diubah.
**Fix:** serialkan via pending-queue (single flight); pada failure restore snapshot server terakhir, bukan snapshot render awal.

### 7. CSV/movement reason: client required, API optional
Dialog adjustment/reversal/reject wajib isi reason di UI, tapi `applyMovementSchema`/`rejectAdjustmentSchema` (`lib/validators/inventory.ts`) membiarkan `reason` optional. Panggilan API langsung bisa bikin movement audit-critical tanpa reason.
**Fix:** jadikan `reason` wajib (min length 1) di zod.

### 8. Open redirect pada halaman invite
`app/invite/[token]/page.tsx:69-70`
Merender `<Link href={sp.next}>` tanpa sanitasi `?next=` (mis. `//evil.com`). Alur login/confirm sudah sanitasi via `safeNext`.
**Fix:** guard `sp.next` dengan `startsWith("/") && !startsWith("//")`.

### 9. Invite route bocorkan error RPC mentah
`app/api/warehouses/members/invite/route.ts:60`
`invalid(error.message)` mengirim teks PostgREST mentah (nama relasi, kode constraint) ke client.
**Fix:** kembalikan pesan stabil, log error mentah.

### 10. Kode warehouse hanya validasi server-side
`components/warehouses/join-warehouse-form.tsx:76` vs `lib/validators/auth.ts:22-24`
Client hanya cek non-empty; server butuh `^WH-[A-Z0-9-]+$`. Format tidak valid melakukan round-trip lalu muncul "Something went wrong."
**Fix:** cerminkan regex di client untuk feedback instan.

### 11. Focus target salah id elemen
`components/warehouses/create-warehouse-form.tsx:201-203` fokus `companyName`/`warehouseType`, tapi DOM ids-nya `company`/`type` → `document.getElementById(null)`; hanya `name` yang fokus benar.
**Fix:** samakan key error dengan id DOM.

### 12. Fokus indikator keyboard hilang di product-select
`components/inventory/searchable-product-select.tsx:186`
Opsi listbox interaktif pakai `outline-none` tanpa `focus-visible:ring`; aktif hanya di warna/background (`bg-muted`). Pengguna keyboard kehilangan penanda fokus.
**Fix:** tambah `focus-visible:ring` + isyarat non-warna (checkmark/ring).

### 13. Penanda warehouse/status member salah tone (semantik)
`components/members/members-page.tsx:612-618`
`PENDING` → `failed` (merah destruktif) padahal netral "menunggu"; `SUSPENDED` → `failed` padahal terbatas bukan error. `StatusBadge` sudah punya tone `suspended` yang tak pernah dipakai.
**Fix:** `ACTIVE→success, PENDING→pending, SUSPENDED→suspended`.

### 14. ETH formatting divergen
`components/console/treasury-card.tsx:151` `toFixed(4)` tanpa separator ribuan; `lib/utils.ts:37 formatEthValue` pakai `toLocaleString` dan dipakai di wallet-balance/settings/profile. `faucet-claim-card.tsx:24` tampilkan raw string tanpa unit.
**Fix:** pakai `formatEthValue` di treasury & faucet.

### 15. `formatTimeAgo` tidak pin locale → risiko hydration mismatch
`lib/notifications/types.ts:151` jatuh ke `toLocaleDateString()` tanpa `FIXED_LOCALE` sementara `lib/utils.ts:16,24` pin `"en-US"`. Di SSR vs hydration locale beda untuk notif > 7 hari.
**Fix:** pakai `formatDate` dari `lib/utils` (ter-pin).

### 16. Inkonsistensi date format (3 format beda)
`formatDate`/`formatDateTime` (`lib/utils.ts`), fallback `formatTimeAgo` (`lib/notifications/types.ts:151`), dan chart tick formatter (`components/analytics/stock-movement-chart.tsx`) masing-masing format beda.
**Fix:** konsolidasi ke helper bersama ter-pin jenis.

### 17. Dashboard header overflow di layar sempit
`components/layout/site-header.tsx:119-204` + `components/realtime/realtime-indicator.tsx:37-55`
Grup kanan (Locale + Theme + Search + **RealtimeIndicator** + Bell + Avatar) selalu tampil; `RealtimeIndicator` menampilkan label teks **di semua breakpoint** (tak ada `hidden sm:inline`). ~250px kontrol di kanan + breadcrumb di 320–400px → crowding.
**Fix:** sembunyikan label realtime di bawah `md` (dot saja).

### 18. Breadcrumb nama warehouse tak pernah truncate
`components/layout/site-header.tsx:97-106`
`BreadcrumbLink` render `{active.name}` tanpa `truncate`/`min-w-0`/`max-w`. Nama panjang mendorong row lebih lebar dari viewport → kontrol kanan `ml-auto` terdorong keluar layar.
**Fix:** `min-w-0 max-w-40 truncate` pada crumb.

---

# REKOMENDASI (Saran untuk Project)

## A. KONSOLIDASI STATUS METADATA (P1 arsitektur / drift-risk) — SARAN PRIORITAS
Status→label/tone diduplikasi independent antar modul: `MOVEMENT_TYPE_META`/`MOVEMENT_STATUS_META` (`product-dialogs.tsx`), `PROOF_STATUS_META` (`movement-detail-sheet.tsx`), `DEPLOYMENT_STATUS_META` (`lib/blockchain/types.ts`), dan `STATUS_TONE_LABEL` privat (`recent-movements.tsx:70`) yang terpisah dari `MOVEMENT_STATUS_META`. Setiap warna/label harus disinkronkan manual; drift tak terlihat karena `Record<string,...>` fallback render string mentah saat status baru tak terdaftar.

**Rekomendasi:** bangun modul shared typed (`lib/inventory/status-meta.ts`, `lib/blockchain/proof-meta.ts`) yang diimpor semua halaman, dan satu sumber tunggal untuk tabel status movement/transaction dipakai `recent-movements`, `movements-page`, `transactions-page`, `product-dialogs`. Ini **penghapusan duplikasi + penambahan modul** sekaligus.

## B. HARUSKAH KITA TETAPKAN I18N? — KEPUTUSAN ARSITEKTUR
Dashboard page memakai `t("dashboard.title")`, tapi **semua** halaman lain (`transactions`, `analytics`, `inventory/*`, `members`, `blockchain`, `notifications`, `settings`, `console`) hardcode Inggris di `PageHeader`. Breadcrumb `pageTitle` juga hardcoded walau `NAV_ITEMS` punya `i18nKey`. Toggle locale ada, tapi berhenti di dashboard — setengah-setengah.

**Rekomendasi:** **pilih satu dari dua**:
- (a) **PENGHAPUSAN UI/UX:** buang `t()` di dashboard → seragam semua halaman Inggris (paling murah, konsisten, tak menyesatkan). ATAU
- (b) **PENAMBAHAN UI/UX:** rebase semua `PageHeader` + breadcrumb ke string i18n. Ini pekerjaan besar tapi yield konsistensi penuh.

Saran saya: untuk v0.2.3 lakukan (a) dulu (kecil, perbaiki kontradiksi), dan tandai (b) sebagai backlog sizing.

## C. PENAMBAHAN KOMPONEN — Error/Empty State & Retry
- `app/(dashboard)/analytics/page.tsx:90-95`: error RPC dirender sebagai `EmptyState` tanpa retry. Jelas beda dgn `blockchain-page.tsx:411-417` yang benar memakai `ErrorState` + `onRetry`. **Ganti ke `ErrorState` + retry.**
- `app/(dashboard)/notifications/page.tsx:41`: query gagal di-swallow (`data ?? []`) → ditampilkan seolah-olah tak ada notif. **Cek `notifRes.error`, render `ErrorState`.**
- Dashboard panels: `recent-transactions.tsx:71-81`, `recent-activity.tsx:37-47`, `top-products.tsx:14-19` pakai inline `<p>`; halaman lain pakai `<EmptyState>`. **Sarankan: sarankan konsolidasi ke `<EmptyState>`.**

## D. PENAMBAHAN — Error boundaries per-route
Hanya ada `app/(dashboard)/error.tsx` + `global-error.tsx`. Semua route data-heavy (`analytics`, `dashboard`, `inventory/*`, `members`) naik ke boundary induk, kehilangan konteks/perbaikan spesifik-route. **Sarankan tambah `error.tsx` per route data-heavy.**

## E. PENGHAPUSAN / PENYEDERHANAAN — Duplikasi & redundansi
1. **`login-form.tsx:67`** hardcode `h-11` (default Button size sudah `h-11`) — redundan, divergen dari sibling. Buang.
2. **`pageTitle()` redundant matching** (`site-header.tsx:52-59`): `pathname.startsWith(c.href)` menutupi dua kondisi pertama. Sederhanakan jadi exact + trailing-slash match.
3. **`display-name-editor` stale success bug** (lihat #5) — bukan hanya fix, tapi reusable `useAsyncAction` hook untuk semua form serupa (kurangi boilerplate submit).
4. **3 duplicate date formatters** → satu helper (lihat #16).
5. **Duplikasi status meta** (lihat A).

## F. PENAMBAHAN — Robustness data
- **Low-stock guard:** `inventory/products/page.tsx:154-157` & `inventory/movements/page.tsx:138-141` mengasumsikan `inventory_balances?.[0]` (array-only), dashboard sudah `Array.isArray` guard. Empty array → `String(undefined)`= `"null"` → `Number("null")` = `NaN` → `NaN < threshold` = `false` → **miss-flag low-stock**. Salin guard dashboard + coalesce ke `Number(... ?? 0)`.
- **Unbounded quantity:** regex `^\d+(\.\d{1,3})?$` terima string panjang → `Number`→`Infinity` masih lolos `> 0` → zod/DB overflow 500. Cap digit & max value di zod.
- **Bulk archive tanpa konfirmasi:** `products-page.tsx:156-179` arsip seleksi langsung eksekusi tanpa dialog, padahal archive tunggal lewat `ArchiveProductDialog` (harus konfirmasi destructive). **Sarankan samakan pola confirm dialog.**
- **Google button tanpa busy state:** `auth/google-button.tsx:16-22` tak disable → double-click dua OAuth. Pakai `useFormStatus()`.

## G. PENAMBAHAN — Feedback & aksesibilitas
1. **Movement approve/reject tak ada success toast:** `movements-page.tsx` tutup-refresh diam-diam; members-page & product dialogs sudah `toast.add`. Tambah toast untuk paritas.
2. **Error banner tak ter-wire ke field** (`aria-describedby`): login/signup/forgot/reset banner tak punya `id`. Wire `aria-describedby` (tiru `auth/form-field.tsx`).
3. **Redirect timer tak dibersihkan:** `reset-password-form.tsx:43` `setTimeout` fire walau unmount. Pakai `useEffect` + `clearTimeout`.
4. **`notification-bell.tsx:385`** judul `text-[13px]` vs `notifications-page-view.tsx:302` `text-sm` — data sama, ukuran beda. Samakan `text-sm`.

## H. KECIL (P3)
- `AUDITOR` role tone `warning` (amber) → sebaiknya `inactive` (role netral read-only).
- `trusted-by.tsx:29` brand `text-muted-foreground/70` (~1.6:1) → `text-muted-foreground` (5.6:1).
- `stock-movement-chart.tsx` chart-1 & chart-2 dua-duanya hijau (`#186049`/`#6ab29b`) — sulit dibedakan untuk buta-warna hijau-merah; pasangkan hue beda (mis. hijau/amber).
- `app/layout.tsx:67 themeColor:"#E4D5C7"` light cream statis → tidak gelap di dark mode; pakai token/dark variant.
- `cta.tsx:24` / `blockchain-explanation.tsx:40,69` overlay putih dekoratif hilang di primary hijau-terang dark-mode (non-fungsional, polish).
- `bulk-add-dialog.tsx:405-411` tombol "Review errors" selalu kembali ke `step==="input"` walau `invalid.length===0`. Ganti label netral / tampil hanya saat ada error.
- `products-page.tsx` comment ("pertahankan page...") vs behavior (`params.delete("page")`) — samakan.
- `site-header` search button di mobile icon-only → tidak ada affordance ⌘K di touch. Opsional text "Search".

---

## PRIORITAS IMPLEMENTASI YANG DISARANKAN

**Sprint P1 (fungsional, cepat)**
1. #2 Gender signup — hapus opsi tak-terkirim / perluas validasi
2. #1 CSV initial_qty — pertahankan nilai parse
3. #13 Member status color semantic + #3 negative-qty color sinkron

**Sprint P2a (bug nyata)**
4. #5 display-name reopen, #6 notif race, #4 close-guard, #7 reason wajib
5. #8 open redirect invite, #9 invite error leak

**Sprint P2b (mobile + a11y)**
6. #17 header overflow, #18 breadcrumb truncate
7. #12 focus ring product-select, #11 focus id, #14/#15/#16 format ETH+date

**Sprint A (arsitektur)**
8. Konsolidasi status meta (A)
9. Putuskan i18n scope (B) — rekomendasi: seragamkan ke Inggris untuk v0.2.3
10. ErrorState/EmptyState + error boundaries per-route (C, D)

**Backlog (P3)**
- Semua poin kecil di H + feedback toast movement (G1) + robust data (F)

---

> Catatan: temuan tidak membutuhkan perubahan `.next`/`node_modules`. Build & contrast tetap hijau sepanjang audit.
