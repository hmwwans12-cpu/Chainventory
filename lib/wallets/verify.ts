import { recoverMessageAddress } from "viem";

/**
 * Bukti kepemilikan wallet (ownership proof) untuk verifikasi.
 *
 * Masalah: `register_wallet` mencatat wallet sebagai `unverified` dan tidak
 * ada flow yang menandai `verified`, sehingga SEMUA stock movement/intent
 * ditolak P1-03. Verifikasi = pemilik menandatangani challenge bertimestamp
 * dengan wallet-nya (personal_sign, tanpa gas) → server memulihkan address
 * dari signature dan mencocokkannya. Replay tidak berbahaya: challenge hanya
 * bisa menandai verified wallet milik penandatangan sendiri, dan berumur
 * maksimal VERIFY_MESSAGE_TTL_MS.
 */

export const VERIFY_MESSAGE_TTL_MS = 10 * 60 * 1000;
const VERIFY_SKEW_MS = 60 * 1000;

export function buildVerifyMessage(address: string, issuedAt: Date): string {
  return [
    "Chainventory wallet verification",
    `Address: ${address.toLowerCase()}`,
    `Issued at: ${issuedAt.toISOString()}`,
  ].join("\n");
}

export type ParsedVerifyMessage =
  | { ok: true; address: string; issuedAt: number }
  | { ok: false };

export function parseVerifyMessage(message: string): ParsedVerifyMessage {
  const lines = message.split("\n");
  if (lines.length !== 3) return { ok: false };
  const [title, addressLine, issuedLine] = lines;
  if (title !== "Chainventory wallet verification") return { ok: false };
  const address = addressLine.startsWith("Address: ")
    ? addressLine.slice("Address: ".length).trim().toLowerCase()
    : null;
  const issuedRaw = issuedLine.startsWith("Issued at: ")
    ? issuedLine.slice("Issued at: ".length).trim()
    : null;
  if (!address || !/^0x[0-9a-f]{40}$/.test(address)) return { ok: false };
  const issuedAt = issuedRaw ? Date.parse(issuedRaw) : NaN;
  if (!issuedRaw || Number.isNaN(issuedAt)) return { ok: false };
  return { ok: true, address, issuedAt };
}

export function isVerifyMessageFresh(
  issuedAt: number,
  now = Date.now()
): boolean {
  const age = now - issuedAt;
  return age >= -VERIFY_SKEW_MS && age <= VERIFY_MESSAGE_TTL_MS;
}

export async function recoverVerifyAddress(
  message: string,
  signature: `0x${string}`
): Promise<string | null> {
  try {
    const recovered = await recoverMessageAddress({ message, signature });
    return recovered.toLowerCase();
  } catch {
    return null;
  }
}
