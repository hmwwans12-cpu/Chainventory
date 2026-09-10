# UI/UX Audit Report — Chainventory

**Audit Date:** 2026-08-31  
**Scope:** All UI components, pages, layouts, and interaction components  
**Excluded:** `.next/`, `node_modules/`, generated files  
**Total Files Audited:** 87+

---

## 1. Executive Summary

Chainventory has a **solid design system foundation** with consistent patterns for cards (`PanelCard`), forms (`FormField`), status badges, and focus states. However, the audit reveals **30 UI/UX issues** across 5 categories: button inconsistencies, font clarity problems, interaction gaps, accessibility oversights, and visual inconsistencies.

### Scores (0–10)

| Dimension | Score | Notes |
|-----------|-------|-------|
| **Button Consistency** | 6.5 | Multiple sizes, vague labels, touch target failures |
| **Typography Clarity** | 7.0 | Good hierarchy but too many `text-xs` instances |
| **Interaction Design** | 7.5 | Good loading states, some missing feedback |
| **Accessibility** | 7.0 | Strong ARIA patterns, some gaps in live regions |
| **Visual Consistency** | 7.5 | Good design token system, minor spacing issues |
| **Overall UI/UX** | **7.1** | Production-ready with targeted improvements needed |

---

## 2. Critical Issues (P1 — Must Fix)

### [P1] Button Touch Target Below 44px (WCAG 2.5.8 Failure)

**Category:** Accessibility / Button  
**WCAG:** 2.5.8 Target Size (Minimum), AA

**Problem:**
Multiple interactive elements fail the 44×44px minimum touch target:

| Component | Element | Current Size | Location |
|-----------|---------|--------------|----------|
| `button.tsx` | `icon-xs` button | 24px | `button.tsx` |
| `button.tsx` | `icon-sm` button | 28px | `button.tsx` |
| `dialog.tsx` | Close button | 28px (`icon-sm`) | `dialog.tsx` |
| `sheet.tsx` | Close button | 28px (`icon-sm`) | `sheet.tsx` |
| `toast.tsx` | Close button | 28px (`icon-sm`) | `toast.tsx` |
| `copy-button.tsx` | Default size | 28px (`icon-xs`) | `copy-button.tsx` |
| `notification-bell.tsx` | Unread badge | 24px | `notification-bell.tsx` |
| `sidebar.tsx` | Menu action | 20px | `sidebar.tsx` |

**Impact:**
- Mobile users cannot reliably tap these elements
- Fails WCAG 2.5.8 (AA) — blocks accessibility compliance
- Users with motor impairments are most affected

**Why:**
The `icon-sm` size (28px) was chosen for visual compactness but doesn't account for touch ergonomics. The `before:-inset-[Npx]` pseudo-element extension helps but isn't consistently applied.

**Recommendation:**
- Increase `icon-sm` from 28px to 36px (or add 8px padding to reach 36px effective)
- Increase `icon-xs` from 24px to 32px
- For close buttons, use `size="icon"` (40px) or add `p-2` padding to reach 44px
- Add `min-h-11 min-w-11` (44px) to all icon-only interactive elements

**Priority:** P1

---

### [P1] Missing `aria-live` on Critical Status Changes

**Category:** Accessibility  
**WCAG:** 4.1.3 Status Messages, AA

**Problem:**
Several dynamic status changes are not announced to screen readers:

| Component | Status Change | Current | Location |
|-----------|---------------|---------|----------|
| `movements-page.tsx` | Live/Reconnecting | `role="status"` only | `movements-page.tsx:280` |
| `blockchain-page.tsx` | Live status | `role="status"` only | `blockchain-page.tsx:202` |
| `pagination.tsx` | Page change | No live region | `pagination.tsx:24-26` |
| `reset-password-form.tsx` | Success message | No live region | `reset-password-form.tsx:63` |
| `forgot-password-form.tsx` | Success message | No live region | `forgot-password-form.tsx:30-32` |
| `copy-button.tsx` | "Copied!" feedback | Visual only | `copy-button.tsx:47-51` |

**Impact:**
- Screen reader users don't know when data refreshes, pages change, or actions succeed
- Violates WCAG 4.1.3 for status messages

