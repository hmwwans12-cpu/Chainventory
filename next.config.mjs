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
 *    need to bootstrap before hydration.
 *
 * CF-04 honesty note: script-src/style-src still carry 'unsafe-inline'
 * (required by Next inline bootstrap + theme script). A per-request nonce
 * pattern is the documented follow-up — see TODO. CSP here is a baseline,
 * not a full XSS mitigation.
 */
const isDev = process.env.NODE_ENV !== "production";
const csp = [
  "default-src 'self'",
  // scripts: Next injects inline __NEXT_DATA__ and chunks; we trust 'self' + Privy.
  // 'unsafe-eval' HANYA di dev: React development (Turbopack) memakai eval()
  // untuk component stacks; production React tidak pernah eval sehingga
  // CSP prod tetap tanpa unsafe-eval.
  "script-src 'self' 'unsafe-inline' https://auth.privy.io" +
    (isDev ? " 'unsafe-eval'" : ""),
  // styles: Next streams style tags inline; we trust self + Google fonts.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://auth.privy.io https://qstash-us-east-1.upstash.io https://sepolia.base.org https://explorer-api.walletconnect.com https://*.rpc.privy.systems wss://relay.walletconnect.com wss://relay.walletconnect.org",
  // Privy auth iframe + WalletConnect verify frames. TANPA ini:
  // "Privy iframe failed to load" + postMessage warnings (repro: semua
  // halaman, error dari chunk @privy-io/react-auth). default-src 'self'
  // tidak cukup karena frame-src tidak di-set eksplisit.
  "frame-src 'self' https://auth.privy.io https://verify.walletconnect.com https://verify.walletconnect.org",
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
  // Coinbase Wallet SDK + Base Account SDK (dibawa Privy/wagmi) WAJIB
  // COOP bukan same-origin agar popup smart-wallet bisa berkomunikasi
  // dengan app. same-origin-allow-popups mempertahankan isolasi kecuali
  // untuk popup yang kita buka sendiri.
  {
    key: "Cross-Origin-Opener-Policy",
    value: "same-origin-allow-popups",
  },
  {
    key: "Cross-Origin-Resource-Policy",
    value: "same-site",
  },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // CF-04: jangan umumkan framework via header (fingerprinting).
  poweredByHeader: false,
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
