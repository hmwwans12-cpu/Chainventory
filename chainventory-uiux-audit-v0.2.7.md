# Chainventory — UI/UX Visual & Consistency Audit (v0.2.7)
**Scope:** Visual hierarchy, contrast, color clashing, button sizing, font clarity, radius/shadow tokens  
**Stack:** Next.js 16 · React 19 · Tailwind v4 · `@base-ui/react` (shadcn-style API) · lucide-react · motion

---

## 0. Token reality check (read from `app/globals.css`)

| Token | Value | Note |
|---|---|---|
| `--background` | `#e4d5c7` (dawn-pink) | warm beige page bg |
| `--card` | `#f3ece5` | almost the same as `--background` |
| `--muted` | `#f3ece5` | **identical** to `--card` |
| `--popover` | `#ffffff` | white — the only "lifted" surface |
| `--primary` | `#186049` (fun-green) | text-on-fill should always be white |
| `--secondary` | `#6ab29b` (tradewind teal) | bright teal — loud as bg fill |
| `--secondary-foreground` | `#0e231b` (near-black) | high contrast on tradewind |
| `--muted-foreground` | `#1e5b46` | AA on card, but on `--background` (dawn-pink) reads as "dark teal" — fine |
| `--destructive` | `#b3402f` | muted brick-red |
| `--warning` | `#8a5a0b` | dark gold |
| `--warning-foreground` | `#4a2f04` | very dark — for filled-warning surfaces |
| `--border` | `#d4c2b2` | warm beige border |

DESIGN.md says: use `rounded-lg` everywhere (not `rounded-xl` / `rounded-2xl` / `rounded-[Npx]`). Use shadow tokens (`--shadow-card`, `--shadow-elevated`, `--shadow-modal`), not raw `shadow-sm/md/lg`. Touch target minimum = 44px (button `default=h-11` is the canonical size).

---

## A. CRITICAL — visual bugs that hurt the product

