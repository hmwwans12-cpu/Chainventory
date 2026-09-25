import type { OwnershipTransferIntent } from "@/lib/warehouses/members-client";

const STORAGE_PREFIX = "chainventory:ownership-transfer:";
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type OwnershipTransferDraft = {
  intentId: string;
  idempotencyKey: string;
  newOwnerId: string;
  txHash: string | null;
  savedAt: number;
};

function storageKey(warehouseId: string): string {
  return `${STORAGE_PREFIX}${warehouseId}`;
}

function storage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isDraft(value: unknown): value is OwnershipTransferDraft {
  if (!value || typeof value !== "object") return false;
  const draft = value as Partial<OwnershipTransferDraft>;
  return (
    typeof draft.intentId === "string" &&
    typeof draft.idempotencyKey === "string" &&
    typeof draft.newOwnerId === "string" &&
    (typeof draft.txHash === "string" || draft.txHash === null) &&
    typeof draft.savedAt === "number"
  );
}

export function readOwnershipTransferDraft(
  warehouseId: string
): OwnershipTransferDraft | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(storageKey(warehouseId));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isDraft(parsed) || Date.now() - parsed.savedAt > MAX_AGE_MS) {
      store.removeItem(storageKey(warehouseId));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function writeOwnershipTransferDraft(
  warehouseId: string,
  intent: OwnershipTransferIntent,
  txHash: string | null = intent.txHash
): OwnershipTransferDraft {
  const draft: OwnershipTransferDraft = {
    intentId: intent.intentId,
    idempotencyKey: intent.idempotencyKey,
    newOwnerId: intent.newOwnerId,
    txHash,
    savedAt: Date.now(),
  };
  const store = storage();
  try {
    store?.setItem(storageKey(warehouseId), JSON.stringify(draft));
  } catch {
    return draft;
  }
  return draft;
}

export function clearOwnershipTransferDraft(warehouseId: string): void {
  const store = storage();
  try {
    store?.removeItem(storageKey(warehouseId));
  } catch {
    return;
  }
}
