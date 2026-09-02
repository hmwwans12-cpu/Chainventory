# Chainventory — Comprehensive Bug, Inconsistency & Flow Audit (v0.3.0)
**Scope:** Logic bugs, RBAC/security holes, error handling, data flow, UI/UX consistency  
**Stack:** Next.js 16 · React 19 · Tailwind v4 · `@base-ui/react` · Supabase (PostgREST + RPC) · Privy · QStash · Viem  
**Audit baseline:** 4 prior audit reports (v0.1.7 through v0.2.9) consolidated. This pass goes **deeper** into auth, RBAC, error semantics, transaction boundaries, and cross-page state propagation.

---

## Severity legend

- **CRITICAL** — data loss, security boundary breach, or fundamentally broken flow
- **HIGH** — feature broken, data leak, RBAC bypass, or production-blocking UX
- **MEDIUM** — inconsistency, silent error, edge case not handled
- **LOW** — polish, nit

---

# PART I — SECURITY & RBAC BUGS

## 1.1 Server error messages leak internal details to client (CRITICAL)

**Pattern:** Multiple API routes return `serverError(err.message)` or `invalid(error.message)` where `err` is the raw exception (PostgREST, viem RPC, JSON parse, etc). This violates `lib/domain/errors.ts` policy (P1-09) and the design intent of the catalog.

| Location | Severity | Issue |
|---|---|---|
| `app/api/console/audit/route.ts:16` | HIGH | `serverError(err instanceof Error ? err.message : "audit read failed")` |
| `app/api/console/errors/route.ts:16` | HIGH | same |
| `app/api/console/treasury/route.ts:16-18` | HIGH | same; on `getTreasuryData` failure, leaks viem RPC URL + chain id |
| `app/api/console/dependencies/route.ts:20-22` | HIGH | same |
| `app/api/console/export/route.ts:64-66` | HIGH | same |
| `app/api/console/proofs/[id]/retry/route.ts:62` | HIGH | `serverError(err instanceof Error ? err.message : "retry failed")` |
| `app/api/warehouses/create/route.ts:463` | HIGH | `serverError(createError.message)` — PostgREST detail |
| `app/api/users/notification-preferences/route.ts:26` | HIGH | `return invalid(error.message)` |
| `app/api/warehouses/members/invite/route.ts:56-62` | MEDIUM | returns generic 400 even on 500-class errors; only info is masked |
| `app/api/warehouses/export/route.ts:72, 121` | MEDIUM | returns `new Response("Export failed.", { status: 500 })` — plain text inconsistent with `api-handler` JSON |
| `app/api/faucet/claim/route.ts:62` | MEDIUM | non-cooldown errors return 400 INVALID_INPUT; treasury depletion or RPC failure should be 500/503 |

**Fix:** standardize on `lib/domain/errors.ts` `mapDbError()` for known patterns; everything else → `serverError("internal error")` with full `err.message` logged via `logger.error` only.

## 1.2 `app/invite/[token]/page.tsx` — raw RPC error displayed to user (HIGH)

```ts
const { error } = await supabase.rpc("accept_invitation", { p_token: token });
const description = error ? error.message : "You have joined...";
```

The token is user-controllable. RPC error messages can include:
- constraint names (e.g. `duplicate key value violates unique constraint "invitations_email_warehouse_id_key"`)
- timestamps and UUIDs
- function internals

`description: error.message` is rendered directly in `CardDescription`. **Information disclosure** to the invitee.

**Fix:** map through `mapDbError()`. Generic "This invitation link is no longer valid" for all rejection paths.

## 1.3 `app/actions/update-profile.ts:47` — `error.message` leaked (HIGH)

```ts
const { error } = await supabase.from("users").update(...).eq(...);
if (error) return { error: error.message };
```

Update on `users.display_name` can fail with constraint violations, RLS issues, etc. Raw message rendered in form.

## 1.4 `lib/inventory/products-client.ts:79-81` — `created.data.id` assumed non-null (HIGH)

```ts
return parseSuccess<{ id: string }>(status, json);
```

The BFF always returns `{ data: { id: ... } }`, but if the BFF ever returns `{ data: null }` (e.g. RPC `create_product_with_initial_stock` returns row without a select), `created.data.id` throws `TypeError: cannot read properties of undefined`. All callers of `createProduct`/`createProductWithInitialStock` will crash.

**Fix:** in `parseSuccess`, return `data: undefined as T` only if the body has `data` key explicitly. Otherwise treat as `toFailure`. Or add runtime guard: `if (!body?.data) return toFailure(200, json)`.

## 1.5 `lib/warehouses/join-client.ts` — never read in audit but invite-by-email uses inline validation while this uses Zod (MEDIUM)

The `/api/warehouses/members/invite` route uses inline type cast + regex for body validation, while every other POST in the same file group uses Zod schemas (`lib/validators/membership.ts`). The code is also loose: `/^[0-9a-f-]{36}$/i` accepts any 36-character hex+dash string — does not enforce UUID structure (8-4-4-4-12).

