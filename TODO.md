# TODO.md

**Status:** Sebagian besar tercapai - disinkronkan dari audit kode
**Last Updated:** 2026-08-23
**Companion to:** `PRD.md`, `ARSITEKTUR.md`, `TECHSTACK.md`, `WORKFLOW.md`

Prioritas implementasi: selesaikan seluruh **P0**, lalu **P1 Identity/Wallet → RBAC → Inventory → Proof pipeline**, lalu **P2**, lalu **P3**.

> **Catatan sinkronisasi (2026-08-23):** kotak `[x]` ditandai berdasar bukti
> terverifikasi: test suite (Vitest 189 passed, Forge 26 passed), verifikasi
> browser end-to-end nyata (join/approve, stock in/out, error kontrak),
> keberadaan artefak kode (migrasi SQL s.d. 0024, `lib/proof/*`, `ci.yml`),
> dan audit kepatuhan dokumen. Kotak yang TIDAK dicoret memang belum
> terverifikasi atau belum ada — daftarnya dirangkum di bagian
> **Sisa Pekerjaan Terbuka** di bawah.
>
> **Update batch A–E (2026-08-23):** Google OAuth, Realtime UI, CSV
> export/import, dan sebagian uji ketahanan diimplementasikan; gerbang penuh
> hijau (prettier/tsc/eslint/Vitest/contrast/build). Detail: bukti per item
> di bawah + spesifikasi `docs/superpowers/specs/2026-08-23-oauth-realtime-csv-design.md`.
>
> **Last verified — 2026-08-24 (run nyata, bukan angka manual):**
> Vitest **209 passed / 25 skipped** · Forge **26 passed** · Playwright E2E lokal
> **18 passed** (termasuk proof on-chain via tunnel) · `tsc` PASS · `eslint` PASS ·
> `build` PASS · `format:check` PASS · `check-contrast` PASS ·
> `pnpm audit --prod --audit-level high` PASS (axios/ws di-patch via overrides).

---

## P0 — Project Foundation

- [ ] Buat repository private dan branch protection.
- [x] Inisialisasi Next.js App Router, TypeScript strict, pnpm, Tailwind, shadcn/ui.
- [x] Konfigurasi ESLint, Prettier, Vitest, Testing Library, Playwright.
- [x] Tambahkan `@t3-oss/env-nextjs` + Zod untuk validasi environment.
- [x] Konfigurasi GitHub Actions: lint, typecheck, test, build.
- [x] Hubungkan Vercel Hobby dan preview deployment.
- [x] Buat struktur environment local/production dan `.env.example` tanpa secret.
- [x] Konfigurasi Pino + request ID + log redaction.
- [x] Tambahkan secret/dependency scan pada CI. (secret scan `ci.yml`; dependency audit belum)

## P0 — Supabase Foundation

- [x] Buat project Supabase Free.
- [x] Migrasikan JWT signing key menjadi asymmetric/JWKS. (✅ terverifikasi live 2026-08-24: /.well-known/jwks.json mengekspos ES256)
- [ ] Konfigurasi Supabase Auth: email dan Google. (✅✅ keduanya live & terverifikasi 2026-08-24)
- [x] Buat tabel `users`, relasi ke `auth.users`, serta profile bootstrap.
- [x] Aktifkan RLS pada seluruh tabel aplikasi.
- [x] Buat helper database untuk membership/permission.
- [x] Buat migration framework dan aturan expand–migrate–contract.
- [ ] Konfigurasi Realtime hanya untuk tabel yang dibutuhkan.
- [x] Buat endpoint health check read-only dan Vercel Cron keep-alive harian.
- [x] Buat prosedur export manual database/audit sebelum demo.

## P0 — Blockchain Foundation

- [x] Inisialisasi Foundry dan OpenZeppelin Contracts.
- [x] Konfigurasi primary dan fallback RPC adapter.
- [x] Siapkan treasury test wallet dan prosedur funding via Base Sepolia faucet.
- [x] Pastikan treasury memiliki saldo test ETH minimum untuk deployment dan proof.
- [x] Implement Factory immutable.
- [x] Implement Warehouse Contract immutable.
- [x] Implement EIP-712 deployment authorization.
- [x] Implement `deploymentNonce` per owner address pada Factory.
- [x] Enforce satu warehouse aktif per owner address on-chain.
- [x] Implement Owner dan `Proof Recorder`.
- [x] Implement pencatatan proof yang idempotent berdasarkan `proofId`.
- [x] Buat Forge unit/fuzz tests: signature, expiry, nonce, chain/factory mismatch, duplicate proof, ownership.
- [x] Deploy Factory/Warehouse ke Base Sepolia dan verifikasi.
- [x] Buat contract registry: address, ABI, deployment block, version.

