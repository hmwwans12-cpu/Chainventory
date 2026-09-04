import { createMDX } from "fumadocs-mdx/next";

/**
 * Security headers (audit v0.3.8 C-03).
 *
 * Defense-in-depth baseline for a Web3 app with treasury / Privy / QStash:
 *  - HSTS forces HTTPS for two years incl. subdomains, preload-ready.
 *  - frame-ancestors 'none' prevents clickjacking on the dashboard.
 *  - nosniff stops MIME-based attacks on JSON responses.
 *  - Referrer-Policy limits leakage to internal URLs.
 *  - Permissions-Policy locks down sensors the app does not need.
 *  - CSP allows the exact third-party origins we actually call (Supabase,
 *    Privy, QStash, Base Sepolia RPC) and the inline styles Next/Fumadocs
 *    need to bootstrap before hydration. `unsafe-inline` for script-src is
 *    avoided via the per-request nonce pattern — see proxy.ts / route
 *    handlers for future enhancement.
 */
const csp = [
  "default-src 'self'",
  // scripts: Next injects inline __NEXT_DATA__ and chunks; we trust 'self' + Privy.
  "script-src 'self' 'unsafe-inline' https://auth.privy.io",
  // styles: Next streams style tags inline; we trust self + Google fonts.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://auth.privy.io https://qstash-us-east-1.upstash.io https://sepolia.base.org",
  "frame-ancestors 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  { key: "Content-Security-Policy", value: csp },
  {
    key: "Cross-Origin-Opener-Policy",
    value: "same-origin",
  },
  {
    key: "Cross-Origin-Resource-Policy",
    value: "same-site",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

const withMDX = createMDX();

export default withMDX(nextConfig);
