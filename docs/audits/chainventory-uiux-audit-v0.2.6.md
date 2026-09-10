# Chainventory — UI/UX Audit Report (Bug-Focused)
**Version:** 0.2.x baseline  
**Scope:** Buttons, controls, forms, dialogs, and dashboard interactions  
**Stack confirmed:** Next.js 16 + React 19, `@base-ui/react` (shadcn-style API, Base UI under the hood), Tailwind v4, `lucide-react`, `motion`, `recharts`, `fumadocs-ui` for /docs only. **Not** the shadcn/ui runtime you may remember.

> Severity legend: **HIGH** = broken/lying state or lost data · **MEDIUM** = confusing UX flow · **LOW** = polish.

---

## A. Verified bugs (with file:line, code referenced)

### A1. **[HIGH] Stale `searchInput` after warehouse switch** — `components/inventory/products-page.tsx:125`
`const [searchInput, setSearchInput] = React.useState(query)` initializes only on mount. When `switchWarehouse()` updates the URL, `query` prop may now point at a different warehouse but `searchInput` still holds the previous warehouse's search string. The debounced effect at line 293 then re-applies that stale text against the new warehouse. The user sees "X results" that don't match what they typed.
**Fix:** add `React.useEffect(() => setSearchInput(query), [query, warehouseId])`.

### A2. **[HIGH] Selection state leaks across warehouses** — `components/inventory/products-page.tsx:151-164`
`selected: Set<string>` of product IDs is never cleared on warehouse change. The sticky "X selected" bar at the bottom (line ~700) carries IDs from the previous warehouse that may not even exist in the new one. The badge count is misleading and `bulkArchiveSelected` could archive nothing or archive cross-tenant data.
**Fix:** `clearSelection()` inside an effect keyed on `warehouseId`.

### A3. **[HIGH] `busyProof` reset before API resolves, no in-flight guard** — `components/blockchain/blockchain-page.tsx:152-172`
```
const result = await retryProof(proof.id);
setBusyProof(null);   // ← released BEFORE router.refresh()
if (result.ok) { ... router.refresh(); }
```
The "if (busyProof) return" guard at line 153 prevents double-click only if the call hasn't fired yet. Because `setBusyProof(null)` runs immediately after the await resolves (before `router.refresh()` completes), the next render's Retry icon stops spinning while the network round-trip and page revalidation are still ongoing. Visually misleading: user thinks retry finished but the row still shows old status.
**Fix:** only release `busyProof` in a `finally`, and await `refreshProofsSafe()` before/after `router.refresh()`.

### A4. **[HIGH] `pendingCount` math includes unknown statuses** — `components/blockchain/blockchain-page.tsx:180-181`
```
pendingCount = proofsState.length - confirmedCount - failedProofs.length;
```
This is "anything that isn't confirmed/failed/manual_review", not actually pending. If a proof is in an unexpected status (e.g. queued for retry), it silently inflates the "pending" badge.
**Fix:** `pendingCount = proofsState.filter(p => p.status === "pending").length`.

### A5. **[HIGH] Members "Approve" button has no busy indicator** — `components/members/members-page.tsx:488-495`
While `processing.has(request.requestId)`, the button is `disabled` but the `<Check />` icon does not swap to `<Loader2 className="animate-spin" />`. Users double-click (no-op the second) because nothing tells them the click registered. Same for Reject (lines 496-504).
**Fix:** render `<Loader2 />` when `busy`.

### A6. **[HIGH] Members role-change race condition** — `components/members/members-page.tsx:227-253, 573-595, 711-731`
`handleRoleChange` mutates the `changing` Set then `await`s the server. The `<SelectTrigger disabled>` only blocks visual interaction, not the data layer. A second `onValueChange` fired from keyboard / programmatic event during the in-flight window will still call `handleRoleChange` again and overwrite the role to whatever the user most recently picked. No early-return guard.
**Fix:** `if (changing.has(member.membershipId)) return;` at the top of `handleRoleChange`.

### A7. **[HIGH] `notifications-page` "Mark all read" lacks busy guard** — `components/notifications/notifications-page-view.tsx:177-242`
`handleMarkAllRead` does the round-trips without any `busy` flag. Double-click during the await triggers two `markNotificationsRead` calls (idempotent but wasteful) and re-renders twice. Same pattern as A5 — there is no spinner.
**Fix:** `const [marking, setMarking] = useState(false)` + swap icon to `<Loader2 />` while true.

