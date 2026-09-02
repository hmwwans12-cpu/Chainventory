import { createPublicClient, formatEther, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

import { baseSepolia, createChainTransport } from "@/lib/blockchain/chains";
import { FAUCET_AMOUNT_ETH, FAUCET_COOLDOWN_MS } from "@/lib/constants";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createProofServiceClient } from "@/lib/proof/supabase";
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

function countBy<T extends string>(
  rows: { status: string }[],
  keys: readonly T[]
): Record<T, number> {
  const counts = {} as Record<T, number>;
  for (const k of keys) counts[k] = 0;
  for (const row of rows) {
    if (counts[row.status as T] !== undefined) counts[row.status as T] += 1;
  }
  return counts;
}

export async function getConsoleSummary(): Promise<ConsoleSummary> {
  const supabase = createProofServiceClient();

  const [whRows, proofRows, outboxRows, memberCount] = await Promise.all([
    supabase.from("warehouses").select("status"),
    supabase.from("proofs").select("status"),
    supabase.from("proof_outbox").select("status"),
    supabase.from("memberships").select("id", { count: "exact", head: true }),
  ]);

  // Audit v0.3.0 §4.9: jangan silent-swallow partial failure — jika salah
  // satu query error, summary angka (total warehouses, total proofs) akan
  // misleading. Log warn + return neutral values agar operator tahu data
  // tidak lengkap.
  if (whRows.error) {
    logger.warn(
      { err: whRows.error.message },
      "console summary: warehouses query failed"
    );
  }
  if (proofRows.error) {
    logger.warn(
      { err: proofRows.error.message },
      "console summary: proofs query failed"
    );
  }
  if (outboxRows.error) {
    logger.warn(
      { err: outboxRows.error.message },
      "console summary: outbox query failed"
    );
  }
  if (memberCount.error) {
    logger.warn(
      { err: memberCount.error.message },
      "console summary: memberships count failed"
    );
  }

  const warehouses = (whRows.data ?? []) as { status: string }[];
  const proofs = (proofRows.data ?? []) as {
    status: (typeof PROOF_STATUSES)[number];
  }[];
  const outbox = (outboxRows.data ?? []) as { status: string }[];

  const outboxCounts = countBy(outbox, [
    "pending",
    "leased",
    "failed",
  ] as const);

  return {
    warehouses: {
      total: warehouses.length,
      active: warehouses.filter((w) => w.status === "active").length,
      suspended: warehouses.filter((w) => w.status === "suspended").length,
    },
    members: memberCount.count ?? 0,
    proofs: {
      total: proofs.length,
      ...countBy(proofs, PROOF_STATUSES),
    },
    outbox: outboxCounts,
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

    const amount = Number(FAUCET_AMOUNT_ETH);
    const balanceNum = Number(balance);
    const affordable = amount > 0 ? Math.floor(balanceNum / amount) : 0;

    return {
      ok: true,
      address: account.address,
      balanceEther: formatEther(balance),
      faucet: {
        amountEther: FAUCET_AMOUNT_ETH,
        cooldownMs: FAUCET_COOLDOWN_MS,
        eligible: balanceNum >= amount,
        affordableClaims: affordable,
        balanceEther: formatEther(balance),
      },
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "treasury probe failed";
    logger.warn({ err: message }, "console treasury probe failed");
    return { ok: false, error: message };
  }
}
