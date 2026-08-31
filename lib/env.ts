import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/**
 * Environment validation (TECHSTACK.md §4).
 *
 * Fails fast at startup/build when required config is missing.
 * Secrets (Supabase service-role, Privy secret, treasury key, RPC secret)
 * are SERVER-ONLY and MUST NOT be prefixed with NEXT_PUBLIC_.
 */
export const env = createEnv({
  server: {
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),

    // Supabase server-only keys — never exposed to the browser.
    // New key model (2026): `secret` preferred, legacy `service_role` fallback.
    SUPABASE_SECRET_KEY: z.string().min(1).optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),

    // Supabase Management API (project administration / live migration queries).
    // Used by RBAC contract test & migration tooling only — never the app.
    SUPABASE_MANAGEMENT_TOKEN: z.string().min(1).optional(),
    SUPABASE_PROJECT_REF: z.string().min(1).optional(),

    // Privy secret for custom-auth verification (wallet layer).
    PRIVY_APP_SECRET: z.string().min(1).optional(),

    // Treasury signer for deployment/proof gas — server-side only.
    TREASURY_PRIVATE_KEY: z.string().min(1).optional(),

    // Blockchain
    BASE_SEPOLIA_RPC_URL: z.string().url().optional(),
    BASE_SEPOLIA_RPC_FALLBACK_URL: z.string().url().optional(),
    WAREHOUSE_FACTORY_ADDRESS: z.string().startsWith("0x").optional(),

    // Async proof delivery
    QSTASH_TOKEN: z.string().min(1).optional(),
    QSTASH_URL: z.string().url().optional(),
    QSTASH_CURRENT_SIGNING_KEY: z.string().min(1).optional(),
    QSTASH_NEXT_SIGNING_KEY: z.string().min(1).optional(),

    // Rate limiting
    UPSTASH_REDIS_REST_URL: z.string().url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),

    // Developer Console allowlist (ARSITEKTUR §7.4)
    DEVELOPER_ALLOWLIST: z.string().optional(),

    // Vercel Cron keep-alive secret (ARSITEKTUR §7.3).
    // Vercel sends `Authorization: Bearer <CRON_SECRET>` on cron requests;
    // the internal keep-alive endpoint verifies it. Server-only.
    CRON_SECRET: z.string().min(16).optional(),

    // Base URL untuk delivery job QStash (proof process/confirm) saat RUNTIME.
    // Prioritas (lihat lib/proof/qstash.ts): QSTASH_APP_BASE_URL (override
    // server-only, dipakai serve.mjs E2E/tunnel) → NEXT_PUBLIC_APP_URL (URL
    // Vercel production, di-set manual saat build) → VERCEL_URL (di-inject
    // otomatis oleh Vercel per deployment — menjamin preview & production
    // default selalu punya URL publik yang benar, tanpa konfigurasi manual).
    // Server-only; tidak pernah ke browser.
    QSTASH_APP_BASE_URL: z.string().url().optional(),
    VERCEL_URL: z.string().min(1).optional(),

    // CI bypass for builds without live secrets
    SKIP_ENV_VALIDATION: z.string().optional(),

    // Observability
    LOG_LEVEL: z
      .enum(["fatal", "error", "warn", "info", "debug", "trace"])
      .default("info"),
  },

  client: {
    NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
    NEXT_PUBLIC_SUPABASE_URL: z.string().url().optional(),
    // New key model (2026): `publishable` preferred, legacy `anon` fallback.
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1).optional(),
    NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1).optional(),
    NEXT_PUBLIC_PRIVY_APP_ID: z.string().min(1).optional(),
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
