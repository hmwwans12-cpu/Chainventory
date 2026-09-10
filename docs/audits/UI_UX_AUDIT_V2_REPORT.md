# Chainventory — UI/UX Audit Report (V2: Source-Code Audit)

**Audit Date:** 2026-09-01  
**Scope:** All UI components, pages, layouts, and interaction components  
**Excluded:** `.next/`, `node_modules/`, generated files  
**Method:** Direct source-code inspection against WCAG 2.1 AA, baseline-ui skill rules, and web-design-guidelines

---

## 1. Executive Summary

The codebase has a **solid design-token foundation** (comprehensive CSS variables, WCAG AA contrast fixes, self-hosted fonts), but a source-code audit reveals **persistent bugs and inconsistencies** that the previous fix pass (UI_UX_FIX_REPORT.md) did not fully resolve. Found **24 new/remaining issues** across 4 categories: button touch targets & logic bugs, font clarity problems, interaction inconsistencies, and z-index/layout bugs.

### Scores (0–10)

| Dimension | Score | Notes |
|-----------|-------|-------|
| **Button Consistency** | 5.5 | Still has `icon-xs` (24px), `icon-sm` (28px), hover-scale jitter, inconsistent label logic |
| **Typography Clarity** | 6.0 | Too many `text-xs` instances for critical content, inconsistent font sizes |
| **Interaction Design** | 7.0 | Good loading patterns, but missing confirmations, confusing hover targets |
| **Accessibility** | 7.0 | Strong ARIA patterns, but touch targets, missing `aria-live`, z-index conflicts |
| **Visual Consistency** | 7.5 | Good design tokens, minor spacing/radius inconsistencies |
| **Logic / UX Bugs** | 5.5 | Misleading copy, no validation on reversals, `Date.now()` keys, missing confirmations |
| **Overall UI/UX** | **6.4** | Needs targeted fixes before production-grade polish |

---

## 2. Critical Bugs — Button Issues

### [BUG] Icon Button Touch Targets Still Below 44px

**Files:** `components/ui/button.tsx`, `components/shared/copy-button.tsx`, `components/layout/site-header.tsx`, `components/nav/command-menu.tsx`, `components/inventory/movements-page.tsx`

**Problem:**
The button component defines sizes that visually fail WCAG 2.5.8 (44×44px minimum touch target):

| Size Prop | Visual Size | CSS Class | Effective Hit |
|-----------|-------------|-----------|---------------|
| `icon-xs` | **24px** | `size-6` | ~46px (via `before:-inset-[11px]`) |
| `icon-sm` | **28px** | `size-7` | ~46px (via `before:-inset-[9px]`) |
| `icon` | **32px** | `size-8` | ~46px (via `before:-inset-[7px]`) |
| Default `size="sm"` | 36px | `h-9` | 36px (no before inset) |

The `before:-inset-*` pattern extends the *clickable area* but the **visual hitbox** remains small, which:
- Fails WCAG 2.5.8 for visual touch target assessment
- Confuses users who expect the visible button to match the tap area
- `copy-button.tsx` defaults to `size="icon-xs"` (24px) — the smallest button in the app
- `site-header.tsx` search button uses `size="sm"` (36px) — also below 44px
- `command-menu.tsx` close button uses `size="icon"` (32px) — below 44px

**Fix:**
```tsx
// button.tsx — add min-h-11 min-w-11 to all icon sizes
"icon-xs": "size-6 min-h-11 min-w-11 ...",
"icon-sm": "size-7 min-h-11 min-w-11 ...",
"icon": "size-8 min-h-11 min-w-11 ...",
```

Or use `size="icon"` (which already has `before:-inset-[7px]`) everywhere and rely on the pseudo-element for hit area, but visually enlarge with `size-9` or `size-10`.

---

### [BUG] Button Hover Scale Causes Visual Jitter

**File:** `components/ui/button.tsx:7`

