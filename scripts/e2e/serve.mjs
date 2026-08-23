import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * E2E app server (P3 item 1) — jalankan build production dengan env E2E.
 *
 * Isolasi (keputusan user): treasury E2E = treasury PRODUCTION (satu wallet,
 * mudah dipantau). Kunci privatnya diambil dari .env.local (TREASURY_PRIVATE_KEY)
 * — TIDAK ada kunci treasury terpisah. Isolasi hanya di level FACTORY:
 *   - Build memakai .env.local (NEXT_PUBLIC_* di-inline saat build).
 *   - RUNTIME hanya WAREHOUSE_FACTORY_ADDRESS yang dioverride ke TEST factory
 *     (contracts/deployments/base-sepolia-test.json).
 * Sehingga warehouse E2E ter-deploy ke test factory (data on-chain test
 * terisolasi dari warehouse production), sementara proofRecorder/treasury tetap
 * SAMA dengan production (sesuai design EIP-712 domain per factory+block).
 *
 * Usage: node scripts/e2e/serve.mjs [--port 3100] [--skip-build] [--tunnel]
 *
 * `--tunnel`: buka cloudflared quick tunnel dan set NEXT_PUBLIC_APP_URL ke URL
 * tunnel saat runtime — diperlukan agar QStash bisa callback ke proof processor
 * (QStash TIDAK bisa kirim ke localhost). Jalur cloudflared dari env
 * `CLOUDFLARED_PATH` atau default `%TEMP%/opencode/cloudflared.exe` (win32).
 */

const args = process.argv.slice(2);
const portArg = args.indexOf("--port");
const port = portArg !== -1 ? Number(args[portArg + 1]) : 3100;
const skipBuild = args.includes("--skip-build");
const useTunnel = args.includes("--tunnel");
const root = resolve(import.meta.dirname, "..", "..");

function parseEnv(file) {
  const out = {};
  try {
    const text = readFileSync(resolve(root, file), "utf8");
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      out[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  } catch {
    /* file optional */
  }
  return out;
}

const baseEnv = { ...process.env, ...parseEnv(".env.local") };
const e2eEnv = parseEnv(".env.e2e.local");

// Override SERVER-ONLY chain config → hanya WAREHOUSE_FACTORY_ADDRESS ke test
// factory. TREASURY_PRIVATE_KEY tetap dari .env.local (treasury production,
// sesuai keputusan user — satu wallet, tidak ada kunci terpisah).
const env = {
  ...baseEnv,
  WAREHOUSE_FACTORY_ADDRESS: e2eEnv.WAREHOUSE_FACTORY_ADDRESS,
  NEXT_PUBLIC_APP_URL: `http://localhost:${port}`,
  PORT: String(port),
  // Developer Console allowlist untuk E2E (di-set di .env.e2e.local); bila
  // tidak di-set, jangan menimpa nilai .env.local.
  ...(e2eEnv.DEVELOPER_ALLOWLIST
    ? { DEVELOPER_ALLOWLIST: e2eEnv.DEVELOPER_ALLOWLIST }
    : {}),
};

// WAREHOUSE_FACTORY_ADDRESS untuk E2E diambil dari registry test bila belum
// di-set di .env.e2e.local (biar satu sumber kebenaran).
if (!env.WAREHOUSE_FACTORY_ADDRESS) {
  try {
    const reg = JSON.parse(
      readFileSync(
        resolve(root, "contracts/deployments/base-sepolia-test.json"),
        "utf8"
      )
    );
    env.WAREHOUSE_FACTORY_ADDRESS = reg.contracts.WarehouseFactory.address;
  } catch {
    throw new Error(
      "base-sepolia-test.json missing — deploy test factory first."
    );
  }
}

function run(cmd, args, opts = {}) {
  return new Promise((res, rej) => {
    const child = spawn(cmd, args, { stdio: "inherit", ...opts });
    child.on("exit", (code) =>
      code === 0 ? res() : rej(new Error(`${cmd} exited ${code}`))
    );
    child.on("error", rej);
  });
}

// Jalur bin Next langsung (hindari npm/npx.cmd resolution di Windows).
const nextBin = resolve(root, "node_modules/next/dist/bin/next");

function defaultCloudflaredPath() {
  if (process.platform === "win32") {
    const temp = process.env.TEMP || process.env.TMP;
    if (temp) return resolve(temp, "opencode", "cloudflared.exe");
  }
  return "cloudflared";
}

/**
 * Buka quick tunnel cloudflared, tunggu URL trycloudflare.
 * Returns { url, child } — child wajib di-kill saat exit.
 */
async function startTunnel() {
  const cf = process.env.CLOUDFLARED_PATH || defaultCloudflaredPath();
  const child = spawn(
    cf,
    ["tunnel", "--url", `http://localhost:${port}`, "--no-autoupdate"],
    // cloudflared menulis banner tunnel ke STDERR — pipe keduanya untuk
    // menemukan URL trycloudflare (stdout cloudflared sering diam).
    { stdio: ["ignore", "pipe", "pipe"] }
  );
  let buf = "";
  const timer = setTimeout(() => child.kill(), 30_000);
  try {
    return await new Promise((resolve, reject) => {
      const onData = (chunk) => {
        buf += chunk.toString();
        const m = buf.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
        if (m) resolve({ url: m[0], child });
      };
      child.stdout.on("data", onData);
      child.stderr.on("data", onData);
      child.on("error", reject);
      child.on("exit", (code) =>
        reject(new Error(`cloudflared exited ${code} before URL ready`))
      );
    });
  } finally {
    clearTimeout(timer);
  }
}

let tunnelChild = null;
async function main() {
  if (useTunnel) {
    const tunnel = await startTunnel();
    tunnelChild = tunnel.child;
    env.QSTASH_APP_BASE_URL = tunnel.url;
    console.log(`[e2e] tunnel → ${tunnel.url} (QStash callback target)`);
  } else {
    // Runtime QStash base = URL yang benar-benar disajikan (bukan build-time
    // NEXT_PUBLIC_APP_URL yang di-inline, mis. localhost:3000).
    env.QSTASH_APP_BASE_URL = `http://localhost:${port}`;
  }

  if (!skipBuild) {
    console.log(`[e2e] building with .env.local (NEXT_PUBLIC_*) ...`);
    await run(process.execPath, [nextBin, "build"], { env });
  }
  console.log(
    `[e2e] serving on :${port} with test factory ${env.WAREHOUSE_FACTORY_ADDRESS}`
  );
  await run(process.execPath, [nextBin, "start", "-p", String(port)], { env });
}

process.on("exit", () => {
  if (tunnelChild && !tunnelChild.killed) tunnelChild.kill();
});

main().catch((err) => {
  console.error("[e2e] server failed:", err);
  process.exit(1);
});
