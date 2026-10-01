#!/usr/bin/env node
/**
 * Dev-only outbox worker poller (P1 audit F3).
 *
 * QStash tidak bisa callback ke localhost sehingga proof macet `pending`
 * saat dev. Script ini mem-poll route dev-only
 * `POST /api/internal/proofs/process-local` (CRON_SECRET, tolak di
 * production) yang mengerjakan submit + confirm in-process.
 *
 * Usage:
 *   pnpm worker:dev
 *   node scripts/dev/outbox-worker.mjs --url http://localhost:3000 --interval 15000
 *
 * Env (atau arg --url/--interval): APP_URL (fallback NEXT_PUBLIC_APP_URL),
 * CRON_SECRET. Berhenti dengan Ctrl+C.
 *
 * Exit: 0 = stopped by user, 1 = config error.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

const args = process.argv.slice(2);
function argValue(name) {
  const i = args.indexOf(name);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
}

/** Parser .env.local minimal (KEY=VALUE, abaikan komentar/kutipan). */
function loadLocalEnv() {
  const out = {};
  for (const file of [".env.local", ".env"]) {
    let raw;
    try {
      raw = readFileSync(join(process.cwd(), file), "utf8");
    } catch {
      continue;
    }
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("="))
        continue;
      const eq = trimmed.indexOf("=");
      let value = trimmed.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      out[trimmed.slice(0, eq).trim()] ??= value;
    }
  }
  return out;
}

const fileEnv = loadLocalEnv();
const baseUrl = (
  argValue("--url") ??
  process.env.APP_URL ??
  fileEnv.NEXT_PUBLIC_APP_URL ??
  "http://localhost:3000"
).replace(/\/$/, "");
const intervalMs = Number(
  argValue("--interval") ?? process.env.WORKER_INTERVAL_MS ?? 15000
);
const cronSecret = process.env.CRON_SECRET ?? fileEnv.CRON_SECRET;

if (!cronSecret) fail("CRON_SECRET tidak ditemukan (.env.local / env).");
if (!Number.isFinite(intervalMs) || intervalMs < 2000) {
  fail("Interval minimal 2000ms.");
}

function fail(msg) {
  console.error(`❌ ${msg}`);
  process.exit(1);
}

let stopped = false;
process.on("SIGINT", () => {
  stopped = true;
  console.log("\n👋 worker stopped");
});

console.log(
  `▶ outbox worker → ${baseUrl} tiap ${intervalMs}ms (Ctrl+C berhenti)`
);

while (!stopped) {
  const started = Date.now();
  try {
    const res = await fetch(`${baseUrl}/api/internal/proofs/process-local`, {
      method: "POST",
      headers: { authorization: `Bearer ${cronSecret}` },
      signal: AbortSignal.timeout(55000),
    });
    const body = await res.json().catch(() => ({}));
    const done = body.processed?.length ?? 0;
    const confirmed = body.confirmed?.length ?? 0;
    if (!res.ok || body.ok === false) {
      console.warn(
        `⚠️  tick HTTP ${res.status}: ${body.error ?? "unknown"} (processed ${done}, confirmed ${confirmed})`
      );
    } else if (done > 0 || confirmed > 0) {
      console.log(`✅ tick: processed ${done}, confirmed ${confirmed}`);
    }
  } catch (err) {
    console.warn(`⚠️  tick gagal: ${err.message} — next dev jalan?`);
  }
  const elapsed = Date.now() - started;
  const wait = Math.max(0, intervalMs - elapsed);
  await new Promise((r) => setTimeout(r, wait));
}
