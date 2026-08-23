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
  const {
    data: { user },
  } = await supabase.auth.getUser();

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
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }

  if (user && isAuthPage) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
