import { env } from "@/lib/env";

export type RuntimeMode = "local" | "e2e" | "preview" | "production";

function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "::1" ||
    host === "0.0.0.0"
  ) {
    return true;
  }
  if (/^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host)) {
    return true;
  }
  const private172 = host.match(/^172\.(\d{1,3})\./);
  if (private172) {
    const second = Number(private172[1]);
    if (second >= 16 && second <= 31) return true;
  }
  if (
    /^169\.254\./.test(host) ||
    /^fe80:/.test(host) ||
    /^(fc|fd)/.test(host)
  ) {
    return true;
  }
  return false;
}

export function normalizePublicOrigin(
  value: string,
  { allowLocal = false }: { allowLocal?: boolean } = {}
): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("Public origin is not a valid URL");
  }
  if (parsed.username || parsed.password) {
    throw new Error("Public origin must not contain credentials");
  }
  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    throw new Error(
      "Public origin must not contain a path, query, or fragment"
    );
  }
  if (parsed.protocol === "http:" && allowLocal) {
    if (!isPrivateHostname(parsed.hostname)) {
      throw new Error("HTTP is only allowed for local origins");
    }
  } else if (parsed.protocol !== "https:") {
    throw new Error("Public origin must use HTTPS");
  }
  if (
    parsed.port &&
    parsed.port !== "443" &&
    !(allowLocal && parsed.protocol === "http:")
  ) {
    throw new Error("Public origin must use the standard HTTPS port");
  }
  if (!allowLocal && isPrivateHostname(parsed.hostname)) {
    throw new Error("Public origin must not be private or loopback");
  }
  return parsed.origin;
}

function runtimeMode(): RuntimeMode {
  if (env.VERCEL_ENV === "preview") return "preview";
  if (env.VERCEL_ENV === "production") return "production";
  if (env.NODE_ENV === "test" || process.env.E2E_MODE === "1") return "e2e";
  return "local";
}

function vercelOrigin(): string | null {
  if (!env.VERCEL_URL) return null;
  const value = env.VERCEL_URL.startsWith("http")
    ? env.VERCEL_URL
    : `https://${env.VERCEL_URL}`;
  return normalizePublicOrigin(value);
}

export function resolvePublicOrigin(): string {
  const mode = runtimeMode();
  const configured = env.QSTASH_APP_BASE_URL ?? env.NEXT_PUBLIC_APP_URL;
  const origin = vercelOrigin();

  if (mode === "preview") {
    if (!origin) {
      throw new Error("VERCEL_URL is required for preview deployments");
    }
    if (env.QSTASH_APP_BASE_URL) {
      const explicit = normalizePublicOrigin(env.QSTASH_APP_BASE_URL);
      if (explicit !== origin) {
        throw new Error("Preview QStash origin does not match VERCEL_URL");
      }
    }
    return origin;
  }

  if (mode === "production") {
    if (!configured) {
      throw new Error("NEXT_PUBLIC_APP_URL is required in production");
    }
    const canonical = normalizePublicOrigin(configured);
    if (origin && canonical !== origin) {
      throw new Error("Production app origin does not match Vercel origin");
    }
    return canonical;
  }

  if (!configured) {
    throw new Error("A local or E2E public origin is required");
  }
  return normalizePublicOrigin(configured, { allowLocal: true });
}

export function currentRuntimeMode(): RuntimeMode {
  return runtimeMode();
}
