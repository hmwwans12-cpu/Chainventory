/**
 * Normalisasi path post-login/redirect ke bentuk internal yang aman.
 *
 * Audit v0.3.11 M-02: replace ad-hoc safeNext() implementations across
 * the auth flow with a single helper that blocks:
 *  - protocol-relative URLs (`//evil.com/x`) — open redirect vector
 *  - backslash-prefixed paths (`/\\evil.com`) — some browsers normalize
 *    these into protocol-relative URLs
 *  - URL-encoded `//` (e.g. `/%2f%2fevil.com`) — bypass attempt
 *  - non-`/`-prefixed values (absolute URLs)
 *
 * The default fallback is `/dashboard` so the worst case for a
 * malformed value is a redirect to the authenticated landing page.
 */
export function safeInternalPath(
  value: string | FormDataEntryValue | null | undefined,
  fallback = "/dashboard"
): string {
  if (typeof value !== "string") return fallback;
  if (value.length === 0) return fallback;
  // Must start with a single forward slash.
  if (!value.startsWith("/")) return fallback;
  // Reject protocol-relative and backslash variants.
  if (value.startsWith("//") || value.startsWith("/\\")) return fallback;
  // Reject URL-encoded slash variants. We only decode once — a recursive
  // decode loop is not needed because the redirect target is rendered
  // verbatim by NextResponse.redirect, which does not re-decode the
  // percent-encoding before sending to the browser.
  const lower = value.toLowerCase();
  if (lower.startsWith("/%2f") || lower.startsWith("/%5c")) return fallback;
  return value;
}
