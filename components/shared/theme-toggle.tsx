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
  // FE-04: baca class saat init (inline script layout sudah set sebelum
  // hydrate) — tanpa flip aria-label setelah mount.
  const [dark, setDark] = React.useState(
    () =>
      typeof document !== "undefined" &&
      document.documentElement.classList.contains("dark")
  );
  // Ronde-3 D-class: server selalu render varian light (document undefined).
  // Tanpa guard ini, klien dark (class sudah di-set inline script) hydrate
  // dengan ikon Sun + label berbeda → hydration mismatch di semua halaman.
  // `mounted` memaksa render pertama klien identik dengan server (Moon),
  // lalu flip ke Sun setelah mount — update biasa, bukan mismatch.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    setMounted(true);
  }, []);
  const showDark = mounted && dark;
  const { t } = useLocale();

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
      aria-label={showDark ? t("common.theme.light") : t("common.theme.dark")}
      title={showDark ? t("common.theme.light") : t("common.theme.dark")}
      aria-pressed={showDark}
    >
      {showDark ? (
        <Sun aria-hidden="true" className="size-4" />
      ) : (
        <Moon aria-hidden="true" className="size-4" />
      )}
    </Button>
  );
}