**Problem:**
```tsx
"hover:scale-[1.02] active:scale-[0.97] ...",
```
`hover:scale-[1.02]` causes:
- Text and icons to shift position on hover
- Adjacent buttons to appear misaligned momentarily
- SVG icons get additional `translate-x-[2px] -translate-y-[1px] scale-105` compounding transforms
- Active state `scale-[0.97]` creates a "squish" feel

**Fix:**
```tsx
// Remove hover:scale-[1.02], keep only active feedback
"active:scale-[0.98] ...",
// Rely on background color change for hover feedback (already handled by variant classes)
```

---

### [BUG] Submit Button Label Logic Inconsistency — "Record {meta.label}"

**File:** `components/inventory/stock-movement-dialog.tsx:542`

**Problem:**
The submit button shows `Record {meta.label}` which dynamically renders as:
- "Record Stock In" / "Record Stock Out" / "Record Adjustment" / "Record Reversal"

This is **technically correct** but creates a UX problem: when `movementType === "reversal"`, the user expects to "Reverse" not "Record Reversal" — it sounds like recording a new movement rather than undoing one.

**Fix:**
```tsx
const label = movementType === "reversal" 
  ? `Reverse ${meta.label}` 
  : `Record ${meta.label}`;
```

---

### [BUG] Archive Dialog Copy: "Cannot Be Undone" Is Misleading

**File:** `components/inventory/product-dialogs.tsx:243`

**Problem:**
```tsx
<DialogDescription>
  Archiving hides the product from the active inventory list. This cannot be undone.
</DialogDescription>
```
Products are **soft-deleted** (status changed to "archived") and can be restored by filtering to "archived" status. The copy creates unnecessary anxiety and is factually incorrect.

**Fix:**
```tsx
Archiving hides the product from the active inventory list but can be restored anytime.
```

---

### [BUG] Stock Reversal Has No Stock Validation — Potential Negative Balance

**File:** `components/inventory/stock-movement-dialog.tsx:269-274`

**Problem:**
```tsx
if (movementType === "reversal") {
  if (!selectedTarget) {
    setError("Select a movement to reverse.");
    return;
  }
  qty = selectedTarget.quantity; // Takes quantity directly without validation
}
```
When reversing a `stock_in`, the reversal creates a `stock_out` of the same quantity **without checking current stock levels**. If the original stock_in added 500 units but only 100 remain, reversing creates a negative balance.

**Fix:**
```tsx
const currentStock = Number(selected?.quantity ?? 0);
const reversalQty = Number(selectedTarget.quantity);
if (reversalQty > currentStock) {
  setError(`Cannot reverse ${reversalQty} units — only ${currentStock} currently in stock.`);
  return;
}
```

---

### [BUG] Bulk Add Dialog Uses `Date.now()` for React Keys

**File:** `components/inventory/bulk-add-dialog.tsx:136`

**Problem:**
```tsx
id: `parsed-${idx}-${Date.now()}`,
```
If multiple rows are parsed in the same millisecond, they get the same suffix, causing **React key collisions** and potential rendering bugs.

**Fix:**
```tsx
id: `parsed-${idx}-${crypto.randomUUID()}`,
```

---

### [BUG] Confirm Dialog Destructive Action Visual Weight Is Wrong

**File:** `components/inventory/product-dialogs.tsx:256`

**Problem:**
```tsx
<Button variant="destructive" onClick={confirm} disabled={busy}>
  Archive product
</Button>
```
In a confirmation dialog, the **destructive action should NOT be the most visually prominent button**. The `variant="destructive"` (red background) draws the eye first — users may accidentally click "Archive" instead of "Cancel".

**Fix:**
```tsx
// Make Cancel the subtle action, Archive the explicit action
<Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
  Cancel
</Button>
<Button variant="destructive" onClick={confirm} disabled={busy}>
  Archive product
</Button>
```
Wait — actually the order is already correct (Cancel left, Archive right). The problem is that `destructive` is too attention-grabbing for a confirmation dialog. Consider using `variant="default"` with a warning color, or add a secondary confirmation step.

