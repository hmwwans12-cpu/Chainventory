# Chainventory — UI/UX Audit (v0.2.3 → target v0.2.4)

Tanggal audit: 2026-08-28
Status build: ✅ `node node_modules/next/dist/bin/next build` (Turbopack, 60 routes)
Contrast: ✅ WCAG AA (`scripts/ci/check-contrast.mjs`)
Scope: `app/`, `components/`, `lib/` — `.next` dan `node_modules` diabaikan

Audit mencakup: buttons & touch targets, tipografi & keterbacaan, forms & validasi, navigasi & mobile, warna & aksesibilitas, data & edge cases, i18n & konsistensi sistem.

---

## Ringkasan

| Severity | Jumlah | Ringkasan |
|----------|--------|-----------|
| **P0** (kritis) | 0 | Tidak ada crash / kebocoran data / korupsi ledger |
| **P1** (fungsional) | 0 | — |
| **P2** (bug nyata) | 11 | Inkonsistensi tampilan, target sentuh, logika hilang, feedback hilang |
| **P3** (polish) | 9 | Aksesibilitas minor, tipografi, redundansi, polish visual |

> Semua `P2` di bawah adalah perbaikan kecil-klinis (1–5 baris per titik) — bukan redesign.

---

# BUGS NYATA

## P2 — Bug nyata / inkonsistensi fitur

### 1. Status `SUSPENDED` kembali divergen desktop vs mobile (regresi fix v0.2.3)
`components/members/members-page.tsx:612-627` (desktop, sudah benar) vs `:686-697` (mobile, masih salah)
`git diff v0.2.3` memperbaiki desktop `SUSPENDED → suspended` (abu netral) tapi menyisakan mobile `SUSPENDED → "failed"` (merah destruktif). Data sama, warna beda per breakpoint — `failed` berarti error terminal, `suspended` berarti non-aktif sementara. Mobile card-list masih merah panik untuk member yang hanya suspended.

**Fix:** samakan mobile `statusTone` ke `suspended` (seperti desktop):
```ts
member.status === "ACTIVE" ? "success" : member.status === "PENDING" ? "pending" : "suspended"
```
Dan label tetap `"Suspended"`. Satu baris.

### 2. CSV overflow 1000+ baris didiamkan (data loss diam-diam)
`lib/inventory/csv.ts:41-52,134-135` (`overflow` flag) vs `components/inventory/bulk-add-dialog.tsx:117-128`
`parseProductsCsv` mengembalikan `overflow:true` saat `rows.length >= MAX_IMPORT_ROWS` tapi `goToPreview()` tidak pernah membaca `parsed.overflow`. 1.001 baris ke atas terpotong sunyi tanpa peringatan — user mengira semua baris terimpor.

**Fix:** di `goToPreview()` cek `if (parsed.overflow) toast(… >1000 rows truncated …)` atau render banner `bg-warning/15` di preview header. Alternatif: `setInvalid` tambahkan entry `Row —: Only first 1,000 rows imported`.

### 3. Tombol "Review errors" selalu tampil walau tanpa error
`components/inventory/bulk-add-dialog.tsx:403-410`
Pada `step==="preview"` tombol kiri berlabel `"Review errors"` (outline) dirender tanpa guard `invalid.length > 0`. Saat CSV bersih (0 invalid) label menyesatkan — tidak ada error untuk direview; klik hanya kembali ke input tanpa aksi scroll ke daftar error.

**Fix:** ganti label netral atau guard:
```tsx
<Button variant="outline" onClick={() => setStep("input")} disabled={busy}>
  {invalid.length ? "Review errors" : "Back to edit"}
</Button>
```
Atau sembunyikan seksi `Review errors` (`:379-401`) dengan benar — sekarang header preview selalu klaim `Invalid rows: N` tapi tombol tetap "Review errors" saat N=0.

### 4. Trigger akun header di bawah 44px tanpa hit-expansion (target sentuh)
`components/layout/site-header.tsx:148-154`
```tsx
<button aria-label={t("common.account_menu")} className="… px-2 py-1.5 …" />
```
`py-1.5` + `px-2` di teks `sm` menghasilkan tinggi ~30–32px, tidak ada `before:-inset-*` seperti `Button` primitive (yang menyematkan `before:-inset-[7..11px]`). WCAG 2.5.8 (Target Size Minimum 24px, AAA 44px) dan audit `preflight.mjs` menandai `py-1` tanpa `min-h-11` sebagai fail. Di mobile 375px, avatar + nama yang `hidden md:flex` membuat target efektif hanya avatar bulat + padding kecil.

