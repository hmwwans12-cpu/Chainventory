import { redirect } from "next/navigation";
import { createPublicClient, formatEther } from "viem";
import { Building2, ExternalLink, User, Wallet } from "lucide-react";

import { baseSepolia, createChainTransport } from "@/lib/blockchain/chains";
import { createClient } from "@/lib/supabase/server";
import {
  getMyWarehouses,
  pickActiveWarehouse,
} from "@/lib/warehouses/current-warehouse";
import { logger } from "@/lib/logger";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";

export const metadata = {
  robots: { index: false, follow: false },
};

/**
 * Halaman Settings (DESIGN §30) — target klik ProfileWalletCard.
 * Read-only profile & wallet & warehouse info; tidak ada aksi destruktif.
 */
export default async function SettingsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [profileRes, walletRes, warehouses] = await Promise.all([
    supabase
      .from("users")
      .select("display_name, email")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("wallets")
      .select("address")
      .eq("user_id", user.id)
      .eq("is_primary", true)
      .limit(1)
      .maybeSingle(),
    getMyWarehouses(supabase, user.id),
  ]);

  const name =
    (profileRes.data?.display_name as string | undefined)?.trim() || "Member";
  const email =
    (profileRes.data?.email as string | undefined) ?? user.email ?? "";
  const walletAddress = (walletRes.data?.address as string | undefined) ?? null;
  const active = pickActiveWarehouse(warehouses, undefined);
  const balanceWei = await fetchWalletBalance(walletAddress);

  return (
    <div className="flex flex-col gap-6">
      {/* Width tier: halaman info ringan — NarrowContent (DESIGN §84.9) */}
      <div className="mx-auto w-full max-w-[960px]">
        <PageHeader
          title="Settings"
          description="Your profile, wallet, and active warehouse details."
        />

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <User
                  aria-hidden="true"
                  className="text-muted-foreground size-4"
                />
                Profile
              </CardTitle>
              <CardDescription>
                Account identity in this workspace.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <span className="bg-primary text-primary-foreground font-display flex size-11 shrink-0 items-center justify-center rounded-full text-base font-semibold">
                  {name.charAt(0).toUpperCase()}
                </span>
                <div className="min-w-0">
                  <p className="text-foreground truncate text-sm font-semibold">
                    {name}
                  </p>
                  <p className="text-muted-foreground truncate text-xs">
                    {email}
                  </p>
                </div>
              </div>
              {active ? (
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-xs">Role</span>
                  <Badge variant="secondary" className="uppercase">
                    {active.role}
                  </Badge>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Wallet
                  aria-hidden="true"
                  className="text-muted-foreground size-4"
                />
                Wallet
              </CardTitle>
              <CardDescription>Primary wallet on Base Sepolia.</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {walletAddress ? (
                <>
                  <p className="text-foreground font-mono text-xs break-all">
                    {walletAddress}
                  </p>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-muted-foreground text-xs">Balance</p>
                      <p className="text-foreground text-sm font-semibold tabular-nums">
                        {balanceWei != null
                          ? `${formatEth(balanceWei)} ETH`
                          : "Unavailable"}
                      </p>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      render={
                        <a
                          href={`https://sepolia.basescan.org/address/${walletAddress}`}
                          target="_blank"
                          rel="noreferrer"
                        />
                      }
                    >
                      BaseScan <ExternalLink aria-hidden="true" />
                    </Button>
                  </div>
                </>
              ) : (
                <p className="text-muted-foreground text-sm">
                  No primary wallet connected yet.
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        {active ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2
                  aria-hidden="true"
                  className="text-muted-foreground size-4"
                />
                Warehouse
              </CardTitle>
              <CardDescription>
                Active warehouse and on-chain contract.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
              <div className="min-w-0">
                <p className="text-foreground truncate text-sm font-semibold">
                  {active.name}
                </p>
                {active.contractAddress ? (
                  <p className="text-muted-foreground mt-1 font-mono text-xs break-all">
                    {active.contractAddress}
                  </p>
                ) : (
                  <p className="text-muted-foreground mt-1 text-xs">
                    No contract deployed yet.
                  </p>
                )}
              </div>
              {active.contractAddress ? (
                <Button
                  variant="outline"
                  size="sm"
                  render={
                    <a
                      href={`https://sepolia.basescan.org/address/${active.contractAddress}`}
                      target="_blank"
                      rel="noreferrer"
                    />
                  }
                >
                  View contract <ExternalLink aria-hidden="true" />
                </Button>
              ) : null}
            </CardContent>
          </Card>
        ) : (
          <EmptyState
            icon={Building2}
            title="No warehouse yet"
            description="Create or join a warehouse to see its details here."
            primaryAction={{
              label: "Create Warehouse",
              href: "/onboarding/create",
            }}
            secondaryAction={{
              label: "Join Warehouse",
              href: "/onboarding/join",
            }}
          />
        )}
      </div>
    </div>
  );
}

/** Sama dengan dashboard: gagal jaringan -> null (bukan error fatal). */
async function fetchWalletBalance(
  address: string | null
): Promise<bigint | null> {
  if (!address) return null;
  try {
    const client = createPublicClient({
      chain: baseSepolia,
      transport: createChainTransport(),
    });
    return await client.getBalance({ address: address as `0x${string}` });
  } catch (err) {
    logger.warn(
      { err: err instanceof Error ? err.message : "balance probe failed" },
      "settings wallet balance probe failed"
    );
    return null;
  }
}

function formatEth(wei: bigint): string {
  return Number(formatEther(wei)).toLocaleString("en-US", {
    maximumFractionDigits: 4,
  });
}