---

## 3. Critical Bugs — Font & Typography

### [BUG] Too Many `text-xs` Instances for Critical Content

**Files:** `components/console/audit-trail.tsx`, `components/inventory/movements-page.tsx`, `components/inventory/bulk-add-dialog.tsx`, `components/shared/notification-preferences.tsx`, `components/shared/command-menu.tsx`, `components/ui/badge.tsx`, `components/inventory/movements-page.tsx`, `app/(dashboard)/settings/page.tsx`, `components/layout/site-header.tsx`, `components/layout/app-sidebar.tsx`, `components/notifications/notification-bell.tsx`

**Problem:**
`text-xs` (12px) is used for content that is important for user understanding:

| File | Content at `text-xs` | Should Be |
|------|---------------------|-----------|
| `audit-trail.tsx` | Entire table body | `text-sm` (14px) |
| `movements-page.tsx:801,881` | Dialog error messages | `text-sm` |
| `bulk-add-dialog.tsx:407` | Validation errors | `text-sm` |
| `notification-preferences.tsx:98` | Column headers | `text-sm` |
| `command-menu.tsx:240` | ESC hint | `text-sm` |
| `badge.tsx` | Badge text | `text-sm` (or keep decorative) |
| `settings/page.tsx:117` | Email display | `text-sm` |
| `settings/page.tsx:156` | Wallet address | `text-sm` |
| `site-header.tsx:179` | User email | `text-sm` |
| `app-sidebar.tsx:130` | Warehouse label | `text-sm` |
| `notification-bell.tsx:350` | Warehouse group header | `text-sm` |
| `notification-bell.tsx:397` | Notification body | `text-sm` |
| `notification-bell.tsx:401` | Timestamp | `text-sm` |
| `product-dialogs.tsx:49` | ErrorBanner | `text-sm` |
| `stock-movement-dialog.tsx:46` | ErrorBanner | `text-sm` |
| `movements-page.tsx` | Multiple status text | `text-sm` |

**Rule:** Never use `text-xs` for error messages, validation feedback, primary data, or user-facing content.

**Fix:**
```tsx
// Replace text-xs with text-sm for all user-facing content
"text-xs" → "text-sm"
```

---

### [BUG] Settings Page Email & Wallet Address Too Small

**File:** `app/(dashboard)/settings/page.tsx:117,156`

**Problem:**
```tsx
<p className="text-muted-foreground truncate text-xs">{email}</p>
<p className="text-foreground font-mono text-xs break-all">{walletAddress}</p>
```
Email and wallet addresses are critical user information displayed at 12px. Wallet addresses especially need to be readable since users need to verify them.

**Fix:**
```tsx
<p className="text-muted-foreground truncate text-sm">{email}</p>
<p className="text-foreground font-mono text-sm break-all">{walletAddress}</p>
```

---

## 4. High Issues — Interaction & Logic Bugs

### [BUG] Z-Index Scale Broken — Dropdowns Render Above Modals

**File:** `app/globals.css:192-196`

**Problem:**
```css
--z-dropdown: 60;
--z-select: 61;
--z-toast: 1000;
--z-modal: 50;  /* LOWER than dropdown! */
--z-overlay: 40;
```
Dropdowns (`z-dropdown: 60`) render **above** modals (`z-modal: 50`). When a dropdown is open inside a dialog, the dropdown appears above the modal backdrop, breaking visual hierarchy.

**Fix:**
```css
--z-dropdown: 1100;
--z-select: 1101;
--z-toast: 1000;
--z-modal: 1200;
--z-overlay: 1150;
```

---

### [BUG] Search Button in Header Is Too Small

**File:** `components/layout/site-header.tsx:137-156`

**Problem:**
```tsx
<Button variant="ghost" size="sm" ...>
  <Search ... className="size-3.5" />
  <span className="hidden lg:inline">Search</span>
  <kbd>⌘K</kbd>
</Button>
```
`size="sm"` = `h-9` (36px). This button contains an icon + text + kbd shortcut, making it visually busy. The 36px height is below the 44px touch target. On mobile, the hidden text and kbd make it unclear what the button does.