**Why:**
`role="status"` alone doesn't create a live region in all screen reader/browser combinations. Explicit `aria-live="polite"` is needed.

**Recommendation:**
Add `aria-live="polite"` to all status containers:
```tsx
<div role="status" aria-live="polite">
  {liveStatus}
</div>
```

For copy feedback, add an `aria-live` region:
```tsx
<span aria-live="polite" className="sr-only">
  {copied ? "Copied!" : ""}
</span>
```

**Priority:** P1

---

### [P1] Inconsistent Button Labels Cause Confusion

**Category:** UX / Button  
**Location:** Multiple files

**Problem:**
Button labels are vague or inconsistent, making it unclear what action will happen:

| Component | Current Label | Issue | Location |
|-----------|---------------|-------|----------|
| `login-form.tsx` | "Continue" | Vague — doesn't indicate sign in | `login-form.tsx:72` |
| `leave-warehouse-dialog.tsx` | "Cancel" → "Close" | Label changes for same action | `leave-warehouse-dialog.tsx:81` |
| `display-name-editor.tsx` | No size prop | Inconsistent with Cancel `size="sm"` | `display-name-editor.tsx:16-24` |
| `stock-movement-dialog.tsx` | "Submit" | Generic — should say "Record Stock In" | `stock-movement-dialog.tsx:528-544` |

**Impact:**
- Users may hesitate or make errors
- "Continue" doesn't set expectations for what happens next
- Inconsistent Cancel/Close creates confusion about whether changes are saved

**Why:**
Labels were written for developer convenience, not user clarity.

**Recommendation:**
| Current | Recommended | Reason |
|---------|-------------|--------|
| "Continue" | "Sign in" | Clear action indication |
| "Close" | "Cancel" | Consistent with other dialogs |
| "Submit" | "Record Stock In/Out" | Specific to the action |
| No size | `size="sm"` | Match Cancel button |

**Priority:** P1

---

## 3. High Issues (P2 — Should Fix)

### [P2] Font Too Small for Important Content

**Category:** Typography / Readability  
**WCAG:** 1.4.4 Resize Text, AA

**Problem:**
`text-xs` (12px) is used for content that is important for user understanding:

| Component | Content | Size | Location |
|-----------|---------|------|----------|
| `audit-trail.tsx` | Entire table | `text-xs` | `audit-trail.tsx:62-85` |
| `movements-page.tsx` | Dialog errors | `text-xs` | `movements-page.tsx:801,881` |
| `bulk-add-dialog.tsx` | Validation errors | `text-xs` | `bulk-add-dialog.tsx:407` |
| `notification-preferences.tsx` | Column headers | `text-xs` | `notification-preferences.tsx:98` |
| `command-menu.tsx` | ESC key hint | `text-xs` | `command-menu.tsx:240` |
| `badge.tsx` | Badge text | `text-xs` | `badge.tsx` |

**Impact:**
- Users with low vision cannot read critical information
- Error messages at 12px are especially problematic — users need to understand what went wrong
- On mobile, 12px text is nearly illegible

**Why:**
`text-xs` was used for visual compactness without considering readability requirements.

**Recommendation:**
| Content | Current | Recommended | Reason |
|---------|---------|-------------|--------|
| Error messages | `text-xs` | `text-sm` | Must be readable |
| Table body | `text-xs` | `text-sm` | Data readability |
| Column headers | `text-xs` | `text-sm` | Hierarchy clarity |
| Hints/helper text | `text-xs` | `text-sm` (min 14px) | Legibility |
| Badge text | `text-xs` | Keep (decorative) | OK for non-essential |

**Minimum rule:** Never use `text-xs` for error messages, validation feedback, or primary data.

**Priority:** P2

---

### [P2] Missing `prefers-reduced-motion` on All Animations

**Category:** Accessibility  
**WCAG:** 2.3.3 Animation from Interactions, AAA

**Problem:**
Only 2 of 15+ animated components respect `prefers-reduced-motion`:

