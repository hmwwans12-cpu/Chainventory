import { NextResponse } from "next/server";

import { verifyCronSecret } from "@/lib/proof/verify-request";
import { reconcileDeployments } from "@/lib/warehouses/deployment-reconcile";

export async function GET(request: Request) {
  if (!(await verifyCronSecret(request))) {
    return NextResponse.json(
      { ok: false, error: "unauthorized" },
      { status: 401 }
    );
  }
  const result = await reconcileDeployments();
  return NextResponse.json(result, { status: result.ok ? 200 : 500 });
}

export async function POST(request: Request) {
  return GET(request);
}