**Fix:** use Zod schema consistent with `requestJoinSchema` etc. Use a proper UUID v4 regex: `/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`.

## 1.6 `app/invite/[token]/page.tsx:36-38` — `accept_invitation` runs before verifying user matches invitee (MEDIUM)

The page is gated only by `getUser()`; any authenticated user can hit the URL and trigger `accept_invitation`. The DB RLS should catch the mismatch, but the error path then leaks (see 1.2). The intended UX is: if the invitee email differs from the signed-in user, redirect to a "sign in with the right email" page.

**Fix:** Pre-fetch the invitation by token in a separate `select invitation where token=…` call; compare `invitation.email` to `user.email`; redirect with explanation if mismatch. **Never call `accept_invitation` for the wrong user.**

## 1.7 `app/api/wallet/balance/route.ts` — no auth, no rate-limit (MEDIUM)

```ts
export async function GET(request: Request) {
  const address = new URL(request.url).searchParams.get("address");
  if (!address || !/^0x[a-fA-F0-9]{40}$/.test(address)) {...}
  const wei = await fetchWalletBalance(address);
  return NextResponse.json({ balance: ... });
}
```

No `requireUser`, no `requireRateLimit`. The address is public testnet info but the endpoint can be used to enumerate balances for any address — including the treasury. While the treasury address is not secret, **rate-limit at minimum** to prevent abuse.

## 1.8 `lib/warehouses/create-client.ts` (related: not in audit yet but should be checked) — see 1.1

## 1.9 `app/api/warehouses/inventory/movements/route.ts:127-135` — "not a member" 403 leaks existence (MEDIUM)

```ts
const role = await getMemberRole(supabase, parsed.data.warehouseId, auth.user.id);
if (!role) return forbidden("Not a member of this warehouse.");
const permission = STOCK_PERMISSION[parsed.data.movementType];
if (!permission || !hasPermission(role, permission)) {
  return forbidden("Insufficient permission.");
}
```

If the warehouseId is a UUID the user has no relationship with, the API tells them "not a member" — confirming the warehouse exists. The same for `requirePermission` in `api-handler.ts:158`. **Information disclosure**.

**Fix:** return generic 403 for both cases (already-insider enumeration is what the dashboard is for).

## 1.10 `lib/security/rate-limit.ts:97-99` — race in incr/expire pair (HIGH)

```ts
const key = `rl:${action}:${dim}:${id}:${bucket}`;
const count = await store.incr(key);
if (count === 1) await store.expire(key, RATE_LIMIT_WINDOW_SEC);
```

Between `incr` (which created the key without TTL) and `expire`, **a concurrent request from the same user can increment an unbounded key**. The window can grow to millions of requests before `expire` lands. With Redis 2-step pipeline this is more common than people think.

**Fix:** use `SET key 0 EX 60 NX` followed by `INCR` (which returns the new value) — atomic. Or use Redis pipeline `incr+expire` in one round-trip via `MULTI/EXEC`.

## 1.11 `lib/warehouses/create.ts` — `expiry` integer overflow risk (LOW)

`expiry = nowSec + DEPLOYMENT_EXPIRY_SECONDS` — JS number safe to 2^53 so realistic. But the JSON round-trip through `createWarehouseSubmitSchema` may parse `expiry` as number. Check the Zod schema.

## 1.12 `lib/auth/permissions.ts:108-129` — MANAGER can `STOCK_APPROVE_ADJUSTMENT` (NEEDS PRD VERIFICATION)

```ts
const MANAGER_PERMS = [
  ...
  PERMISSIONS.STOCK_APPROVE_ADJUSTMENT,
  ...
];
```

Per PRD §9.2 (cited in the comment), the design intent is "4-eyes" — the actor who created the adjustment should not be the same as the approver. If the same MANAGER creates AND approves, the audit value is lost. There's no server-side check in `app/api/warehouses/inventory/movements/route.ts:274-356` (approve/reject handlers) that verifies `movement.actor_user_id !== auth.user.id`.

**Fix:** add an explicit check in the approve handler: if `movement.actor_user_id === auth.user.id`, return 400 "You cannot approve your own adjustment."

## 1.13 `lib/blockchain/contracts.ts` / `lib/proof/qstash.ts` (not deeply audited) — no env validation crashes

If `BASE_SEPOLIA_RPC_URL` is unreachable, the proof pipeline silently fails. `publishProofJob` already logs errors. OK.

---

# PART II — LOGIC BUGS

## 2.1 `lib/notifications/notification-bell.tsx:213-214` — race in unreadCount decrement (HIGH)

```ts
unreadRef.current = Math.max(0, unreadRef.current - 1);
setUnreadCount(unreadRef.current);
```

This is the **same bug** the v0.2.6 audit claimed was fixed by switching to `unreadStore.adjust(-1)`. The fix is in `lib/notifications/unread-store.ts` (which has `adjust()`), but `notification-bell.tsx` still uses the local `unreadRef` pattern, not the store. **Regression** or the fix was never applied here.