| Component | Animation | Has Reduced Motion? |
|-----------|-----------|---------------------|
| `button.tsx` | `hover:scale-[1.02] active:scale-[0.97]` | ❌ No |
| `dialog.tsx` | `scale-95` entrance | ❌ No |
| `sheet.tsx` | Slide-in | ❌ No |
| `dropdown-menu.tsx` | `slide-in-from-top-2` | ❌ No |
| `toast.tsx` | Complex transforms | ❌ No |
| `tooltip.tsx` | Fade-in/zoom-in | ❌ No |
| `accordion.tsx` | Expand/collapse | ❌ No |
| `skeleton.tsx` | `animate-pulse` | ❌ No |
| `chart.tsx` | Zoom-in/out | ❌ No |
| `hero.tsx` | Hover scale | ✅ Yes (pointer-fine only) |
| `reveal.tsx` | Scroll reveal | ✅ Yes |

**Impact:**
- Users with vestibular disorders may experience nausea/seizures
- Users with autism or attention disorders find animations distracting
- Fails WCAG 2.3.3 (AAA)

**Why:**
Reduced motion was added to marketing animations but not to core UI components.

**Recommendation:**
Add to `globals.css`:
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

This single global rule fixes ALL components at once.

**Priority:** P2

---

### [P2] Sheet Overlay Too Light — Poor Modal Perception

**Category:** Visual / UX  
**Location:** `sheet.tsx`

**Problem:**
The Sheet (drawer) overlay is `bg-black/10` (10% black), while Dialog uses `bg-black/50` (50% black). This is a 5x difference for what should be similar modal experiences.

**Impact:**
- Users may not perceive the Sheet as a modal overlay
- Content behind the Sheet remains visually distracting
- Inconsistent with user expectations from other modal patterns

**Why:**
Sheet was designed to be "less intrusive" but went too far — 10% is barely visible.

**Recommendation:**
Increase Sheet overlay to `bg-black/30` or `bg-black/40`:
```tsx
<SheetOverlay className="bg-black/40" />
```

This provides better modal perception while still being lighter than Dialog (50%).

**Priority:** P2

---

### [P2] Tooltip Delay = 0ms — Disorienting

**Category:** UX / Interaction  
**Location:** `tooltip.tsx`

**Problem:**
Tooltips appear instantly (`delay={0}`) when hovering over any element. This causes:
- Accidental tooltip triggers when moving cursor
- Multiple tooltips appearing/disappearing rapidly
- Visual noise and disorientation

**Why:**
Default delay was never configured.

**Recommendation:**
Add a 200-300ms delay:
```tsx
<Tooltip delay={250}>
  ...
</Tooltip>
```

This prevents accidental triggers while keeping tooltips responsive.

**Priority:** P2

---

### [P2] Placeholder Contrast May Fail WCAG AA

**Category:** Accessibility  
**WCAG:** 1.4.3 Contrast (Minimum), AA  
**Location:** `input.tsx`

**Problem:**
Placeholder uses `placeholder:text-muted-foreground/70` — 70% opacity of an already low-contrast color. If `muted-foreground` is ~45% lightness on white, 70% of that is ~31.5% — below the 4.5:1 ratio required for AA.

**Impact:**
- Users with low vision cannot read placeholder hints
- May fail WCAG 1.4.3

**Why:**
Opacity stacking creates unpredictable contrast.

**Recommendation:**
Use a dedicated placeholder color with guaranteed contrast:
```tsx
placeholder:text-[var(--placeholder)]
```

And in `globals.css`:
```css
--placeholder: color-mix(in oklab, var(--foreground) 50%, transparent);
```

This ensures placeholder is always 50% of foreground color, meeting contrast requirements.

**Priority:** P2

---

## 4. Medium Issues (P3 — Nice to Fix)

### [P3] Button Hover Scale Causes Visual Jitter

**Category:** UX / Visual  
**Location:** `button.tsx`

**Problem:**
`hover:scale-[1.02] active:scale-[0.97]` causes:
- Text and icons to shift position on hover
- Adjacent buttons to appear misaligned
- SVG icons get additional `translate-x-[2px] -translate-y-[1px] scale-105` — compounding transforms

**Why:**
Scale animation was added for "delight" but creates visual instability.

**Recommendation:**
Replace scale with subtler feedback:
```tsx
// Instead of:
"hover:scale-[1.02] active:scale-[0.97]"
// Use:
"active:scale-[0.98]"  // Only scale on press, not hover
```

