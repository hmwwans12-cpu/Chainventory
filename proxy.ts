import { type NextRequest } from "next/server";

import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Protected + auth pages — mirror lib/routes.ts (dicek lib/routes.test.ts).
    "/dashboard/:path*",
    "/inventory/:path*",
    "/transactions/:path*",
    "/members/:path*",
    "/analytics/:path*",
    "/notifications/:path*",
    "/settings/:path*",
    "/console/:path*",
    "/login/:path*",
    "/signup/:path*",
    "/api/:path*",
  ],
};
