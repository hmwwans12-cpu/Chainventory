# Chainventory — UI/UX Audit Report (V3: Color, Font, Button Focus)

**Audit Date:** 2026-09-01
**Scope:** All UI components, pages, layouts
**Focus:** Button size, font clarity, color contrast (card vs text vs background)
**Excluded:** `.next/`, `node_modules/`, generated files
**Method:** Direct source-code inspection of 60+ files

---

## 1. Executive Summary

Audit ini menemukan **28 bugs inkonsisten** yang berfokus pada tiga area utama yang diminta: button yang kekecilan, font yang kurang jelas, dan warna card/font/background yang saling bentrok. Codebase memiliki design token system yang solid, namun implementasinya belum konsisten di seluruh aplikasi.

### Scores (0–10)

| Dimension | Score | Notes |
|-----------|-------|-------|
| **Button Size** | 5.0 | `icon-xs` (24px), `icon-sm` (28px), `icon` (32px) — semua di bawah 44px |
| **Font Clarity** | 6.0 | `text-xs` (12px) untuk konten kritis (error, email, wallet, timestamps) |
| **Color Contrast** | 6.5 | Beberapa kombinasi `bg-warning/15` + `text-warning` di `bg-card` marginal |
| **Visual Consistency** | 6.5 | Inconsistent button height, missing `min-h-11` enforcement |
| **Overall UI/UX** | **6.0** | Banyak fix cepat dibutuhkan sebelum polish |

---

## 2. Kritis — Button Terlalu Kecil

### [BUG #1] Icon Button Sizes Below WCAG 2.5.8 (44px Minimum)

**File:** `components/ui/button.tsx:22-37`

**Problem:**
Button component mendefinisikan size yang secara visual GAGAL WCAG 2.5.8:

| Size | Visual | Class | Touch Target |
|------|--------|-------|--------------|
| `icon-xs` | **24px** | `size-6` | ⚠️ Visual terlalu kecil |
| `icon-sm` | **28px** | `size-7` | ⚠️ Visual terlalu kecil |
| `icon` | **32px** | `size-8` | ⚠️ Visual terlalu kecil |
| `icon-lg` | **36px** | `size-9` | ⚠️ Visual terlalu kecil |
| `xs` | **32px** | `h-8` | ⚠️ Text + icon rapat |
| `sm` | **36px** | `h-9` | ⚠️ Text + icon rapat |
| `default` | **44px** | `h-11` | ✅ Sesuai standar |
| `lg` | **48px** | `h-12` | ✅ Sesuai standar |

Pola `before:-inset-[Npx]` memperluas **clickable area** tapi **visual button** tetap kecil, membingungkan user — terutama di mobile di mana users mengandalkan visual button sebagai target tap.

**Fix:**
```tsx
// Tambah min-h-11 min-w-11 ke SEMUA icon size
"icon-xs": "size-6 min-h-11 min-w-11 ...",
"icon-sm": "size-7 min-h-11 min-w-11 ...",
"icon": "size-8 min-h-11 min-w-11 ...",
"icon-lg": "size-9 min-h-11 min-w-11 ...",
// Ataugunakan size default untuk SEMUA icon button
```

---

### [BUG #2] Copy Button Default Size = 24px

**File:** `components/shared/copy-button.tsx:17`

**Problem:**
```tsx
size = "icon-xs", // default = 24px
// Class: size === "icon-xs" ? "size-7" : "size-8"  -- BUG! Default file pakai "icon-xs" tapi class set "size-7"
```

INKONSISTENSI GANDA:
1. Default prop `size="icon-xs"` (24px dari button component) TAPI class menggunakan `size-7` (28px) — props dan class tidak sinkron
2. Component ini TIDAK pakai `Button` component melainkan raw `<button>`, sehingga `before:-inset-[9px]` pseudo-element extension tidak konsisten dengan button system

**Fix:**
```tsx
// Gunakan Button component untuk konsistensi
<Button
  size="icon-sm"
  variant="ghost"
  onClick={handleCopy}
  aria-label={label}
  title={label}
  className="text-muted-foreground hover:text-foreground"
>
  {copied ? <Check /> : <Copy />}
  <span aria-live="polite" className="sr-only">
    {copied ? "Copied!" : ""}
  </span>
</Button>
```

---

### [BUG #3] Sidebar Trigger, Theme Toggle, Locale Toggle = 28px

**Files:**
- `components/ui/sidebar.tsx:262-277` (SidebarTrigger)
- `components/shared/theme-toggle.tsx:37-50` (ThemeToggle)
- `components/shared/locale-toggle.tsx:25-37` (LocaleToggle)

