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

