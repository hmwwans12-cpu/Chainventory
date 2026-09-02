/**
 * Audit v0.3.4 §2.19: util sanitasi pesan error untuk ditampilkan di
 * konsol. Memotong kalimat pertama (sebelum .!?\n) dan batasi panjang
 * untuk mencegah bocor URL RPC, chain id, atau stack trace panjang ke UI.
 */
export function sanitizeConsoleError(
  raw: string | null | undefined,
  fallback = "Probe failed."
): string {
  if (!raw) return fallback;
  const firstSentence = raw.split(/[.!?\n]/)[0]?.trim();
  if (!firstSentence) return fallback;
  if (firstSentence.length > 120) {
    return `${fallback} See server logs.`;
  }
  return firstSentence;
}