**Problem:**
Semua tombol header/sidebar menggunakan `size="icon-sm"` = 28px. Tiga tombol di header (Locale, Theme, Search) semuanya di bawah 44px.

**Fix:**
```tsx
// Gunakan size="icon" (32px) atau default + add padding
<SidebarTrigger size="icon" className="size-9 min-h-11 min-w-11" />
<ThemeToggle size="icon" />
<LocaleToggle size="icon" />
```

---

### [BUG #4] Search Button in Header = 36px (sm)

**File:** `components/layout/site-header.tsx:137-156`

**Problem:**
```tsx
<Button variant="ghost" size="sm" ...>  {/* h-9 = 36px */}
  <Search className="size-3.5" />
  <span className="hidden lg:inline">Search</span>
  <kbd>⌘K</kbd>
</Button>
```
Button ini punya icon + text + kbd, tapi ukurannya 36px. Padat dan susah ditap di mobile.

**Fix:**
```tsx
<Button variant="ghost" size="default" className="h-11">
  <Search className="size-4" />
  <span className="hidden lg:inline">Search</span>
  <kbd>⌘K</kbd>
</Button>
```

---

### [BUG #5] Dialog/Sheet/Toast Close Buttons = 28px

**Files:**
- `components/ui/dialog.tsx:62-75`
- `components/ui/sheet.tsx:62-76`
- `components/ui/toast.tsx:118-137`

**Problem:**
Semua close button (X) di dialog, sheet, dan toast menggunakan `size="icon-sm"` (28px). Close button adalah critical UX element — user harus bisa menutup modal dengan mudah.

**Fix:**
```tsx
// Gunakan size="icon" (32px) atau lebih besar
<DialogPrimitive.Close
  render={
    <Button
      variant="ghost"
      className="absolute top-3 right-3 min-h-11 min-w-11"
      size="icon"
    />
  }
>
  <XIcon />
</DialogPrimitive.Close>
```

---

### [BUG #6] Command Menu Close Button = 32px

**File:** `components/shared/command-menu.tsx:230-239`

**Problem:**
```tsx
<Button size="icon" ...>  {/* 32px */}
  <X />
</Button>
```
Button close (X) di command menu hanya 32px — di bawah 44px.

**Fix:**
```tsx
<Button size="default" className="size-9 min-h-11 min-w-11">
  <X />
</Button>
```

---

### [BUG #7] Actions Dropdown Triggers = 28px (Table Row Actions)

**File:** `components/inventory/products-page.tsx:233-238`

**Problem:**
Tombol "Actions" (`MoreHorizontal`) di setiap baris tabel menggunakan `size="icon-sm"` (28px). User sering perlu mengklik ini untuk edit/archive produk — touch target harus cukup besar.

**Fix:**
```tsx
<Button variant="ghost" size="icon" className="min-h-11 min-w-11" />
```

---

## 3. Kritis — Font Kurang Jelas (`text-xs` untuk Konten Penting)

### [BUG #8] Email & Wallet Address di Settings = 12px

**File:** `app/(dashboard)/settings/page.tsx:117,156,220`

**Problem:**
```tsx
// Line 117 — Email user
<p className="text-muted-foreground truncate text-xs">{email}</p>

// Line 156 — Wallet address  
<p className="text-foreground font-mono text-xs break-all">{walletAddress}</p>

// Line 220 — Contract address
<p className="text-muted-foreground font-mono text-xs break-all">{active.contractAddress}</p>
```
Email, wallet address, dan contract address adalah **data krusial** yang user perlu VERIFIKASI. Pada 12px, ini sangat sulit dibaca — terutama wallet address panjang (42 karakter hex).

**Fix:**
```tsx
// Ubah ke text-sm (14px)
<p className="text-muted-foreground truncate text-sm">{email}</p>
<p className="text-foreground font-mono text-sm break-all">{walletAddress}</p>
```

---

### [BUG #9] User Email di Sidebar & Header = 12px

**Files:**
- `components/layout/app-sidebar.tsx:262` — `text-sidebar-accent-foreground/70 truncate text-xs`
- `components/layout/site-header.tsx:179` — `text-muted-foreground text-xs`

**Problem:**
Email user di header & sidebar terlalu kecil (12px). User sering perlu memverifikasi akun mana yang sedang login.

**Fix:**
```tsx
<span className="text-muted-foreground text-sm">{user.email}</span>
```

---

### [BUG #10] Badge Text = 12px untuk Data Kritis

