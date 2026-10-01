import { createClient } from "@/lib/supabase/server";
import { json, requireReadRateLimit, requireUser } from "@/lib/api-handler";
import {
  logStartupResult,
  runStartupChecks,
} from "@/lib/health/startup-checks";

/**
 * GET /api/health/startup — hasil startup health checks untuk banner
 * dashboard (P0 audit). Terautentikasi + rate-limit read-only fail-open.
 * Tanpa secret di respons: hanya status + identifier publik.
 */
export async function GET(request: Request) {
  const supabase = await createClient();
  const auth = await requireUser(supabase);
  if (auth.res) return auth.res;

  const limited = await requireReadRateLimit(
    "startup-health",
    auth.user.id,
    request
  );
  if (limited) return limited;

  const checks = await runStartupChecks();
  logStartupResult(checks);
  const ok = checks.every((c) => c.ok);
  return json({ ok, checks }, ok ? 200 : 503);
}
