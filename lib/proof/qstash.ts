import { randomUUID } from "node:crypto";

import { Client } from "@upstash/qstash";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

/**
 * QStash publisher (P1 Step 5).
 *
 * User request TIDAK menulis on-chain — hanya membuat outbox (transaksi sama
 * dengan movement) lalu publish job ke QStash SETELAH commit. Processor
 * menerima callback via endpoint internal (`/api/internal/proofs/*`) dan
 * memverifikasi signature QStash (WORKFLOW §6).
 *
 * Retry bisnis dikelola DB (attempt_count ≤ 5, exponential backoff) — QStash
 * dipanggil dengan `retries: 0` agar budget attempt tepat dan reconciliation
 * harian menjadi safety net.
 */

export const PROOF_PROCESS_PATH = "/api/internal/proofs/process";
export const PROOF_CONFIRM_PATH = "/api/internal/proofs/confirm";

/** Delay (detik) konfirmasi job per round; setelah MAX → manual_review. */
export const CONFIRM_DELAYS = [5, 10, 20, 40, 80] as const;
export const CONFIRM_MAX_ROUNDS = CONFIRM_DELAYS.length + 1;

export function proofBaseUrl(): string {
  // Prioritas (semua server-side / runtime, tidak ada yang di-inline):
  //   1. QSTASH_APP_BASE_URL  — override eksplisit (serve.mjs E2E tunnel).
  //   2. NEXT_PUBLIC_APP_URL  — URL Vercel production (di-set manual saat
  //      build; diabaikan bila masih default localhost — menandakan belum
  //      dikonfigurasi di Vercel).
  //   3. VERCEL_URL           — di-inject Vercel per deployment (hostname
  //      tanpa skema) → menjamin preview & production default selalu benar
  //      walaupun preview URL unik/berubah tiap deploy.
  // QStash TIDAK bisa menjangkau localhost/private — memakai base URL lokal
  // di sini = proof macet pending (bug yang baru ditemukan lewat E2E).
  const explicit = env.QSTASH_APP_BASE_URL;
  if (explicit) return explicit.replace(/\/+$/, "");

  const nextPublic = env.NEXT_PUBLIC_APP_URL;
  const nextPublicOk =
    nextPublic &&
    nextPublic.startsWith("https://") &&
    !/localhost|127\.0\.0\.1|0\.0\.0\.0/.test(nextPublic);
  if (nextPublicOk) return nextPublic.replace(/\/+$/, "");

  const vercelHost = env.VERCEL_URL;
  if (vercelHost) return `https://${vercelHost}`.replace(/\/+$/, "");

  throw new Error(
    "No public base URL for QStash delivery. Set QSTASH_APP_BASE_URL, or " +
      "NEXT_PUBLIC_APP_URL (Vercel env), or deploy on Vercel (VERCEL_URL)."
  );
}

export function proofProcessUrl(): string {
  return `${proofBaseUrl()}${PROOF_PROCESS_PATH}`;
}

export function proofConfirmUrl(): string {
  return `${proofBaseUrl()}${PROOF_CONFIRM_PATH}`;
}

export function qstashClient(): Client {
  return new Client({
    token: env.QSTASH_TOKEN ?? undefined,
    baseUrl: env.QSTASH_URL ?? undefined,
  });
}

/** Publish job proses (setelah commit DB movement+outbox). Return messageId QStash. */
export async function publishProofJob(
  proofId: string
): Promise<string | undefined> {
  const res = await qstashClient().publishJSON({
    url: proofProcessUrl(),
    body: { proofId, type: "process" },
    headers: { "Content-Type": "application/json" },
    retries: 0,
    deduplicationId: `proof-process-${proofId}`,
  });
  logger.info(
    { proofId, messageId: res.messageId },
    "proof job published to QStash"
  );
  return res.messageId;
}

/** Retry delayed (exponential backoff dari DB `next_attempt_at`). */
export async function scheduleProofRetry(
  proofId: string,
  delaySeconds: number
): Promise<void> {
  await qstashClient().publishJSON({
    url: proofProcessUrl(),
    body: { proofId, type: "process", retry: true },
    headers: { "Content-Type": "application/json" },
    retries: 0,
    delay: delaySeconds,
    deduplicationId: `proof-retry-${proofId}-${randomUUID()}`,
  });
  logger.info({ proofId, delaySeconds }, "proof retry scheduled to QStash");
}

/** Schedule job konfirmasi terpisah (bukan sinkron dengan submit). */
export async function scheduleProofConfirmation(
  proofId: string,
  round: number
): Promise<void> {
  const delay =
    CONFIRM_DELAYS[round - 1] ?? CONFIRM_DELAYS[CONFIRM_DELAYS.length - 1];
  await qstashClient().publishJSON({
    url: proofConfirmUrl(),
    body: { proofId, type: "confirm", round },
    headers: { "Content-Type": "application/json" },
    retries: 0,
    delay,
    deduplicationId: `proof-confirm-${proofId}-r${round}`,
  });
  logger.info({ proofId, round, delay }, "proof confirmation job scheduled");
}

/**
 * Re-trigger konfirmasi dari reconciliation (job lama mungkin hilang / dedup
 * id asli sudah tersimpan 90 hari). Dedup unik → tidak ketahan deduplication
 * QStash. Idempoten di sisi penerima.
 */
export async function scheduleProofConfirmationFromReconcile(
  proofId: string
): Promise<void> {
  await qstashClient().publishJSON({
    url: proofConfirmUrl(),
    body: { proofId, type: "confirm", round: 1, fromReconcile: true },
    headers: { "Content-Type": "application/json" },
    retries: 0,
    delay: CONFIRM_DELAYS[0],
    deduplicationId: `proof-confirm-reconcile-${proofId}-${randomUUID()}`,
  });
  logger.info(
    { proofId },
    "proof confirmation re-scheduled from reconciliation"
  );
}
