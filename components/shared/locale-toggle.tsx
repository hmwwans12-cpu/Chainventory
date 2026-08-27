"use client";

import { Check, Globe } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { LOCALES } from "@/lib/i18n/translations";
import { useLocale } from "@/components/providers/locale-provider";

/**
 * Pengalih bahasa EN/ID (audit New#4). Menyimpan pilihan via LocaleProvider
 * (cookie `locale` + `<html lang>`). Menerjemahkan shell client (sidebar,
 * command palette, header). Konten server (landing/docs) menyusul.
 */
export function LocaleToggle() {
  const { locale, setLocale, t } = useLocale();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={t("common.language")}
            title={t("common.language")}
          />
        }
      >
        <Globe aria-hidden="true" className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("common.language")}</DropdownMenuLabel>
        </DropdownMenuGroup>
        {LOCALES.map((l) => (
          <DropdownMenuItem
            key={l.value}
            onClick={() => setLocale(l.value)}
            aria-current={locale === l.value}
          >
            <span className="flex-1">{l.label}</span>
            {locale === l.value ? (
              <Check aria-hidden="true" className="text-primary size-4" />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
