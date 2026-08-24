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
    paths: [
      "password",
      "*.password",
      "token",
      "*.token",
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
