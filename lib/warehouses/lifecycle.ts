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
