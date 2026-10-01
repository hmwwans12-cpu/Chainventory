"use client";

import * as React from "react";
import { AlertTriangle } from "lucide-react";

import { useLocale } from "@/components/providers/locale-provider";

type Check = { key: string; ok: boolean; detail: string };

/**
 * Banner kesehatan environment (P0 audit): muncul HANYA bila ada check
 * yang gagal (factory/JWKS/RPC/Privy/treasury). Sebelum ini app boot
 * normal walau env rusak dan error baru muncul saat user klik — banner
 * ini menangkapnya di awal. Fetch sekali saat mount; diam bila sehat.
 */
export function StartupHealthBanner() {
  const { t } = useLocale();
  const [failed, setFailed] = React.useState<Check[] | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/health/startup", {
          headers: { "content-type": "application/json" },
        });
        const body = (await res.json().catch(() => null)) as {
          checks?: Check[];
        } | null;
        if (!cancelled && body && !res.ok && Array.isArray(body.checks)) {
          setFailed(body.checks.filter((c) => !c.ok));
        }
      } catch {
        // Fail-silent: banner hanya informasi, jangan ganggu dashboard bila
        // endpoint sendiri unreachable (auth/rate-limit).
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!failed || failed.length === 0) return null;

  return (
    <div
      role="alert"
      className="bg-status-err-bg/80 border-status-err-border/60 text-status-err-fg mb-4 flex items-start gap-2.5 rounded-xl border p-3 text-xs leading-snug"
    >
      <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
      <span className="flex-1">
        {t("health.startup_degraded")}{" "}
        {failed.map((c) => `${c.key}: ${c.detail}`).join(" · ")}
      </span>
    </div>
  );
}
