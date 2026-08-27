import { Suspense } from "react";
import Link from "next/link";
import { ChevronRight, Wallet } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { getInitials } from "@/lib/utils";
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
  contractAddress,
}: {
  name: string;
  role: string;
  walletAddress: string | null;
  warehouseName?: string;
  warehouseId?: string;
  contractAddress?: string | null;
}) {
  const initial = getInitials(name, null, "?");

  return (
    <Link
      href={warehouseId ? `/settings?warehouse=${warehouseId}` : "/settings"}
      aria-label="Open profile and wallet settings"
      className="focus-visible:ring-ring hover:ring-ring/40 block rounded-xl transition-shadow hover:ring-2 focus-visible:ring-2 focus-visible:outline-none"
    >
      <Card>
        {/*
          Anatomy responsive (temuan audit UI #12):
          - Desktop (sm+): [Avatar] [Identity] ......... [Balance >]
          - Mobile: Avatar|Identity di baris atas, wallet/warehouse/balance
            menjadi baris sendiri di bawah — tinggi stabil, tanpa flex-wrap.
        */}
        <CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="bg-primary text-primary-foreground font-display flex size-11 shrink-0 items-center justify-center rounded-full text-base font-semibold">
              {initial}
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <span className="text-foreground truncate text-sm font-semibold">
                  {name}
                </span>
                <Badge variant="secondary">
                  {{
                    OWNER: "Owner",
                    MANAGER: "Manager",
                    STAFF: "Staff",
                    AUDITOR: "Auditor",
                    VIEWER: "Viewer",
                  }[role] ?? role}
                </Badge>
              </div>
              {walletAddress ? (
                <span className="text-muted-foreground truncate font-mono text-xs tabular-nums">
                  {shorten(walletAddress)}
                  <span className="ms-1.5 hidden font-sans not-italic sm:inline">
                    · Base Sepolia
                  </span>
                </span>
              ) : (
                <span className="text-muted-foreground flex items-center gap-1 text-xs">
                  <Wallet aria-hidden="true" className="size-3.5" />
                  No wallet connected yet
                </span>
              )}
            </div>
          </div>

          {/* Baris detail mobile — tersembunyi di desktop (sudah di identity) */}
          <div className="flex flex-col gap-1 sm:hidden">
            {warehouseName ? (
              <DetailRow label="Warehouse" value={warehouseName} mono={false} />
            ) : null}
            {contractAddress ? (
              <DetailRow label="Contract" value={shorten(contractAddress)} />
            ) : null}
            <DetailRow
              label="Balance"
              value={
                <Suspense fallback={<span>—</span>}>
                  <WalletBalance address={walletAddress} suffix=" ETH" />
                </Suspense>
              }
            />
          </div>

          <div className="hidden items-center gap-2 ps-2 sm:ms-auto sm:flex">
            <div className="flex flex-col items-end gap-0.5">
              <Suspense fallback={<Skeleton className="h-6 w-20" />}>
                <WalletBalance
                  address={walletAddress}
                  suffix=""
                  className="text-foreground text-lg font-semibold tracking-tight tabular-nums"
                />
              </Suspense>
              <span className="text-muted-foreground text-xs">ETH balance</span>
            </div>
            <ChevronRight
              aria-hidden="true"
              className="text-muted-foreground size-5 shrink-0"
            />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function shorten(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
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
    <div className="flex items-center justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span
        className={
          mono
            ? "text-foreground truncate font-mono tabular-nums"
            : "text-foreground truncate"
        }
      >
        {value}
      </span>
    </div>
  );
}