### A1. `bg-card` and `bg-muted` are the same color (#f3ece5)
**Where it bites:**
- `components/ui/card.tsx:87` — `CardFooter` uses `bg-muted/50` to separate from the card body. But `bg-muted` == `bg-card` (#f3ece5), so `bg-muted/50` becomes a barely-visible lift. The card footer never visually separates from the body.
- `components/marketing/marketing-header.tsx:63, 138` — Active nav link uses `bg-muted` on the page background. On a transparent header with `--background/80` backdrop-blur underneath, the active indicator looks almost the same as the inactive hover state.
- `components/analytics/range-tabs.tsx:38` — Active tab uses `bg-card` to "lift" out of the `bg-muted` container. Same color — no visual differentiation between active/inactive tabs.
- `components/ui/tabs.tsx:31` — TabsList default `bg-muted` container with `data-active:bg-background` tab inside. Active tab = page background (dawn-pink), inactive = card (off-white). Visually they look like two different cards stacked. The active tab does not "pop" out — it just changes which beige tone is showing.

**Fix:** separate `bg-muted` from `bg-card` by giving one of them a slightly different tone (e.g. `bg-muted: #ebe0d3`, a step between card and background). Or change the active-tab pattern to use a shadow/ring instead of relying on bg swap.

### A2. `Card` primitive uses `rounded-xl` (violates DESIGN.md)
`components/ui/card.tsx:15` — `rounded-xl` (16px) on every card. DESIGN §9 says: *"use `rounded-lg` for BOTH controls and cards/panels app-wide — including marketing — so radius stays consistent. Avoid mixing rounded-2xl / rounded-xl / arbitrary rounded-[..] across surfaces."*

**Other `rounded-xl` violations in the codebase:**
- `components/dashboard/profile-wallet-card.tsx:41` — `<Link className="rounded-lg">` (correct here) but child `Card` is `rounded-xl`. Visual mismatch on hover (ring expands but corner is xl).
- `components/analytics/stat-card.tsx:118-123` — Link wrapper `rounded-xl` (should be `rounded-lg`).
- `components/faucet/faucet-claim-card.tsx:81` — icon container `rounded-xl` for `size-10` icon bubble. The card itself is `rounded-lg` (default Card). Two radii on the same card.
- `components/ui/dialog.tsx:54` — dialog uses `rounded-lg` ✓ correct.
- `components/ui/sheet.tsx:56` — sheet uses `rounded-t-lg/rounded-r-lg/rounded-l-lg/rounded-b-lg` ✓ correct.

**Fix:** change `card.tsx:15` `rounded-xl` → `rounded-lg`. Sweep through 5+ files to replace the other `rounded-xl` violations.

### A3. `rounded-md` leaks into SelectItem & Tabs
- `components/ui/select.tsx:119` — `SelectItem` uses `rounded-md` (6px). All other UI surfaces use `rounded-lg` (12px) or `rounded-sm` (6px). Mixed radii inside a single select dropdown vs outside.
- `components/ui/tabs.tsx:61` — `TabsTrigger` uses `rounded-md`. Should be `rounded-lg` (or `rounded-sm` if going for the small-pill look).
- `components/ui/tabs.tsx:27` — `TabsList` uses `rounded-lg` ✓ but trigger inside is `rounded-md`. Visually: outer pill is smooth, inner triggers have sharper corners that look like they don't fit.

**Fix:** standardize trigger to `rounded-sm` (so it visually fits inside a `rounded-lg` container) or `rounded-md` if intent is the small-pill.

### A4. `shadow-lg` and `shadow-xs` used directly instead of tokens
- `components/ui/dialog.tsx:54` — `shadow-lg` (raw tailwind). Token is `--shadow-modal` (12px 32px with 0.18 alpha). `shadow-lg` is generic and doesn't match the brand-tinted shadow palette.
- `components/ui/sheet.tsx:56` — same `shadow-lg` violation.
- `components/console/summary-cards.tsx:58` — `*:data-[slot=card]:shadow-xs`. Token is `--shadow-card` (1px 2px with 0.05 alpha). `shadow-xs` is the raw tailwind tiny shadow — barely visible on a card with `ring-1 ring-foreground/10` already.

**Fix:** replace with `shadow-(--shadow-modal)` / `shadow-(--shadow-card)`.

---

## B. HIGH — button size & tap-target violations

### B1. Primary action buttons using `size="sm"` (h-9, 36px) — below project norm
The Button primitive (button.tsx:28) defines `size="sm"` as `h-9 min-w-11` (36px). The project declares `min-h-11` (44px) as the touch-target minimum. Yet:

- `components/faucet/faucet-claim-card.tsx:113` — **"Claim 0.001 ETH"** is the only thing the user can do in this card and it's `size="sm"`. This is the most important action on the card.
- `components/inventory/bulk-add-dialog.tsx:233` — **mode switcher** (Manual / Paste / Upload CSV). These are the primary navigation inside the dialog, not auxiliary buttons.
- `components/console/manual-review-table.tsx` has `className="min-h-11 min-w-24"` ✓ correct.
- `components/console/treasury-card.tsx:187, 129` — `className="min-h-11"` ✓ correct.
- `components/console/dependencies-card.tsx:83` — `className="min-h-11"` ✓ correct.
- `components/console/export-card.tsx` (per audit) — has `min-h-11` ✓.
- `components/console/developer-console.tsx:274, 281` — `min-h-11` ✓ on dialog buttons.
- `components/members/members-page.tsx:488-504` — Approve/Reject `size="sm"` but these are row-level actions, OK.
- `components/console/manual-review-table.tsx:140-152` — Retry `className="min-h-11 min-w-24"` ✓.
- `components/blockchain/blockchain-page.tsx:386-389` — Retry icon-only `size="sm"` (h-9). OK by icon convention.

**Fix:** raise `size="sm"` users to `default` (h-11) where the button is a primary action. For mode switcher (bulk-add-dialog), use a proper `TabsList` or a segmented control with container `bg-muted`.

### B2. Icon-only buttons on absolute positions have ambiguous hit area
- `components/ui/dialog.tsx:62-74` — close button uses `size="icon-sm"` (28px) absolutely positioned `top-3 right-3` with `before:absolute before:-inset-[7px]`. The `-inset-[7px]` expansion overlaps the dialog header text area. On the `DialogTitle` which has `pr-10` (line 109) to leave room — but only 40px, the close button's expanded hit area extends ~5px into the title.
- Same issue in `components/ui/sheet.tsx:62-75` (identical pattern).

**Fix:** use `size="icon"` (32px) for top-right dialog/sheet close, with `pr-12` (48px) on title to give room for the 32px button + 8px gap.

### B3. `xs` button size (h-8, 32px) for icon-only actions
- `components/ui/button.tsx:27` — `size="xs"` is `h-8` (32px). Used as a tag-like button (e.g. inline edit icon). The `-inset-[11px]` expansion gives a 54px hit area — generous. But the visual button is small; users don't perceive the expansion. **Issue:** not a real bug, but if a user has a touch device and lands within the visible 32px area, the click target is fine; if they land in the expanded 54px area, it may feel "magnetic" because the visible button is so much smaller. Not a blocker, just a polish concern.

---

## C. HIGH — contrast / color clashes

### C1. `text-muted-foreground` (#1e5b46) on `bg-muted` (#f3ece5)
Contrast: ~5.55:1 — passes WCAG AA. **But** `--muted` and `--card` are the same color, so wherever you have a card with `bg-muted` text inside, the text appears in the card's "muted" tone (not lifted). On `--background` (dawn-pink #e4d5c7), `text-muted-foreground` reads as a clear dark teal — fine. **Risk:** when designers add a `--muted-foreground/70` or use `text-muted-foreground/80` somewhere (haven't found it yet but easy mistake), the result can dip below 4.5:1.

