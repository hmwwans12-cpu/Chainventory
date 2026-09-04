import { clsx, type ClassValue } from "clsx";
import { formatEther } from "viem";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Formatter tanggal/waktu dengan locale TERKUNCI ("en-US").
 * Alasan: Date.toLocale*() tanpa locale eksplisit memakai locale runtime
 * (Node saat SSR, browser saat hidrasi) sehingga bisa hydration mismatch.
 */
const FIXED_LOCALE = "en-US";

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(FIXED_LOCALE, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(FIXED_LOCALE, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatTimeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} min ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  if (d < 7) return `${d}d ago`;
  return formatDate(iso);
}

export function formatChartDay(isoDay: string): string {
  return new Date(`${isoDay}T00:00:00`).toLocaleDateString(FIXED_LOCALE, {
    month: "short",
    day: "numeric",
  });
}

/**
 * Wei -> string ETH dengan locale terkunci & presisi 4 desimal
 * (audit DRY #5: sebelumnya duplikat di settings & dashboard).
 */
export function formatEthValue(wei: bigint): string {
  return Number(formatEther(wei)).toLocaleString("en-US", {
    maximumFractionDigits: 4,
  });
}

/**
 * Format nilai ETH dalam satuan decimal (string/angka) dengan pemisah ribuan
 * dan maksimal 4 angka desimal — konsisten dengan formatEthValue.
 */
export function formatEthDecimal(value: string | number): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "\u2014";
  return n.toLocaleString("en-US", { maximumFractionDigits: 4 });
}

/**
 * Inisial untuk avatar — satu sumber (audit C1). Menangani null, undefined,
 * DAN string kosong (""). `fallback` dipakai bila tak ada nama/email.
 */
export function getInitials(
  name?: string | null,
  email?: string | null,
  fallback = "?"
): string {
  const source = (name || email || "").trim();
  if (!source) return fallback;
  return source.charAt(0).toUpperCase();
}

/**
 * Permissive but practical email validator (audit v0.3.9 H-18).
 * The previous `/^[^@\s]+@[^@\s]+\.[^@\s]+$/` regex accepted "a@b.c"
 * (a single-char TLD). This regex requires:
 *   - local part: 1+ chars that aren't @ or whitespace
 *   - @ symbol
 *   - domain: 1+ chars that aren't @ or whitespace
 *   - dot
 *   - TLD: 2+ letters (so "a@b.c" is rejected; "a@b.co" is accepted)
 * It is not RFC 5322 — that would be massively complex and reject valid
 * addresses — but it is good enough for client-side pre-validation. The
 * authoritative check is the Zod schema on the server.
 */
export function isValidEmail(input: string | null | undefined): boolean {
  if (!input) return false;
  return /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(input.trim());
}
