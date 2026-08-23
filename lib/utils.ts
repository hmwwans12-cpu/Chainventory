import { clsx, type ClassValue } from "clsx";
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
