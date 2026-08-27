import { cache } from "react";
import { cookies } from "next/headers";
import type { Locale } from "./translations";

/**
 * Server-side locale reader (cached per request). Use this in server components
 * that need to translate their own text. For live, instant switching driven by
 * the client <LocaleProvider>, use `useLocale()` in client components instead.
 */
export const getLocale = cache(async (): Promise<Locale> => {
  const store = await cookies();
  const value = store.get("locale")?.value;
  return value === "id" ? "id" : "en";
});