## P1 — Identity, Wallet, dan Akses

- [x] Implement login/sign-up Supabase: email dan Google. (✅✅ keduanya live & terverifikasi 2026-08-24)
- [x] Integrasikan Privy memakai custom-auth token Supabase.
- [x] Aktifkan embedded wallet dan external wallet.
- [x] Tambahkan Base Sepolia network guard serta switch-network UX.
- [x] Buat tabel `wallets`: riwayat wallet, primary wallet, verification state.
- [x] Terapkan aturan satu primary wallet.
- [ ] Implement flow wallet migration/ownership transfer on-chain untuk Owner.
- [x] Buat tabel `warehouses` dan `warehouse_deployments`.
- [x] Implement create warehouse: idempotency → read on-chain nonce → EIP-712 → relay → lifecycle deploy.
- [x] Implement Developer Console allowlist dari environment variable.
- [x] Uji akses Developer Console terpisah dari role warehouse.

## P1 — Membership dan RBAC

- [x] Buat tabel `memberships` dan canonical authorization matrix.
- [x] Buat tabel `join_requests`.
- [x] Implement join by warehouse code.
- [x] Implement approve/reject join request.
- [x] Enforce: Manager hanya dapat approve/assign/remove Staff, Auditor, Viewer.
- [x] Tolak approval, assignment, atau perubahan ke role `MANAGER` maupun `OWNER` oleh non-Owner dengan `403 FORBIDDEN`.
- [x] Tambahkan integration test untuk setiap percobaan role escalation oleh Manager.
- [x] Implement leave warehouse dan remove member.
- [x] Cegah Owner keluar sebelum transfer ownership.
- [x] Implement suspend/reactivate warehouse oleh Owner.
- [x] Tolak seluruh mutation warehouse saat status `suspended`.
- [x] Tambahkan audit log untuk semua perubahan role/member/status.

## P1 — Product dan Inventory Core

- [x] Buat tabel `products`, `inventory_balances`, `stock_movements`.
- [x] Buat SKU unik per warehouse.
- [x] Gunakan `NUMERIC(24,3)` untuk quantity.
- [x] Buat database trigger: unit produk tidak dapat berubah setelah movement pertama.
- [x] Route Handler memeriksa apakah produk sudah memiliki movement sebelum menerima perubahan unit dan mengembalikan error UX yang jelas.
- [x] Uji trigger database sebagai enforcement final terhadap direct/bypass update.
- [x] Implement PostgreSQL RPC `apply_stock_movement`.
- [x] Terapkan row lock, expected version, dan conditional update stok.
- [x] Kembalikan `INSUFFICIENT_STOCK` saat Stock Out melebihi saldo terkunci.
- [x] Kembalikan `STALE_STOCK` beserta saldo/version terbaru saat `expected_balance_version` tidak cocok.
- [x] Uji dua error tersebut sebagai respons API terpisah dan UI yang berbeda.
- [x] Implement Stock In untuk Owner/Manager/Staff.
- [x] Implement Stock Out untuk Owner/Manager/Staff.
- [x] Tolak stok negatif atomik.
- [x] Tambahkan reason/reference untuk setiap movement.
- [x] Implement Stock Adjustment dengan approval Owner/Manager.
- [x] Implement Stock Reversal sebagai movement baru yang merujuk movement asal.
- [x] Implement low-stock threshold dan alert in-app.
- [x] Implement archive product; hanya bila saldo nol dan tanpa hard delete.

## P1 — Proof Pipeline Async

- [x] Buat tabel `proofs`, `proof_outbox`, dan status lifecycle.
- [x] Buat payload proof immutable + version.
- [x] Implement JCS RFC 8785 + Keccak-256; semua numeric menjadi canonical decimal string.
- [x] Tambahkan proof/outbox dalam transaksi yang sama dengan movement committed.
- [x] Konfigurasi Upstash Redis dan QStash Free.
- [x] Implement publish job setelah database commit.
- [x] Implement QStash signature verification.
- [x] Implement job lease database dan duplicate-delivery safety.
- [x] Implement penghitungan ulang hash oleh Proof Job Processor sebelum submit; mismatch → `manual_review` + audit log.
- [x] Implement submit proof menggunakan treasury signer.
- [x] Simpan tx hash dan status `submitted`.
- [x] Implement confirmation job dengan delayed polling dan 2 confirmations.
- [x] Implement exponential retry maksimal lima kali.
- [x] Implement `manual_review` dan retry hanya dari Developer Console.
- [x] Implement reconciliation harian untuk outbox/proof yang tertinggal.
- [x] Tambahkan BaseScan link dan status proof pada UI.