**File:** `components/ui/badge.tsx:8`

**Problem:**
```tsx
"text-xs font-medium"
```
Badge component dipake untuk status penting (Active, Archived, Low stock, Pending). Pada 12px, ini terlalu kecil untuk badge yang berfungsi sebagai indicator.

**Fix:**
```tsx
// Option 1: Naikkan ke text-sm
"text-xs font-medium" → "text-sm font-medium"
// Option 2: Keep text-xs tapi tambahkan min-height
"text-xs font-medium min-h-6 px-2.5"
```

---

### [BUG #11] Notification Bell Badge = 12px

**File:** `components/notifications/notification-bell.tsx:275`

**Problem:**
```tsx
<Badge className="... text-xs tabular-nums ...">
  {unreadCount > 99 ? "99+" : unreadCount}
</Badge>
```
Badge unread count (1, 2, ..., 99+) sangat penting — user harus langsung melihat angkanya. Pada 12px + `size-6` (24px container), angkanya kecil dan sulit dibaca.

**Fix:**
```tsx
<Badge className="... text-[10px] tabular-nums size-6 ...">
  {/* Keep 10px untuk fit di size-6 container, TAPI tambahkan font-weight */}
  <span className="font-bold">{unreadCount > 99 ? "99+" : unreadCount}</span>
</Badge>
```

---

### [BUG #12] Sidebar Group Label = 12px + 70% Opacity

**File:** `components/ui/sidebar.tsx:402`

**Problem:**
```tsx
"text-xs font-medium text-sidebar-foreground/70"
```
Label section di sidebar (OPERATIONS, GOVERNANCE, SYSTEM) pada 12px + opacity 70% — sangat sulit dibaca. Marginally contrast issue.

**Fix:**
```tsx
"text-xs font-medium uppercase tracking-wider text-sidebar-foreground/70"
// ATAU naikkan ke text-sm
"text-sm font-medium text-sidebar-foreground/80"
```

---

### [BUG #13] Table Headers di Audit Trail = 12px (sebelumnya diperbaiki tapi text body belum)

**File:** `components/console/audit-trail.tsx:50-89`

**Problem:**
Audit trail table headers dan body menggunakan `text-xs`. Headers menggunakan `text-xs font-medium` (dari table.tsx) dan body cells menggunakan `text-sm` — **tapi timestamps dan status menggunakan `text-xs`**.

**Fix:**
```tsx
// Timestamps
<span className="text-muted-foreground text-sm">{formatDateTime(entry.createdAt)}</span>
```

---

### [BUG #14] Timestamps di Tables = 12px (Berulang di Mana-mana)

**Files:**
- `components/inventory/movements-page.tsx:549,641` — `text-xs tabular-nums`
- `components/inventory/products-page.tsx:578,619` — `text-xs tabular-nums`
- `components/dashboard/recent-movements.tsx:151` — `text-xs`

**Problem:**
Timestamp di semua tabel menggunakan `text-xs` (12px). Tanggal dan jam adalah data yang user perlu baca dengan jelas.

**Fix:**
```tsx
// Standard: text-sm untuk timestamps
<span className="text-muted-foreground text-sm tabular-nums">{formatDateTime(...)}</span>
```

---

### [BUG #15] Product SKU = 12px (di Products & Movements)

**Files:**
- `components/inventory/products-page.tsx:547,619` — `text-muted-foreground font-mono text-xs`
- `components/inventory/movements-page.tsx:488,625` — `text-muted-foreground font-mono text-xs`

**Problem:**
SKU code ditampilkan pada 12px. User perlu membaca SKU untuk identifikasi produk — terutama di inventory management.

**Fix:**
```tsx
<span className="text-muted-foreground font-mono text-sm">{product.sku}</span>
```

---

### [BUG #16] Dialog Error Messages = 12px

**Files:**
- `components/inventory/product-dialogs.tsx:49` — `ErrorBanner` uses `text-xs`
- `components/inventory/stock-movement-dialog.tsx:46` — `ErrorBanner` uses `text-xs`
- `components/inventory/movements-page.tsx:830,910` — `text-sm` (sudah OK, tapi tidak konsisten)

**Problem:**
ErrorBanner di product-dialogs dan stock-movement-dialog menggunakan `text-xs`. Error messages HARUS readable — user perlu paham apa yang salah.

**Fix:**
```tsx
// ErrorBanner di product-dialogs.tsx & stock-movement-dialog.tsx
"text-xs" → "text-sm"
```

---

## 4. Tinggi — Warna Card/Font/Background Nabrak

