import { logger } from "@/lib/logger";
import { createProofServiceClient } from "@/lib/proof/supabase";

/**
 * Warehouse lifecycle harian (PRD §20) — dipicu Vercel Cron TERPISAH dari
 * keep-alive (`/api/internal/warehouses/lifecycle`, `0 5 * * *`).
 *
 * RPC `run_warehouse_lifecycle` (migration 0020) menandai warehouse yang
 * tidak aktif (23 hari → warning, 27 → critical, 30 → suspended), menulis
 * notifikasi OWNER + MANAGER sekali per episode inaktivitas, dan mengubah
 * status ke `suspended` saat lewat 30 hari. Idempoten: panggilan berulang di
 * rentang yang sama tidak mengirim notifikasi ganda.
 */

export type LifecycleRow = {
  warehouse_id: string;
  stage: "warning" | "critical" | "suspended";
  notified: number;
  suspended: boolean;
};

export type LifecycleResult =
  | { ok: true; processed: number; stages: LifecycleRow[] }
  | { ok: false; processed: number; error: string };

export type LowStockDigestResult =
  | { ok: true; notified: number }
  | { ok: false; notified: number; error: string };

/**
 * Digest low-stock harian (0076): produk aktif di bawah ambang →
 * notifikasi OWNER+MANAGER (dedup per produk). Dipanggil cron lifecycle
 * yang sama — tanpa cron baru. Gagal digest TIDAK menggagalkan lifecycle.
 */
export async function digestLowStock(): Promise<LowStockDigestResult> {
  const supabase = createProofServiceClient();
  const { data, error } = await supabase.rpc("digest_low_stock");
  if (error) {
    logger.error({ err: error.message }, "low-stock digest failed");
    return { ok: false, notified: 0, error: error.message };
  }
  const notified = typeof data === "number" ? data : Number(data ?? 0) || 0;
  logger.info({ notified }, "low-stock digest complete");
  return { ok: true, notified };
}

export type ArchiveOldLogsResult =
  { ok: true; moved: number } | { ok: false; moved: number; error: string };

/**
 * Arsip audit_logs + notifications >180 hari (0077, maks 1000/panggil —
 * backlog terkuras progresif tiap cron). Gagal arsip TIDAK menggagalkan
 * lifecycle.
 */
export async function archiveOldLogs(): Promise<ArchiveOldLogsResult> {
  const supabase = createProofServiceClient();
  const { data, error } = await supabase.rpc("archive_old_logs");
  if (error) {
    logger.error({ err: error.message }, "archive old logs failed");
    return { ok: false, moved: 0, error: error.message };
  }
  const moved = typeof data === "number" ? data : Number(data ?? 0) || 0;
  if (moved > 0) logger.info({ moved }, "archive old logs moved rows");
  return { ok: true, moved };
}

export async function runWarehouseLifecycle(): Promise<LifecycleResult> {
  const supabase = createProofServiceClient();

  const { data, error } = await supabase.rpc("run_warehouse_lifecycle");
  if (error) {
    logger.error({ err: error.message }, "warehouse lifecycle failed");
    return { ok: false, processed: 0, error: error.message };
  }

  const rows = (Array.isArray(data) ? data : []) as LifecycleRow[];
  const stages: LifecycleRow[] = [];
  for (const row of rows) {
    if (
      row &&
      typeof row.warehouse_id === "string" &&
      (row.stage === "warning" ||
        row.stage === "critical" ||
        row.stage === "suspended")
    ) {
      stages.push(row);
    }
  }

  logger.info({ processed: stages.length }, "warehouse lifecycle run complete");

  return { ok: true, processed: stages.length, stages };
}