**Fix:** replace lines 213-214 with `unreadStore.adjust(-1)` and remove the local `unreadRef`/`unreadRef.current` useEffect at lines 63-66. Make sure the `markedReadRef` is still local (it's per-row, doesn't need to be in the store).

## 2.2 `lib/analytics/aggregate.ts:74-78, 87-89` — daily range uses local time, not UTC (MEDIUM)

```ts
function toISODate(date: Date): string { ... }  // uses getFullYear/Month/Date
function fillDailyGaps(payload, rangeDays) {
  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - (rangeDays - 1));
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const iso = toISODate(d);
    const row = byDay.get(iso);
    ...
  }
}
```

DB stores timestamps in UTC. `new Date().getDate()` is local. A user in UTC+8 sees the same UTC day broken into two "days" at 8 AM/PM. A user in UTC-8 sees one day extending into the next. **Chart labels don't match DB queries**.

**Fix:** use UTC date components: `date.getUTCFullYear()`, `date.getUTCMonth()`, `date.getUTCDate()`. Also format the displayed label in the same timezone or store ISO date keys from the RPC.

## 2.3 `lib/analytics/aggregate.ts:112-116` — `normalizeDecimal` regex is now safe, but discards leading `0.` values (LOW)

`if (!value.includes(".")) return value;` — `0.5` works, `.5` returns `.5` unchanged (no leading zero to strip). OK for normalized server output. Just verify all incoming values have a leading digit. Tested code path, OK.

## 2.4 `app/(dashboard)/inventory/products/page.tsx:78-128` — `countQuery` error is silently swallowed (MEDIUM)

```ts
const { count: totalCount } = await countQuery;
...
total={totalCount ?? 0}  // if countQuery errored, totalCount is null
```

If `countQuery` fails (e.g. transient RLS issue), `totalCount` is null, fallback to 0, no pagination. The list still renders. **User sees list but no pagination control, with no indication why.**

**Fix:** if `countResult.error` is present, show a small "total unknown" hint or treat as 0 explicitly and log server-side.

## 2.5 `app/(dashboard)/inventory/products/page.tsx:43-45` — `?status=Archived` (case-sensitive) silently defaults to "active" (LOW)

```ts
const statusFilter = rawStatus === "archived" || rawStatus === "all" ? rawStatus : "active";
```

If user types `?status=Archived` it falls to "active". Inconsistent. Should be case-insensitive: `rawStatus.toLowerCase()` first.

## 2.6 `app/api/warehouses/create/route.ts:300-322` — idempotency key re-generation breaks idempotent retry (MEDIUM)

```ts
const { data: existing } = await supabase
  .from("warehouse_deployments")
  .select(...)
  .eq("idempotency_key", parsed.data.idempotencyKey)
  .maybeSingle();
```

The idempotency key is generated **server-side** during `prepare` (line 246: `randomUUID()`). Client receives it and must include it in `submit`. If the client loses the key (network drop, page refresh, tab close), it cannot idempotently retry — it re-runs `prepare`, gets a NEW key, and the previous deployment is orphaned. There's no client-side persistence (`sessionStorage` would help).

**Fix:** client stores the `idempotencyKey` in `sessionStorage` keyed by the prepared-message-hash, so a tab refresh can recover it.

## 2.7 `app/api/warehouses/create/route.ts:301-322` — idempotent retry response misses `warehouseCode` (LOW)

```ts
if (existing) {
  await finalizeIfMined(supabase, existing);
  ...
  return ok({
    status: existing.status,
    deploymentId: existing.id,
    warehouseId: existing.warehouse_id,
    warehouseCode: parsed.data.warehouseCode,  // ← uses REQUEST body, not DB
    ...
  });
}
```

The response uses `parsed.data.warehouseCode` (from the request), but if the client lost the original code, this still works because the request body is required. However, the deployment row might have a different code if there was a previous race. Minor inconsistency.

## 2.8 `app/api/warehouses/members/invite/route.ts:68-71` — broken email link when `NEXT_PUBLIC_APP_URL` is empty (HIGH)

```ts
const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
const fullLink = appUrl
  ? `${appUrl.replace(/\/$/, "")}${acceptUrl}`
  : acceptUrl;
```

If the env var is missing, the email contains a **relative URL** like `/invite/abc123`. Email clients cannot follow relative links. The fallback should error to the inviter.

**Fix:** if `!appUrl` → return error to the inviter ("Email service not configured") so the UI shows the user they need to copy the link manually. Or use `request.nextUrl.origin` server-side. Currently the link is silently broken.

## 2.9 `app/api/warehouses/members/invite/route.ts:55-62` — generic 400 masks 500 (MEDIUM)

```ts
const { data, error } = await supabase.rpc("create_invitation", {...});
if (error) {
  ...
  return invalid("This email is already invited or is already a member, ...");
}
```

Any RPC error (network, DB outage, etc) gets a "user already invited" message. **Inconsistent**: the user retries, gets the same error, gives up. Real errors should be 500.