### A8. **[MEDIUM] `notification-bell` `unreadRef` race** — `components/notifications/notification-bell.tsx:206-225`
Clicking a row updates `unreadRef.current = Math.max(0, unreadRef.current - 1)`. The effect at ~64 re-mirrors `unreadRef` to `unreadCount`. Two rapid clicks decrement twice from the same baseline because the effect hasn't caught up. Counter becomes wrong.
**Fix:** decrement based on `unreadCount` state (closure value) rather than ref, or coalesce decrements.

### A9. **[MEDIUM] Console "Confirm retry" icon spin is scoped wrong** — `components/console/developer-console.tsx:271-289`
`cn(busyId !== null ? "animate-spin" : undefined)` spins the RefreshCw icon **whenever any busy op is in flight**, not only when this specific retry is in flight. With several cards each triggering async ops, the wrong card's icon spins.
**Fix:** gate spin on `busyId === proof.id`.

### A10. **[MEDIUM] `transfer-ownership-dialog` no spinner icon** — `components/members/dialogs/transfer-ownership-dialog.tsx:122-124`
Submit shows text "Transferring…" but no `Loader2` icon. Inconsistent with every other async submit in the codebase (which uses `<Loader2 className="animate-spin" />`).
**Fix:** swap icon while `busy`.

### A11. **[MEDIUM] Sidebar warehouse switcher has no transition / busy state** — `components/layout/app-sidebar.tsx:148`
`onClick={() => switchWarehouse(w.id)}` calls `router.replace(switchWarehouseUrl(...))` but the dropdown stays open and items stay clickable until navigation completes. A user can rapidly click multiple warehouses and fire multiple navigations.
**Fix:** wrap in `startTransition` and either disable items during `isPending` or close the menu before navigation.

### A12. **[MEDIUM] Dashboard "Go to dashboard" size inconsistency** — `app/invite/[token]/page.tsx:76-81` vs onboarding flows
Invite success uses default `size` for "Go to dashboard"; `create-warehouse-form.tsx:555-561` and `join-warehouse-form.tsx:268-274` use `size="lg"`. Same semantic CTA, different visual prominence.

### A13. **[MEDIUM] "Transfer Ownership" verb — two variants** — `components/members/members-page.tsx:279-282` (outline) vs `components/members/dialogs/leave-warehouse-dialog.tsx:84-87` (default)
Same action rendered with different button variants depending on which surface the user is on.

### A14. **[MEDIUM] "Mark all read" — two variants** — `components/notifications/notifications-page-view.tsx:234-242` (outline) vs `components/notifications/notification-bell.tsx:304-313` (ghost)
Same action, different visual weight.

### A15. **[MEDIUM] `switchWarehouseUrl` preserves status/q/type/proof across warehouse switches** — `lib/warehouses/warehouse-url.ts:14-18`
By design, but combined with no UI to "clear filter" inside the empty state, it produces confusing "No products found" screens when a filter that was relevant to warehouse A is meaningless to warehouse B. Recommendation: at minimum, products page should auto-reset `status` to `active` when warehouse changes.

### A16. **[MEDIUM] No manual refresh button on Blockchain Proofs** — `components/blockchain/blockchain-page.tsx`
Users have only realtime + page reload. There is a `refreshProofsSafe` already declared (line 110) but never wired to a button.

### A17. **[MEDIUM] `TopProducts` empty state missing** — `app/(dashboard)/analytics/page.tsx:143-150`
Card renders the title but the content is just `products={[]}` with no inline "No products in this range" empty state.

### A18. **[MEDIUM] Console dependency/treasury fetch failures show empty silently** — `components/console/developer-console.tsx:74-94`
On catch, dependencies become `[]` and treasury becomes `null`. No error banner — user can't distinguish "service down" from "no data".

### A19. **[MEDIUM] `BulkAddDialog` "Review errors" label is misleading** — `components/inventory/bulk-add-dialog.tsx:428`
When the row has errors the button text says "Review errors"; clicking returns to the edit step where errors are no longer visible. User expects to *see* the errors.

### A20. **[MEDIUM] Members role-change Select fires immediately with no confirm** — `components/members/members-page.tsx:573-595`
Picking a new role in the dropdown fires `changeMemberRole` instantly with no confirm step. Demoting a manager is one keystroke away.

### A21. **[MEDIUM] Settings `NotificationPreferences` rendered even when no warehouse** — `app/(dashboard)/settings/page.tsx:268`
Notification prefs apply to the user, not to a warehouse, so this is technically OK, but rendering it on the "no warehouse" empty-state page is confusing.

