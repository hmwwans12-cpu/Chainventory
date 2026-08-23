# E2E & CI/Staging — Chainventory

E2E penuh (P3) terdiri dari dua suite Playwright yang dijalankan serial:

| Suite                                 | Isi                                                                                                       | Butuh apa                        |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------- |
| `smoke` (`e2e/smoke.spec.ts`)         | **env-deploy (BLOCKER, test pertama)** + halaman publik + brand                                           | build production + `CRON_SECRET` |
| `main-flow` (`e2e/main-flow.spec.ts`) | 12 test: auth → deploy on-chain → member → product → stock → **proof QStash on-chain** → 3 skenario gagal | tunnel QStash (atau URL publik)  |

Semua test memakai **test factory** (`contracts/deployments/base-sepolia-test.json`)
dan **treasury produksi** (satu wallet — keputusan user). Cleanup penuh di
`afterAll` menghapus semua jejak run walau ada test gagal.

## Cara pakai lokal

```bash
pnpm install
pnpm e2e:verify        # validasi wiring env: factory/treasury/proofRecorder
pnpm e2e:serve --tunnel  # terminal 1: build + serve production + tunnel cloudflared
pnpm e2e:test          # terminal 2: Playwright full suite (15 test, ±1.5 menit)
```

- `E2E_TUNNEL=1` → `serve.mjs` membuka cloudflared quick tunnel dan men-set
  `QSTASH_APP_BASE_URL` saat **runtime** ke URL tunnel. Wajib untuk test
  proof (QStash tidak bisa menjangkau `localhost`).
- `E2E_SKIP_BUILD=1` → lewati build ulang (hemat waktu saat iterasi).
- `E2E_BASE_URL=https://…` → jalankan suite melawan deployment jarak jauh
  (staging Vercel) — tanpa tunnel, QStash delivery berjalan natural.
- `E2E_RETRIES=<n>` → override retry (default `0`; retry tidak aman untuk
  suite serial karena seed user memakai `Date.now()` tetap).

Prereq local: `cloudflared` (lihat `CLOUDFLARED_PATH` di `scripts/e2e/serve.mjs`),
`pnpm` via corepack, `forge`/`cast` di `~/.foundry/bin`, dan `.env.local` berisi
creds Supabase + `TREASURY_PRIVATE_KEY` + `QSTASH_*` + `CRON_SECRET` +
`BASE_SEPOLIA_RPC_URL`. Nilai aktual tidak pernah dicetak ke output.

## BLOCKER "Environment & Deploy"

Test pertama suite memanggil `GET /api/internal/env-health` (gated
`Authorization: Bearer CRON_SECRET`) dan memverifikasi base URL QStash
server-side publik (`https`, bukan localhost) saat berjalan remote. Ini
menangkap di detik pertama mode gagal "proof macet pending" yang muncul dari
`NEXT_PUBLIC_APP_URL` di-inline saat build.

Resolusi base URL (lihat `lib/proof/qstash.ts`):

1. `QSTASH_APP_BASE_URL` — override eksplisit (serve.mjs E2E tunnel).
2. `NEXT_PUBLIC_APP_URL` — produksi custom domain (di-set manual di Vercel
   env saat build; diabaikan bila masih `localhost`).
3. `VERCEL_URL` — di-inject Vercel per deployment → **preview aman otomatis**
   walau URL unik/berubah tiap deploy.
4. gagal → throw (test BLOCKER menolak build).

## CI (GitHub Actions)

- `.github/workflows/ci.yml` — dua job:
  - `quality` (selalu jalan): typecheck, lint, vitest, build, secret scan.
  - `e2e` (jalan bila secret dikonfigurasi): install cloudflared + browser,
    tulis `.env.local` dari secret, `e2e:verify`, lalu suite penuh dengan
    tunnel.
- `.github/workflows/preview.yml` — **staging**: deploy PR ke Vercel preview,
  jalankan suite penuh terhadap URL preview (memvalidasi `VERCEL_URL`
  fallback). Jalan bila secret Vercel + E2E dikonfigurasi.

### Secret yang harus dikonfigurasi (Settings → Secrets and variables → Actions)

Prefix `E2E_` dipakai supaya jelas milik pipeline E2E:

| Secret                                                 | Untuk                                                |
| ------------------------------------------------------ | ---------------------------------------------------- |
| `E2E_SUPABASE_URL`                                     | `NEXT_PUBLIC_SUPABASE_URL`                           |
| `E2E_SUPABASE_PUBLISHABLE_KEY`                         | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`               |
| `E2E_PRIVY_APP_ID`                                     | `NEXT_PUBLIC_PRIVY_APP_ID`                           |
| `E2E_SUPABASE_SECRET_KEY`                              | `SUPABASE_SECRET_KEY`                                |
| `E2E_SUPABASE_SERVICE_ROLE_KEY`                        | `SUPABASE_SERVICE_ROLE_KEY`                          |
| `E2E_PRIVY_APP_SECRET`                                 | `PRIVY_APP_SECRET`                                   |
| `E2E_TREASURY_PRIVATE_KEY`                             | `TREASURY_PRIVATE_KEY` (treasury produksi)           |
| `E2E_QSTASH_TOKEN`                                     | `QSTASH_TOKEN`                                       |
| `E2E_QSTASH_URL`                                       | `QSTASH_URL` (`https://qstash-us-east-1.upstash.io`) |
| `E2E_QSTASH_CURRENT_SIGNING_KEY`                       | `QSTASH_CURRENT_SIGNING_KEY`                         |
| `E2E_QSTASH_NEXT_SIGNING_KEY`                          | `QSTASH_NEXT_SIGNING_KEY`                            |
| `E2E_CRON_SECRET`                                      | `CRON_SECRET` (min 16 karakter)                      |
| `E2E_BASE_SEPOLIA_RPC_URL`                             | `BASE_SEPOLIA_RPC_URL`                               |
| `VERCEL_TOKEN` / `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` | deploy preview (workflow `preview.yml`)              |

Tanpa secret, `e2e`/`staging` skip dengan pesan jelas — PR tidak diblokir.

## Deploy Vercel (produksi)

`NEXT_PUBLIC_APP_URL` **tidak di-auto-provide** Vercel — WAJIB di-set manual
di Project Settings → Environment Variables (scope Production/Preview) karena
di-inline saat build. Bila lupa, build jatuh ke `http://localhost:3000` dan
proof macet pending; smoke BLOCKER akan menolak deployment tersebut.
