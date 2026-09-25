import { toCanonicalDecimal } from "@/lib/proof/payload";

export type IntentReplayRequest = {
  actorUserId: string;
  warehouseId: string;
  productId: string;
  movementType: string;
  quantity: string;
  expectedBalanceVersion?: string | null;
  reason?: string | null;
  reference?: string | null;
  actorWallet?: string | null;
};

export type IntentReplayRecord = {
  warehouse_id: string;
  product_id: string;
  movement_type: string;
  quantity: string | number;
  expected_balance_version: string | number | null;
  reason: string | null;
  reference: string | null;
  actor_wallet: string;
  request_fingerprint?: string | null;
  payload: unknown;
  created_at?: string | null;
};

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function version(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

function payloadValue(payload: unknown, key: string): unknown {
  if (!payload || typeof payload !== "object") return undefined;
  return (payload as Record<string, unknown>)[key];
}

export function isIntentReplayCompatible(
  record: IntentReplayRecord,
  request: IntentReplayRequest,
  expectedFingerprint: string
): boolean {
  const actorUserMatches =
    payloadValue(record.payload, "actorUserId") === undefined ||
    payloadValue(record.payload, "actorUserId") === request.actorUserId;
  const payloadMatches =
    payloadValue(record.payload, "warehouseId") === undefined ||
    payloadValue(record.payload, "warehouseId") === request.warehouseId;
  const productMatches =
    payloadValue(record.payload, "productId") === undefined ||
    payloadValue(record.payload, "productId") === request.productId;
  const movementMatches =
    payloadValue(record.payload, "movementType") === undefined ||
    payloadValue(record.payload, "movementType") === request.movementType;
  const quantityMatches =
    payloadValue(record.payload, "quantity") === undefined ||
    toCanonicalDecimal(String(payloadValue(record.payload, "quantity"))) ===
      toCanonicalDecimal(request.quantity);
  const reasonMatches =
    payloadValue(record.payload, "reason") === undefined ||
    text(payloadValue(record.payload, "reason")) === text(request.reason);
  const referenceMatches =
    payloadValue(record.payload, "reference") === undefined ||
    text(payloadValue(record.payload, "reference")) === text(request.reference);
  const actorMatches =
    payloadValue(record.payload, "actorWallet") === undefined ||
    text(payloadValue(record.payload, "actorWallet")).toLowerCase() ===
      text(request.actorWallet).toLowerCase();

  const rowMatches =
    record.warehouse_id === request.warehouseId &&
    record.product_id === request.productId &&
    record.movement_type === request.movementType &&
    toCanonicalDecimal(String(record.quantity)) ===
      toCanonicalDecimal(request.quantity) &&
    version(record.expected_balance_version) ===
      version(request.expectedBalanceVersion) &&
    text(record.reason) === text(request.reason) &&
    text(record.reference) === text(request.reference) &&
    text(record.actor_wallet).toLowerCase() ===
      text(request.actorWallet).toLowerCase();

  if (
    !rowMatches ||
    !actorUserMatches ||
    !payloadMatches ||
    !productMatches ||
    !movementMatches
  ) {
    return false;
  }
  if (
    !quantityMatches ||
    !reasonMatches ||
    !referenceMatches ||
    !actorMatches
  ) {
    return false;
  }
  return (
    !record.request_fingerprint ||
    record.request_fingerprint === expectedFingerprint
  );
}

export function getIntentOccurredAt(record: IntentReplayRecord): string {
  const payloadOccurredAt = payloadValue(record.payload, "occurredAt");
  if (typeof payloadOccurredAt === "string" && payloadOccurredAt.trim()) {
    return payloadOccurredAt;
  }
  return record.created_at ?? "1970-01-01T00:00:00.000Z";
}
