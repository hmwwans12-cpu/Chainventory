import { NextResponse } from "next/server";

import { reconcileFaucetClaims } from "@/lib/faucet/reconcile";
import { verifyCronSecret } from "@/lib/proof/verify-request";

export async function GET(request: Request) {
  if (!(await verifyCronSecret(request))) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }
  const result = await reconcileFaucetClaims();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export async function POST(request: Request) {
  return GET(request);
}