Or remove scale entirely and rely on background color change for feedback.

**Priority:** P3

---

### [P3] Sheet Rounded Corners on Screen Edge

**Category:** Visual  
**Location:** `sheet.tsx`

**Problem:**
Left/right Sheets get `rounded-lg` on ALL sides, including the side that touches the screen edge. This creates a visible gap between the Sheet and the screen edge.

**Why:**
`rounded-lg` is applied uniformly without considering the `side` prop.

**Recommendation:**
Use directional rounding based on side:
```tsx
side === "left" ? "rounded-r-lg" :
side === "right" ? "rounded-l-lg" :
side === "top" ? "rounded-b-lg" :
"rounded-t-lg"
```

**Priority:** P3

---

### [P3] Dead Code in Sidebar Component

**Category:** Code Quality  
**Location:** `sidebar.tsx`

**Problem:**
References `peer-data-[size=sm]/menu-button` but no `sm` size exists in `sidebarMenuButtonVariants` (only `default` and `lg`). This is dead CSS selector.

**Why:**
The `sm` size was removed but the selector was forgotten.

**Recommendation:**
Remove the dead selector:
```tsx
// Remove:
"peer-data-[size=sm]/menu-button:top-1"
```

**Priority:** P3

---

### [P3] Inconsistent Transition Durations

**Category:** Visual Consistency  
**Location:** Multiple components

**Problem:**
Animation durations vary without rationale:

| Component | Duration |
|-----------|----------|
| Dialog | 150ms |
| Sheet | 200ms |
| Dropdown | 100ms |
| Button | Not specified (browser default) |
| Accordion | Not specified |

**Why:**
Each component was built independently without a shared motion system.

**Recommendation:**
Define motion tokens in `globals.css`:
```css
--duration-fast: 100ms;
--duration-base: 150ms;
--duration-slow: 200ms;
```

And use them consistently:
- Micro-interactions (hover, focus): `var(--duration-fast)`
- State changes (toggle, expand): `var(--duration-base)`
- Page transitions: `var(--duration-slow)`

**Priority:** P3

---

### [P3] Skip Link Hidden Behind Sidebar

**Category:** Accessibility  
**Location:** `app/(dashboard)/layout.tsx`

**Problem:**
The skip link at `focus:top-4 focus:left-4` appears at the left edge of the viewport, but the sidebar is at `left: 0` with `width: 16rem`. When sidebar is open, the skip link is hidden behind it.

**Why:**
Skip link positioning doesn't account for sidebar state.

**Recommendation:**
Either:
1. Move skip link to `top-4 left-[17rem]` when sidebar is open
2. Or use the sidebar's `onOpenChange` to temporarily close it on skip link activation
3. Or position skip link at `top-4 left-4` but with `z-[var(--z-sidebar)+1]`

**Priority:** P3

---

### [P3] Double-Bezel-Card Dynamic Classes Won't Work

**Category:** Bug  
**Location:** `double-bezel-card.tsx`

**Problem:**
`` `rounded-[${radius}]` `` uses template literals in Tailwind class names. Tailwind v4 does NOT detect dynamic class names at build time. If `radius` is not the default `"2rem"`, the class won't be generated.

**Why:**
Dynamic class construction doesn't work with Tailwind's static analysis.

**Recommendation:**
Use inline `style` for dynamic values:
```tsx
<div style={{ borderRadius: radius }}>
  {children}
</div>
```

Or use a safelist of known radius values.

**Priority:** P3

---

### [P3] File Input Height Misalignment

**Category:** Visual  
**Location:** `input.tsx`

**Problem:**
`file:h-9` (36px) inside an `h-11` (44px) input creates visual misalignment — the file button is shorter than the input field.

**Why:**
The file input pseudo-element has its own height that doesn't match the parent.

**Recommendation:**
Use `h-full` for the file button:
```tsx
"file:h-full ..."
```

Or remove explicit height and let it fill naturally.

**Priority:** P3

---

## 5. Low Issues (P4 — Polish)

### [P4] Marketing Header Button Hierarchy Inconsistency

**Category:** Visual Consistency  
**Location:** `marketing-header.tsx`

