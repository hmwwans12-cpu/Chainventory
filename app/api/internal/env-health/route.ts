import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { proofBaseUrl } from "@/lib/proof/qstash";
import { verifyCronSecret } from "@/lib/proof/verify-request";

/**
 * Health env deploy (P3 smoke BLOCKER — kategori "Environment & Deploy").
 *
 * Mengekspos hasil resolusi base URL QStash (tanpa secret) supaya smoke test
 * bisa memverifikasi SEBELUM menjalankan test lain bahwa environment deploy
 * (Vercel production/preview) punya URL publik yang benar. Jika base URL
 * ternyata localhost/private, proof pipeline akan macet pending persis
 * seperti bug NEXT_PUBLIC_APP_URL yang ditemukan lewat E2E item 2 — dan
 * gejalanya baru terlihat belakangan. Cek ini menangkapnya di awal.
 *
 * GET /api/internal/env-health  (Authorization: Bearer CRON_SECRET)
 */

export async function GET(request: Request) {
  const cronOk = await verifyCronSecret(request);
  if (!cronOk) {
    logger.warn("env-health rejected: no valid cron auth");
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }

  let baseUrl: string | null = null;
  let error: string | null = null;
  try {
    baseUrl = proofBaseUrl();
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }

  const url = baseUrl ? new URL(baseUrl) : null;
  const isPublic = url
    ? url.protocol === "https:" &&
      !/localhost|127\.0\.0\.1|0\.0\.0\.0/.test(url.hostname)
    : false;

  return NextResponse.json({
    ok: baseUrl !== null,
    data: {
      baseUrl,
      isPublic,
      hostname: url?.hostname ?? null,
      mode: process.env.NODE_ENV,
      source: baseUrl ? undefined : error,
    },
  });
}
