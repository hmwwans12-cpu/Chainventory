"use client";

import * as React from "react";
import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { useLocale } from "@/components/providers/locale-provider";

/**
 * Toggle tema terang/gelap (audit UI/UX 0.1.8 §6). Tanpa next-themes:
 * membaca/menulis class `.dark` di <html> + persist di localStorage.
 * Token warna gelap sudah siap di globals.css (DESIGN §5) sehingga seluruh
 * surfaces ikut berganti via CSS variable.
 */
export function ThemeToggle() {
  const [dark, setDark] = React.useState(false);
  const { t } = useLocale();

  React.useEffect(() => {
    const isDark = document.documentElement.classList.contains("dark");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDark(isDark);
  }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {
      // localStorage tidak tersedia — abaikan
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={toggle}
      aria-label={dark ? t("common.theme.light") : t("common.theme.dark")}
      aria-pressed={dark}
    >
      {dark ? (
        <Sun aria-hidden="true" className="size-4" />
      ) : (
        <Moon aria-hidden="true" className="size-4" />
      )}
    </Button>
  );
}
