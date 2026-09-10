import { Suspense } from "react";
import Link from "next/link";
import { ChevronRight, Wallet } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { getInitials, shortenAddress } from "@/lib/utils";
import { roleLabel } from "@/lib/auth/permissions";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { WalletBalance } from "@/components/shared/wallet-balance";

/**
 * Profile / Wallet Card (DESIGN §30) — elemen pembuka Dashboard.
 *
 * Seluruh kartu adalah satu target klik menuju Settings (Profile & Wallet):
 * target besar sesuai Fitts. Menampilkan Name, Role, Wallet Address, dan
 * Base Sepolia Balance; Warehouse + Contract Address opsional bila ada.
 * Saldo di-stream via <WalletBalance> (Suspense) — halaman tidak memblock
 * menunggu RPC (audit #7).
 */
export function ProfileWalletCard({
  name,
  role,
  walletAddress,
  warehouseName,
  warehouseId,
  warehouseCode,
  contractAddress,
}: {
  name: string;
  role: string;
  walletAddress: string | null;
  warehouseName?: string;
  warehouseId?: string;
  warehouseCode?: string | null;
  contractAddress?: string | null;
}) {
  const initial = getInitials(name, null, "?");

  return (
    <Link
      href={warehouseId ? `/settings?warehouse=${warehouseId}` : "/settings"}
      // FE-19: label gabungan agar SR tidak mendengar "ETH + saldo" terpotong
      // tanpa konteks (nilai saldo async tetap diumumkan terpisah).
      aria-label={`${name}, open profile and wallet settings`}
      className="focus-visible:ring-ring group hover:border-primary block rounded-xl transition-all hover:shadow-(--shadow-elevated) focus-visible:ring-3 focus-visible:outline-none"
    >
      <Card className="p-4">
        <CardContent className="flex flex-col justify-between gap-4 p-0 md:flex-row md:items-center">
          {/* Primary identity — name + role (visual weight 1) */}
          <div className="flex min-w-0 items-center gap-4">
            <span className="bg-primary text-primary-foreground font-display flex size-12 shrink-0 items-center justify-center rounded-full text-lg font-bold shadow-sm">
              {initial}
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <span className="t-headline-sm text-foreground truncate">
                  {name}
                </span>
                <Badge variant="success">{roleLabel(role)}</Badge>
              </div>
              {/* Secondary — warehouse name + code */}
              {warehouseName ? (
                <span className="text-muted-foreground t-body-sm flex items-center gap-1.5">
                  <span className="truncate">{warehouseName}</span>
                  {warehouseCode ? (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="t-code text-primary font-medium">
                        {warehouseCode}
                      </span>
                    </>
                  ) : null}
                </span>
              ) : null}
            </div>
          </div>

          {/* Utility — balance + network, right aligned desktop */}
          <div className="flex items-center gap-3.5 self-end md:self-auto">
            <div className="flex flex-col gap-0.5 text-right">
              <span className="flex items-center justify-end gap-2">
                <Suspense fallback={<Skeleton className="h-5 w-20" />}>
                  <WalletBalance
                    address={walletAddress}
                    className="text-foreground t-code text-base font-bold tabular-nums"
                  />
                </Suspense>
                <span className="bg-surface-high border-border text-muted-foreground rounded px-2 py-0.5 text-[11px] font-semibold">
                  Base Sepolia
                </span>
              </span>
              {walletAddress ? (
                <span className="text-muted-foreground t-code justify-end text-[11px]">
                  {shortenAddress(walletAddress)}
                </span>
              ) : null}
            </div>
            <div className="bg-border h-8 w-px shrink-0" aria-hidden="true" />
            <ChevronRight
              aria-hidden="true"
              className="text-muted-foreground group-hover:text-primary size-5 shrink-0 transition-all group-hover:translate-x-0.5"
            />
          </div>
        </CardContent>

        {/* Mobile detail rows — progressive disclosure for technical IDs */}
        {walletAddress || contractAddress ? (
          <div className="flex flex-col gap-1.5 border-t pt-3 sm:hidden">
            {walletAddress ? (
              <DetailRow label="Wallet" value={shortenAddress(walletAddress)} />
            ) : null}
            {contractAddress ? (
              <DetailRow
                label="Contract"
                value={shortenAddress(contractAddress)}
              />
            ) : null}
          </div>
        ) : !walletAddress ? (
          <p className="text-muted-foreground flex items-center gap-1.5 border-t pt-3 text-sm sm:hidden">
            <Wallet aria-hidden="true" className="size-3.5" />
            No wallet connected yet. Connect in Settings
          </p>
        ) : null}
      </Card>
    </Link>
  );
}

function DetailRow({
  label,
  value,
  mono = true,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={
          mono
            ? "text-foreground truncate font-mono text-sm tabular-nums"
            : "text-foreground truncate text-sm"
        }
      >
        {value}
      </span>
    </div>
  );
}