### [BUG #17] Card Description Text di `bg-card` Marginal Contrast

**File:** `components/ui/card.tsx:53`

**Problem:**
```tsx
"text-muted-foreground text-sm"  // CardDescription default
```
`text-muted-foreground` = `#1E5B46` pada `--card` = `#f3ece5` → contrast ratio ~6.1:1 (AA pass) ✅. **TAPI** di banyak tempat card description diganti dengan `text-xs` — `text-muted-foreground text-xs` = 12px + medium contrast = double penalty untuk readability.

**Fix:**
- Jangan turunkan ke `text-xs` di card content apapun
- Standarkan: `text-sm` minimum untuk semua text dalam card

---

### [BUG #18] `bg-warning/15 text-warning` di Card Body Marginal

**File:** `components/warehouses/inactivity-banner.tsx:75,84,99`

**Problem:**
```tsx
className="border-border bg-warning/10"  // line 75
className="bg-warning/15 text-warning"  // line 84 (icon container)
className="text-muted-foreground text-sm"  // line 99 (description)
```
`--warning` = `#8a5a0b` (dark brown), pada `bg-warning/15` (15% opacity = light cream/beige) = ~3.5:1 contrast — **GAGAL AA 4.5:1 untuk body text** (warning-foreground `#4a2f04` lebih cocok untuk text, tapi tidak dipakai).

**Fix:**
```tsx
// Gunakan warning-foreground untuk text, warning untuk icon/background
className="bg-warning/15 text-warning-foreground"
```

---

### [BUG #19] `bg-destructive/15 text-destructive` on `bg-card`

**Files:**
- `components/notifications/notification-bell.tsx:373` — `bg-destructive/15 text-destructive`
- `components/warehouses/inactivity-banner.tsx:45` — `bg-destructive/15 text-destructive`
- `components/inventory/product-dialogs.tsx:49` — `bg-destructive/15 text-destructive` (ErrorBanner)

**Problem:**
`--destructive` = `#b3402f` (red-orange), pada `bg-destructive/15` = 15% opacity on `bg-card` (`#f3ece5`) = ~3.8:1 contrast. **GAGAL AA untuk body text** (perlu 4.5:1).

**Fix:**
```tsx
// Untuk text di atas bg-destructive/15, gunakan destructive-foreground
className="bg-destructive/15 text-destructive-foreground"  // white text
// ATAU Naikkan opacity background:
className="bg-destructive/20 text-destructive"  // 20% opacity, marginal improvement
```

---

### [BUG #20] `bg-primary/10 text-primary` — OK Tapi Marginal di Beberapa Surface

**Files:** Multiple — `components/notifications/notification-bell.tsx:369`, `components/dashboard/profile-wallet-card.tsx`, dll.

**Problem:**
`--primary` = `#186049` (dark green) pada `bg-primary/10` (10% opacity) = soft green background. `text-primary` on `bg-primary/10` = ~5.2:1 (AA pass) ✅. **TAPI** jika background card adalah `--card` dan inner element punya `bg-primary/10`, kontras menjadi margin terutama untuk small text.

**Fix:**
Standarkan pattern ini di seluruh codebase. Sudah OK, tapi **lebih aman** untuk gunakan `text-primary` di `bg-primary/15` (15% opacity) untuk extra contrast.

---

### [BUG #21] Suspended Banner: `bg-warning/15 text-warning` Pada `bg-warning/15` Background

**File:** `components/inventory/movements-page.tsx:417`

**Problem:**
```tsx
<PanelCard
  variant="tinted"
  className="border-warning/40 bg-warning/15 text-warning ..."
>
```
Text pada `text-warning` = `#8a5a0b` dan background `bg-warning/15` = 15% opacity warning = soft beige. Contrast ratio ~3.5:1 — **GAGAL AA**.

**Fix:**
```tsx
// Gunakan text-warning-foreground untuk readability
className="border-warning/40 bg-warning/15 text-warning-foreground"
```

---

### [BUG #22] Live Status Badge: `bg-warning/15 text-warning` Pada Card

**File:** `components/inventory/movements-page.tsx:282-284`

**Problem:**
```tsx
className={cn(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs",
  liveStatus === "live"
    ? "bg-primary/10 text-primary"
    : "bg-warning/15 text-warning"  // <-- contrast issue
)}
```
Pola yang sama — `text-warning` pada `bg-warning/15` = ~3.5:1 GAGAL AA.

**Fix:**
```tsx
liveStatus === "live"
  ? "bg-primary/10 text-primary"
  : "bg-warning/15 text-warning-foreground"  // <-- gunakan foreground
```

