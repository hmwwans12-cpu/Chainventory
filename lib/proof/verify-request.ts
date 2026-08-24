import { timingSafeEqual } from "node:crypto";

import { Receiver } from "@upstash/qstash";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * Auth untuk endpoint internal proof (ARSITEKTUR §7, WORKFLOW §6).
 *
 * - `verifyCronSecret`     → Vercel Cron (`Authorization: Bearer CRON_SECRET`)
 * - `verifyQStashSignature` → callback QStash (`Upstash-Signature` header)
 *
 * Fail-closed: keduanya harus lulus salah satu, bukan hanya ada header.
 */

export async function verifyCronSecret(request: Request): Promise<boolean> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return false;
  const expected = env.CRON_SECRET;
  if (!expected) return false;
  const presented = Buffer.from(header.slice("Bearer ".length));
  const exp = Buffer.from(expected);
  return presented.length === exp.length && timingSafeEqual(presented, exp);
}

export async function verifyQStashSignature(
  request: Request
): Promise<boolean> {
  const signature = request.headers.get("upstash-signature");
  if (!signature) return false;
  const body = await request.clone().text();
  try {
    const receiver = new Receiver({
      currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
      nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
    });
    return await receiver.verify({ signature, body });
  } catch (err) {
    logger.warn({ err }, "QStash signature verification failed");
    return false;
  }
}

/**
 * Wrapper hardening untuk route internal proof.
 *
 * CATATAN (audit CI 2026-08-24): TIDAK memakai `verifySignatureAppRouter`
 * dari SDK — versi SDK membangun `Receiver` di module-load dan langsung
 * membaca env signing keys, sehingga BUILD gagal di lingkungan tanpa
 * QStash keys (CI). Implementasi di bawah memakai `Receiver` lazy
 * (verifyQStashSignature) dengan semantik fail-closed identik:
 * semua kegagalan verifikasi -> 403, error lain diteruskan.
 */
export function verifyQStashAppRouter(
  handler: (request: Request) => Promise<Response> | Response
) {
  return async (request: Request): Promise<Response> => {
    const ok = await verifyQStashSignature(request);
    if (!ok) {
      return new Response("invalid signature", { status: 403 });
    }
    return handler(request);
  };
}
