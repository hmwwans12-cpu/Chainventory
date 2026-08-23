# TECHSTACK.md

**Status:** Locked
**Last Updated:** 2026-08-13
**Companion to:** `PRD.md`

---

## 1. Stack Table

| Area                   | Pilihan                                                                     |
| ---------------------- | --------------------------------------------------------------------------- |
| App                    | Next.js App Router + React + TypeScript strict                              |
| Styling/UI             | Tailwind CSS + shadcn/ui + Radix primitives                                 |
| Design assets          | Lucide icons, Motion, custom Gooey Toast                                    |
| Form/validasi          | React Hook Form + Zod                                                       |
| Auth & session         | Supabase Auth: email + Google, JWT asymmetric/JWKS                          |
| Wallet                 | Privy custom auth, embedded wallet + external wallet                        |
| Database               | Supabase PostgreSQL                                                         |
| Authorization          | PostgreSQL RLS (defense-in-depth) + server-side permission checks (primary) |
| Realtime               | Supabase Realtime (filtered per warehouse)                                  |
| Backend API            | Next.js Route Handlers sebagai BFF                                          |
| Blockchain client      | viem; tanpa wagmi agar integrasi Privy lebih sederhana                      |
| Network                | Base Sepolia (`84532`)                                                      |
| Smart contract         | Solidity + Foundry + OpenZeppelin Contracts                                 |
| Contract model         | Factory immutable + Warehouse immutable per warehouse                       |
| Proof                  | JCS RFC 8785 + Keccak-256; outbox table + retry                             |
| Async job delivery     | Upstash QStash (signed async delivery)                                      |
| RPC                    | Primary RPC (Infura preferred candidate) + fallback melalui adapter tunggal |
| CSV import/export      | Papa Parse untuk parsing; generator CSV di server                           |
| Charts                 | Recharts                                                                    |
| Testing web            | Vitest + Testing Library + Playwright                                       |
| Testing contract       | Forge tests + Base Sepolia smoke test                                       |
| Lint/format            | ESLint + Prettier                                                           |
| CI/CD                  | GitHub Actions + Vercel Hobby                                               |
| Monitoring             | Pino structured logs + Vercel/Supabase status + Developer Console           |
| Caching                | Next.js cache untuk read-only/public; data warehouse sensitif tetap dynamic |
| Environment validation | `@t3-oss/env-nextjs` + Zod                                                  |
| Rate limiting          | Upstash Redis + `@upstash/ratelimit`                                        |
| Package manager        | pnpm                                                                        |

---

## 2. Authentication & Identity Architecture

### 2.1 Supabase Auth sebagai identitas utama

Supabase Auth menjadi identity & authorization layer: login email/Google, JWT, RLS.

JWT Supabase menggunakan **signing key asimetris/JWKS** (bukan symmetric/HS256 default). Migrasi project Supabase ke JWT signing keys (asymmetric, JWKS endpoint) adalah prasyarat wajib sebelum integrasi Privy berfungsi.

### 2.2 Privy sebagai wallet layer

Privy dikonfigurasi dengan **custom auth**, menerima access token dari sesi Supabase (`getCustomAccessToken`) sebagai basis otentikasinya sendiri. Privy tidak berjalan sebagai identity provider independen — ia menempel pada sesi Supabase.

Privy tetap menyediakan:

- Embedded wallet (dibuat otomatis saat login).
- External wallet connection.

### 2.3 Alasan tidak memakai Firebase/NoSQL

Firestore (NoSQL) bertentangan dengan kebutuhan atomic transaction dan RLS relasional yang menjadi fondasi arsitektur (lihat `ARSITEKTUR.md` §3). Supabase PostgreSQL dipertahankan sebagai satu-satunya database operasional.

### 2.4 Kapasitas free-tier

| Layanan       | Limit free-tier                                 | Kecukupan untuk MVP                                             |
| ------------- | ----------------------------------------------- | --------------------------------------------------------------- |
| Privy         | 500 MAU                                         | Jauh di atas kebutuhan demo/skripsi                             |
| Supabase      | ~50k MAU auth, 500MB DB                         | Cukup untuk skala MVP                                           |
| Upstash Redis | 500K commands/bulan, 256MB data, 10GB bandwidth | Setara ±16.600 request/hari untuk rate limiting sensitif — aman |

**Tidak menggandakan akun** Supabase/Privy untuk menambah kuota. Dua akun berarti dua source of truth, bertentangan dengan prinsip database tunggal (lihat `PRD.md` §29, §36). Jika limit terlampaui di masa depan, jalur yang benar adalah **upgrade plan**, bukan menggandakan akun.

---

## 3. Authorization Order (Defense-in-Depth)

Urutan wajib untuk setiap Route Handler:

```text
1. Verifikasi JWT Supabase
2. Verifikasi membership warehouse
3. Verifikasi permission role
4. Rate limit (Upstash)
5. Business logic / operasi database
```

**RLS adalah defense-in-depth/safety net** untuk mencegah kebocoran atau bypass jika ada bug application layer — **bukan primary authorization check**. Route Handler wajib memverifikasi JWT, membership, dan role sebelum menjalankan business logic atau operasi berprivilege, sesuai prinsip Next.js: selalu verifikasi kredensial sebelum memberi akses ke resource yang dilindungi, jangan mengandalkan satu layer saja.

---

## 4. Environment Validation

`@t3-oss/env-nextjs` + Zod, divalidasi saat **startup/build** agar deployment gagal cepat bila secret/config wajib belum tersedia — bukan gagal diam-diam saat runtime di production.

---

## 5. Logging

`pino` untuk structured JSON logs di server.

**Field standar:** request ID, user ID (ter-redaksi), warehouse ID, action, status, latency, error code.

**Dilarang mencatat:** token, private key, signature mentah, JWT, session cookie, atau secret apa pun.

---

## 6. Rate Limiting

**Provider:** Upstash Redis + `@upstash/ratelimit`, memakai identifier user dan IP.

**Kapasitas:** Free tier mencakup 500.000 command/bulan — cukup untuk demo; penggunaan dipantau di Developer Console.

### 6.1 Fail-Closed (mutation sensitif)

Berlaku untuk: **Stock In/Out, Adjustment, Reversal, Deployment, Ownership Transfer, Join/Member Management, Faucet.**

Jika Upstash Redis timeout/down, endpoint tersebut **menolak request tanpa menyentuh database**.

### 6.2 Fail-Open (operasi non-mutating)

Berlaku untuk: read/dashboard/search, refresh status proof, subscription Realtime.

Tetap dapat berjalan bila rate limiter gagal; sistem mencatat **warning terstruktur**. Tidak ada mutation yang "lolos" saat limiter bermasalah — fail-open hanya untuk operasi yang sama sekali tidak mengubah data.

---

## 7. Dependency Governance

- Dependency baru harus punya alasan jelas, kompatibel free tier, dipelihara aktif, dan tidak menduplikasi capability yang sudah ada.
- Jangan menambah layanan berbayar, mainnet, atau persistent worker tanpa change request eksplisit.
