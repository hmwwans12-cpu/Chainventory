import { timingSafeEqual } from "node:crypto";

import { Receiver } from "@upstash/qstash";
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";

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
 * `verifySignatureAppRouter` yang di-hardening: SDK mengembalikan 403 untuk
 * header hilang, tetapi signature rusak (garbage / body tampered) melempar
 * `SignatureError` yang bocor menjadi HTTP 500. Wrapper ini memastikan semua
 * jalur gagal verifikasi → 403 (fail-closed), dan hanya error non-signature
 * yang diteruskan.
 */
export function verifyQStashAppRouter(
  handler: (request: Request) => Promise<Response> | Response
) {
  const guarded = verifySignatureAppRouter(handler);
  return async (request: Request): Promise<Response> => {
    try {
      return await guarded(request);
    } catch (err) {
      if (err instanceof Error && err.name === "SignatureError") {
        return new Response("invalid signature", { status: 403 });
      }
      throw err;
    }
  };
}