**Fix:** jadikan `min-h-11` atau `p-2 before:-inset-*`, atau bungkus dengan `<Button variant="ghost" size="sm">` yang sudah punya hit-expansion. Paling murah: `className="… min-h-11 px-2 … before:absolute before:-inset-2 …"`.

### 5. Checkbox produk `size-5` dengan hit-area 36px — masih di bawah 44px
`components/inventory/products-page.tsx:462-467, 494-501, 562-569`
`class="size-5 … before:-inset-2"` → visual 20px + 8px per sisi = 36px hit-area, masih 8px di bawah 44px (butuh `-inset-[12px]` atau `-inset-3`). `size-5` untuk select-all/per-row/pilih mobile ketiganya sama. Di mobile `mt-1` menambah offset vertikal tapi tidak memperbesar hit-area.

**Fix:** ubah ke `before:-inset-[12px]` atau naikkan ke `size-6` dengan `before:-inset-[10px]` (total 44px). Pola sama untuk checkbox manapun yang `size-5` + `before:-inset-2`.

### 6. Banner error login/signup/forgot/reset tidak terhubung ke input (`aria-describedby`)
`components/auth/login-form.tsx:36-43`, `signup-form.tsx:36-43`, `forgot-password-form.tsx`, `reset-password-form.tsx`, `join-warehouse-form.tsx`
Error dirender sebagai `<div role="alert" className="border-destructive/30 …">` tanpa `id`, sementara `<Input>` hanya `aria-invalid` tanpa `aria-describedby`. `FormField` helper sudah benar wiring `describedBy={`${id}-error``} tapi form auth tidak memakainya untuk banner global — screen reader dengar "invalid" tapi tidak tahu pesan apa. Berbeda dengan `display-name-editor.tsx:114-116` yang sudah benar `aria-describedby="display-name-error"`.

**Fix:** beri `id="form-error"` pada banner dan `aria-describedby="form-error"` di setiap `<Input>` saat `error` ada (atau pindah ke `FormField error={error}`).

### 7. Approve/Reject adjustment tanpa feedback sukses (keheningan UX)
`components/inventory/movements-page.tsx:728-882` (`ApproveDialog`, `RejectDialog`)
`approve()` / `reject()` sukses hanya `onDone()` (refresh) tanpa `toast.add`. Kontras dengan `handleApprove` di `members-page.tsx:196-203` dan `ArchiveProductDialog` yang sudah `toast.success`. User klik Approve → dialog tutup sunyi, tidak tahu apakah commit berhasil sebelum realtime merefresh.

**Fix:** tambahkan di `if (result.ok)` sebelum `onDone()`:
```ts
toast.add({ type: "success", title: "Movement approved", description: `${meta.label} · ${movement.quantity} ${movement.unit}` });
```
Pola sama untuk `RejectDialog` (`title: "Movement rejected"`).

### 8. `setTimeout` finalizing tanpa cleanup (leak + setState on unmounted)
`components/warehouses/create-warehouse-form.tsx:234-237` (`complete()`)
```ts
window.setTimeout(() => { setResult(data); setPhase("success"); }, 700);
```
Timer id tidak disimpan, tidak `clearTimeout` saat unmount. Jika user menavigasi pergi selama 700ms (mis. klik Back to onboarding), `setState` pada komponen unmounted → React warning + potensi memory leak. Berbeda dengan `notification-bell.tsx` yang sudah menyimpan `popTimer.current` dan `clearTimeout` di cleanup.

**Fix:** simpan `const t = window.setTimeout(…)` di `useRef`, `useEffect` cleanup `clearTimeout(t)`, atau hindari delay saat `prefers-reduced-motion`.

### 9. `formatTimeAgo` & chart tick masih duplikasi formatter tanggal
`lib/notifications/types.ts:151` (sudah di-pin via `formatDate` — bagus, fix v0.2.3) vs `components/analytics/stock-movement-chart.tsx:18-22, 86-93`
Chart `tickLabel` dan `ChartTooltipContent labelFormatter` memanggil `new Date(…).toLocaleDateString("en-US", {month:"short", day:"numeric"})` inline, terpisah dari `formatDate`/`formatDateTime` ter-pin di `lib/utils.ts`. Konsistensi pin sudah lebih baik (semua `"en-US"`), tapi duplikasi formatter tetap — perubahan `FIXED_LOCALE` atau opsi format di `lib/utils` tidak menjalar ke chart.