**Fix:**
```tsx
<Button variant="ghost" size="icon" aria-label={t("common.open_command")} className="h-11 w-11">
  <Search ... className="size-4" />
</Button>
```
Or use `size="default"` with `h-11` and keep the text/kbd.

---

### [BUG] Command Menu ESC Hint Is Purely Cosmetic — No Keyboard Handler

**File:** `components/shared/command-menu.tsx:240-242`

**Problem:**
```tsx
<kbd className="... font-mono text-xs sm:inline">ESC</kbd>
```
The ESC key is shown as a hint but **pressing ESC does not close the command menu**. There's no `onKeyDown` handler for ESC on the input or dialog. This creates a false affordance — users expect ESC to work but it doesn't.

**Fix:**
```tsx
const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (e.key === "Escape") {
    e.preventDefault();
    setOpen(false);
  }
  // ... existing arrow key handling
};
```

---

### [BUG] DisplayNameEditor Submit/Cancel Button Size Mismatch

**File:** `components/shared/display-name-editor.tsx:14-25,100-108`

**Problem:**
```tsx
// Submit button — size="sm" (h-9 = 36px)
<Button type="submit" size="sm" ...>Save name</Button>

// Cancel button — size="sm" (h-9 = 36px)  
<Button type="button" variant="outline" size="sm" ...>Cancel</Button>
```
The submit button uses `size="sm"` (36px) but the default button size is `h-11` (44px). This creates inconsistency with other forms in the app that use the default button size.

**Fix:**
```tsx
// Use consistent size — either default or sm for both
<Button type="submit" ...>Save name</Button>  // default = h-11
```

---

### [BUG] No Sign-Out Confirmation Dialog

**File:** `components/layout/app-sidebar.tsx:300-303`

**Problem:**
```tsx
<DropdownMenuItem onClick={() => void signOut()}>
  <LogOut ... />
  {t("common.sign_out")}
</DropdownMenuItem>
```
Clicking "Sign out" immediately logs the user out with no confirmation. A accidental click would sign them out of their warehouse session.

**Fix:**
```tsx
<DropdownMenuItem onClick={() => {
  // Open AlertDialog for confirmation
  setShowSignOutDialog(true);
}}>
  <LogOut ... />
  {t("common.sign_out")}
</DropdownMenuItem>
```

---

### [BUG] Movements Page — No Confirmation Before Leaving Warehouse

**File:** `components/members/members-page.tsx` (leave-warehouse-dialog.tsx not found, logic inline)

**Problem:**
When a member leaves a warehouse, there's no confirmation dialog shown. The action is destructive — the user loses access to all warehouse data.

**Fix:** Add an `AlertDialog` before the leave action with clear consequences explained.

---

### [BUG] Product Search Doesn't Search by SKU

**File:** `components/inventory/products-page.tsx:293-298`

**Problem:**
The search filter only searches by product name (`ilike` on name), not by SKU. Users cannot find products by their SKU code.

**Fix:**
```tsx
or('name.ilike.*q*,sku.ilike.*q*')
```

---

## 5. Medium Issues — Visual & Consistency Bugs

### [BUG] Inconsistent Button Loading States

**Files:** Multiple — `login-form.tsx`, `signup-form.tsx`, `stock-movement-dialog.tsx`, `product-dialogs.tsx`, `display-name-editor.tsx`

**Problem:**
- `login-form.tsx`: Shows spinner + text change (`"Signing in…"`) ✅
- `signup-form.tsx`: Shows spinner + text change (`"Creating account…"`) ✅
- `display-name-editor.tsx`: Shows spinner icon only, no text change ❌
- `stock-movement-dialog.tsx`: Shows spinner icon only, button text remains `Record {meta.label}` ❌
- `product-dialogs.tsx`: Shows spinner icon only ❌

