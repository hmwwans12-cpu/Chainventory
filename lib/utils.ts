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

/**
 * Wei -> string ETH dengan locale terkunci & presisi 4 desimal
 * (audit DRY #5: sebelumnya duplikat di settings & dashboard).
 */
export function formatEthValue(wei: bigint): string {
  return Number(formatEther(wei)).toLocaleString("en-US", {
    maximumFractionDigits: 4,
  });
}
