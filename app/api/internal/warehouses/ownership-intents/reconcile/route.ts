import { NextResponse } from "next/server";

import { requireReadRateLimit } from "@/lib/api-handler";
import { verifyCronSecret } from "@/lib/proof/verify-request";
import { reconcileOwnershipTransferIntents } from "@/lib/warehouses/ownership-intent-reconcile";

export async function GET(request: Request) {
  if (!(await verifyCronSecret(request))) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }
  const limited = await requireReadRateLimit("cron-internal", "cron", request);
  if (limited) return limited;
  const result = await reconcileOwnershipTransferIntents();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export async function POST(request: Request) {
  return GET(request);
}