**Fix:** Standardize loading states — always show a spinner AND change the button text:
```tsx
{pending ? <><Loader2 ... /> Saving...</> : <Save />}
```

---

### [BUG] Notification Bell Badge Uses `text-xs`

**File:** `components/notifications/notification-bell.tsx:275`

**Problem:**
```tsx
<Badge className="... text-xs tabular-nums">
```
The unread count badge uses `text-xs` (12px) for a critical data point (notification count).

**Fix:**
```tsx
<Badge className="... text-sm tabular-nums">
```

---

### [BUG] Badge Component Text Too Small

**File:** `components/ui/badge.tsx:8`

**Problem:**
```tsx
"text-xs font-medium"
```
Badge text at 12px is below readability threshold for functional UI elements.

**Fix:**
```tsx
"text-xs font-medium" → "text-[10px] font-medium" // for decorative badges only
// Or better: keep at text-xs only for status indicators, use text-sm for actionable badges
```

---

### [BUG] Sidebar Group Label Text Too Small

**File:** `components/ui/sidebar.tsx:402`

**Problem:**
```tsx
"text-xs font-medium text-sidebar-foreground/70"
```
Sidebar group labels at 12px with 70% opacity of muted-foreground may fail contrast requirements.

**Fix:**
```tsx
"text-xs font-medium" → "text-sm font-medium text-sidebar-foreground/80"
```

---

### [BUG] Inconsistent Font Weights for Card Titles

**Files:** Multiple — `components/analytics/stat-card.tsx`, `app/(dashboard)/settings/page.tsx`

**Problem:**
- StatCard title: `text-2xl font-semibold` (600) ✅
- Settings page: some titles use `font-medium` (500), others `font-semibold` (600)
- `app-sidebar.tsx` line 133: `text-sm font-medium` for warehouse name
- `site-header.tsx` line 176: `text-sm font-medium` for user name

**Fix:** Standardize all card titles and section headers to `font-semibold` (600).

---

### [BUG] Settings Page Has Inconsistent Max-Width

**File:** `app/(dashboard)/settings/page.tsx:92`

**Problem:**
```tsx
<div className="mx-auto flex w-full max-w-[960px] flex-col gap-6">
```
Settings uses `max-w-[960px]` while dashboard uses `max-w-[1600px]`. This creates a jarring horizontal jump when navigating between pages.

**Fix:**
```tsx
// Use consistent max-width or CSS transition
max-w-[1200px] // or same as dashboard
```

---

## 6. Suggested Improvements for the Project

### A. UI/UX Removals

#### Remove: Button Hover Scale Animation
**File:** `components/ui/button.tsx:7`
**Why:** The `hover:scale-[1.02]` causes visual jitter and makes adjacent buttons misalign. The "delight" it adds is outweighed by visual instability.
**Action:** Remove `hover:scale-[1.02]`, keep only `active:scale-[0.98]` for press feedback.

#### Remove: Duplicate Sign-Out Location
**File:** `app/(dashboard)/settings/page.tsx` — already removed per fix report
**Status:** ✅ Already handled

#### Remove: Dashboard Quick Actions at Bottom
**File:** `app/(dashboard)/dashboard/page.tsx` — already removed per fix report
**Status:** ✅ Already handled

#### Remove: ESC Hint in Command Menu (or Make It Functional)
**File:** `components/shared/command-menu.tsx:240-242`
**Why:** Showing an ESC hint that doesn't work is misleading. Either implement ESC to close, or remove the hint.

---

### B. UI/UX Additions