### A22. **[LOW] Several buttons disabled with no inline reason** — no explanation tooltip on:
- `components/inventory/movements-page.tsx:365-379` (Stock In/Out — `disabled={suspended}`)
- `components/inventory/movements-page.tsx:328-344` (Adjustment/Reversal dropdown items)
- `components/warehouses/create-warehouse-form.tsx:609-617` ("Try Again" — `disabled={!ready || !authenticated}`)
- `components/warehouses/join-warehouse-form.tsx:329-336` (same)

A `<Tooltip>` or visible helper text would help. Banner above the actions partially covers it but the affordance itself gives no cue.

### A23. **[LOW] `products-page` bulk-archive confirm copy stale** — `components/inventory/products-page.tsx:725-730`
While `bulkBusy`, button label still says "Archive products" rather than "Archiving…". Minor copy inconsistency (the rest of the codebase swaps labels).

### A24. **[LOW] `Pagination` deep-link to empty page** — `components/transactions/transactions-page.tsx:403-409`
Hides pagination when `totalPages <= 1`. If user deep-links to `?page=5` and filter yields no rows, no UI to recover except clearing URL manually.

### A25. **[LOW] `analytics/range-tabs` no busy state on navigation** — `components/analytics/range-tabs.tsx:34-55`
Tabs are `<Link>`s. Click navigates server-side; no `Loader2` swap. Inconsistent with products-page which does swap a spinner during transition.

### A26. **[LOW] `movements-page` "loadError" branch hides retry on data** — `components/inventory/movements-page.tsx:678-687`
The `<ErrorState>` shown after data has been rendered replaces the LoadMore footer, removing the user's way to retry loading more.

### A27. **[LOW] `products-page` `stockTarget` not reset on warehouse change** — `components/inventory/products-page.tsx:677-688`
A pending stock dialog can carry a product from the previous warehouse into the new one.

### A28. **[LOW] Members empty state has no invite CTA for owners** — `components/members/members-page.tsx:514-519`
When `members.length === 0` and `canInvite` is true, the empty-state has no Invite button (the invite code section is always rendered above, so this is partially addressed — but the empty state stands alone visually).

### A29. **[LOW] Toast close button has redundant aria + sr-only** — `components/ui/toast.tsx:118-138`
`aria-label="Close toast"` + `<span class="sr-only">Close</span>` both label the same control. Harmless but redundant.

---

## B. Buttons that look too small or inconsistent (you asked specifically)

Verified the project's `min-h-11` discipline is followed almost everywhere. The exceptions worth touching:

| Location | Size | Issue |
|---|---|---|
| `components/shared/pagination.tsx:28-43` | `size="sm"` (h-9) | Below project norm; OK for compact toolbars but inconsistent with other nav controls. |
| `components/shared/display-name-editor.tsx:69-77` | `size="icon-sm"` (28px) | Hit area is expanded via `before:-inset-[9px]`, but the visible icon is small. |
| `components/inventory/products-page.tsx:330-338` (search clear X) | `size-7` with `-inset-2` | Hit area ~30px without expansion; borderline for touch. |
| `components/inventory/movements-page.tsx:317-323` (more movement types) | uses default h-11 | Actually fine — verify on mobile. |

No button below 32px without justified expansion was found.

---

## C. Project-level UI/UX suggestions

### C1. **Add a `<RefreshButton>` primitive** (penambahan)
Every list page (products, movements, members, transactions, blockchain, console) re-implements "fetch latest" ad-hoc. Add a shared `<RefreshButton onRefresh={fn} />` in `components/shared/` that:
- shows `<Loader2 animate-spin />` while `pending`
- accepts `aria-label="Refresh"` and optional visible label
- is reused by console cards, blockchain header, etc.

### C2. **Wrap warehouse switch in a `useTransition` everywhere** (perbaikan)
`app-sidebar.tsx`, `site-header.tsx`, `blockchain-page.tsx`, `analytics-controls.tsx`, every page-level warehouse Select. Currently inconsistent: some pages do, some don't. Standardize.

### C3. **Standardize destructive-confirm variant** (perbaikan)
`product-dialogs.tsx` uses `destructive` for archive, `reject-join-dialog.tsx` uses `destructive`, but `movements-page.tsx` approve uses `default`. Adopt: any action that mutates committed stock uses `destructive`.

