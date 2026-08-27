"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeftRight,
  Bell,
  ChartNoAxesCombined,
  FileSearch,
  LayoutDashboard,
  Package,
  ReceiptText,
  Search,
  Settings,
  SquareTerminal,
  UserPlus,
  Users,
  Warehouse,
} from "lucide-react";

import {
  Dialog as DialogPrimitive,
} from "@base-ui/react/dialog";
import { cn } from "@/lib/utils";
import { useLocale } from "@/components/providers/locale-provider";

type Command = {
  id: string;
  label: string;
  i18nKey: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  group: "Navigate" | "Quick action";
};

const COMMANDS: Command[] = [
  { id: "dashboard", label: "Dashboard", i18nKey: "nav./dashboard", href: "/dashboard", icon: LayoutDashboard, group: "Navigate" },
  { id: "products", label: "Products", i18nKey: "cmd.products", href: "/inventory/products", icon: Package, group: "Navigate" },
  { id: "movements", label: "Stock Movements", i18nKey: "cmd.movements", href: "/inventory/movements", icon: ArrowLeftRight, group: "Navigate" },
  { id: "transactions", label: "Transactions", i18nKey: "cmd.transactions", href: "/transactions", icon: ReceiptText, group: "Navigate" },
  { id: "members", label: "Members", i18nKey: "cmd.members", href: "/members", icon: Users, group: "Navigate" },
  { id: "notifications", label: "Notifications", i18nKey: "cmd.notifications", href: "/notifications", icon: Bell, group: "Navigate" },
  { id: "blockchain", label: "Audit Explorer", i18nKey: "cmd.audit_explorer", href: "/blockchain", icon: FileSearch, group: "Navigate" },
  { id: "analytics", label: "Analytics", i18nKey: "cmd.analytics", href: "/analytics", icon: ChartNoAxesCombined, group: "Navigate" },
  { id: "settings", label: "Settings", i18nKey: "cmd.settings", href: "/settings", icon: Settings, group: "Navigate" },
  { id: "create", label: "Create Warehouse", i18nKey: "cmd.create_warehouse", href: "/onboarding/create", icon: Warehouse, group: "Quick action" },
  { id: "join", label: "Join Warehouse", i18nKey: "cmd.join_warehouse", href: "/onboarding/join", icon: UserPlus, group: "Quick action" },
  { id: "console", label: "Developer Console", i18nKey: "cmd.developer_console", href: "/console", icon: SquareTerminal, group: "Quick action" },
];

/**
 * Command palette (⌘K) — audit UI/UX 0.1.8 §9. Quick-jump antar halaman
 * dan aksi umum. Tanpa dependensi cmdk: filter + navigasi sederhana dengan
 * keyboard penuh (↑/↓/Enter). Base UI Dialog (sudah ada di stack).
 */
export function CommandMenu() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useLocale();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);

  const results = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return COMMANDS;
    return COMMANDS.filter((c) => c.label.toLowerCase().includes(q));
  }, [query]);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function go(cmd: Command | undefined) {
    if (!cmd) return;
    setOpen(false);
    setQuery("");
    // Pertahankan konteks warehouse aktif (audit: ⌘K membuang ?warehouse).
    const wh = searchParams.get("warehouse");
    const href = wh ? `${cmd.href}?warehouse=${encodeURIComponent(wh)}` : cmd.href;
    router.push(href);
  }

  function onInputKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(results[active]);
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-black/50 transition-opacity duration-150 data-ending-style:opacity-0 data-starting-style:opacity-0 supports-backdrop-filter:backdrop-blur-xs" />
        <DialogPrimitive.Popup
          className="bg-popover text-popover-foreground border-border fixed top-[15%] left-1/2 z-50 max-h-[min(80vh,32rem)] w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border bg-clip-padding shadow-lg outline-none transition duration-150 ease-out data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0"
          aria-label="Command palette"
        >
          <DialogPrimitive.Title className="sr-only">
            Command palette
          </DialogPrimitive.Title>
          <div className="border-border flex items-center gap-2 border-b px-3">
            <Search aria-hidden="true" className="text-muted-foreground size-4 shrink-0" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={onInputKey}
              placeholder={t("cmd.search")}
              aria-label={t("cmd.search")}
              role="combobox"
              aria-expanded={open}
              aria-controls="command-listbox"
              aria-activedescendant={
                results.length > 0 ? results[active]?.id : undefined
              }
              autoFocus
              className="text-foreground placeholder:text-muted-foreground focus-visible:ring-ring focus-visible:ring-2 h-11 w-full bg-transparent text-sm outline-none"
            />
            <kbd className="text-muted-foreground hidden rounded border px-1.5 py-0.5 font-mono text-xs sm:inline">
              ESC
            </kbd>
          </div>

          <ul
            id="command-listbox"
            role="listbox"
            aria-label="Commands"
            className="flex flex-col gap-0.5 overflow-y-auto p-2"
          >
            {results.length === 0 ? (
              <li className="text-muted-foreground px-3 py-6 text-center text-sm">
                No results for “{query}”.
              </li>
            ) : (
              results.map((cmd, i) => {
                const Icon = cmd.icon;
                return (
                  <li
                    key={cmd.id}
                    id={cmd.id}
                    role="option"
                    aria-selected={i === active}
                  >
                    <button
                      type="button"
                      onClick={() => go(cmd)}
                      onMouseMove={() => setActive(i)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                        i === active
                          ? "bg-muted text-foreground"
                          : "text-foreground hover:bg-muted/60"
                      )}
                    >
                      <Icon aria-hidden="true" className="text-muted-foreground size-4 shrink-0" />
                      <span className="flex-1 truncate">{t(cmd.i18nKey ?? cmd.label)}</span>
                      <span className="text-muted-foreground text-xs uppercase tracking-wide">
                        {cmd.group === "Navigate"
                          ? t("cmd.group.navigate")
                          : t("cmd.group.action")}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
