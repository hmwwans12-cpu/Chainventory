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
      className="focus-visible:ring-ring block rounded-lg transition-shadow hover:shadow-(--shadow-elevated) focus-visible:ring-3 focus-visible:outline-none"
    >
      <Card>
        <CardContent className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          {/* Primary identity — name + role (visual weight 1) */}
          <div className="flex min-w-0 items-center gap-3">
            <span className="bg-primary text-primary-foreground flex size-11 shrink-0 items-center justify-center rounded-full text-base font-semibold">
              {initial}
            </span>
            <div className="flex min-w-0 flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <span className="text-foreground truncate text-[15px] font-semibold">
                  {name}
                </span>
                <Badge variant="outline" className="text-sm">
                  {{
                    OWNER: "Owner",
                    MANAGER: "Manager",
                    STAFF: "Staff",
                    AUDITOR: "Auditor",
                    VIEWER: "Viewer",
                  }[role] ?? role}
                </Badge>
              </div>
              {/* Secondary — warehouse name only, muted */}
              {warehouseName ? (
                <span className="text-muted-foreground truncate text-sm">
                  {warehouseName}
                </span>
              ) : null}
            </div>
          </div>

          {/* Utility — balance + network, right aligned desktop */}
          <div className="flex items-center justify-between gap-4 sm:ms-auto sm:justify-end">
            <div className="flex flex-col sm:items-end gap-0.5">
              <Suspense
                fallback={<Skeleton className="h-6 w-24" />}
              >
                <span className="flex items-baseline gap-1.5">
                  <WalletBalance
                    address={walletAddress}
                    suffix=""
                    className="text-foreground text-lg font-semibold tracking-tight tabular-nums"
                  />
                  <span className="text-muted-foreground text-sm">ETH</span>
                </span>
              </Suspense>
              <span className="text-muted-foreground text-sm">
                Base Sepolia
                {walletAddress ? (
                  <span className="hidden sm:inline"> · {shorten(walletAddress)}</span>
                ) : null}
              </span>
            </div>
            <ChevronRight
              aria-hidden="true"
              className="text-muted-foreground/40 size-5 shrink-0"
            />
          </div>

          {/* Mobile detail rows — progressive disclosure for technical IDs */}
          {walletAddress || contractAddress ? (
            <div className="flex flex-col gap-1.5 border-t pt-3 sm:hidden">
              {walletAddress ? (
                <DetailRow label="Wallet" value={shorten(walletAddress)} />
              ) : null}
              {contractAddress ? (
                <DetailRow label="Contract" value={shorten(contractAddress)} />
              ) : null}
            </div>
          ) : !walletAddress ? (
            <p className="text-muted-foreground flex items-center gap-1.5 border-t pt-3 text-sm sm:hidden">
              <Wallet aria-hidden="true" className="size-3.5" />
              No wallet connected yet — connect in Settings
            </p>
          ) : null}
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