**Fix:** ekstrak `formatChartDay(iso: string)` di `lib/utils.ts` dan pakai di `stock-movement-chart.tsx` untuk tick + tooltip.

### 10. `pageTitle()` logic redundan (dead code)
`components/layout/site-header.tsx:45-63`
```ts
pathname === c.href || pathname.startsWith(`${c.href}/`) || pathname.startsWith(c.href)
```
Kondisi ketiga `startsWith(c.href)` sudah mencakup dua pertama. `best` dipilih via longest-match sehingga hasil tetap benar, tapi dua kondisi pertama mati. Menyamarkan bug potensial: `/inventory` akan match `/` (prefix `/`) jika `NAV_ITEMS` punya `href: "/"`.

**Fix:** sederhanakan ke `pathname === c.href || pathname.startsWith(`${c.href}/`)` saja, dan guard `c.href !== "/"` untuk prefix match.

### 11. `rangeHint` string replace rapuh
`app/(dashboard)/dashboard/page.tsx:264`
```ts
const rangeHint = t("dashboard.vs_previous").replace("{n}", String(range));
```
Asumsi placeholder `{n}` selalu ada di terjemahan. Jika penerjemah ganti ke `{days}` atau hilang, replace diam-diam gagal dan UI tampil `vs previous {n} days` mentah. Pola i18n lain (`translate(locale, key)`) tidak punya interpolasi helpers; semua hint lain hardcode tanpa placeholder.

**Fix:** gunakan helper interpolasi kecil `t("dashboard.vs_previous", { n: range })` atau ganti key menjadi dua: `dashboard.vs_previous_7/30/90` tanpa interpolasi.

---

## P3 — Polish / aksesibilitas minor

### 12. Kontras tipografi `text-[13px]` vs `text-sm` (inkonsistensi + kurang jelas)
`components/notifications/notification-bell.tsx:385` (`text-[13px]`) vs `notifications-page-view.tsx:302` (`text-sm` = 14px)
Data sama (judul notifikasi), ukuran beda 1px per konteks. `13px` di bell dropdown pada lebar 24rem dengan font `500/600` sedikit kurang legible dibanding `14px` di halaman penuh. Audit G4 sudah catat, belum diseragamkan.

**Fix:** samakan ke `text-sm` di bell (abaikan `text-[13px]`).

### 13. `themeColor` statis terang di dark mode
`app/layout.tsx:67` `themeColor: "#E4D5C7"` (Dawn Pink) tetap dipakai saat `.dark` aktif (`--background: #0E231B`). Browser chrome/scrollbar tetap krem di dark mode — bentrok. Komentar di `67` sudah benar: viewport harus match background.

**Fix:** ganti ke `themeColor: [{ media: "(prefers-color-scheme: light)", color: "#E4D5C7" }, { media: "(prefers-color-scheme: dark)", color: "#0E231B" }]` (Next `Viewport` mendukung array).

### 14. Chart In/Out dua-duanya hijau (buta warna)
`app/globals.css:59-61` (`--chart-1: #186049` hijau tua, `--chart-2: #6AB29B` hijau mint) + `components/analytics/top-products.tsx:66,72`
In vs Out dibedakan hanya tone hijau — untuk deuteranopia hampir identik. Legend teks ada, tapi glanceability hilang. Sudah dicatat v0.2.2 H, belum ubah karena takut ripple token global.

**Fix lokal aman:** di `stock-movement-chart.tsx` override `stockOut` ke hue berbeda (amber `#8A5A0B` atau `--warning` yang sudah lolos AA), tinggalkan token global. Atau ubah `--chart-2` ke amber di `globals.css` jika disetujui design.

### 15. Komentar `applyFilters` vs perilaku (dokumen vs kode)
`components/inventory/products-page.tsx:97-111` (komentar `P0#2: pertahankan page …` vs `params.delete("page")`)
Komentar klaim "pertahankan `page` agar search/filter tidak reset ke 1" tapi kode `delete("page")` justru me-reset ke 1 (perilaku yang benar — filter baru → halaman 1). Komentar vs kode kontradiktif, menyesatkan maintainer berikutnya.

**Fix:** perbarui komentar menjadi "hapus `page` agar filter baru mulai dari halaman 1".

