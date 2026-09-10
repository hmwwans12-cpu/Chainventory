import { pino } from "pino";

import { env } from "@/lib/env";

/**
 * Structured JSON logger (TECHSTACK.md §5).
 *
 * Must NEVER log: tokens, private keys, raw signatures, JWT, session
 * cookies, or any secret. Use redaction patterns as defense-in-depth.
 *
 * Server-only module: hanya dipakai di server. Guard `typeof window` di bawah
 * mencegah crash bila sebuah client module mengimpornya (env server-only tidak
 * boleh diakses di client).
 */
export const logger = pino({
  level: typeof window === "undefined" ? (env.LOG_LEVEL ?? "info") : "info",
  redact: {
    // Fix BE-18: sebelumnya hanya 7 pola — qstash/redis/basescan/resend
    // token, treasury key, privy secret, wallet address, email, dan userId
    // lolos ke Vercel logs (PII + secret). TECHSTACK §5 mewajibkan user ID
    // ter-redaksi; panggil logger dengan userIdHash bila butuh korelasi.
    paths: [
      "password",
      "*.password",
      "token",
      "*.token",
      "qstash_token",
      "*.qstash_token",
      "redis_token",
      "*.redis_token",
      "basescan_key",
      "*.basescan_key",
      "resend_key",
      "*.resend_key",
      "treasury",
      "*.treasury",
      "privy_secret",
      "*.privy_secret",
      "privyUserId",
      "*.privyUserId",
      "authorization",
      "*.authorization",
      "secret",
      "*.secret",
      "privateKey",
      "*.privateKey",
      "signature",
      "*.signature",
      "jwt",
      "*.jwt",
      "wallet",
      "*.wallet",
      "actorWallet",
      "*.actorWallet",
      "address",
      "*.address",
      "email",
      "*.email",
      "userId",
      "*.userId",
    ],
    censor: "[REDACTED]",
  },
  base: {
    service: "chainventory",
  },
  transport:
    process.env.NODE_ENV !== "production"
      ? { target: "pino-pretty", options: { colorize: true } }
      : undefined,
});
