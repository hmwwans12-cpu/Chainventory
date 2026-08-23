import { keccak256, toBytes } from "viem";

import { canonicalize } from "@/lib/proof/jcs";

/**
 * Proof payload hash = JCS RFC 8785 → UTF-8 → Keccak-256 (P1 Step 5 prep).
 *
 * Payload immutable: `hash_version = 1` (PLAN_04 §7.6); old hash tidak
 * pernah diinterpretasi ulang. Numeric sudah dalam bentuk canonical decimal
 * string sebelum `canonicalize` (ditegakkan di `jcs` — BigInt ditolak).
 */
export const PROOF_HASH_VERSION = 1;

export function hashProofPayload(payload: unknown): string {
  const canonical = canonicalize(payload);
  return keccak256(toBytes(canonical));
}