### 16. Bulk archive `Promise.all` tanpa granular error
`components/inventory/products-page.tsx:165-188`
`archivedSelected` memanggil `Promise.all([...selected].map(id => archiveProduct(...)))` tanpa per-row retry. Jika 3 dari 5 gagal, 2 sudah ter-arsip tapi toast `"Could not archive all products"` generik tanpa rincian baris mana gagal.

**Fix:** `Promise.allSettled`, kumpulkan `fulfilled/failed`, toast `Archived 2/5 — 3 failed (SKU…)` atau fallback per-row loop dengan `for…of`.

### 17. Low-stock `threshold > 0` guard benar tapi `quantity` string coercion rapuh
`components/inventory/products-page.tsx:486-488` sudah benar (`quantity != null && Number(threshold) > 0 && Number(qty) <= Number(threshold)`) — **tidak ada bug lagi** setelah guard `Array.isArray` di v0.2.2. Namun coercion `Number(" 12 ")`/`Number("")` masih toleran; `quantity: "0"` vs `null` vs `undefined` di-handle. Tidak perlu perbaikan — dicatat sebagai verifikasi lolos.

### 18. `RealtimeIndicator` pill `px-2 py-1` (status, bukan button) — bukan target sentuh, dikecualikan
`components/realtime/realtime-indicator.tsx:37-43` role `status` bukan interaktif; `px-2 py-1 text-xs`  ~22px tinggi sah untuk badge status. Tidak perlu 44px — dikecualikan dari audit target sentuh.

### 19. Decorative/informational `text-xs` (12px) — sebagian besar sah, satu yang perlu perhatian
`badge` (`h-5 text-xs`), `TableHead` (`text-xs`), SKU/timestamp (`font-mono text-xs`), helper hint (`text-muted-foreground text-xs`) — semua sekunder, sah pada 12px dengan line-height memadai. Satu-satunya yang sekunder-tapi-hampir-primer: `members-page.tsx:296` label `"Invite code"` `text-xs` di samping nilai `text-sm` — sudah border pill, tidak perlu dibesarkan. Tidak ada `text-[10px]`/`text-[11px]` ditemukan.

### 20. `StatusBadge` `inactive` (`bg-muted text-foreground`) vs `suspended` (`bg-foreground/10`) — nuansa hampir identik di light mode
`components/shared/status-badge.tsx:41-50` `inactive` (card-muted) dan `suspended` (foreground 10%) di Dawn Pink `#E4D5C7` keduanya abu-krem pucat — sulit dibedakan sekilas. Di dark mode kontras lebih baik. Pertimbangkan `suspended` ke `bg-warning/12` atau outline untuk membedakan "non-aktif sementara" dari "archived/mati".

---

# REKOMENDASI (Saran untuk Project)

## A. KONSOLIDASI STATUS METADATA — tetap PRIORITAS (belum dikerjakan, sengaja ditunda)
Duplikasi `MOVEMENT_TYPE_META`/`MOVEMENT_STATUS_META` (`product-dialogs.tsx`), `PROOF_STATUS_META` (`movement-detail-sheet.tsx`), `DEPLOYMENT_STATUS_META` (`lib/blockchain/types.ts`), `STATUS_TONE_LABEL` (`recent-movements.tsx:74-81`) dan `ROLE_META` (`members-page.tsx`) masih independen `Record<string,…>` tanpa exhaustiveness check. Drift tak terlihat: status baru fallback render string mentah.

**Rekomendasi — PENAMBAHAN + PENGHAPUSAN:** bangun `lib/inventory/status-meta.ts` + `lib/blockchain/proof-meta.ts` typed `as const` + helper `getStatusMeta(status)` dengan `satisfies Record<StatusUnion, …>` sehingga miss-key jadi error compile. Semua halaman impor dari satu sumber. Ini penghapusan duplikasi + penambahan modul — sudah disetujui ditunda karena butuh test run (pnpm diblokir).

## B. I18N SCOPE — KEPUTUSAN ARSITEKTUR (tetap terbuka)
Dashboard `t("dashboard.*")` lokal, 9 halaman lain Inggris hardcode di `PageHeader` + `pageTitle` breadcrumb. Dua opsi tetap:
- (a) **PENGHAPUSAN:** buang `t()` di dashboard → seragam Inggris (murah, konsisten);
- (b) **PENAMBAHAN:** rebase semua `PageHeader` + breadcrumb ke i18n.