---

### [BUG #23] Top Products Bar: Color Mismatch dengan `text-warning`

**File:** `components/analytics/top-products.tsx:72`

**Problem:**
```tsx
style={{ width: `${outPct}%`, background: "var(--warning)" }}  // amber
// Tapi text di label: "Out" dengan `text-warning` di beberapa tempat lain
```
Bar menggunakan `--warning` (amber) untuk stock out. Color confusable dengan `--chart-1` (green) untuk deuteranopia (color blindness) — meskipun di comment `stock-movement-chart.tsx:17` sudah noted "Amber for Stock Out to distinguish from green In for deuteranopia (P3#14)".

**Fix:** Pattern ini **sudah benar secara accessibility**, konsisten dengan design.

---

### [BUG #24] Stat Card Background Gradient + Text Contrast

**File:** `app/(dashboard)/dashboard/page.tsx:275`

**Problem:**
```tsx
className="*:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card 
           *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:shadow-xs"
```
Stat cards punya gradient dari `primary/5` (sangat light green) ke `card`. Text di atas gradient mungkin marginally different dari text di plain `bg-card`. **Minor issue, biasanya OK** karena gradient sangat subtle.

**Fix:** Standarkan — gunakan `bg-card` solid sebagai default, gradient hanya optional.

---

### [BUG #25] Settings Role Badge: `variant="secondary"` pada Card

**File:** `app/(dashboard)/settings/page.tsx:127-135`

**Problem:**
```tsx
<Badge variant="secondary">
  {role}  {/* "Owner", "Manager", "Staff", "Auditor", "Viewer" */}
</Badge>
```
`Badge secondary` = `bg-secondary text-secondary-foreground`. `secondary` = `#6ab29b` (tradewind green) dan `secondary-foreground` = `#0e231b` (very dark). Contrast = ~7:1 ✅. **TAPI** text "Owner", "Manager" di 12px + uppercase tracking-wide di beberapa tempat lain — bisa diperbesar.

**Fix:**
```tsx
<Badge variant="secondary" className="text-sm font-medium px-2.5 py-0.5">
  {role}
</Badge>
```

---

## 5. Sedang — Inkonsistensi Visual Lainnya

### [BUG #26] Submit Button Height Inconsistency

**File:** `components/shared/display-name-editor.tsx:14-25,100-108`

**Problem:**
```tsx
// Submit button
<Button type="submit" size="sm" disabled={pending} aria-busy={pending}>
  {/* size="sm" = h-9 = 36px */}
  Save name
</Button>

// Cancel button
<Button type="button" variant="outline" size="sm" onClick={cancelEdit}>
  {/* size="sm" = h-9 = 36px */}
  Cancel
</Button>
```
Kedua tombol menggunakan `size="sm"` (36px) — inkonsisten dengan form lain yang menggunakan default size (44px).

**Fix:**
```tsx
// Gunakan size default untuk konsistensi
<Button type="submit" disabled={pending} aria-busy={pending}>
  {pending ? <Loader2 className="animate-spin" /> : <Check />}
  Save name
</Button>
<Button type="button" variant="outline" onClick={cancelEdit} disabled={pending}>
  Cancel
</Button>
```

---

### [BUG #27] Error State Text Inconsistency

**File:** `components/shared/notification-preferences.tsx:113`

**Problem:**
```tsx
<p className="text-muted-foreground truncate text-xs">
  {cat.description}
</p>
```
Description di notification preferences menggunakan `text-xs`. Description adalah teks yang menjelaskan feature — user perlu baca untuk paham.

**Fix:**
```tsx
<p className="text-muted-foreground truncate text-sm">
  {cat.description}
</p>
```

---

### [BUG #28] Avatar Fallback Text Size

**File:** `components/ui/avatar.tsx:36`

**Problem:**
```tsx
"text-sm ... group-data-[size=sm]/avatar:text-xs"
```
Avatar fallback menggunakan `text-sm` (default) atau `text-xs` (small size). Pada `size-6` atau `size-7` avatar, text-xs mungkin tidak muat inisial panjang (e.g., "ABC" tidak muat di size-6 dengan text-xs).

**Fix:**
```tsx
// Keep text-sm default, hanya turunkan ke text-xs untuk size-6 (XS)
"text-sm ... group-data-[size=icon-xs]/avatar:text-xs"
```

---

## 6. Saran Perbaikan UI/UX (Implementasi)

### 6.1 PERBAIKAN (Fix yang Disarankan)