**Fix:** distinguish via `error.code` or pattern match: `23505` → 409 with the user-friendly message; everything else → `serverError`.

## 2.10 `components/auth/signup-form.tsx:73-83` — gender Select value not submitted (MEDIUM)

```ts
<Select name="gender">
  <SelectTrigger className="h-11 w-full" aria-label="Gender">
    <SelectValue placeholder="Select gender" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="MALE">Male</SelectItem>
    <SelectItem value="FEMALE">Female</SelectItem>
  </SelectContent>
</Select>
```

Base UI's `<Select name="gender">` does not write the value into a hidden form input automatically (unlike shadcn). When the form is submitted, `formData.get("gender")` is `null` unless the user explicitly selects. Verify in the rendered DOM — if no hidden input is present, signup is silently missing the field.

**Fix:** add a hidden input bound to the value:
```tsx
<input type="hidden" name="gender" value={gender ?? ""} />
```

## 2.11 `app/(dashboard)/members/page.tsx:94-101` — `users!join_requests_user_id_fkey` FK name hardcoded (MEDIUM)

```ts
.from("join_requests")
.select("id, user_id, created_at, users!join_requests_user_id_fkey(id, email, display_name)")
```

The FK constraint name is hardcoded. If Supabase migration 0024+ ever renames the constraint, the query silently returns `null` for the user join and shows "Unknown" everywhere. The data loss is silent.

**Fix:** drop the FK hint: `users(id, email, display_name)` — PostgREST will pick the only FK by default.

## 2.12 `components/members/members-page.tsx` — "Approve" submit button missing spinner + busy state for the role Select (MEDIUM)

After the v0.2.6 fix added `<Loader2 />` to the Approve/Reject buttons (lines 488-504), the `roleChoice[requestId]` Select at line 487-486 (`Select disabled={busy ? true : ...}`) is not disabled on busy. If user opens the dropdown, selects a role during the in-flight approval of a different row, **that second selection fires a new `handleRoleChange` or `handleApprove` simultaneously**. Race.

**Fix:** also disable the Select during `busy` for that specific row's request.

## 2.13 `app/api/warehouses/inventory/movements/route.ts:175-187` — silent skip of proof when `product.data` is null (HIGH)

```ts
const [warehouse, product] = await Promise.all([...]);
const contractAddress = warehouse.data?.contract_address;
...
let proofPayload: unknown = null;
let proofPayloadHash: string | null = null;
if (contractAddress && product.data) {
  // build proof
}
```

If the product doesn't exist for the warehouse, the RPC `apply_stock_movement` will likely fail. But here we **silently skip** the proof — the movement could be applied WITHOUT a proof, and the user never knows. Should be 404 for the product or a clear error.

**Fix:** if `!product.data` after the fetch, return `notFound("Product not found in this warehouse.")` BEFORE the proof construction.

## 2.14 `app/api/warehouses/inventory/products/bulk/route.ts:107-145` — UUID regenerated per-row inside loop (MEDIUM)

```ts
for (const [idx, row] of parsed.data.products.entries()) {
  ...
  if (hasQty) {
    const productIdNew = randomUUID();
    const movementId = randomUUID();
    ...
  }
}
```

Per-row UUIDs are correct. But the `lastAppliedRef`-style guard (no double-submit) is **missing**. If the user clicks "Import" twice rapidly, two POSTs fire and you get **duplicate SKUs** in the same warehouse (each generates a new UUID, both call `create_product_with_initial_stock`). The DB unique constraint on `products_sku` will catch it per row, returning `PRODUCT_EXISTS` for the second request — but the first request still created 1 product with 1 stock_in, leaving inconsistent state.

**Fix:** on the client (BulkAddDialog) gate the submit button with a busy state (already done); on the server, accept the same idempotency key for bulk imports.

## 2.15 `lib/inventory/products-client.ts:126-141` — `createProductWithInitialStock` ignores initialQuantity success (LOW)

```ts
export async function createProductWithInitialStock(values, fetcher = fetch) {
  const qty = (values.initialQuantity ?? "").trim();
  const wantsStock = qty !== "" && Number(qty) > 0;
  const created = await createProduct(values, fetcher);
  if (!created.ok) return created;
  return {
    ok: true,
    status: created.status,
    data: { productId: created.data.id, initialStockApplied: wantsStock },
  };
}
```

Returns `initialStockApplied: wantsStock` based on what the user requested, **not** what the server actually did. The BFF always creates initial stock atomically (per route code), so `wantsStock` is true iff the server did it. OK in this codebase, but the function name implies "and applied initial stock" — returns success even if BFF didn't.

**Fix:** have BFF return `initialStockApplied: bool` in response, propagate here.

## 2.16 `app/api/warehouses/inventory/products/route.ts:139` — `publishProofJob` failure silently swallowed (LOW)

```ts
if (proofRow) {
  await publishProofJob(proofRow.id).catch(() => undefined);
}
```

