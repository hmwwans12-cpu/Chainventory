/**
 * Verifikasi transaksi wallet-paid proof — stock intent v2 (PRD §32b).
 *
 * Audit N-1 (2026-08-23): action `finalize` tidak boleh percaya "receipt
 * sukses apa pun". Sebelum commit inventory, BFF wajib membuktikan bahwa tx
 * yang diklaim user:
 *   1. berstatus sukses (receipt),
 *   2. dikirim KE contract warehouse yang tepat,
 *   3. memanggil `recordProof` dengan proofId = keccak256(intent id),
 *   4. mengeset actor = wallet intent (bukan wallet orang lain).
 * Fungsi ini murni (tanpa network) agar mudah di-unit-test; Route Handler
 * yang mengambil tx/receipt dari RPC.
 */

import { decodeFunctionData, keccak256, toBytes, type Hex } from "viem";

export const warehouseProofAbi = [
  {
    type: "function",
    name: "recordProof",
    stateMutability: "nonpayable",
    inputs: [
      { name: "proofId", type: "bytes32" },
      { name: "payloadHash", type: "bytes32" },
      { name: "actor", type: "address" },
      { name: "eventType", type: "string" },
      { name: "timestamp", type: "uint256" },
      { name: "txMetadata", type: "bytes" },
    ],
    outputs: [],
  },
] as const;

export interface IntentProofTx {
  /** Alamat kontrak tujuan tx (null untuk contract creation). */
  to: string | null;
  /** Wallet pengirim menurut receipt/tx. */
  from: string;
  /** Calldata mentah tx. */
  input: Hex;
  /** Status receipt ("success" | "reverted" | undefined bila belum ada). */
  status: string | undefined;
}

export interface IntentExpectation {
  contractAddress: string;
  actorWallet: string;
  intentId: string;
}

export type IntentProofVerdict = { ok: true } | { ok: false; reason: string };

export function verifyIntentProofTx(
  tx: IntentProofTx,
  expected: IntentExpectation
): IntentProofVerdict {
  if ((tx.status ?? "") !== "success")
    return { ok: false, reason: "transaction reverted" };

  if (!tx.to)
    return { ok: false, reason: "transaction has no contract recipient" };
  if (tx.to.toLowerCase() !== expected.contractAddress.toLowerCase())
    return { ok: false, reason: "sent to a different contract" };

  let decoded: ReturnType<typeof decodeFunctionData<typeof warehouseProofAbi>>;
  try {
    decoded = decodeFunctionData({
      abi: warehouseProofAbi,
      data: tx.input,
    });
  } catch {
    return { ok: false, reason: "not a recordProof call" };
  }
  if (decoded.functionName !== "recordProof")
    return { ok: false, reason: "not a recordProof call" };

  const [proofId, , actor] = decoded.args;
  const expectedProofId = keccak256(toBytes(expected.intentId));
  if (proofId.toLowerCase() !== expectedProofId.toLowerCase())
    return { ok: false, reason: "proof id mismatch" };
  if (actor.toLowerCase() !== expected.actorWallet.toLowerCase())
    return { ok: false, reason: "actor wallet mismatch" };

  return { ok: true };
}
