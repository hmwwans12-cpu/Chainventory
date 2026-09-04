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
    // API routes that depend on the user session. We intentionally EXCLUDE:
    //   - /api/internal/* : cron, QStash callbacks, env-health (no cookies,
    //     no user, no Supabase auth — getUser() throws and was burning the
    //     Supabase quota on every webhook delivery)
    //   - /api/auth/*     : OAuth callback paths that set their own cookies
    //     after a different auth flow
    //   - /api/health     : liveness probe (no auth needed)
    // The exclusion is implemented as a negative-lookahead matcher.
    "/api/((?!internal|auth|health).*)",
  ],
};