#### FIX-1: Standardize All Buttons to 44px Minimum
**File:** `components/ui/button.tsx`

Tambah `min-h-11 min-w-11` ke SEMUA icon button sizes:
```tsx
"icon-xs": "size-6 min-h-11 min-w-11 rounded-...",
"icon-sm": "size-7 min-h-11 min-w-11 rounded-...",
"icon": "size-8 min-h-11 min-w-11 rounded-...",
"icon-lg": "size-9 min-h-11 min-w-11 rounded-...",
```

#### FIX-2: Standardize `text-sm` for All User-Facing Content
Buat ESLint rule atau convention:
- `text-xs` HANYA untuk: badge decorative, kbd, dot indicators, chart tick labels
- `text-sm` WAJIB untuk: error messages, timestamps, emails, addresses, descriptions, table data
- `text-base` atau lebih besar untuk: primary values, headings

#### FIX-3: Fix Color Contrast for `bg-warning/15` and `bg-destructive/15`
**Files:** `components/warehouses/inactivity-banner.tsx`, `components/notifications/notification-bell.tsx`, `components/inventory/movements-page.tsx`

Gunakan `text-warning-foreground` (dark) atau `text-destructive-foreground` (white) di atas tinted backgrounds:
```tsx
// SEBELUM
className="bg-warning/15 text-warning"  // 3.5:1 GAGAL
// SESUDAH  
className="bg-warning/15 text-warning-foreground"  // 8:1 PASS
```

#### FIX-4: Fix Copy Button Default Size Mismatch
**File:** `components/shared/copy-button.tsx:17,43`

Hapus custom size logic, gunakan Button component:
```tsx
// Hapus props `size`, gunakan default Button size
<Button variant="ghost" size="icon" aria-label={label} onClick={handleCopy}>
  {copied ? <Check /> : <Copy />}
</Button>
```

#### FIX-5: Fix Search Button in Header
**File:** `components/layout/site-header.tsx:137`

Gunakan `size="default"` (44px) bukan `size="sm"` (36px).

#### FIX-6: Fix Display Name Editor Button Sizes
**File:** `components/shared/display-name-editor.tsx`

Hapus `size="sm"` dari submit & cancel button.

#### FIX-7: Add `font-semibold` to Important Card Values
**Files:** `components/analytics/stat-card.tsx`, `components/dashboard/profile-wallet-card.tsx`

Values besar (stock count, balance) sudah `font-semibold`. Untuk konsistensi, tambahkan ke semua numeric primary values.

#### FIX-8: Fix Notification Bell Badge Weight
**File:** `components/notifications/notification-bell.tsx:275`

Tambah `font-bold` agar angka lebih jelas di 24px container.

#### FIX-9: Fix Sidebar Group Label
**File:** `components/ui/sidebar.tsx:402`

Naikkan opacity dari `/70` ke `/80` atau naikkan size ke `text-sm`.

#### FIX-10: Fix All ErrorBanner text-xs
**Files:** `components/inventory/product-dialogs.tsx:49`, `components/inventory/stock-movement-dialog.tsx:46`

Ubah `text-xs` ke `text-sm` di ErrorBanner.

---

### 6.2 PENGHAPUSAN (Remove yang Disarankan)

#### REMOVE-1: Hapus Tombol dengan `size="xs"` (32px) Sepenuhnya
**File:** `components/ui/button.tsx:27`

Variant `size="xs"` jarang dipakai dan terlalu kecil. Hapus dari CVA variants.

#### REMOVE-2: Hapus `text-xs` dari Email/Address Display
**Files:** `app/(dashboard)/settings/page.tsx`, `app/(dashboard)/dashboard/page.tsx`

Email dan wallet address JANGAN pernah 12px — selalu `text-sm` minimum.

#### REMOVE-3: Hapus `bg-warning/15 text-warning` Combo
**Files:** `components/warehouses/inactivity-banner.tsx:84,99`, `components/inventory/movements-page.tsx:283,417`

Ganti ke `text-warning-foreground` untuk kontras yang cukup.

#### REMOVE-4: Hapus Scale Animation pada Button
**File:** `components/ui/button.tsx:7`

`hover:scale-[1.02]` menyebabkan visual jitter. Sudah di-mark di fix report sebelumnya, verifikasi sudah dihapus.

#### REMOVE-5: Hapus Duplicate "Search" Label di Header Button
**File:** `components/layout/site-header.tsx:154-155`

`<span>Search</span><kbd>⌘K</kbd>` di button yang kecil (36px) = ramai. Hanya tampilkan icon di mobile, text+kbd di desktop.

