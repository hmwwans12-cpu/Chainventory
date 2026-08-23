/**
 * Shared Route Handler plumbing (P1 Step 5 harden — candidate C1).
 *
 * Sebelumnya tiap handler (wallets/sync, membership, inventory/products,
 * inventory/movements) mengulang sendiri: auth check + JSON parse + map
 * error → HTTP. Modul ini memusatkan seam tersebut ke satu tempat:
 *  - response helpers (invalid/unauthorized/forbidden/notFound/serverError/ok)
 *  - `readJson` (parse aman dengan response default 400)
 *  - `requireUser` (auth Supabase → 401 bila tidak login)
 *  - `getMemberRole`/`requirePermission` (RBAC TS yang sama dengan
 *    `lib/auth/permissions` — satu-satunya sumber matrix sisi client)
 *  - `rpcErrorStatus`/`fromPostgrestError` (error code / PostgREST → HTTP)
 */

import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import {
  hasPermission,
  type Permission,
  type Role,
} from "@/lib/auth/permissions";
import { createClient } from "@/lib/supabase/server";
import {
  enforceMutationRateLimit,
  type MutationAction,
} from "@/lib/security/rate-limit";

export type SupabaseClient = Awaited<ReturnType<typeof createClient>>;

/** Kode error kanonik yang dipakai body respons `{ ok: false, error, errorCode }`. */
export type ErrorCode =
  | "INVALID_INPUT"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INSUFFICIENT_STOCK"
  | "STALE_STOCK"
  | "UNSUPPORTED_NETWORK"
  | "PRIVY_VERIFICATION_FAILED"
  | "RATE_LIMITED"
  | "RPC_FAILED";

/** Hasil `requireUser`: satu-satunya jalur login yang valid. */
export type AuthResult =
  { user: User; res: null } | { user: null; res: NextResponse };

const RPC_ERROR_STATUS: Record<string, number> = {
  INVALID_INPUT: 400,
  UNAUTHENTICATED: 401,
  UNSUPPORTED_NETWORK: 400,
  PRIVY_VERIFICATION_FAILED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INSUFFICIENT_STOCK: 409,
  STALE_STOCK: 409,
};

/** Pola pesan error PostgREST yang merupakan penolakan otorisasi (→ 403). */
const AUTHZ_ERROR_RE =
  /not authenticated|insufficient|row-level security|not a member|not owner of|warehouse not found|join request already|join request not|already a member|warehouse not accepting|cannot remove owner|owner cannot leave|unit is immutable|movement not|new row violates|duplicate key/i;

export function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

export function error(message: string, errorCode: ErrorCode, status: number) {
  return json({ ok: false, error: message, errorCode }, status);
}

export const invalid = (message = "Invalid input.") =>
  error(message, "INVALID_INPUT", 400);
export const unauthorized = (message = "Unauthorized.") =>
  error(message, "UNAUTHENTICATED", 401);
export const forbidden = (message = "Forbidden.") =>
  error(message, "FORBIDDEN", 403);
export const notFound = (message = "Not found.") =>
  error(message, "NOT_FOUND", 404);
export const serverError = (message = "Internal error.") =>
  error(message, "RPC_FAILED", 500);
export const ok = (data: unknown = null, status = 200) =>
  json({ ok: true, data }, status);

/** Error code kanonik (dari RPC return table / domain layer) → HTTP status. */
export function rpcErrorStatus(errorCode: string | undefined): number {
  return errorCode ? (RPC_ERROR_STATUS[errorCode] ?? 500) : 500;
}

export function isAuthzError(message: string): boolean {
  return AUTHZ_ERROR_RE.test(message);
}

/** Map pesan error PostgREST/DB ke respons terstruktur (403 vs 500). */
export function fromPostgrestError(message: string): NextResponse {
  logger.warn({ err: message }, "PostgREST request rejected");
  return isAuthzError(message) ? forbidden(message) : serverError(message);
}

/** Parse JSON body dengan aman; `{ ok: false }` bila bukan JSON valid. */
export async function readJson(request: Request) {
  try {
    return { ok: true as const, body: (await request.json()) as unknown };
  } catch {
    return { ok: false as const, body: null };
  }
}

/** Jaga semua handler: wajib ada sesi Supabase, kalau tidak → 401. */
export async function requireUser(
  supabase: SupabaseClient
): Promise<AuthResult> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { user: null, res: unauthorized() };
  return { user, res: null };
}

/** Role member ACTIVE user di warehouse, atau null bila bukan member. */
export async function getMemberRole(
  supabase: SupabaseClient,
  warehouseId: string,
  userId: string
): Promise<Role | null> {
  const { data } = await supabase
    .from("memberships")
    .select("role")
    .eq("warehouse_id", warehouseId)
    .eq("user_id", userId)
    .eq("status", "ACTIVE")
    .maybeSingle();
  return (data?.role as Role) ?? null;
}

/**
 * Gate RBAC sekali pakai: member ACTIVE + punya `permission` → null (lanjut),
 * selain itu response 403. HANYA untuk kapabilitas; operasi assign-role tetap
 * wajib `canAssignRole` di sisi DB (permissions.ts).
 */
export async function requirePermission(
  supabase: SupabaseClient,
  warehouseId: string,
  userId: string,
  permission: Permission
): Promise<NextResponse | null> {
  const role = await getMemberRole(supabase, warehouseId, userId);
  if (!role) return forbidden("Not a member of this warehouse.");
  if (!hasPermission(role, permission))
    return forbidden("Insufficient permission.");
  return null;
}

/**
 * Gate rate limit mutasi sensitif (TECHSTACK §6.1, fail-closed): panggil
 * SETELAH `requireUser` (butuh userId). Null → boleh lanjut; selain itu
 * 429 + Retry-After siap dikembalikan ke client.
 */
export async function requireRateLimit(
  action: MutationAction,
  userId: string,
  request: Request
): Promise<NextResponse | null> {
  const decision = await enforceMutationRateLimit(action, userId, request);
  if (decision.allowed) return null;
  const retryAfterSec = Math.max(Math.ceil(decision.resetMs / 1000), 1);
  const res = json(
    {
      ok: false,
      error:
        "Too many requests. Please slow down and try again in a few seconds.",
      errorCode: "RATE_LIMITED",
    },
    429
  );
  res.headers.set("Retry-After", String(retryAfterSec));
  return res;
}
