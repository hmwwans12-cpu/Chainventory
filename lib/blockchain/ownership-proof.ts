import { decodeFunctionData, type Hex } from "viem";

/**
 * Verifikasi transaksi transferOwnership warehouse (temuan audit #4).
 *
 * Pola yang SAMA dengan verifyIntentProofTx (intent-proof.ts): BFF tidak
 * boleh percaya "receipt sukses apa pun". Sebelum sinkron DB, buktikan tx:
 *   1. berstatus sukses (receipt),
 *   2. dikirim KE contract warehouse yang tepat,
 *   3. memanggil `transferOwnership(address)` (bukan fungsi lain),
 *   4. dikirim DARI owner on-chain saat ini (onlyOwner ditegakkan kontrak,
 *      tapi cek eksplisit memberi pesan error yang jelas),
 *   5. argumen newOwner SAMA dengan wallet primary terverifikasi milik
 *      member target (mengikat tx ke pilihan user di dialog — tanpa ini
 *      penyerang bisa submit tx transfer ke alamatnya sendiri).
 * Fungsi ini murni (tanpa network) agar mudah di-unit-test; Route Handler
 * yang mengambil tx/receipt/owner dari RPC.
 */

export const warehouseOwnershipAbi = [
  {
    type: "function",
    name: "transferOwnership",
    stateMutability: "nonpayable",
    inputs: [{ name: "newOwner", type: "address" }],
    outputs: [],
  },
] as const;

export interface OwnershipTransferTx {
  /** Alamat kontrak tujuan tx (null untuk contract creation). */
  to: string | null;
  /** Wallet pengirim menurut tx. */
  from: string;
  /** Calldata mentah tx. */
  input: Hex;
  /** Status receipt ("success" | "reverted" | undefined bila belum ada). */
  status: string | undefined;
}

export interface OwnershipTransferExpectation {
  contractAddress: string;
  currentOwnerWallet: string;
  newOwnerWallet: string;
}

export type OwnershipTransferVerdict =
  { ok: true; newOwner: string } | { ok: false; reason: string };

/**
 * Wiring expectation untuk route handler transfer_confirm
 * (fix audit §10.1 / P0-1 — regresi kritis wiring).
 *
 * Aturan yang dikunci helper ini:
 *  - `currentOwnerWallet` WAJIB dari `warehouses.on_chain_owner_wallet` di DB
 *    (state PRA-transfer; kolom ini baru berubah saat RPC
 *    `confirm_ownership_transfer` sukses). JANGAN pakai hasil
 *    `readContract(owner)` yang dibaca SETELAH tx mined — nilainya sudah
 *    menjadi owner BARU sehingga cek `tx.from == currentOwner` selalu gagal
 *    untuk transfer yang valid.
 *  - `onChainOwnerAfter` (hasil `readContract(owner)` pasca-mined) dipakai
 *    sebagai POST-CONDITION: harus sama dengan wallet target. Bila beda,
 *    transfer belum terlihat di RPC / target salah — tolak fail-closed
 *    sebelum sinkron DB.
 */
export interface TransferExpectationInput {
  contractAddress: string;
  /** State PRA-transfer dari DB (`warehouses.on_chain_owner_wallet`). */
  dbOwnerWallet: string;
  /** Hasil `owner()` pasca-tx mined (state SETELAH transfer). */
  onChainOwnerAfter: string;
  /** Wallet primary verified milik member target (otoritatif dari DB). */
  targetWallet: string;
}

export function resolveOwnershipTransferExpectation(
  input: TransferExpectationInput
):
  | { ok: true; expectation: OwnershipTransferExpectation }
  | { ok: false; reason: string } {
  if (
    input.onChainOwnerAfter.toLowerCase() !== input.targetWallet.toLowerCase()
  ) {
    return {
      ok: false,
      reason:
        "on-chain owner does not match the selected member wallet yet (transaction may still be propagating, or it targets a different address)",
    };
  }
  return {
    ok: true,
    expectation: {
      contractAddress: input.contractAddress,
      currentOwnerWallet: input.dbOwnerWallet,
      newOwnerWallet: input.targetWallet,
    },
  };
}
export function verifyOwnershipTransferCall(
  tx: Omit<OwnershipTransferTx, "status">,
  expected: OwnershipTransferExpectation
): OwnershipTransferVerdict {
  if (
    !tx.to ||
    tx.to.toLowerCase() !== expected.contractAddress.toLowerCase()
  ) {
    return { ok: false, reason: "transaction targets another contract" };
  }
  let decoded: { functionName: string; args: readonly unknown[] };
  try {
    decoded = decodeFunctionData({
      abi: warehouseOwnershipAbi,
      data: tx.input,
    });
  } catch {
    return { ok: false, reason: "transaction is not a transferOwnership call" };
  }
  if (decoded.functionName !== "transferOwnership") {
    return { ok: false, reason: "transaction is not a transferOwnership call" };
  }
  const [newOwner] = decoded.args as [`0x${string}`];
  if (!newOwner) {
    return { ok: false, reason: "transferOwnership call has no newOwner arg" };
  }
  if (tx.from.toLowerCase() !== expected.currentOwnerWallet.toLowerCase()) {
    return { ok: false, reason: "transaction sender is not the current owner" };
  }
  if (newOwner.toLowerCase() !== expected.newOwnerWallet.toLowerCase()) {
    return {
      ok: false,
      reason: "transfer target differs from selected member wallet",
    };
  }
  return { ok: true, newOwner: newOwner.toLowerCase() };
}

export function verifyOwnershipTransferTx(
  tx: OwnershipTransferTx,
  expected: OwnershipTransferExpectation
): OwnershipTransferVerdict {
  if (tx.status !== "success") {
    return { ok: false, reason: "transaction not successful" };
  }
  return verifyOwnershipTransferCall(tx, expected);
}