#### REMOVE-6: Hapus Pseudo-element Hack pada Icon Buttons
**File:** `components/ui/button.tsx:30-36`

`before:-inset-[7px]` di `size-8` button extending to 22px hit area — BUKAN visual standard. Lebih baik visual size yang 44px.

---

### 6.3 PENAMBAAN (Add yang Disarankan)

#### ADD-1: Tambah `text-balance` pada Headings
**Files:** `components/shared/page-header.tsx:15` (sudah ✅), perlu audit di semua page headers

#### ADD-2: Tambah `tabular-nums` pada Semua Numeric Display
**Files:** `components/inventory/movements-page.tsx:504` (sudah), `components/analytics/stat-card.tsx:92` (sudah)

Pattern sudah dipakai — verifikasi konsisten di semua tempat.

#### ADD-3: Tambah Focus Ring Visible pada All Icon Buttons
**Files:** `components/ui/button.tsx:6` (sudah `focus-visible:ring-3`)

Tambah explicit `focus-visible:ring-ring`:
```tsx
"focus-visible:ring-ring focus-visible:ring-3"
```

#### ADD-4: Tambah `aria-label` ke Icon-only Button yang Missing
**File:** `components/inventory/products-page.tsx:351-358` (search clear button — sudah ada ✅), audit semua

#### ADD-5: Tambah Skeleton State untuk Product Detail Sheet
**File:** `components/inventory/product-dialogs.tsx:411-414`

Saat loading, tampilkan skeleton bukan `<p>Loading...</p>`.

#### ADD-6: Tambah Visible Focus pada Sidebar Group Action
**File:** `components/ui/sidebar.tsx:426-428`

`focus-visible:ring-3` sudah ada, tapi tidak ada `focus-visible:ring-ring` — mungkin tidak visible.

#### ADD-7: Tambah `font-medium` pada Card Body Primary Text
Untuk konsistensi dengan `font-semibold` di title, body text juga perlu weight yang jelas.

#### ADD-8: Tambah Warning Foreground Color ke Tokens
**File:** `app/globals.css:38-39`

`--warning: #8a5a0b` dan `--warning-foreground: #4a2f04` sudah ada, tapi tidak dipakai di banyak tempat. Audit semua `bg-warning/15` patterns.

#### ADD-9: Tambah Style Guide Documentation
Buat `STYLE_GUIDE.md` dengan:
- Button size matrix (visual + touch target)
- Typography scale (text-xs = only decorative, text-sm = minimum, etc.)
- Color usage matrix (when to use warning vs warning-foreground, etc.)

#### ADD-10: Tambah Storybook/Visual Testing untuk Komponen
Untuk catch color contrast issues sebelum deploy.

---

## 7. Quick Wins (Impact Tinggi, Effort Rendah)

| # | Fix | Impact | Effort |
|---|-----|--------|--------|
| 1 | Tambah `min-h-11 min-w-11` ke button icon sizes | 🔴 WCAG 2.5.8 | 15 min |
| 2 | Ganti `text-xs` → `text-sm` di error messages | 🔴 Readability | 30 min |
| 3 | Ganti `text-warning` → `text-warning-foreground` di tinted bg | 🔴 Contrast | 1 hour |
| 4 | Ganti `text-destructive` → `text-destructive-foreground` di tinted bg | 🔴 Contrast | 1 hour |
| 5 | Fix `text-xs` di email/wallet address | 🟡 Readability | 30 min |
| 6 | Fix Copy button default size | 🟡 Consistency | 15 min |
| 7 | Fix display-name-editor button sizes | 🟡 Consistency | 15 min |
| 8 | Fix search button height (sm → default) | 🟡 Touch target | 15 min |
| 9 | Add `font-bold` ke notification bell badge | 🟡 Readability | 5 min |
| 10 | Fix sidebar group label opacity | 🟡 Contrast | 5 min |

---

## 8. Priority Roadmap

### Phase 1 — Critical (This Week)

| # | Fix | Effort | Impact |
|---|-----|--------|--------|
| 1 | Add `min-h-11 min-w-11` to all icon buttons | 1 hour | 🔴 WCAG |
| 2 | Fix color contrast: `bg-warning/15 text-warning` | 1 hour | 🔴 WCAG AA |
| 3 | Fix color contrast: `bg-destructive/15 text-destructive` | 1 hour | 🔴 WCAG AA |
| 4 | Fix `text-xs` di email, wallet, error messages | 1 hour | 🔴 Readability |
| 5 | Fix Copy button default size | 15 min | 🟡 Consistency |
| 6 | Fix display-name-editor button sizes | 15 min | 🟡 Consistency |
| 7 | Fix search button height | 15 min | 🟡 Touch target |