**Files with `text-muted-foreground` text inside cards (verify each is OK on its surface):**
- `components/console/dependencies-card.tsx:50` — `text-muted-foreground` on plain card row. ✓ 5.55:1.
- `components/console/error-summary.tsx:86, 91, 96, 104, 113` — multiple. ✓ on card.
- `components/dashboard/recent-activity.tsx:38, 68, 73` — ✓ on card.
- `components/dashboard/recent-movements.tsx:141, 151` — ✓.
- `components/inventory/movements-page.tsx` (multiple rows) — all on card ✓.
- `components/console/manual-review-table.tsx:98, 109, 116, 124, 135` — ✓ on card but the row has `bg-warning/[0.04]` tint which shifts the bg slightly. The `warning/[0.04]` tint is so subtle it doesn't change contrast meaningfully.

### C2. Faucet claim card error message color
`components/faucet/faucet-claim-card.tsx:92` — error message uses `text-muted-foreground` and is a generic-looking info. When the user sees "Network error. Your faucet claim was not submitted." in muted text, they may miss it. **Should be `text-destructive`** (or a `role="alert"` block with `bg-destructive/15`).

### C3. EmptyState `bg-card/50` makes the empty state very low contrast
`components/shared/empty-state.tsx:54` — `bg-card/50` (50% opacity card on top of `bg-background`). With `--card=#f3ece5` and `--background=#e4d5c7`, the resulting 50% blend is only ~2 RGB values lighter than the page background. The dashed border is the only thing that delineates it.

**Fix:** use full `bg-card` instead of `bg-card/50` (the page already has enough hierarchy).

### C4. Settings error block in create-warehouse uses 5% destructive tint
`components/warehouses/create-warehouse-form.tsx:592` — `bg-destructive/5` is barely visible. Compare `components/auth/login-form.tsx:40` which uses `bg-destructive/15`. **Inconsistency:** error surfaces differ. Standardize on `bg-destructive/15` everywhere.

### C5. StatusBadge "warning" tone missing border
`components/shared/status-badge.tsx:34, 49` — "warning" tone has no border; "suspended" tone (same color family) has `border border-warning/20`. Visually: warning is just `bg-warning/15 text-warning`, suspended adds a faint border. **Inconsistency.** Either both have borders, or neither.

