import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/**
 * Environment validation (TECHSTACK.md §4).
 *
 * Fails fast at startup/build when required config is missing.
 * Secrets (Supabase service-role, Privy secret, treasury key, RPC secret)
 * are SERVER-ONLY and MUST NOT be prefixed with NEXT_PUBLIC_.
 */

/**
 * Audit v0.3.9 H-12: when a developer copies .env.example → .env.local,
 * every empty placeholder becomes the empty string "" (not undefined).
 * Zod's `.optional()` only forgives `undefined`, so an empty TREASURY_PRIVATE_KEY
 * would crash the dev build. We normalize empty strings to `undefined` before
 * validation so the optional path actually applies.
 */
const emptyToUndefined = (v: unknown) =>
  typeof v === "string" && v.trim() === "" ? undefined : v;

const optionalString = z.preprocess(emptyToUndefined, z.string().min(1).optional());
const optionalUrl = z.preprocess(emptyToUndefined, z.string().url().optional());
const optionalHexAddress = z.preprocess(
  emptyToUndefined,
  z.string().startsWith("0x").optional()
);
const optionalMin16 = z.preprocess(
  emptyToUndefined,
  z.string().min(16).optional()
);

export const env = createEnv({
  server: {
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),

    // Supabase server-only keys — never exposed to the browser.
    // New key model (2026): `secret` preferred, legacy `service_role` fallback.
    SUPABASE_SECRET_KEY: optionalString,
    SUPABASE_SERVICE_ROLE_KEY: optionalString,

    // Supabase Management API (project administration / live migration queries).
    // Used by RBAC contract test & migration tooling only — never the app.
    SUPABASE_MANAGEMENT_TOKEN: optionalString,
    SUPABASE_PROJECT_REF: optionalString,

    // Privy secret for custom-auth verification (wallet layer).
    PRIVY_APP_SECRET: optionalString,

    // Treasury signer for deployment/proof gas — server-side only.
    TREASURY_PRIVATE_KEY: optionalString,

    // Blockchain
    BASE_SEPOLIA_RPC_URL: optionalUrl,
    BASE_SEPOLIA_RPC_FALLBACK_URL: optionalUrl,
    WAREHOUSE_FACTORY_ADDRESS: optionalHexAddress,

    // Audit v0.3.9 H-13: documented in .env.example but not validated here.
    // BaseScan API key for contract verification & transaction lookups.
    BASESCAN_API_KEY: optionalString,

    // Async proof delivery
    QSTASH_TOKEN: optionalString,
    QSTASH_URL: optionalUrl,
    QSTASH_CURRENT_SIGNING_KEY: optionalString,
    QSTASH_NEXT_SIGNING_KEY: optionalString,

    // Rate limiting
    UPSTASH_REDIS_REST_URL: optionalUrl,
    UPSTASH_REDIS_REST_TOKEN: optionalString,

    // Developer Console allowlist (ARSITEKTUR §7.4)
    DEVELOPER_ALLOWLIST: z.preprocess(
      emptyToUndefined,
      z.string().optional()
    ),

    // Vercel Cron keep-alive secret (ARSITEKTUR §7.3).
    // Vercel sends `Authorization: Bearer <CRON_SECRET>` on cron requests;
    // the internal keep-alive endpoint verifies it. Server-only.
    CRON_SECRET: optionalMin16,

    // Base URL untuk delivery job QStash (proof process/confirm) saat RUNTIME.
    // Prioritas (lihat lib/proof/qstash.ts): QSTASH_APP_BASE_URL (override
    // server-only, dipakai serve.mjs E2E/tunnel) → NEXT_PUBLIC_APP_URL (URL
    // Vercel production, di-set manual saat build) → VERCEL_URL (di-inject
    // otomatis oleh Vercel per deployment — menjamin preview & production
    // default selalu punya URL publik yang benar, tanpa konfigurasi manual).
    // Server-only; tidak pernah ke browser.
    QSTASH_APP_BASE_URL: optionalUrl,
    VERCEL_URL: optionalString,

    // CI bypass for builds without live secrets
    SKIP_ENV_VALIDATION: z.preprocess(
      emptyToUndefined,
      z.string().optional()
    ),

    // Observability
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace"])
      .default("info"),
  },

  client: {
    NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
    NEXT_PUBLIC_SUPABASE_URL: optionalUrl,
    // New key model (2026): `publishable` preferred, legacy `anon` fallback.
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: optionalString,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: optionalString,
    NEXT_PUBLIC_PRIVY_APP_ID: optionalString,
  },

  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_MANAGEMENT_TOKEN: process.env.SUPABASE_MANAGEMENT_TOKEN,
    SUPABASE_PROJECT_REF: process.env.SUPABASE_PROJECT_REF,
    PRIVY_APP_SECRET: process.env.PRIVY_APP_SECRET,
    TREASURY_PRIVATE_KEY: process.env.TREASURY_PRIVATE_KEY,
    BASE_SEPOLIA_RPC_URL: process.env.BASE_SEPOLIA_RPC_URL,
    BASE_SEPOLIA_RPC_FALLBACK_URL: process.env.BASE_SEPOLIA_RPC_FALLBACK_URL,
    WAREHOUSE_FACTORY_ADDRESS: process.env.WAREHOUSE_FACTORY_ADDRESS,
    BASESCAN_API_KEY: process.env.BASESCAN_API_KEY,
    QSTASH_TOKEN: process.env.QSTASH_TOKEN,
    QSTASH_URL: process.env.QSTASH_URL,
    QSTASH_CURRENT_SIGNING_KEY: process.env.QSTASH_CURRENT_SIGNING_KEY,
    QSTASH_NEXT_SIGNING_KEY: process.env.QSTASH_NEXT_SIGNING_KEY,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    CRON_SECRET: process.env.CRON_SECRET,
    QSTASH_APP_BASE_URL: process.env.QSTASH_APP_BASE_URL,
    VERCEL_URL: process.env.VERCEL_URL,
    DEVELOPER_ALLOWLIST: process.env.DEVELOPER_ALLOWLIST,
    SKIP_ENV_VALIDATION: process.env.SKIP_ENV_VALIDATION,
    LOG_LEVEL: process.env.LOG_LEVEL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_PRIVY_APP_ID: process.env.NEXT_PUBLIC_PRIVY_APP_ID,
  },

  // CI/preview builds without live secrets should set SKIP_ENV_VALIDATION=1
  // to avoid fail-fast. Production deploys (Vercel) run without it and will
  // fail-fast if secrets are missing (TECHSTACK §4).
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
});
