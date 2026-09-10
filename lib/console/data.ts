import { createPublicClient, formatEther, parseEther, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { baseSepolia, createChainTransport } from "@/lib/blockchain/chains";
import { FAUCET_AMOUNT_ETH, FAUCET_COOLDOWN_MS } from "@/lib/constants";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createProofServiceClient } from "@/lib/proof/supabase";
import { sanitizeConsoleError } from "@/lib/utils/sanitize-console-error";
import type {
  AuditEntry,
  ConsoleSummary,
  ErrorEntry,
  ManualReviewProof,
  TreasuryData,
} from "@/lib/console/types";

/**
 * Data reads Developer Console.
 *
 * SEMUA query memakai service client (bypass RLS) — memang disengaja, karena
 * console menampilkan data lintas-tenant. Akses halaman/route ini tetap wajib
 * melewati `getConsoleActor` (allowlist server-side) di lapisan pemanggil.
 * Tidak ada satupun kolom secret (payload jsonb / key) yang di-select.
 */

const PROOF_STATUSES = [
  "pending",
  "retrying",
  "submitted",
  "confirming",
  "confirmed",
  "manual_review",
  "failed",
] as const;

/**
 * APP-17: kejujuran data console. getManualReviewProofs/getErrorSummary/
 * getAuditTrail mengembalikan [] saat DB gagal (fallback aman) — tanpa
 * sinyal ini halaman console terlihat "sehat & kosong". Probe ringan ini
 * memberi tahu halaman kapan harus menampilkan banner data-incomplete.
 */
export async function getConsoleDataHealth(): Promise<{ ok: boolean }> {
  const supabase = createProofServiceClient();
  const { error } = await supabase
    .from("proofs")
    .select("id", { count: "exact", head: true });
  if (error) {
    logger.warn(
      { err: error.message },
      "console data health probe failed"
    );
    return { ok: false };
  }
  return { ok: true };
}

export async function getConsoleSummary(): Promise<ConsoleSummary> {
  const supabase = createProofServiceClient();

  // Fix BE-17 (PRD §29): summary sebelumnya select full-table (status semua
  // warehouses/proofs/outbox) ke memori = OOM/latensi saat data tumbuh.
  // Head-count exact per status: tanpa transfer baris, paralel.
  const head = (table: string, match?: Record<string, string>) => {
    let q = supabase.from(table).select("id", { count: "exact", head: true });
    if (match) {
      for (const [k, v] of Object.entries(match)) q = q.eq(k, v);
    }
    return q;
  };

  const queries = {
    whTotal: head("warehouses"),
    whActive: head("warehouses", { status: "active" }),
    whSuspended: head("warehouses", { status: "suspended" }),
    members: head("memberships"),
    proofTotal: head("proofs"),
    ...Object.fromEntries(
      PROOF_STATUSES.map((s) => [`proof_${s}`, head("proofs", { status: s })])
    ),
    outboxPending: head("proof_outbox", { status: "pending" }),
    outboxLeased: head("proof_outbox", { status: "leased" }),
    outboxFailed: head("proof_outbox", { status: "failed" }),
  } as const;

  const entries = await Promise.all(
    Object.entries(queries).map(async ([key, q]) => {
      const { count, error } = await q;
      // Audit v0.3.0 §4.9: jangan silent-swallow partial failure.
      if (error) {
        logger.warn({ err: error.message }, `console summary: ${key} failed`);
      }
      return [key, count ?? 0] as const;
    })
  );
  const n = Object.fromEntries(entries) as Record<string, number>;

  const proofCounts = {} as Record<(typeof PROOF_STATUSES)[number], number>;
  for (const s of PROOF_STATUSES) proofCounts[s] = n[`proof_${s}`] ?? 0;

  return {
    warehouses: {
      total: n.whTotal ?? 0,
      active: n.whActive ?? 0,
      suspended: n.whSuspended ?? 0,
    },
    members: n.members ?? 0,
    proofs: {
      total: n.proofTotal ?? 0,
      ...proofCounts,
    },
    outbox: {
      pending: n.outboxPending ?? 0,
      leased: n.outboxLeased ?? 0,
      failed: n.outboxFailed ?? 0,
    },
  };
}

export async function getManualReviewProofs(
  limit = 100
): Promise<ManualReviewProof[]> {
  const supabase = createProofServiceClient();

  const { data: rows, error } = await supabase
    .from("proofs")
    .select(
      "id, warehouse_id, warehouse_address, movement_id, payload_hash, attempt_count, error, created_at, updated_at"
    )
    .eq("status", "manual_review")
    .order("updated_at", { ascending: true })
    .limit(limit);
  if (error) {
    logger.error({ err: error.message }, "console manual_review read failed");
    return [];
  }
  if (!rows || rows.length === 0) return [];

  const ids = rows.map((r) => r.id as string);
  const warehouseIds = [
    ...new Set(rows.map((r) => r.warehouse_id as string).filter(Boolean)),
  ];

  const [whResult, obResult] = await Promise.all([
    warehouseIds.length > 0
      ? supabase.from("warehouses").select("id, name").in("id", warehouseIds)
      : Promise.resolve({ data: [] }),
    supabase
      .from("proof_outbox")
      .select("proof_id, status, attempt_count, error")
      .in("proof_id", ids),
  ]);

  const names = new Map<string, string>();
  for (const w of (whResult.data ?? []) as { id: string; name: string }[]) {
    names.set(w.id, w.name);
  }
  const outboxByProof = new Map<
    string,
    { status: string; attemptCount: number; error: string | null }
  >();
  for (const ob of (obResult.data ?? []) as {
    proof_id: string;
    status: string;
    attempt_count: number;
    error: string | null;
  }[]) {
    outboxByProof.set(ob.proof_id, {
      status: ob.status,
      attemptCount: ob.attempt_count,
      error: ob.error,
    });
  }

  return rows.map((r) => ({
    id: r.id as string,
    warehouseId: r.warehouse_id as string,
    warehouseName: r.warehouse_id
      ? (names.get(r.warehouse_id as string) ?? null)
      : null,
    warehouseAddress: r.warehouse_address as string,
    movementId: r.movement_id as string | null,
    payloadHash: r.payload_hash as string,
    attemptCount: r.attempt_count as number,
    error: r.error as string | null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
    outbox: outboxByProof.get(r.id as string) ?? null,
  }));
}