**Problem:**
"Sign up" uses `size="lg"` while "Login" uses `size="sm"` — the primary action (Sign up) should be more prominent, but the size difference is jarring.

**Recommendation:**
Use `size="default"` for both, but differentiate via variant:
- Sign up: `variant="default"` (filled)
- Login: `variant="ghost"` (text only)

**Priority:** P4

---

### [P4] Gender Select Limited Options

**Category:** UX / Inclusion  
**Location:** `signup-form.tsx`

**Problem:**
Gender Select only has MALE/FEMALE — no non-binary, prefer-not-to-say, or other option. This is exclusionary.

**Recommendation:**
Add options:
```tsx
<SelectItem value="MALE">Male</SelectItem>
<SelectItem value="FEMALE">Female</SelectItem>
<SelectItem value="NON_BINARY">Non-binary</SelectItem>
<SelectItem value="PREFER_NOT_TO_SAY">Prefer not to say</SelectItem>
```

Or make the field optional with "(Optional)" in the label.

**Priority:** P4

---

### [P4] Auth Layout Logo Not Linked

**Category:** UX  
**Location:** `app/(auth)/layout.tsx`

**Problem:**
The Logo component is rendered but not wrapped in a link — users can't click the logo to go home.

**Recommendation:**
```tsx
<Link href="/" aria-label="Go to homepage">
  <Logo />
</Link>
```

**Priority:** P4

---

### [P4] Reset Password Page Has No Back Link

**Category:** UX  
**Location:** `app/(auth)/reset-password/page.tsx`

**Problem:**
Users who arrive at this page by mistake (or whose token expired) have no way to navigate back to login without using the browser back button.

**Recommendation:**
Add a "Back to login" link at the bottom of the page.

**Priority:** P4

---

### [P4] Settings Sign-Out Button at Bottom

**Category:** UX / Safety  
**Location:** `app/(dashboard)/settings/page.tsx`

**Problem:**
The sign-out button is at the very bottom of the settings page, which is:
- Hard to find (users expect it in the header or sidebar)
- Dangerous (accidental clicks when scrolling to bottom)

**Recommendation:**
Move sign-out to:
1. The sidebar footer (already exists in `app-sidebar.tsx`)
2. Or a "Danger Zone" section at the bottom with visual separation
3. Or remove from settings entirely if it's in the sidebar

**Priority:** P4

---

### [P4] No Warehouse Empty State Duplicated

**Category:** Code Quality / UX  
**Location:** 8+ dashboard pages

**Problem:**
The "No warehouse yet" empty state is copy-pasted across all dashboard pages with slightly different descriptions. This creates maintenance burden and potential inconsistency.

**Recommendation:**
Create a shared `<NoWarehouse />` component:
```tsx
// components/shared/no-warehouse.tsx
export function NoWarehouse({ description }: { description?: string }) {
  return (
    <EmptyState
      icon={Warehouse}
      title="No warehouse yet"
      description={description ?? "Create or join a warehouse to get started."}
      primaryAction={{ label: "Create Warehouse", href: "/onboarding/create" }}
      secondaryAction={{ label: "Join Warehouse", href: "/onboarding/join" }}
    />
  );
}
```

**Priority:** P4

---

## 6. UI/UX Removal Recommendations

### Remove: Dashboard Quick Actions at Bottom

**Category:** UX / Information Architecture  
**Location:** `app/(dashboard)/dashboard/page.tsx:419-439`

**Problem:**
Three `variant="outline"` buttons (Stock Movements, Products, Analytics) are at the very bottom of the dashboard. These are primary actions but are styled as secondary and placed where users rarely scroll.

**Why:**
They were added as an afterthought, not as part of the information architecture.

**Recommendation:**
Remove these buttons from the bottom. Users already have:
- Sidebar navigation to all these pages
- Stat cards that are clickable (link to the relevant page)
- Command menu (⌘K) for quick navigation

If quick actions are needed, place them as a **floating action button** or in the **page header** — not at the bottom.

**Priority:** P3

---

### Remove: Duplicate Sign-Out in Settings

**Category:** UX / Redundancy  
**Location:** `app/(dashboard)/settings/page.tsx`