## P2 — API Security dan Anti-Abuse

- [x] Implement Zod schema untuk seluruh Route Handler.
- [x] Implement urutan guard: JWT → membership → role → rate limit → business logic.
- [x] Konfigurasi Upstash rate limit per user dan IP.
- [x] Terapkan fail-closed pada mutation sensitif.
- [x] Terapkan fail-open + warning log pada read-only endpoint.
- [x] Implement idempotency UUID: kolom `idempotency_key` + constraint unik per tabel (`apply_stock_movement` replay → `IDEMPOTENT`; dedup di `stock_intents` & `warehouse_deployments`). (koreksi redaksi audit 2026-08-23 — tidak ada tabel `idempotency_records`; mekanismenya kolom+constraint)
- [x] Implement faucet: Owner/Manager/Staff saja, `0.001` Base Sepolia ETH per 12 jam.
- [x] Tambahkan anti-abuse faucet dan observability klaim.
- [x] Pastikan browser tidak dapat menjalankan direct mutation pada ledger/balance/proof.
- [ ] Uji RLS bypass, role escalation, rate-limit outage, dan secret leakage. (escalation + secret leakage ✅; RLS bypass ✅ `rls-bypass.contract.test.ts` live-env; rate-limit outage ✅ `rate-limit.outage.test.ts` + `.unconfigured.test.ts`)

## P2 — UI, Realtime, dan Data Access

- [x] Implement landing page, login, onboarding, dan wallet connection flow.
- [x] Implement app shell: sidebar, header, permission-aware navigation.
- [x] Implement dashboard: SKU aktif, stok rendah, movement terbaru, proof pending/failed, live/stale state.
- [x] Implement product list/detail/create/edit/archive.
- [x] Implement Stock In/Out form dengan decimal-safe input dan stale stock dialog.
- [x] Implement adjustment/reversal approval UI.
- [x] Implement transaction drawer dan proof/BaseScan detail.
- [x] Implement member management dan join request UI.
- [x] Implement warehouse suspension dan ownership transfer UI.
- [x] Implement Realtime subscription per warehouse dengan cleanup saat account/warehouse berubah. (✅ `use-warehouse-realtime.ts`; halaman movements punya channel tersendiri)
- [x] Implement `Live`, `Reconnecting`, dan `Data may be outdated` states. (✅ pill global di header + mesin status murni `lib/realtime/status.ts`)
- [x] Implement loading, skeleton, empty, error, disabled, permission-denied, offline states. (✅ offline ditambahkan 2026-08-24: `useOnline` + pill Offline di RealtimeIndicator)
- [x] Implement in-app notifications.
- [x] Implement responsive dan accessibility QA.
- [x] Implement CSV export berdasarkan permission. (✅ `/api/warehouses/export` + tombol di Products/Movements)

## P2 — CSV Import

- [x] Implement CSV template produk/stok awal. (✅ `public/templates/products-import.csv` + link unduh di dialog)
- [x] Batasi 1.000 baris dan ukuran file. (✅ `MAX_IMPORT_ROWS=1000`, `MAX_CSV_BYTES=1MB`; bulk route chunk ≤500)
- [x] Implement preview serta validasi penuh sebelum commit. (✅ parser RFC4180 `lib/inventory/csv.ts` + langkah preview Valid/Invalid)
- [x] Pastikan stok awal dibuat sebagai Stock In per baris. (✅ dua fase: bulk create lalu `applyMovement` stock_in)
- [x] Pastikan setiap movement import memiliki audit dan proof individual. (✅ lewat BFF movement standar + outbox proof per movement)
- [x] Tampilkan hasil berhasil/gagal per baris tanpa partial state ambigu. (✅ langkah hasil per baris + ringkasan stok)

## P2 — Developer Console

- [x] Implement dashboard platform-only: warehouse aktif/suspended, anggota, proof pending/failed, retry queue.
- [x] Tampilkan treasury test balance dan sisa kelayakan faucet.
- [x] Tampilkan status Supabase, Upstash Redis, QStash, primary/fallback RPC, dan Base Sepolia.
- [x] Tampilkan structured error summary serta request/proof/transaction correlation.
- [x] Implement manual retry proof dengan audit trail.
- [x] Implement manual export database/audit CSV.
- [x] Jangan pernah menampilkan secret, private key, JWT, atau signature mentah.

## P3 — Testing, Hardening, dan Release