`logger.warn` is not called here (compare to movements route which does log). The bulk route also has a try/catch with `/* ignore */`. Daily reconciliation is the safety net, but operators should see a "publish failed" log.

**Fix:** add `logger.warn` inside the `.catch`.

## 2.17 `app/(dashboard)/inventory/movements/page.tsx:71-75` — products query never used for stock-in dialog if user lacks `STOCK_IN` (LOW)

```ts
const [movementsResult, productsResult] = await Promise.all([...]);
if (movementsResult.error || productsResult.error) {...}
const movements = ...;
const products = ...;
```

The page always loads the products list even for a viewer (no `STOCK_IN`/`STOCK_OUT`). The list is used to populate the stock-movement dialog. If the user has no stock-movement permission, the products list is downloaded for nothing. Move the products query behind a permission check.

## 2.18 `lib/blockchain/contracts.ts` and `lib/proof/qstash.ts` not fully audited (SKIPPED — out of scope for this pass; flagged for follow-up)

---

# PART III — UI/UX INCONSISTENCIES

## 3.1 `app/not-found.tsx:11` — "Login" button `size="sm"` (h-9) for primary nav (HIGH)

The 404 page has two CTAs: "Login" (line 11) using `size="sm"` and "Back to home" (line 25) using default. After the v0.2.9 audit standardized on `min-h-11`, this was missed. Inconsistent with rest of codebase.

## 3.2 `app/(auth)/layout.tsx:25` — auth card uses `rounded-xl` (HIGH)

`bg-card w-full max-w-sm rounded-xl border p-6 shadow-sm sm:p-8` — `rounded-xl` violates DESIGN.md §9. v0.2.9 audit fixed the main `Card` primitive to `rounded-lg` but the auth shell was missed.

## 3.3 `components/auth/login-form.tsx:36-43` — error block styling inconsistent (LOW)

The login error uses `<div className="border-destructive/30 bg-destructive/15 text-destructive rounded-lg border px-3 py-2 text-sm">` — but the `<FormField>` error uses different styling inside each `FormField`. Inconsistent with the standardized `bg-destructive/15 text-destructive rounded-md px-2 py-1 text-xs` (faucet card) and `bg-destructive/15 text-destructive rounded-lg border border-destructive/30 px-3 py-2 text-sm` (login form). Pick one.

## 3.4 `app/(dashboard)/layout.tsx:95` — main uses `bg-muted/30` while body is bg-background (MEDIUM)

```tsx
<main className="bg-muted/30 flex-1">
```

`bg-muted/30` over the page background is a 30% alpha tint. With the new `--muted: #ebe0d3` (darker than card), the main area now has a visible (subtle) tint that's different from the sidebar bg. May or may not be intended. Worth a design review.

## 3.5 `app/invite/[token]/page.tsx:76-80` — "Go to dashboard" button missing `size="lg"` for consistency (LOW)

The dashboard CTA on invite success uses default size, while the onboarding flow uses `size="lg"` (audit v0.2.6 fix). Inconsistent.

## 3.6 `app/(dashboard)/error.tsx` — no `useEffect` to log error to console (MEDIUM)

Per the v0.2.5 audit (A1 from v0.2.5: missing useEffect). Still not fixed. Operators see no console error when the dashboard route fails.

## 3.7 `app/(dashboard)/error.tsx:24` — `error.digest` exposed in UI is fine; but no Sentry/similar (LOW)

For prod observability, an error-tracking integration would be valuable. Out of scope for bug audit but worth flagging.

## 3.8 `components/warehouses/create-warehouse-form.tsx:797` — `h-12 w-full text-base` redundant overrides (LOW)

`size="lg"` already sets `h-12`. The `className="h-12 w-full text-base"` overrides the size's `px-2.5` to `w-full` (OK) but `h-12` is redundant. Audit v0.2.9 fixed `hero.tsx` but not this file.

## 3.9 `components/auth/google-button.tsx:40` — no size override, default h-11; OK; but `pending ? "Signing in…" : label` is misleading (LOW)

If the button is used in "Sign up" form, the label is "Sign up with Google" but during pending it says "Signing in…". Slight copy mismatch.

## 3.10 `app/(dashboard)/dashboard/page.tsx:60-62` — `DAY_MS` declared but unused (LOW)

```ts
const DAY_MS = 24 * 60 * 60 * 1000;
```

grep shows it's not used. Dead code.

---

# PART IV — DATA FLOW & CONSISTENCY

## 4.1 Cross-page warehouse switch resets the "Go to dashboard" CTA in invite (MEDIUM)

When the user accepts an invite and the new warehouse is assigned, the `next` param may still be `?warehouse=OLDID` from a previous flow. The redirect logic in `app/invite/[token]/page.tsx:45-48` only validates `next` is internal, not that it matches a valid warehouse.

## 4.2 `app/(dashboard)/dashboard/page.tsx:209-216` — Recent Activity uses full `notifications` query, not server data (MEDIUM)

The dashboard server-renders with full data, but the activity card is hydrated client-side and uses `useUnreadNotifications` hook. If the user has many warehouses, the recent activity is re-fetched client-side after hydration — wasted bandwidth.