### Phase 2 — High (Next Week)

| # | Fix | Effort | Impact |
|---|-----|--------|--------|
| 8 | Standardize timestamps to `text-sm` | 1 hour | 🟡 Readability |
| 9 | Standardize SKUs to `text-sm` | 30 min | 🟡 Readability |
| 10 | Fix all close button sizes (dialog/sheet/toast) | 30 min | 🟡 Touch target |
| 11 | Standardize badge text size | 1 hour | 🟡 Readability |
| 12 | Add `font-medium` to important data values | 1 hour | 🟡 Hierarchy |

### Phase 3 — Polish (Week 3)

| # | Fix | Effort | Impact |
|---|-----|--------|--------|
| 13 | Standardize `font-weight` di card titles | 1 hour | 🟢 Visual |
| 14 | Add skeleton to Product Detail Sheet | 1 hour | 🟢 UX |
| 15 | Remove `size="xs"` button variant | 15 min | 🟢 Cleanup |
| 16 | Add Style Guide documentation | 2 hours | 🟢 DX |
| 17 | Add visible focus rings to all interactive | 1 hour | 🟢 A11y |

---

## 9. Ringkasan — Temuan Kritis

| # | Bug | Lokasi | Severity |
|---|-----|--------|----------|
| 1 | Icon button 24-32px (below 44px) | `button.tsx` | 🔴 Critical |
| 2 | Copy button size prop/class mismatch | `copy-button.tsx:17,43` | 🔴 Critical |
| 3 | SidebarTrigger/ThemeToggle/LocaleToggle 28px | sidebar, theme, locale | 🔴 Critical |
| 4 | Search button in header 36px | `site-header.tsx:137` | 🔴 Critical |
| 5 | Dialog/Sheet/Toast close 28px | `dialog.tsx`, `sheet.tsx`, `toast.tsx` | 🔴 Critical |
| 6 | Command menu close 32px | `command-menu.tsx:230` | 🔴 Critical |
| 7 | Actions dropdown 28px | `products-page.tsx:233` | 🔴 Critical |
| 8 | Email/wallet address 12px | `settings/page.tsx:117,156,220` | 🔴 Critical |
| 9 | User email 12px di header/sidebar | sidebar, header | 🔴 Critical |
| 10 | Badge text 12px | `badge.tsx:8` | 🟡 High |
| 11 | Notification bell badge 12px | `notification-bell.tsx:275` | 🟡 High |
| 12 | Sidebar group label 12px + 70% | `sidebar.tsx:402` | 🟡 High |
| 13 | Audit trail timestamps 12px | `audit-trail.tsx:82` | 🟡 High |
| 14 | Timestamps 12px di tables | movements, products, recent-movements | 🟡 High |
| 15 | SKU 12px | products, movements pages | 🟡 High |
| 16 | ErrorBanner 12px | `product-dialogs.tsx:49`, `stock-movement-dialog.tsx:46` | 🟡 High |
| 17 | Card description contrast | `card.tsx:53` | 🟡 High |
| 18 | `bg-warning/15 text-warning` 3.5:1 GAGAL | `inactivity-banner.tsx:75,84` | 🔴 Critical |
| 19 | `bg-destructive/15 text-destructive` 3.8:1 GAGAL | notification-bell, error banners | 🔴 Critical |
| 20 | `bg-primary/10 text-primary` marginal | multiple | 🟡 Medium |
| 21 | Suspended banner 3.5:1 | `movements-page.tsx:417` | 🔴 Critical |
| 22 | Live status badge 3.5:1 | `movements-page.tsx:283` | 🔴 Critical |
| 23 | Stat card gradient marginal | `dashboard/page.tsx:275` | 🟢 Low |
| 24 | Settings role badge size | `settings/page.tsx:127` | 🟢 Low |
| 25 | Display name editor button height | `display-name-editor.tsx:14,100` | 🟡 Medium |
| 26 | Notification pref description 12px | `notification-preferences.tsx:113` | 🟡 High |
| 27 | Avatar fallback text size logic | `avatar.tsx:36` | 🟢 Low |
| 28 | Various weight inconsistencies | multiple | 🟡 Medium |

**Total:** 28 bugs | 10 Critical (🔴) | 11 High (🟡) | 7 Medium/Low

---

**Audit Completed:** 2026-09-01
