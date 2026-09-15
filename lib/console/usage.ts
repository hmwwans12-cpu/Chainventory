import { logger } from "@/lib/logger";
import { env } from "@/lib/env";
import { createProofServiceClient } from "@/lib/proof/supabase";

/**
 * Proximity tracking ke limit free-tier (temuan audit #29).
 *
 * AGENT.md mewajibkan keterbatasan free-tier "tetap terlihat" — selama ini
 * console hanya tahu MATI/HIDUP (boolean credential). Modul ini mengukur
 * yang BISA diukur dengan kredensial yang sudah ada (tanpa secret baru):
 *   - Ukuran database Supabase (byte, via Management API) vs referensi
 *     paket Free 500MB (terdokumentasi Supabase 2024+; angka pasti ikut
 *     paket aktif project — tampilkan sebagai referensi, bukan vonis).
 *   - Jumlah baris tabel inti (head-count exact, tanpa transfer baris).
 * Yang BELUM bisa (butuh kunci/API baru) dilaporkan eksplisit sebagai
 * `tracked: false` + alasan, bukan angka palsu: Privy MAU, Upstash command.
 */

export const SUPABASE_FREE_DB_BYTES = 500 * 1024 * 1024;
export const SUPABASE_FREE_DB_REF = "paket Supabase Free (±500MB, cek dashboard bila paket berubah)";

export interface UsageItem {
  key: string;
  /** Nilai terpakai dalam satuan `unit` (null bila tidak terukur). */
  used: number | null;
  /** Batas referensi (null = tidak ada batas yang diketahui). */
  limit: number | null;
  unit: "bytes" | "rows" | "eth";
  /** Alasan tidak terukur (hanya bila used === null). */
  unavailableReason?: string;
}

export function usagePct(used: number | null, limit: number | null): number | null {
  if (used === null || limit === null || limit <= 0 || used < 0) return null;
  return Math.min(100, Math.round((used / limit) * 100));
}

export function formatUsageValue(value: number, unit: UsageItem["unit"]): string {
  if (unit === "bytes") {
    if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
    if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
    return `${value} B`;
  }
  return value.toLocaleString("en-US");
}

const MGMT_TIMEOUT_MS = 8000;

async function fetchDbSizeBytes(): Promise<number | null> {
  const token = env.SUPABASE_MANAGEMENT_TOKEN;
  const ref = env.SUPABASE_PROJECT_REF;
  if (!token || !ref) return null;
  try {
    const res = await fetch(
      `https://api.supabase.com/v1/projects/${ref}/database/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: "select pg_database_size(current_database()) as bytes" }),
        signal: AbortSignal.timeout(MGMT_TIMEOUT_MS),
      }
    );
    if (!res.ok) return null;
    const rows = (await res.json()) as Array<{ bytes?: string | number }>;
    const raw = rows?.[0]?.bytes;
    const n = typeof raw === "number" ? raw : Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : null;
  } catch (err) {
    logger.warn({ err }, "console usage db-size probe failed");
    return null;
  }
}

const COUNT_TABLES = [
  "warehouses",
  "products",
  "stock_movements",
  "proofs",
  "memberships",
  "notifications",
] as const;

async function countRows(): Promise<Record<string, number | null>> {
  const supabase = createProofServiceClient();
  const entries = await Promise.all(
    COUNT_TABLES.map(async (table) => {
      try {
        const { count, error } = await supabase
          .from(table)
          .select("id", { count: "exact", head: true });
        if (error || count === null) return [table, null] as const;
        return [table, count] as const;
      } catch (err) {
        logger.warn({ err, table }, "console usage row-count failed");
        return [table, null] as const;
      }
    })
  );
  return Object.fromEntries(entries);
}

export interface UsageReport {
  items: UsageItem[];
  /** true bila SEMUA item terukur; false = tampilkan banner data-incomplete. */
  complete: boolean;
}

export async function getUsageProximity(): Promise<UsageReport> {
  const [dbBytes, counts] = await Promise.all([fetchDbSizeBytes(), countRows()]);
  const items: UsageItem[] = [
    {
      key: "supabase_db_size",
      used: dbBytes,
      limit: SUPABASE_FREE_DB_BYTES,
      unit: "bytes",
      ...(dbBytes === null
        ? { unavailableReason: "need-management-token" }
        : {}),
    },
    ...COUNT_TABLES.map((table) => ({
      key: `rows_${table}`,
      used: counts[table] ?? null,
      limit: null,
      unit: "rows" as const,
    })),
    {
      key: "privy_mau",
      used: null,
      limit: null,
      unit: "rows" as const,
      unavailableReason: "need-privy-api-key",
    },
    {
      key: "upstash_commands",
      used: null,
      limit: null,
      unit: "rows" as const,
      unavailableReason: "need-upstash-api-key",
    },
  ];
  return { items, complete: items.every((i) => i.used !== null) };
}