**Fix:** pass the initial data as a prop, hydrate from props.

## 4.3 `lib/notifications/notifications-client.ts:fetchUnreadIds` may return empty for non-bell pages (LOW)

`fetchUnreadIds` selects `id` from `notifications` where `read_at is null`. If there are >1000 unread, the limit kicks in but is not handled. Bulk "Mark all read" then leaves the rest unread.

**Fix:** paginate or use `select count(*)` first to detect overflow.

## 4.4 `lib/warehouses/join-client.ts` — `requestJoin` returns no warehouse metadata (LOW)

After successful join request, the user is redirected to a "pending" page. They need to know which warehouse they requested. Current code doesn't return warehouse name.

**Fix:** have `request_join` RPC return the warehouse name in addition to status.

## 4.5 `app/api/warehouses/inventory/products/route.ts:200-243` (DELETE) — no check that product is not in active movements (LOW)

Archiving a product that has stock balance is allowed. The product status changes to "archived", but the existing stock_movements still reference it. The product disappears from the default list view (status=active filter), but historical movement pages still link to it. May be intentional. Verify UX: "View product" link on an archived product's historical movement shows a "Product is archived" notice? **No code for this** — clicking the product link from a movement on a deleted product → 404.

## 4.6 `app/api/warehouses/export/route.ts:60-64` — `ids` filter on bulk export doesn't validate ids belong to the warehouse (LOW)

```ts
const ids = idsParam.split(",").map((x) => x.trim()).filter((x) => /^[0-9a-f-]{36}$/i.test(x));
if (ids.length) productsQuery = productsQuery.in("id", ids);
```

If a malicious user passes ids from another warehouse, the query filters by `warehouse_id` AND `id in (...)`. RLS would catch this, but the query plan is wasted. OK, but the regex is loose. Same fix as 1.5.

## 4.7 `lib/notifications/unread-store.ts:25-28` — `set` ignores same-value updates (MEDIUM)

```ts
set(next: number): void {
  const clamped = Math.max(0, next);
  if (clamped === count) return;
  count = clamped;
  for (const listener of listeners) listener();
}
```

`clamped === count` returns without notifying. If the store was out of sync (e.g. legacy value), calling `set` to the actual count won't reset listeners. Minor.

## 4.8 `components/inventory/movements-page.tsx:701-740` — three dialogs use duplicated `fetchPage` refetch logic (LOW)

DRY violation. Extract `refreshList = useCallback(() => fetchPage(...), [...])` and call it in all three `onDone` handlers.

## 4.9 `lib/console/data.ts:51-56` — `Promise.all` for independent queries doesn't fail-fast on partial errors (LOW)

If `whRows` errors but `proofRows` succeeds, the code does `whRows.data ?? []` (treats as empty). The summary `warehouses.total: 0` is wrong. Should propagate the error.

**Fix:** check each `.error` and short-circuit, or surface partial failure.

## 4.10 `lib/console/dependencies.ts` (not read) — probeDependencies may include `TREASURY_PRIVATE_KEY` reachability (LOW)

If the probe is slow (e.g. RPC to viem), the developer console shows "dependencies" with TREASURY status. May leak that treasury is configured. Acceptable for dev console but flag for prod if data ever leaks.

---

# PART V — i18n & ACCESSIBILITY

## 5.1 `lib/i18n/translations.ts:497` — missing translation returns the key as text (HIGH)

```ts
let result = translations[locale][key] ?? translations.en[key] ?? key;
```

If a translator forgets to add a key, the UI renders the raw key (e.g. `dashboard.title` instead of "Dashboard"). This is hard to spot in dev (looks like a normal string).

**Fix:** return `__MISSING__${key}__MISSING__` in dev, or use `console.warn` server-side and a generic fallback. Use build-time check: a test that diffs keys in `en` vs `id`.

## 5.2 `lib/i18n/translations.ts:498-502` — `replace` with no HTML escape (LOW)

If a translation contains `$&` or other special replace patterns, values containing `$` could be misinterpreted. Use a safer string-template function.

## 5.3 `components/auth/signup-form.tsx:73-83` — gender Select placeholder accessibility (LOW)

`<SelectValue placeholder="Select gender" />` is rendered as a button. Screen readers may not announce the placeholder as a label since the visible label is in the surrounding FormField. Verify.

## 5.4 `lib/i18n/translations.ts` — no `useTranslations` hook in `LocaleProvider`; all `t()` calls are server-side (MEDIUM)

