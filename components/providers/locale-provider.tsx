"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import { translate, type Locale } from "@/lib/i18n/translations";

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: string, params?: Record<string, string>) => string;
};

const LocaleContext = React.createContext<LocaleContextValue | null>(null);

const COOKIE = "locale";
const MAX_AGE = 60 * 60 * 24 * 365;

function readCookie(): Locale {
  if (typeof document === "undefined") return "en";
  const match = document.cookie.match(/(?:^|;\s*)locale=([^;]+)/);
  return match && match[1] === "id" ? "id" : "en";
}

/**
 * Provider bahasa EN/ID (audit New#4). Locale disimpan di cookie `locale`
 * agar server & client sama, dan men-set `<html lang>`. Komponen client
 * (sidebar, command palette, header) membaca via `useLocale().t(key)`.
 */
export function LocaleProvider({
  children,
  initialLocale = "en",
}: {
  children: React.ReactNode;
  initialLocale?: Locale;
}) {
  const router = useRouter();
  const [locale, setLocaleState] = React.useState<Locale>(initialLocale);

  React.useEffect(() => {
    const initial = readCookie();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLocaleState(initial);
    document.documentElement.lang = initial;
  }, []);

  const setLocale = React.useCallback(
    (next: Locale) => {
      setLocaleState(next);
      document.cookie = `${COOKIE}=${next}; path=/; max-age=${MAX_AGE}`;
      document.documentElement.lang = next;
      // Paksa server component (dashboard/settings cs) membaca cookie locale
      // terbaru sehingga seluruh halaman ikut berganti bahasa, bukan hanya
      // komponen client (audit: toggle EN/ID sebelumnya tidak mengubah teks server).
      router.refresh();
    },
    [router]
  );

  const t = React.useCallback(
    (key: string, params?: Record<string, string>) =>
      translate(locale, key, params),
    [locale]
  );

  const value = React.useMemo<LocaleContextValue>(
    () => ({ locale, setLocale, t }),
    [locale, setLocale, t]
  );

  return (
    <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>
  );
}

export function useLocale(): LocaleContextValue {
  const ctx = React.useContext(LocaleContext);
  if (!ctx) {
    return {
      locale: "en",
      setLocale: () => {},
      t: (key: string) => translate("en", key),
    };
  }
  return ctx;
}