Untuk v0.2.4 saran tetap (a) dulu bila konsistensi diutamakan, atau pertahankan status quo (dashboard lokal, sisanya Inggris) sebagai **fitur yang disengaja** — tapi dokumentasikan di `DESIGN.md` agar tidak dikira inkonsistensi.

## C. PENAMBAHAN — Handle kosong vs error yang konsisten
- `analytics`, `notifications` sudah `ErrorState` (fix v0.2.3 — bagus). Sisa panel dashboard `recent-transactions/ recent-movements/ recent-activity` dan `top-products` masih inline `<p>` kosong; seragamkan ke `<EmptyState size="sm">` agar tinggi kartu stabil dan aksi "View all" tetap kontekstual.
- Tambah `error.tsx` per-route data-heavy bila diinginkan konteks retry spesifik-route (opsional — `app/(dashboard)/error.tsx` induk sudah cukup untuk v0.2.4).

## D. PENGHAPUSAN / PENYEDERHANAAN
1. Sederhanakan `pageTitle()` (lihat P2#10) — hapus kondisi mati.
2. Satukan formatter tanggal/chart (lihat P2#9) — satu `formatChartDay` helper.
3. Ganti manual `t("key").replace("{n}", …)` dengan helper interpolasi agar placeholder tidak rapuh (P2#11).
4. Hapus label menyesatkan "Review errors" saat `invalid.length===0` (P2#3).

## E. PERBAIKAN TARGET SENTUH — paket kecil terfokus
1. Akun trigger header → `min-h-11` + hit expansion (P2#4)
2. Checkbox `size-5` → `before:-inset-[12px]` agar 44px (P2#5)
3. Pertahankan pola `Button` primitive yang sudah benar (`before:-inset-[7..11px]`) — jangan duplikasi manual `py-1` tanpa expansion di elemen interaktif baru.

## F. PENAMBAHAN ROBUSTNESS DATA
1. Guard CSV overflow (P2#2) — surface `overflow` ke user.
2. Bulk archive `allSettled` + pesan granular (P3#16).
3. Validasi `initial_qty` unbounded sudah di-cap `1_000_000_000_000` di zod + dialog (fix v0.2.3) — **lolos**, tidak perlu lagi.

## G. AKSESIBILITAS & FEEDBACK
1. Wire `aria-describedby` banner error ke input (P2#6).
2. Tambah `toast.success` pada approve/reject movement (P2#7).
3. Cleanup `setTimeout` via ref + `useEffect` (P2#8).
4. Seragamkan `text-[13px]` → `text-sm` di bell (P3#12).

## H. POLISH VISUAL KECIL
- `themeColor` dark variant (P3#13).
- Chart In/Out hue berbeda untuk buta warna (P3#14) — fix lokal di chart, jangan ubah token global tanpa approval design.
- `StatusBadge suspended` vs `inactive` nuansa (P3#20) — pertimbangkan outline/amber tipis untuk suspended.
- `trusted-by.tsx` sudah `text-muted-foreground` (fix v0.2.3 — lolos, tidak perlu lagi).

---

## PRIORITAS IMPLEMENTASI YANG DISARANKAN (v0.2.4)

**Sprint P2 (bug nyata, cepat — estimasi 1 jam)**
1. #1 Members mobile suspended tone (1 baris)
2. #2 CSV overflow warning (3 baris)
3. #3 Bulk preview label guard (1 baris)
4. #6 Banner aria-describedby (4 file, 2 baris/file)
5. #7 Toast approve/reject (2 dialog, 3 baris)

**Sprint P2b (a11y + mobile — estimasi 1 jam)**
6. #4 Header account trigger min-h-11 (1 baris)
7. #5 Checkbox hit-area 44px (3 lokasi, 1 kelas)
8. #8 setTimeout cleanup ref (4 baris)
9. #9/#10 Formatter + pageTitle dedup (2 file)

**Sprint P3 (polish — estimasi 45 menit)**
10. #12 Bell text 13→14px (1 baris)
11. #13 themeColor dark variant (1 baris layout)
12. #14 Chart hue lokal (1 baris)
13. #15 Komentar applyFilters (1 baris)

**Backlog arsitektur**
- A. Status metadata consolidation (modul baru, butuh test run)
- B. i18n scope decision (keputusan produk)
- C. Error boundaries per-route (opsional)

---

> Catatan: tidak ada perubahan `.next`/`node_modules`. Build & contrast tetap hijau sepanjang audit.