**Problem:**
Sign-out button appears in both Settings AND the sidebar footer. This is redundant and creates maintenance burden.

**Why:**
Sign-out was added to settings before the sidebar footer existed.

**Recommendation:**
Remove from Settings. Keep only in the sidebar footer where users expect it.

**Priority:** P3

---

### Remove: Button Hover Scale Animation

**Category:** UX / Visual  
**Location:** `button.tsx`

**Problem:**
`hover:scale-[1.02]` causes visual jitter and makes adjacent buttons appear misaligned. The "delight" it adds is outweighed by the visual instability.

**Why:**
Added for "premium feel" but creates a "cheap" feel due to jitter.

**Recommendation:**
Remove hover scale entirely. Keep only `active:scale-[0.98]` for press feedback. Rely on background color change for hover feedback.

**Priority:** P3

---

## 7. UI/UX Addition Recommendations

### Add: Global Reduced Motion Override

**Category:** Accessibility  
**Location:** `globals.css`

**Problem:**
No global mechanism to disable animations for users who need it.

**Recommendation:**
Add to `globals.css`:
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

This single addition fixes ALL components at once.

**Priority:** P2

---

### Add: Shared `NoWarehouse` Component

**Category:** Code Quality / UX  
**Location:** `components/shared/no-warehouse.tsx`

**Problem:**
"No warehouse" empty state duplicated across 8+ pages.

**Recommendation:**
Create a shared component (see P4 section above) and use it everywhere.

**Priority:** P3

---

### Add: Page-Level Loading States for Marketing

**Category:** UX  
**Location:** `app/(marketing)/`

**Problem:**
Marketing pages have no loading state — navigation between pages shows a blank screen until data loads.

**Recommendation:**
Create `loading.tsx` files for each marketing route:
```tsx
// app/(marketing)/features/loading.tsx
export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-8 w-48" />
      <div className="grid gap-6 md:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-64" />
        ))}
      </div>
    </div>
  );
}
```

**Priority:** P3

---

### Add: Confirmation for Destructive Actions in Settings

**Category:** UX / Safety  
**Location:** `app/(dashboard)/settings/page.tsx`

**Problem:**
Sign-out and other destructive actions have no confirmation step.

**Recommendation:**
Add a confirmation dialog for sign-out:
```tsx
<AlertDialog>
  <AlertDialogTrigger asChild>
    <Button variant="outline">Sign out</Button>
  </AlertDialogTrigger>
  <AlertDialogContent>
    <AlertDialogHeader>
      <AlertDialogTitle>Sign out?</AlertDialogTitle>
      <AlertDialogDescription>
        You will need to sign in again to access your warehouse.
      </AlertDialogDescription>
    </AlertDialogHeader>
    <AlertDialogFooter>
      <AlertDialogCancel>Cancel</AlertDialogCancel>
      <AlertDialogAction onClick={signOut}>Sign out</AlertDialogAction>
    </AlertDialogFooter>
  </AlertDialogContent>
</AlertDialog>
```

**Priority:** P3

---

### Add: Skeleton Loading for Invite Page

**Category:** UX  
**Location:** `app/invite/[token]/page.tsx`

**Problem:**
The invite page shows nothing while the RPC call is processing — user sees a blank page.

**Recommendation:**
Add a loading state:
```tsx
// app/invite/[token]/loading.tsx
export default function Loading() {
  return (
    <div className="flex flex-col items-center gap-4 py-10">
      <Skeleton className="size-14 rounded-full" />
      <Skeleton className="h-6 w-48" />
      <Skeleton className="h-4 w-64" />
    </div>
  );
}
```

**Priority:** P3

---

## 8. Priority Roadmap

### Phase 1 — Critical Fixes (Week 1)

| Task | Effort | Impact |
|------|--------|--------|
| Add global `prefers-reduced-motion` override | 30 min | High |
| Increase icon button touch targets to 36px+ | 1 hour | High |
| Add `aria-live="polite"` to all status regions | 1 hour | High |
| Fix button labels (Continue → Sign in, etc.) | 30 min | High |
| Increase Sheet overlay to `bg-black/40` | 15 min | Medium |

### Phase 2 — High Fixes (Week 2)