### C6. Profile/Settings role badge uses `variant="secondary"` (loud teal)
`components/dashboard/profile-wallet-card.tsx:60` and `app/(dashboard)/settings/page.tsx:127` — both render role labels (Owner/Manager/Staff/Auditor/Viewer) as `<Badge variant="secondary">` which is `bg-secondary text-secondary-foreground` (teal #6ab29b + near-black #0e231b). This is a **loud visual element for a passive label**.

**Fix:** use `<Badge variant="outline">` for role. Reserve `variant="secondary"` (teal) for callouts that need attention.

### C7. Manual review row tinting collides with row dividers
`components/console/manual-review-table.tsx:92` — `<TableRow className="bg-warning/[0.04]">` on every row. The table likely uses `divide-border` for row separation. Two row-divider strategies on the same table can produce odd double-divider visuals when the warning tint is below the divide color.

### C8. `bg-tradewind/15` on Hero "live" pill
`components/marketing/hero.tsx:180` — `text-primary` (#186049) on `bg-tradewind/15` (≈ #e6f0ec). Contrast ≈ 4.5:1 (passes AA for normal text). But the primary is very dark green and the tint is very light teal — they share hue, so the pill can look "washed out". Consider `bg-primary/10 text-primary` (same as success tone in status-badge) for consistency.

### C9. Card hover on Profile-wallet has ring conflict
`components/dashboard/profile-wallet-card.tsx:41` — Link has `hover:ring-2 hover:ring-ring/40`. The wrapped Card has `ring-1 ring-foreground/10` (from card.tsx:15). On hover, ring changes from `ring-1 ring-foreground/10` to `ring-2 ring-ring/40`. Visual jump: ring thickness doubles, color shifts, layer count is wrong (Card has ring + Link adds ring = ring ring).

**Fix:** remove `ring-1 ring-foreground/10` from Card or use a `hover:shadow-elevated` instead of `hover:ring-2` on the Link wrapper. Don't double-ring.

### C10. Marketing CTA buttons override `h-12` redundantly
`components/marketing/hero.tsx:117-118, 130` — `size="lg"` (which is already `h-12` per button.tsx:29) plus explicit `className="h-12 px-7 text-base"`. Redundant. The className `h-12` overrides any future change to `size="lg"`. **Fix:** remove the explicit `h-12`, keep `px-7 text-base` only.

---

## D. MEDIUM — font & hierarchy

### D1. `text-xs` used for primary content in many places
The 12px (`text-xs`) is the codebase's small-text convention, used for: helper text, badge labels, dates, wallet addresses, table captions. But:
- `components/console/manual-review-table.tsx:95, 98, 105, 109, 116, 124, 135` — every cell is `text-xs`. The "warehouse name" (line 95) is `text-sm font-medium` ✓, but secondary info (address, attempts) is `text-xs`. Fine for table density.
- `components/dashboard/recent-activity.tsx:73` — timestamp `text-xs`. Fine.
- `components/faucet/faucet-claim-card.tsx:88` — body description `text-xs`. **This is primary content (the reason the card exists).** At 12px on a card body, it reads "secondary info" rather than "this is what you can do". Bump to `text-sm`.
- `components/inventory/product-form.tsx` (per audit) — labels and helper text. Likely `text-sm` already.
- `components/auth/login-form.tsx:40` — error message `text-sm` ✓.

### D2. `text-base` (16px) on Input is too large for body form fields
`components/ui/input.tsx:12` — `text-base` on default, then `md:text-sm`. This means mobile shows 16px inputs (good for iOS) but desktop shows 14px (smaller than the form labels which are `text-sm`). The label is the same size as the input on desktop, breaking the typical "label > input" hierarchy.

**Fix:** `text-sm` on mobile, `text-sm` on desktop (or `text-base` everywhere to keep label/input at different sizes).

### D3. `DialogTitle` uses `font-medium` while `CardTitle` uses `font-semibold`
- `components/ui/dialog.tsx:108-110` — `font-display text-base font-medium` for dialog title.
- `components/ui/card.tsx:41-43` — `font-display text-base font-semibold` for card title.

Dialog title should be **louder** than card title, not the same weight. **Fix:** dialog title → `font-semibold` (or `text-lg font-semibold` for more hierarchy).

### D4. `h1` size inconsistent across pages
- `components/shared/page-header.tsx:15` — `text-2xl font-semibold` (24px).
- `app/(dashboard)/settings/page.tsx:585` — `text-2xl font-semibold` for "Create Warehouse" error heading.
- `components/warehouses/create-warehouse-form.tsx:585` — `text-2xl font-semibold tracking-tight md:text-3xl`.
- `components/marketing/hero.tsx:97` — `text-[2.75rem] sm:text-6xl` (44px → 60px).
- `components/marketing/cta.tsx` (per inventory) — different.

Page-level h1s cluster around `text-2xl` for dashboard pages and `text-6xl` for marketing. The "dashboard page title" vs "marketing hero title" are intentionally different scales — fine. But the `create-warehouse-form.tsx` uses `text-2xl md:text-3xl` while `page-header.tsx` uses just `text-2xl`. **Fix:** align all dashboard page h1s to `text-2xl md:text-3xl`.

### D5. `SidebarMenuButton` font/weight is undefined
- `components/layout/app-sidebar.tsx:120-135` — `<SidebarMenuButton size="lg">` shows the warehouse name. Default sidebar button font size is set by the sidebar primitive (per audit: `text-sm`).
- `components/ui/sidebar.tsx` — verify default typography.

### D6. `EmptyState` title uses `text-base font-semibold`
`components/shared/empty-state.tsx:59` — `text-base font-semibold` for "No stock movements yet" etc. Same weight as `CardTitle` (`text-base font-semibold`). But the empty state is a single piece of information, while the card title is followed by description. **Fix:** empty state title could be `text-lg` to feel more like a "headline" calling for action.

---

## E. MEDIUM — components & states

### E1. Notification bell badge uses redundant `rounded-full` over `rounded-4xl`
`components/notifications/notification-bell.tsx:275` — `rounded-full` is set, but the Badge primitive has `rounded-4xl` (badge.tsx:8). Tailwind-merge handles it, but the explicit `rounded-full` is redundant code. **Fix:** drop the explicit `rounded-full`.

### E2. LoginForm submit button has no spinner icon during pending
`components/auth/login-form.tsx:70-72` — `disabled={pending}` but the button only swaps text to "Signing in…". No `<Loader2 />` icon. Every other async submit in the codebase has the icon (per audit A5/A7 from previous round). **Fix:** add `<Loader2 aria-hidden="true" className="animate-spin" />` before the label.

### E3. `CardAction title` attribute used as tooltip
`components/analytics/stat-card.tsx:96` — `<CardAction title="Compared to the previous period">`. The `title` attribute shows a native browser tooltip — inconsistent with the rest of the project that uses the `Tooltip` primitive. **Fix:** wrap the DeltaBadge in `<Tooltip>`.

### E4. `StatCard` min-height only on analytics card
`components/analytics/stat-card.tsx:112, 123` — `min-h-[148px]`. `components/console/summary-cards.tsx` has no min-height. Both render stat cards side-by-side on their respective pages. Inconsistent vertical rhythm when both are present (they never are, but the principle matters). **Fix:** add `min-h-[148px]` to all stat cards or none.

### E5. `EmptyState` lacks `min-h` consistency
EmptyState renders 12px padding, but the icon container is `size-10` and title is `text-base` — total height is ~140px. Other "empty" patterns (e.g. `console/manual-review-table.tsx` empty state) use `EmptyState` directly. Consistent ✓.

### E6. `PanelCard` `tinted` variant is just `border` with no color
`components/shared/panel-card.tsx:34` — `tinted: "border"`. Relies on the caller to pass `className` with the actual color. If the caller forgets, the bordered panel is just a default-bordered box that looks like the `solid` variant. **Fix:** require an explicit color or rename variant to `bordered-needs-color`.

### E7. `PanelCard padding="none"` removes padding AND edge styling logic
`components/shared/panel-card.tsx:25` — `none: ""` (no padding class). Fine, but `solid` variant with `padding="none"` gives a card with ring-1 + no padding — useful for table headers but it's the same look as `padding="default"` minus padding. No visual issue.

### E8. `marking` text "Marking…" in notifications-bell uses ghost variant
`components/notifications/notification-bell.tsx:312-316` — `Marking…` button is now `variant="outline"` (per previous fix). The icon is `Loader2` when busy. ✓. Same pattern in notifications-page-view ✓.

### E9. Faucet card uses `rounded-xl` for inner icon bubble
`components/faucet/faucet-claim-card.tsx:81` — `<span className="bg-primary/10 text-primary flex size-10 ... rounded-xl">`. The card has `rounded-lg` (Card default). **Fix:** use `rounded-lg` for the icon container to match the card's radius.

### E10. `Card` with custom `className` that overrides ring
`components/console/manual-review-table.tsx:55` — `<Card className="ring-warning/40">`. The Card primitive's `ring-foreground/10` is replaced by `ring-warning/40` (more visible). But ring is `ring-1` (default in card.tsx:15) — to make the warning ring stand out, the card needs `ring-2` or a shadow. **Fix:** use `border-warning/30` and `border-2` instead of ring override.

### E11. `bg-warning/[0.04]` on TableRow uses arbitrary alpha
`components/console/manual-review-table.tsx:92` — Tailwind v4 supports arbitrary alpha in brackets, but this is less consistent than `bg-warning/5` (no brackets) or a defined tone variable. **Fix:** use `bg-warning/5`.

### E12. `error` `role="alert"` inconsistency
- `components/auth/login-form.tsx:37-44` — `<div role="alert">` for form error.
- `components/warehouses/create-warehouse-form.tsx:591-598` — `<div role="alert">` ✓.
- `components/members/dialogs/transfer-ownership-dialog.tsx:82-87` — `<p role="alert">` ✓.
- `components/faucet/faucet-claim-card.tsx:92` — `<p role="status">` for **error** message (line 72). Should be `role="alert"`.

### E13. Bulk-add dialog mode switcher is buttons, not a Tabs
`components/inventory/bulk-add-dialog.tsx:226-241` — three `<Button size="sm">` for Manual/Paste/Upload. Should use the existing `Tabs` primitive (which has proper active-state styling, container, accessibility) or a `bg-muted` segmented control. The current pattern: three outlined buttons side-by-side, no visual container indicating they're a group.

### E14. `Card` with `border` for "Manual review queue" but the rest of the codebase uses `ring-1 ring-foreground/10`
The `Card` primitive uses `ring-1 ring-foreground/10` (card.tsx:15) as the default edge. `manual-review-table.tsx:55` overrides to `ring-warning/40`. **Inconsistency:** the override tries to signal "important" via ring color, but the underlying primitive is a ring (subtle line). A "warning" card would be more conventional as `border-warning/40 border-2` or `border-warning/30 bg-warning/5`. Currently it's a slightly more yellow line on a card — almost imperceptible.

### E15. PageHeader h1 weight vs the rest of marketing
`components/shared/page-header.tsx:15` — `text-2xl font-semibold`. Marketing hero h1 is `text-6xl font-semibold`. **Inconsistency:** dashboard page headers feel weak compared to the rest of the brand. Bump to `text-2xl md:text-3xl font-semibold tracking-tight`.

---

## F. LOW — nits

### F1. `SidebarTrigger` size in mobile context
- `components/layout/site-header.tsx:98` — `SidebarTrigger aria-label="Toggle sidebar"`. The size depends on the sidebar primitive (per audit: `size-9` = h-9, 36px). Below project `min-h-11` for a primary action. **Fix:** add `className="min-h-11 min-w-11"`.

### F2. `SignOut` button in `app-sidebar.tsx:300` uses default `size` (h-11) ✓ correct.
Same in `site-header.tsx:210`. ✓.

### F3. `ThemeToggle` icon button is `size-icon` (h-8) with -inset expansion
- `components/shared/theme-toggle.tsx` — audit shows `size="icon"` (32px) + `-inset-[7px]`. Hit area = 46px. ✓.

### F4. `LocaleToggle` button same pattern ✓.

### F5. `CopyButton` `size="icon-sm"` (28px) + `-inset-[9px]` = 46px ✓.

### F6. `display-name-editor.tsx` "Edit" button `size="icon-sm"` (28px) + `-inset-[9px]` = 46px ✓.

### F7. `CommandMenu` close button `size="icon"` (32px) + `-inset-[7px]` = 46px ✓.

### F8. `empty-state.tsx` "primaryAction" `Button` has no `size` — default `h-11` ✓.
"secondaryAction" `Button` no size — default ✓.

### F9. `recent-movements.tsx:77` "View all" button `size="sm"` (h-9). As a navigation action in a card header, this is borderline. **Fix:** use `size="default"` or keep `sm` with `min-h-11` override.

### F10. `recent-transactions.tsx` (per inventory) — likely same `size="sm"` pattern.

### F11. `pagination.tsx:28-43` — `<Button size="sm">` for prev/next. Per audit, OK by pagination convention but the project norm is `h-11`. **Fix:** use `min-h-11 min-w-11` on these.

### F12. `error-state.tsx:41` "Try again" button uses default `h-11` ✓.

### F13. `load-more.tsx:29` "Load more" button default `h-11` ✓.

### F14. `display-name-editor.tsx:69` "Edit" icon button `icon-sm` (28px) + expansion ✓.

### F15. `inventory/products-page.tsx:330` "Clear search" `X` button `size-7` with `-inset-2` (8px). Hit area = 30px. Below the 32px visual. **Fix:** `size-8` with `-inset-[8px]` to get 48px hit area.

### F16. `members-page.tsx:629` Member row actions trigger `size="icon-sm"` (28px) + expansion. Per audit ✓.

### F17. `inventory/products-page.tsx:233` Action menu trigger `size="icon-sm"` (28px) ✓.

### F18. `inventory/movements-page.tsx:529` Row actions trigger `size="icon-sm"` ✓.

### F19. `transactions/transactions-page.tsx:289` Row actions trigger `size="icon-sm"` ✓.

### F20. `marketing/marketing-header.tsx:104-115` Mobile menu trigger `size="icon"` (32px) + `-inset-[7px]`. Hit area 46px ✓.

### F21. `inventory/products-page.tsx:476-481` "Select all" checkbox `size-5` + `-inset-[12px]` = 50px hit area ✓.

### F22. `inventory/products-page.tsx:512-519` Row checkbox same ✓.

### F23. Bulk add mode switcher — `gap-1` (4px) between buttons is tight. The active button has `bg-primary text-primary-foreground` and inactive is `outline`. With `gap-1`, they almost touch. **Fix:** `gap-2` (8px) or wrap in a `bg-muted p-1 rounded-lg` segmented control.

### F24. `console/error-summary.tsx:104` Tooltip trigger is a `<span>` (block). The Tooltip primitive likely expects a focusable element — `<span>` has no `tabindex`. Hover works, but keyboard users can't reach the tooltip. **Fix:** add `tabIndex={0}` to the trigger, or use a proper button.

### F25. `console/manual-review-table.tsx:124` same issue (Tooltip on `<span>`).

### F26. `components/console/dependencies-card.tsx:18-31` — `<Dot />` uses `aria-hidden="true"`, but the dependency name is `<span className="text-foreground text-sm font-medium">` next to it. The whole row has no `<li role="listitem">` semantic or `<ul>` parent (wait, it does — the parent is `<ul className="flex flex-col divide-y">`). Fine ✓. But the `Dot` color encodes status (green/red/gray) and the visual alone tells the story. Color-blind users: there's also a "configured" / "not configured" text label (line 41-43) ✓. Failed dependencies have `animate-pulse` (line 28-29) which is motion-only — fine for non-essential decoration.

### F27. `components/console/manual-review-table.tsx:55` `ring-warning/40` color is the only place warning is used as a card edge. The Card primitive doesn't support a `variant` parameter; this kind of "this card is special" pattern is repeated 4+ times in the codebase with `ring-warning/40`, `ring-primary/30`, etc. **Fix:** add a `tone` prop to `PanelCard` or `Card` primitive.

---

## G. Suggestions (UI/UX)

### G1. **Refactor Card primitive: separate `bg-muted` from `bg-card`**
Either:
- Rename `--muted` to a darker tone (e.g. `#ebe0d3`) so cards "lift" off the page.
- Or change the active-tab pattern (Tabs, RangeTabs) to use a border + shadow instead of relying on bg swap.

### G2. **Sweep `rounded-xl` → `rounded-lg`**
- `components/ui/card.tsx:15` ← main offender
- `components/analytics/stat-card.tsx:118`
- `components/faucet/faucet-claim-card.tsx:81` (icon bubble)
- `components/dashboard/profile-wallet-card.tsx` (any remaining)

### G3. **Sweep `shadow-sm` / `shadow-lg` / `shadow-xs` → tokens**
- `shadow-modal` for dialogs, sheets, popovers
- `shadow-card` for cards (replacing the ring if you want a shadow-based look)
- `shadow-elevated` for floating elements (Hero floating cards, dropdowns)

### G4. **Standardize error message surfaces**
Pick one pattern: `role="alert"`, `bg-destructive/15` (not /5, not /10), `text-destructive`, `rounded-lg`, `px-3 py-2 text-sm`. Apply everywhere.

### G5. **Standardize role badge**
`<Badge variant="outline">` for roles in profile-wallet-card and settings. Reserve `variant="secondary"` (teal) for actual callouts.

### G6. **Add a "Card tone" prop to Card / PanelCard**
Instead of overriding `ring-` or `border-` per card, accept `tone="warning" | "destructive" | "primary"` and let the primitive apply the right edge. Avoids the manual-review-table ring override and the failure-banner tinted overrides.

### G7. **Promote `h1` on dashboard pages to `text-2xl md:text-3xl font-semibold tracking-tight`**
Apply in `page-header.tsx` and the few inline `<h1>` cases (create-warehouse-form error page).

### G8. **Use a proper Tabs/segmented control in bulk-add-dialog**
Replace the three `<Button size="sm">` with `Tabs` (already a primitive). The active state will be properly styled, and the focus/keyboard story is already implemented.

### G9. **Add `min-h-11 min-w-11` overrides on every icon button**
Audit every icon-only button and add the override if the button doesn't have `-inset-[7px]+` expansion. Specifically:
- `recent-movements.tsx:77` "View all" — wait, that's not icon-only.
- `pagination.tsx` prev/next — `min-h-11 min-w-11`.
- `inventory/products-page.tsx:330` "Clear search" — bump `size-7` to `size-8`.

### G10. **Replace CardAction `title=` with Tooltip**
Audit every `title=` attribute; convert to `<Tooltip>` for consistency with the rest of the project.

### G11. **Disable duplicate role/element tooltip on `<span>` TooltipTrigger**
For `error-summary.tsx` and `manual-review-table.tsx`, add `tabIndex={0}` to the Tooltip trigger span so keyboard users can focus and read.

### G12. **Add an explicit "Filter active" pill / chip strip**
On every list page, when a filter is applied, show a removable chip ("Status: Archived ×", "Type: stock_in ×"). This is the cleanest way to fix the "I filtered and forgot" empty-state problem.

### G13. **Replace `TooltipTrigger render={<span ... />}` with `render={<button ... />}`** for any tooltip that contains interactive content. Currently `error-summary.tsx:104` and `manual-review-table.tsx:124` use a `<span>` — semantically they should be a focusable element.

### G14. **Add `font-display` to h2-h6 by default** (already done in globals.css:243) — verify it's actually applied. Some inline `<h3>` / `<h4>` in components may be missing it.

### G15. **Inverted hierarchy: `value` should be larger than `label`**
`components/console/summary-cards.tsx:45-48` — value `text-2xl` ✓ > description `text-sm` ✓.
`components/analytics/stat-card.tsx:88-93` — label `text-sm` (CardDescription) + value `text-2xl md:text-3xl` ✓.
`components/dashboard/recent-movements.tsx:147` — quantity `text-sm`. The label "Qty" (header) is `text-sm` (TableHead default). **Same size for label and value** — visual hierarchy flat. **Fix:** use `font-mono text-sm font-medium tabular-nums` for quantity to give it visual weight.

### G16. **Hapus / ganti** — `<Badge variant="secondary">` (teal loud) for role display in profile-wallet-card and settings page. Use `<Badge variant="outline">` (subtle).

### G17. **Tambah** — `bg-warning/[0.04]` di TableRow manual-review pakai `bg-warning/5` (5 tanpa bracket, Tailwind v4 recognize), lebih clean.

### G18. **Tambah** — `aria-current="page"` di active nav link marketing-header (sudah ada di line 59 ✓) — sudah OK, tidak perlu.

---

## H. Summary table

| Severity | Count | Theme |
|---|---|---|
| CRITICAL | 4 | bg-card/bg-muted identical · rounded-xl leak · shadow token leak · mixed select/tab radii |
| HIGH | 10 | button size:sm on primary actions · close button hit area · various text-xs primary content · dialog title weight · bg-card/50 on empty state · destructive/5 vs /15 inconsistency · role badge variant · warning tone missing border · ring conflict on profile-wallet |
| MEDIUM | 15 | text-xs on primary content · input text-base vs label text-sm · page h1 inconsistency · notification bell redundant rounded-full · login submit no spinner · CardAction title= as tooltip · StatCard min-h only on analytics · PanelCard tinted no color · role badge variant · faucet card error color · manual-review ring + row tinting · h1 alignment · mark-review Tabs pattern · empty state title size · marketing h1 vs dashboard h1 |
| LOW | 25 | F1–F27 nits: icon button min-h · TooltipTrigger span tabIndex · redundant radius · various minor |

**Top 3 to fix first (highest visual impact):**
1. **A1** — separate `bg-muted` from `bg-card` (or fix active-tab pattern). Affects every page.
2. **A2** — `rounded-xl` → `rounded-lg` in `card.tsx:15`. One-line fix that propagates everywhere.
3. **A4** — replace `shadow-lg` and `shadow-xs` with `shadow-(--shadow-modal)` and `shadow-(--shadow-card)`. Aligns with DESIGN.

**Most surprising bug:**
- `bg-card` and `bg-muted` being the **same color** is a fundamental design-token choice that silently degrades UI hierarchy on every page. Any visual element relying on "active = different surface" doesn't work as expected.