#### Add: Sign-Out Confirmation Dialog
**File:** `components/layout/app-sidebar.tsx`
**Why:** Destructive action without confirmation risks accidental sign-out.
**Implementation:**
```tsx
<AlertDialog>
  <AlertDialogTrigger asChild>
    <DropdownMenuItem onClick={() => setShowSignOutDialog(true)}>
      <LogOut /> Sign out
    </DropdownMenuItem>
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogTitle>Sign out?</AlertDialogTitle>
    <AlertDialogDescription>
      You'll need to sign in again to access your warehouse.
    </AlertDialogDescription>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction onClick={signOut}>Sign out</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

#### Add: Onboarding Tour for New Users
**Location:** Dashboard
**Why:** New users see the dashboard without guidance on what to do first.
**Implementation:** Add a one-time overlay/tour highlighting: create product, record stock movement, view audit explorer.

#### Add: SKU Search
**File:** `components/inventory/products-page.tsx`
**Why:** Users need to find products by SKU code, not just name.

#### Add: Loading Skeletons for All Async Pages
**Files:** `app/invite/[token]/page.tsx`, `components/inventory/product-dialogs.tsx`
**Why:** Pages that show "Loading..." text without skeleton layouts feel slow and jarring.

---

### C. UI/UX Enhancements

#### Enhance: Standardize All Touch Targets to 44px+
**Files:** `components/ui/button.tsx`, `components/ui/input.tsx`, `components/shared/copy-button.tsx`, `components/layout/site-header.tsx`
**Why:** WCAG 2.5.8 compliance and consistent mobile experience.
**Implementation:** Add `min-h-11 min-w-11` to all interactive elements.

#### Enhance: Add Password Visibility Toggle to Login Form
**File:** `components/auth/login-form.tsx:58-68`
**Why:** Users can't check their password input, especially on mobile.
**Implementation:** Add an eye icon toggle to show/hide the password field.

#### Enhance: Add Skeleton Loading for Product Detail Sheet
**File:** `components/inventory/product-dialogs.tsx:329-462`
**Why:** The sheet shows "Loading..." text while fetching movements — skeleton would improve perceived performance.

#### Enhance: Add Fade Scroll Indicator for Tables
**File:** `components/inventory/movements-table.tsx`
**Why:** Horizontal scroll on tables has no visual indicator.
**Implementation:** Add a gradient fade on the right edge.

#### Enhance: Implement Dark Mode Toggle
**Files:** `app/globals.css:80-114`
**Why:** Dark mode CSS variables are already defined but not functional. This is a prepared feature that adds significant accessibility value.
**Implementation:** Add a theme toggle in the header that switches `.dark` class on `<html>`.

#### Enhance: Consolidate Realtime Subscriptions
**File:** `components/notifications/notification-bell.tsx`
**Why:** Multiple realtime channels (notifications, warehouse, movements) create memory overhead. A centralized manager would reduce complexity.
**Implementation:** Create `useRealtimeManager` hook that all components subscribe to.

---

## 7. Priority Roadmap

### Phase 1 — Critical Bugs (This Week)

| # | Fix | Effort | Impact |
|---|-----|--------|--------|
| 1 | Fix button touch targets (add `min-h-11 min-w-11`) | 1 hour | 🔴 WCAG 2.5.8 |
| 2 | Remove `hover:scale-[1.02]` from button | 5 min | 🟡 Visual stability |
| 3 | Fix z-index scale (`--z-dropdown` > `--z-modal`) | 10 min | 🔴 Modal layering |
| 4 | Fix ESC key handler in command menu | 15 min | 🟡 False affordance |
| 5 | Fix "cannot be undone" archive copy | 5 min | 🟡 UX clarity |
| 6 | Add stock validation to reversals | 1 hour | 🔴 Data integrity |
| 7 | Fix `Date.now()` keys in bulk-add | 10 min | 🟡 Bug fix |
| 8 | Increase `text-xs` → `text-sm` for critical content | 2 hours | 🔴 Readability |

### Phase 2 — High Fixes (Next Week)

| # | Fix | Effort | Impact |
|---|-----|--------|--------|
| 9 | Add sign-out confirmation dialog | 1 hour | 🟡 Safety |
| 10 | Standardize button loading states | 1 hour | 🟡 Consistency |
| 11 | Add password visibility toggle to login | 30 min | 🟡 UX |
| 12 | Fix settings page max-width | 15 min | 🟡 Visual consistency |
| 13 | Add SKU search to products | 30 min | 🟡 Feature |
| 14 | Add skeleton loading for async pages | 1 hour | 🟡 Performance |

### Phase 3 — Polish (Week 3)

| # | Enhancement | Effort | Impact |
|---|-------------|--------|--------|
| 15 | Implement dark mode toggle | 2 hours | 🟢 Accessibility |
| 16 | Add fade scroll indicator for tables | 30 min | 🟢 UX polish |
| 17 | Add onboarding tour | 3 hours | 🟢 New user experience |
| 18 | Consolidate realtime subscriptions | 2 hours | 🟢 Performance |
| 19 | Standardize transition durations | 1 hour | 🟢 Visual consistency |

---

## 8. Quick Wins (High Impact, Low Effort)

| # | Change | Impact | Effort |
|---|--------|--------|--------|
| 1 | Remove `hover:scale-[1.02]` from button | Medium | 5 min |
| 2 | Fix z-index scale | High | 10 min |
| 3 | Fix ESC key handler in command menu | High | 15 min |
| 4 | Fix "cannot be undone" archive copy | High | 5 min |
| 5 | Fix `Date.now()` keys | Medium | 10 min |
| 6 | Add `min-h-11 min-w-11` to all icon buttons | High | 30 min |
| 7 | Change `text-xs` → `text-sm` for errors/data | High | 2 hours |
| 8 | Add sign-out confirmation dialog | High | 1 hour |

---

## 9. What's Already Good

1. **Design Token System** — Comprehensive CSS variables with WCAG AA contrast enforcement
2. **`prefers-reduced-motion`** — Global override in `globals.css`
3. **`aria-live` regions** — Added to notification bell, forms, pagination
4. **`FormField` wrapper** — Consistent label + error + hint pattern
5. **`PanelCard` / `StatCard`** — Unified card surfaces with good spacing
6. **Status badges** — Never color-only, always icon + text
7. **Focus states** — Consistent `focus-visible:ring-3 focus-visible:ring-ring/50`
8. **Loading states** — Spinner + text change pattern on most forms
9. **i18n** — Full EN/ID translation infrastructure
10. **`before:-inset-*` pattern** — Hit area extension on button variants

---

## 10. What's Worst

1. **Button touch targets** — `icon-xs` (24px), `icon-sm` (28px), `icon` (32px) all below 44px
2. **Z-index scale broken** — Dropdowns (60) render above modals (50)
3. **Too many `text-xs`** — Critical content at 12px
4. **No stock validation on reversals** — Can create negative balances
5. **ESC hint is fake** — Shown but not functional
6. **Archive copy misleading** — "Cannot be undone" but soft-deleted
7. **Inconsistent loading states** — Some show text, some don't
8. **Sign-out has no confirmation** — Accidental click risk

---

## 11. Final Verdict

### Is It Production-Ready?

**Yes, but with significant UX debt.** The app is functional and usable, but has multiple issues that affect accessibility compliance (WCAG 2.5.8 touch targets, `text-xs` for critical content), data integrity (no stock validation on reversals), and user confidence (misleading copy, fake ESC hint, no sign-out confirmation).

### What Would Make It Look More Professional

1. **Consistent touch targets** — 44px minimum everywhere
2. **Readable typography** — `text-sm` minimum for all user-facing content
3. **Functional affordances** — Every hint (ESC) should work
4. **Accurate copy** — "Cannot be undone" when it can be undone is a trust killer
5. **Data validation** — Don't let users create negative stock balances
6. **Consistent loading states** — Same pattern across all buttons
7. **Confirmation dialogs** — For all destructive actions
8. **Proper z-index** — Modals must always render above dropdowns

---

**Audit Completed:** 2026-09-01  
**Total Issues Found:** 24  
- Critical (Button/Logic bugs): 7
- Critical (Font clarity): 1
- High (Interaction/Logic): 6
- Medium (Visual/Consistency): 7
- Removals suggested: 2
- Additions suggested: 4
- Enhancements suggested: 6
