import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { supabaseClientKey, supabaseUrl } from "@/lib/supabase/config";
import { AUTH_ROUTES, PROTECTED_ROUTES } from "@/lib/routes";

/**
 * Supabase session refresh for middleware (Auth Foundation).
 * Refreshes the session cookie on every request; redirects unauthenticated
 * users away from protected routes.
 *
 * Bug fix (P3): `setAll` may be called multiple times by Supabase SSR
 * (once per cookie group). The original implementation replaced
 * `supabaseResponse` on each call, losing cookies set by earlier calls
 * (e.g., access token set in first call lost when refresh token call
 * creates a new response). Fixed by preserving cookies from previous
 * response before replacing.
 */
export async function updateSession(request: NextRequest) {
  const url = supabaseUrl();
  const key = supabaseClientKey();

  if (!url || !key) {
    return NextResponse.next();
  }

  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value)
        );
        // Preserve cookies from previous response before replacing.
        const prevCookies = supabaseResponse.cookies.getAll();
        supabaseResponse = NextResponse.next({
          request,
        });
        prevCookies.forEach(({ name, value }) =>
          supabaseResponse.cookies.set(name, value)
        );
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options)
        );
      },
    },
  });

  // Do not run code between createServerClient and getUser().
  // Audit v0.3.9 H-11: wrap in try/catch so a Supabase outage (or transient
  // 5xx on the auth endpoint) does not cascade into a 500 for every
  // protected page. The route handler is the primary authorization
  // boundary per AGENT.md §3 — proxy.ts is only doing session refresh.
  let user: { id: string; email?: string | null } | null = null;
  try {
    const result = await supabase.auth.getUser();
    user = result.data.user;
  } catch (err) {
    // Log but do not block. Protected routes will reject the request via
    // the in-route `requireUser` helper which is the actual auth gate.
    console.warn("[proxy] supabase.auth.getUser failed:", err);
  }

  const pathname = request.nextUrl.pathname;
  const matchesRoute = (routes: readonly string[]) =>
    routes.some(
      (route) => pathname === route || pathname.startsWith(`${route}/`)
    );

  const isProtected = matchesRoute(PROTECTED_ROUTES);
  const isAuthPage = matchesRoute(AUTH_ROUTES);

  if (isProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set(
      "next",
      request.nextUrl.pathname + request.nextUrl.search
    );
    return NextResponse.redirect(url);
  }

  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