### C4. **Add `clearSelection()` + sync `searchInput` on warehouse change** (perbaikan — fixes A1 + A2)
A small `useEffect` keyed on `warehouseId` in `products-page.tsx` to reset both search input and selection. Single utility could be extracted.

### C5. **Empty-state differentiation** (perbaikan)
The shared `<EmptyState>` should accept a `filterActive?: boolean` prop and, when true, render a "Clear filter" pill so users don't think the system is empty.

### C6. **Refactor `switchWarehouseUrl` policy** (perbaikan)
Add a per-page opt-in: products page resets `status` to `active` when warehouse changes; movements resets `type` filter; etc. Centralize the rule in `lib/warehouses/warehouse-url.ts`.

### C7. **Add an "Active filter chips" strip** (penambahan)
A small bar above lists showing currently-applied filters as removable chips. Solves "why am I seeing nothing?" without changing routing semantics.

### C8. **Confirm dialog for role change** (perbaikan)
Replace the immediate-fire `<Select>` in members-page with a `RoleChangeConfirmDialog`. Demoting/transferring should always have a confirm step.

### C9. **Remove redundant `<span class="sr-only">Close</span>` in `toast.tsx`** (perbaikan — A29)
The `aria-label` already covers it.

### C10. **Add a global "Refresh" affordance on console cards** (penambahan)
Each card (Treasury, Dependencies, Errors, Manual review) should have its own refresh button calling `loadLive()` / `refresh()`. Currently only realtime pushes drive them.

### C11. **Confirm-retry dialog should label-change** (perbaikan — A9)
While busy, swap `<RefreshCw />` + "Retry" for `<Loader2 />` + "Retrying…". Currently only the icon spins.

### C12. **Better empty states for TopProducts / Recent widgets** (penbaikan)
`RecentMovements`, `RecentTransactions`, `RecentActivity`, `TopProducts` all silently render nothing when empty. Define an inline empty copy.

### C13. **Audit `aria-busy` on async actions** (penbaikan)
Several components set `disabled` during async but never `aria-busy="true"`. Adding it improves assistive-tech feedback.

### C14. **Sidebar warehouse switcher loading state** (perbaikan — A11)
After click, the dropdown should close and a tiny inline spinner should show on the trigger until navigation completes.

### C15. **Remove `confirm-archive` archive button once user confirms** (perbaikan)
After successful bulk archive the sticky selection bar lingers. `clearSelection()` should fire on success.

### C16. **Blockchain proofs: render "showing 50 of N" notice** (perbaikan — A16 adjacent)
When `totalProofs > PROOF_LIMIT` (50), show a small notice. Currently the "total" badge and the visible list diverge silently.

### C17. **Notifications `unreadRef` → state** (perbaikan — A8)
Stop decrementing a ref. Use functional `setUnreadCount(prev => Math.max(0, prev - 1))` to avoid the race.

### C18. **Add `useEffect` for `setSearchInput(query)`** (perbaikan — A1)
2 lines of code, fixes the search-after-switch leak.

---

## D. Summary table

| Severity | Count | Items |
|---|---|---|
| HIGH | 7 | A1, A2, A3, A4, A5, A6, A7 |
| MEDIUM | 14 | A8, A9, A10, A11, A12, A13, A14, A15, A16, A17, A18, A19, A20, A21 |
| LOW | 8 | A22, A23, A24, A25, A26, A27, A28, A29 |

**No broken aria-labels** on icon-only buttons (every site audited has `aria-label`).  
**No dead `onClick` handlers** found.  
**No dangerously small buttons** (all hit areas ≥32px or properly expanded).  
**Form pending states** are correctly wired almost everywhere — the exception is `Mark all read`, Members Approve/Reject, and Transfer Ownership.

---

## E. What to tackle first (impact-ranked)

1. **A1 + A2 (products-page stale state)** — single 8-line `useEffect` clears two HIGH bugs.
2. **A3 (blockchain retry race)** — move `setBusyProof(null)` into `finally` and add `await refreshProofsSafe()`.
3. **A4 (pendingCount math)** — one-line fix.
4. **A5/A6/A7/A9 (no spinner / race in members + notifications + console)** — add `<Loader2>` swap and `if (busy.has(id)) return;` guards.
5. **A10/A11 (transfer dialog + sidebar)** — small icon swap + `startTransition`.
6. **C4 + C6 (warehouse-switch cleanup)** — systemic fix for "weird empty states after switching".
7. **C1 + C10 (shared Refresh primitive)** — eliminates duplicated code across 5+ files.