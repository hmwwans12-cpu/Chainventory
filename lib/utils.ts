import { clsx, type ClassValue } from "clsx";
import { formatEther } from "viem";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const DEFAULT_LOCALE = "en-US";
const DEFAULT_TIME_ZONE = "Asia/Jakarta";

export type DateFormatOptions = {
  locale?: string;
  timeZone?: string;
};

export type RelativeTimeOptions = DateFormatOptions & {
  now?: number;
  style?: Intl.RelativeTimeFormatOptions["style"];
  numeric?: Intl.RelativeTimeFormatOptions["numeric"];
};

type ResolvedDateFormatOptions = {
  locale: string;
  timeZone: string;
};

function resolveDateFormatOptions(
  localeOrOptions?: string | DateFormatOptions,
  timeZone?: string
): ResolvedDateFormatOptions {
  if (typeof localeOrOptions === "object" && localeOrOptions !== null) {
    return {
      locale: localeOrOptions.locale || DEFAULT_LOCALE,
      timeZone: localeOrOptions.timeZone || DEFAULT_TIME_ZONE,
    };
  }
  return {
    locale: localeOrOptions || DEFAULT_LOCALE,
    timeZone: timeZone || DEFAULT_TIME_ZONE,
  };
}

function formatDateValue(
  date: Date,
  locale: string,
  timeZone: string,
  options: Intl.DateTimeFormatOptions
): string {
  try {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone }).format(
      date
    );
  } catch {
    return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
      ...options,
      timeZone: DEFAULT_TIME_ZONE,
    }).format(date);
  }
}

export function formatDate(
  iso: string,
  localeOrOptions?: string | DateFormatOptions,
  timeZone?: string
): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const { locale, timeZone: resolvedTimeZone } = resolveDateFormatOptions(
    localeOrOptions,
    timeZone
  );
  return formatDateValue(date, locale, resolvedTimeZone, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatDateTime(
  iso: string,
  localeOrOptions?: string | DateFormatOptions,
  timeZone?: string
): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const { locale, timeZone: resolvedTimeZone } = resolveDateFormatOptions(
    localeOrOptions,
    timeZone
  );
  return formatDateValue(date, locale, resolvedTimeZone, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function createRelativeTimeFormatter(
  locale: string,
  style: Intl.RelativeTimeFormatOptions["style"],
  numeric: Intl.RelativeTimeFormatOptions["numeric"]
): Intl.RelativeTimeFormat {
  try {
    return new Intl.RelativeTimeFormat(locale, { style, numeric });
  } catch {
    return new Intl.RelativeTimeFormat(DEFAULT_LOCALE, {
      style: "narrow",
      numeric: "always",
    });
  }
}

export function formatTimeAgo(
  iso: string,
  locale?: string,
  now?: number
): string;
export function formatTimeAgo(
  iso: string,
  options?: RelativeTimeOptions
): string;
export function formatTimeAgo(
  iso: string,
  now?: number,
  locale?: string
): string;
export function formatTimeAgo(
  iso: string,
  localeOrNowOrOptions: string | number | RelativeTimeOptions = DEFAULT_LOCALE,
  nowOrLocale?: number | string | RelativeTimeOptions
): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";

  let locale = DEFAULT_LOCALE;
  let timeZone = DEFAULT_TIME_ZONE;
  let now = Date.now();
  let style: Intl.RelativeTimeFormatOptions["style"] = "narrow";
  let numeric: Intl.RelativeTimeFormatOptions["numeric"] = "always";

  if (typeof localeOrNowOrOptions === "string") {
    locale = localeOrNowOrOptions;
    if (typeof nowOrLocale === "number") {
      now = nowOrLocale;
    } else if (typeof nowOrLocale === "object" && nowOrLocale !== null) {
      now = nowOrLocale.now ?? now;
      locale = nowOrLocale.locale || locale;
      timeZone = nowOrLocale.timeZone || timeZone;
      style = nowOrLocale.style ?? style;
      numeric = nowOrLocale.numeric ?? numeric;
    }
  } else if (typeof localeOrNowOrOptions === "number") {
    now = localeOrNowOrOptions;
    if (typeof nowOrLocale === "string") {
      locale = nowOrLocale;
    } else if (typeof nowOrLocale === "object" && nowOrLocale !== null) {
      now = nowOrLocale.now ?? now;
      locale = nowOrLocale.locale || locale;
      timeZone = nowOrLocale.timeZone || timeZone;
      style = nowOrLocale.style ?? style;
      numeric = nowOrLocale.numeric ?? numeric;
    }
  } else if (localeOrNowOrOptions !== null) {
    now = localeOrNowOrOptions.now ?? now;
    locale = localeOrNowOrOptions.locale || locale;
    timeZone = localeOrNowOrOptions.timeZone || timeZone;
    style = localeOrNowOrOptions.style ?? style;
    numeric = localeOrNowOrOptions.numeric ?? numeric;
  }

  if (!Number.isFinite(now)) return "—";
  const formatter = createRelativeTimeFormatter(locale, style, numeric);
  const diff = now - date.getTime();
  const seconds = Math.floor(diff / 1000);
  const absoluteSeconds = Math.abs(seconds);
  if (absoluteSeconds < 60) return formatter.format(-seconds, "second");
  const minutes = Math.floor(absoluteSeconds / 60);
  if (minutes < 60)
    return formatter.format(Math.trunc(-seconds / 60), "minute");
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return formatter.format(Math.trunc(-seconds / 3600), "hour");
  const days = Math.floor(hours / 24);
  if (days < 7) return formatter.format(Math.trunc(-seconds / 86400), "day");
  return formatDate(iso, { locale, timeZone });
}

export function formatChartDay(
  isoDay: string,
  localeOrOptions?: string | DateFormatOptions,
  timeZone?: string
): string {
  const date = new Date(`${isoDay}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "—";
  const { locale, timeZone: resolvedTimeZone } = resolveDateFormatOptions(
    localeOrOptions,
    timeZone
  );
  return formatDateValue(date, locale, resolvedTimeZone, {
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
 * Alamat/hash pendek "0x12ab…cdef" — satu sumber (FE-23: sebelumnya 3
 * implementasi slice(0,6) dengan karakter ellipsis berbeda).
 */
export function shortenAddress(address: string, head = 6, tail = 4): string {
  if (address.length <= head + tail + 1) return address;
  return `${address.slice(0, head)}…${address.slice(-tail)}`;
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