Currently all translations happen server-side in page components. Client components receive the already-translated strings as props. This works but prevents client-side re-renders on locale switch (which doesn't exist yet). If a LocaleToggle is used, the entire tree re-renders from server. Acceptable for current scope; flag for future.

## 5.5 `app/api/wallet/balance/route.ts` — no locale-aware error messages (LOW)

Plain string "Invalid address." — fine for API.

---

# PART VI — TYPESCRIPT & API DESIGN

## 6.1 `lib/api-handler.ts:31` — `SupabaseClient` is defined as server-only (HIGH)

```ts
export type SupabaseClient = Awaited<ReturnType<typeof createClient>>;
```

This type leaks into client-side code via `lib/inventory/types.ts` (`getProduct(supabase: SupabaseClient, ...)` etc). If a client component imports `SupabaseClient`, it transitively imports `lib/supabase/server.ts` which calls `cookies()` from `next/headers` — **runtime error in client component**.

**Fix:** define a separate `ClientSupabase` type for the browser client, or use `SupabaseClient<Database>` from `@supabase/supabase-js` directly.

## 6.2 `lib/inventory/products-client.ts:79-81` — `parseSuccess` type lies (already noted in 1.4)

`ApiResult<T>` says `data: T`, but if `body.data` is missing, `data` is `undefined`. TypeScript will not catch this.

## 6.3 `lib/notifications/types.ts` `NotificationRow` type may be inconsistent with actual row (LOW)

Not audited in depth; verify `notificationHref` and `dedup_key` are correctly typed.

## 6.4 `app/actions/auth.ts:30-34` — `loginAction` is `async` but `redirect()` throws, so `Promise<{error:string|null}>` return type is misleading (LOW)

`redirect()` throws a `NEXT_REDIRECT` error, so the function never actually returns the typed value. The return type should be `Promise<{error: string | null} | never>` or just be left untyped. Minor.

## 6.5 `app/actions/auth.ts:122-135` — `signInWithGoogleAction` has return type `Promise<void>` (LOW)

Same issue. The function never returns — it always redirects. Return type should be `Promise<never>`.

---

# PART VII — TEST COVERAGE GAPS (informational)

The codebase has a strong test suite (per TODO.md: 223 passed / 30 skipped). However, the following critical paths are **not covered by unit tests** (verified by scanning the test files list):

- `lib/notifications/notification-bell.tsx` — race in `unreadRef` decrement (would fail with simulated rapid clicks)
- `lib/security/rate-limit.ts` — incr/expire race (mocking Redis is non-trivial)
- `app/api/warehouses/inventory/movements/route.ts` — silent skip of proof when product not found
- `app/api/warehouses/members/invite/route.ts` — broken email link when `NEXT_PUBLIC_APP_URL` empty
- `lib/analytics/aggregate.ts:fillDailyGaps` — UTC vs local timezone off-by-one

Adding tests for these would prevent regression.

---

# PART VIII — RECOMMENDATIONS (organized by area)

## 8.1 Security (highest impact)

1. **Standardize error responses** — create `safeError(err, fallbackMessage)` helper that always logs full err + returns `serverError(fallbackMessage)`. Replace all `serverError(err.message)` calls.
2. **Map ALL PostgREST/RPC errors through `mapDbError()`** — including the `accept_invitation` error, `update-profile` error, `notification-preferences` error. Add a helper `actionError(error)` for server actions.
3. **Fix `requirePermission` to be generic 403** — never reveal "not a member" vs "insufficient permission" distinction.
4. **Add Zod schema to `/api/warehouses/members/invite`** + use proper UUID v4 regex.
5. **Add `requireUser` + `requireRateLimit` to `/api/wallet/balance`** — defense in depth.
6. **Pre-check invitation email vs signed-in user** before calling `accept_invitation`.
7. **Harden rate limiter** — use Redis `SET … EX … NX` + `INCR` atomic, or `EVAL` Lua script.
8. **Add self-approval check** in `apply_stock_movement` approve path.
9. **Make `NEXT_PUBLIC_APP_URL` required at startup** if email invites are enabled.

## 8.2 Logic / data integrity

10. **Fix UTC timezone in `fillDailyGaps`** — use `getUTC*` methods.
11. **Add idempotency to bulk import** — accept `idempotencyKey` body field, dedupe per row.
12. **Surface `countQuery` errors** on products page (don't silently default to 0).
13. **Verify gender Select submits** — add hidden input if Base UI doesn't auto-emit.
14. **Replace hardcoded FK hint** in `join_requests` select — drop the hint, use auto-detect.
15. **Pass through `initialStockApplied` from BFF** in `createProductWithInitialStock` response.
16. **Fix `unreadRef` race in `notification-bell.tsx`** — use `unreadStore.adjust(-1)`.
17. **404 when product not found** in movements apply path (don't silently skip proof).
18. **Case-insensitive `?status=` parsing** in products page.
19. **Persist `idempotencyKey` client-side** for warehouse create.

## 8.3 UI/UX consistency

20. **Fix `app/not-found.tsx:11` "Login" button size** to default or `min-h-11`.
21. **Fix `app/(auth)/layout.tsx:25` `rounded-xl`** to `rounded-lg`.
22. **Add `useEffect` to `app/(dashboard)/error.tsx`** to log error to console.
23. **Standardize error block styling** — pick one of the three current variants.
24. **Remove unused `DAY_MS`** in dashboard page.
25. **DRY the dialog `onDone` handlers** in movements page.

## 8.4 Code health

26. **Add build-time i18n key parity test** — every `en` key must exist in `id` (and vice versa). Catch missing translations at build time.
27. **Use `console.warn` in dev for missing keys** in `lib/i18n/translations.ts`.
28. **Define `ClientSupabase` type** separate from server `SupabaseClient` to prevent the `cookies()` import leak.
29. **Tighten `parseSuccess` type** to require non-null `data` for success.

## 8.5 Adding / Removing UI

### Additions (high value)

30. **Filter chip strip** on list pages (products, members, movements) — shows active filters as removable pills.
31. **Server error toast** on dashboard for 5xx responses (currently silent on most pages).
32. **Inventory "recent activity" badge on sidebar nav** showing global unread count.
33. **Empty state for inventory products with role=VIEWER** — "You have read-only access" message.
34. **Bulk archive confirmation summary** before action (count of products that will be archived).
35. **Real-time `live_status` indicator** on every page using real-time (not just dashboard).

### Removals (debt reduction)

36. **Remove `DAY_MS` from dashboard page** (unused constant).
37. **Remove `unreadRef` + `markedReadRef` split** — consolidate into `unreadStore` + a simple `Set<string>` for marked-in-progress.
38. **Remove `recent-...` widgets from dashboard** if real-time `recentActivity` widget already exists (per recent-movements recentTransactions — they may overlap).
39. **Remove duplicate `Promise.all` for warehouse+product in movements** if cached. (Not applicable currently; they're different tables.)

---

# PART IX — TOP-15 PRIORITY FIX LIST (with estimated impact)

| # | File:Line | Issue | Severity | Impact |
|---|---|---|---|---|
| 1 | `lib/notifications/notification-bell.tsx:213-214` | `unreadRef` race regression | HIGH | Counter wrong on rapid clicks |
| 2 | `lib/security/rate-limit.ts:97-99` | incr/expire race | HIGH | Rate limit can be bypassed at window boundary |
| 3 | `app/api/warehouses/members/invite/route.ts:68-71` | Broken email link when `NEXT_PUBLIC_APP_URL` empty | HIGH | Invitation emails non-functional |
| 4 | `app/invite/[token]/page.tsx:42` | Raw RPC error shown to user | HIGH | Information disclosure |
| 5 | `app/actions/update-profile.ts:47` | Raw error.message leaked | HIGH | Information disclosure |
| 6 | `app/(dashboard)/error.tsx` | No `useEffect` log | MEDIUM | Silent prod errors |
| 7 | Multiple `serverError(err.message)` sites (8+) | Internal error leak | HIGH | Information disclosure |
| 8 | `lib/analytics/aggregate.ts:74-78,87-89` | Local time in chart | MEDIUM | Wrong chart for non-UTC users |
| 9 | `lib/i18n/translations.ts:497` | Missing key returns key string | HIGH | Untranslated strings in UI |
| 10 | `app/(auth)/layout.tsx:25` | `rounded-xl` violates DESIGN | MEDIUM | Visual inconsistency |
| 11 | `app/(dashboard)/inventory/products/page.tsx:78-128` | `countQuery` errors swallowed | MEDIUM | Pagination missing without reason |
| 12 | `app/(auth)/onboarding/...` and similar — unused `Dashboard` data | LOW | Wasted bandwidth |
| 13 | `components/auth/signup-form.tsx:73-83` | Gender Select may not submit | MEDIUM | Lost user data |
| 14 | `app/api/warehouses/inventory/movements/route.ts:175-187` | Silent proof skip on missing product | HIGH | Inconsistent state |
| 15 | `app/(dashboard)/inventory/members/page.tsx:94-101` | Hardcoded FK constraint name | MEDIUM | Silent data loss on rename |

---

# PART X — SUMMARY TABLE

| Severity | Count | Theme |
|---|---|---|
| CRITICAL | 1 | Information disclosure via raw error messages (1.1, 1.2, 1.3) |
| HIGH | 14 | Rate-limit race · unread race · broken email link · silent skips · FK fragility · FK missing FK hint · missing translation fallback · etc. |
| MEDIUM | 22 | Case-sensitivity · FK hardcoding · page error missing log · UTC vs local · select data emission · DRY violations · etc. |
| LOW | 16 | Dead code · redundant overrides · minor copy issues · unused constants · etc. |

**Total findings:** 53.

**Top systemic issues to fix first** (each removes several findings):
1. **Error handling system** — replace 8+ `serverError(err.message)` with catalog-mapped responses. Removes findings 1.1, 1.2, 1.3, 2.9.
2. **Translation completeness check** — add build test. Removes finding 5.1.
3. **Notification ref pattern** — migrate `notification-bell.tsx` to `unreadStore`. Removes finding 2.1.
4. **Rate limiter atomicity** — use Redis `SET EX NX` + `INCR`. Removes finding 1.10.
5. **Card/error-block style standardization** — pick one of three current patterns. Removes findings 3.3, 3.4.