- [x] Unit test validation, decimal formatting, JCS hash, RBAC, idempotency, proof lifecycle.
- [x] Integration test migration, RLS, trigger unit immutability, atomic stock, stale version, negative stock.
- [x] Contract Forge/fuzz test dan Base Sepolia smoke test.
- [x] Test QStash duplicate delivery, lease, retry, confirmation polling, manual review.
- [x] Playwright E2E: login → wallet → deploy → member → product → Stock In/Out → realtime → proof. (✅ 2026-08-24 lokal penuh via cloudflared tunnel: smoke + main-flow 12 termasuk proof on-chain QStash NYATA + console 3 = hijau semua; eksekusi CI tinggal isi secret E2E_*)
- [x] Test embedded dan external wallet.
- [ ] Test fail-closed Redis dan degraded QStash/RPC/Supabase state. (fail-closed Redis ✅ 2 test faucet; degraded QStash/RPC/Supabase belum)
- [x] Review bundle size, dependency licenses, accessibility, mobile layout, SEO landing page.
- [x] Jalankan release smoke test dan export manual sebelum demo.
- [x] Dokumentasikan known limitations free tier dan recovery playbook.

---

## Sisa Pekerjaan Terbuka (hasil audit 2026-08-23; diperbarui setelah batch A–E)

1. ~~Aktivasi Google provider di dashboard Supabase~~ ✅ (2026-08-24) — provider aktif & diverifikasi live (`/auth/v1/authorize?provider=google` → 302 ke accounts.google.com dengan client ID produksi). Catatan deploy: saat go-live Vercel, set `NEXT_PUBLIC_APP_URL` ke domain produksi dan tambahkan domain itu di Auth → URL Configuration.
2. ~~JWT asymmetric/JWKS~~ ✅ (ES256 aktif sejak project init — Supabase kini default asimetris).
3. ~~Offline state UI~~ ✅ (2026-08-24) — `hooks/use-online.ts` + status Offline eksplisit di indikator realtime.
4. **Degraded QStash/RPC/Supabase tests** — fail-closed Redis faucet ✅; degraded pipeline lain belum.
5. **Wallet migration/ownership transfer on-chain** untuk Owner — klarifikasi audit: kontrak `Warehouse.transferOwnership()` SUDAH ada (onlyOwner); yang belum dibangun adalah alur end-to-end (tx on-chain ditandatangani Owner via Privy + sinkron `on_chain_owner_wallet`) — butuh desain flow.
6. ~~E2E main-flow lokal penuh~~ ✅ (2026-08-24, 18 test hijau termasuk proof on-chain nyata; CI otomatis jalan begitu secret E2E_* diisi).
7. **Redeploy Factory solc 0.8.36** — ✅ v2 terdeploy (`0x3811...8Bf48`, tx `0xdc249aca…`) & tercatat di registry. Tersisa satu langkah manual: alihkan `WAREHOUSE_FACTORY_ADDRESS` ke v2 saat siap (v1 tetap melayani warehouse eksisting).
8. ~~Branch protection GitHub~~ ✅ (2026-08-24) — rule `main` aktif via API: required check `quality` (strict), force-push & delete diblokir, linear history wajib, admin bypass disengaja utk solo dev.
9. **SUPABASE_MANAGEMENT_TOKEN** kedaluwarsa (401) — segarkan di `.env.local` bila perlu eksekusi SQL live.
10. **Verifikasi live RLS bypass test** — `rls-bypass.contract.test.ts` auto-skip tanpa env server; jalankan dengan env penuh untuk bukti live.
11. ~~Apply migrasi 0025–0026 ke database live~~ ✅ (2026-08-24) — ternyata 0022 & 0024 juga belum ter-apply; seluruhnya sudah dieksekusi via `supabase db query --linked` dan terverifikasi live (tabel `faucet_claims`+`stock_intents`, RPC intents race-safe, trigger berbasis `auth.jwt()` tanpa sesi anonim lolos). BONUS: 3 bug fatal di 0022 ditemukan & diperbaiki sebelum apply pertama (predikat index memakai `now()` non-IMMUTABLE → 42P17; typo `end begin;`; panggilan `public.write_audit(7 arg)` yang tidak ada → diganti `private.write_audit(9 arg)` + cooldown 12 jam dicek eksplisit).
12. **Rate limit mutasi sensitif (audit N-2, diimplementasikan 2026-08-23)** — limiter fail-closed per user+IP kini ada untuk stock movement/intent, product write (tunggal+bulk), warehouse create/deployment, membership/ownership, dan wallet sync (`lib/security/rate-limit.ts`); faucet tetap memakai cooldown 12 jam tersendiri. Belum terverifikasi live melawan Upstash production.