export async function getErrorSummary(limit = 100): Promise<ErrorEntry[]> {
  const supabase = createProofServiceClient();

  const { data: rows, error } = await supabase
    .from("proofs")
    .select(
      "id, warehouse_id, movement_id, status, tx_hash, error, attempt_count, created_at"
    )
    .in("status", ["failed", "manual_review"])
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !rows) return [];

  const warehouseIds = [
    ...new Set(rows.map((r) => r.warehouse_id as string).filter(Boolean)),
  ];
  let names = new Map<string, string>();
  if (warehouseIds.length > 0) {
    const wh = await supabase
      .from("warehouses")
      .select("id, name")
      .in("id", warehouseIds);
    names = new Map(
      ((wh.data ?? []) as { id: string; name: string }[]).map((w) => [
        w.id,
        w.name,
      ])
    );
  }

  return rows.map((r) => ({
    id: r.id as string,
    status: r.status as ErrorEntry["status"],
    warehouseId: r.warehouse_id as string,
    warehouseName: r.warehouse_id
      ? (names.get(r.warehouse_id as string) ?? null)
      : null,
    movementId: r.movement_id as string | null,
    txHash: r.tx_hash as string | null,
    error: r.error as string | null,
    attemptCount: r.attempt_count as number,
    createdAt: r.created_at as string,
  }));
}

export async function getAuditTrail(limit = 100): Promise<AuditEntry[]> {
  const supabase = createProofServiceClient();

  const { data: rows, error } = await supabase
    .from("audit_logs")
    .select(
      "id, warehouse_id, actor_user_id, action, entity, entity_id, status, related_tx_hash, created_at, users(email)"
    )
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    // Audit v0.3.4 §9.19: silent fallback = misleading; operator tidak
    // tahu kalau DB sedang down. Log + return [] konsisten dengan
    // getErrorSummary dan getManualReviewProofs.
    logger.error(
      { err: error.message },
      "console audit_trail read failed"
    );
    return [];
  }
  if (!rows) return [];

  return rows.map((r) => ({
    id: r.id as string,
    warehouseId: r.warehouse_id as string | null,
    actorUserId: r.actor_user_id as string | null,
    actorEmail: (r.users as { email?: string } | null)?.email ?? null,
    action: r.action as string,
    entity: r.entity as string,
    entityId: r.entity_id as string | null,
    status: r.status as string | null,
    relatedTxHash: r.related_tx_hash as string | null,
    createdAt: r.created_at as string,
  }));
}

/** Treasury: balance (RPC/BaseScan) + sisa kelayakan faucet (kebijakan). */
export async function getTreasuryData(): Promise<TreasuryData> {
  const privateKey = env.TREASURY_PRIVATE_KEY;
  if (!privateKey) {
    return { ok: false, error: "TREASURY_PRIVATE_KEY not configured." };
  }
  try {
    const hexKey: Hex = privateKey.startsWith("0x")
      ? (privateKey as Hex)
      : `0x${privateKey}`;
    const account = privateKeyToAccount(hexKey);
    const publicClient = createPublicClient({
      chain: baseSepolia,
      transport: createChainTransport(),
    });
    const balance = await publicClient.getBalance({ address: account.address });

    // Fix BE-11 (PRD §16: integer eksak pakai BigInt): Number(bigint wei)
    // hilang presisi >2^53 (~0.009 ETH) → eligible/affordable salah total.
    const amountWei = parseEther(FAUCET_AMOUNT_ETH);
    const affordable =
      amountWei > 0n ? Number(balance / amountWei) : 0;

    return {
      ok: true,
      address: account.address,
      balanceEther: formatEther(balance),
      faucet: {
        amountEther: FAUCET_AMOUNT_ETH,
        cooldownMs: FAUCET_COOLDOWN_MS,
        eligible: balance >= amountWei,
        affordableClaims: affordable,
        balanceEther: formatEther(balance),
      },
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "treasury probe failed";
    logger.warn({ err: message }, "console treasury probe failed");
    return {
      ok: false,
      // Audit v0.3.5 §9.22: sanitize viem error untuk UI — triim
      // kalimat pertama, batasi panjang. Full error sudah di log.
      error: sanitizeConsoleError(message, "Treasury probe failed"),
    };
  }
}