| Task | Effort | Impact |
|------|--------|--------|
| Increase `text-xs` to `text-sm` for errors/data | 1 hour | High |
| Add tooltip delay (250ms) | 15 min | Medium |
| Fix placeholder contrast | 30 min | Medium |
| Fix skip link positioning | 30 min | Medium |
| Fix Sheet rounded corners | 30 min | Medium |

### Phase 3 — Medium Fixes (Week 3)

| Task | Effort | Impact |
|------|--------|--------|
| Remove dashboard quick actions from bottom | 15 min | Medium |
| Remove duplicate sign-out from settings | 15 min | Medium |
| Remove button hover scale | 15 min | Medium |
| Create shared `NoWarehouse` component | 1 hour | Medium |
| Add marketing loading states | 1 hour | Medium |

### Phase 4 — Polish (Week 4)

| Task | Effort | Impact |
|------|--------|--------|
| Add gender options to signup | 30 min | Low |
| Link auth layout logo | 15 min | Low |
| Add back link to reset password | 15 min | Low |
| Fix double-bezel-card dynamic classes | 30 min | Low |
| Standardize transition durations | 1 hour | Low |

---

## 9. Quick Wins (High Impact, Low Effort)

| # | Change | Impact | Effort |
|---|--------|--------|--------|
| 1 | Add global reduced motion override | High | 30 min |
| 2 | Increase Sheet overlay to `bg-black/40` | Medium | 15 min |
| 3 | Fix button labels (Continue → Sign in) | High | 30 min |
| 4 | Add tooltip delay (250ms) | Medium | 15 min |
| 5 | Remove button hover scale | Medium | 15 min |
| 6 | Remove dashboard quick actions from bottom | Medium | 15 min |
| 7 | Remove duplicate sign-out from settings | Medium | 15 min |
| 8 | Link auth layout logo | Low | 15 min |

---

## 10. Final Verdict

### What's Already Good

1. **Design Token System** — Comprehensive CSS variable system with WCAG AA contrast
2. **PanelCard** — Unified card surface with 4 padding tiers
3. **FormField** — Consistent form field pattern with error/hint support
4. **StatusBadge** — Never color-only, always icon + text
5. **Focus States** — Consistent `focus-visible:ring-3 focus-visible:ring-ring/50`
6. **Touch Targets** — Most interactive elements use `min-h-11` (44px)
7. **Loading States** — Good `disabled` + spinner + text change pattern
8. **Error Handling** — Consistent `role="alert"` + `aria-invalid` + `aria-describedby`
9. **i18n** — Full EN/ID translation infrastructure
10. **Self-Hosted Fonts** — Good for offline build robustness

### What's Worst

1. **Icon Button Touch Targets** — 24-28px fails WCAG 2.5.8
2. **Missing Reduced Motion** — Only 2/15+ components respect it
3. **Small Font for Errors** — `text-xs` for validation messages
4. **Inconsistent Button Labels** — "Continue" instead of "Sign in"
5. **Sheet Overlay Too Light** — 10% vs Dialog's 50%

### What's Most Urgent

1. Add global `prefers-reduced-motion` override (fixes 13 components at once)
2. Increase icon button touch targets to 36px+
3. Add `aria-live="polite"` to all status regions
4. Fix button labels for clarity

### Is It Production-Ready?

**Yes, with caveats.** The UI/UX foundation is solid and the app is usable. The main blockers for production are:
- Touch target compliance (WCAG 2.5.8)
- Reduced motion support (WCAG 2.3.3)
- Status message announcements (WCAG 4.1.3)

After fixing these 3 items, the app meets WCAG AA standards.

### What Would Make It Look More Professional

1. **Consistent motion** — Standardize transition durations
2. **Larger touch targets** — 44px minimum everywhere
3. **Better error typography** — `text-sm` minimum for errors
4. **Cleaner button hierarchy** — Remove scale animations, use variant for hierarchy
5. **Proper modal perception** — Darker Sheet overlay

---

**Audit Completed:** 2026-08-31  
**Total Issues Found:** 30  
- P1 (Critical): 3
- P2 (High): 5
- P3 (Medium): 8
- P4 (Low): 7
- Removal: 3
- Addition: 5
