# Verifikasi & Fix — Batch B (2026-10-04)

Baseline awal Batch B: HEAD `9c0369f`, `test` 587 passed | 32 skipped.
Hasil akhir: `test` **606 passed | 32 skipped, 121 files, 0 failed** (+19 test baru).
Commit Batch B: `d895928` (T-1), `b98f7d7` (T-3/R-4), `88c99cf` (R-6 test),
`43c3f4f` (R-7), `edb190f` (R-8), `983239e` (M-6).

CATATAN ATRIBUSI JUJUR: commit dilakukan setelah semua edit Batch B selesai,
sehingga `git add .github/workflows/ci.yml` pada commit `b98f7d7` mengikutkan
seluruh working-tree ci.yml saat itu (pin SHA + permissions + cloudflared
[T-3], job contracts [R-6], step encoding [R-8]). Isi di HEAD lengkap dan
terverifikasi per temuan di bawah; commit `88c99cf`/`edb190f` membawa test +
file non-ci.yml masing-masing. Tidak ada push; histori lokal saja.
`AUDIT_ChaInventory_0.5.7_20261004.md` tetap kotor pra-sesi — tidak disentuh.

## 1. Tabel ringkas

| ID      | Verdict | Bukti singkat                                                                                                        | Aksi                                                       | File diubah                                    | Test baru                             | Gate                   |
| ------- | ------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------- | ------------------------------------- | ---------------------- |
| T-1     | VALID   | `SKIP=1 + VERCEL_ENV=production` → import `lib/env` resolve (seharusnya reject). Test 1 gagal → 3 lulus              | Throw bila SKIP di production; `skipValidation` efektif    | `lib/env.ts`                                   | `lib/env-skip-production.test.ts` (3) | hijau + build          |
| T-3+R-4 | VALID   | 15 `uses:@v4` tanpa SHA; 0 `permissions:`; `releases/latest` tanpa checksum. Test 4 gagal → 4 lulus                  | SHA pin + `contents: read` + cloudflared 2026.9.3 + sha256 | 3 workflow                                     | `workflow-hardening.test.ts` (4)      | hijau                  |
| R-6     | VALID   | `rg forge workflows` → 0; `contracts/` + submodule ada; forge lokal tak ada (tak dijalankan). Test 2 gagal → 2 lulus | Job `contracts` (submodule + toolchain pin + build/test)   | `ci.yml`                                       | `workflow-contracts.test.ts` (2)      | hijau                  |
| R-7     | VALID   | Tanpa guard, `--push` dummy lanjut ke `supabase link` (terbukti di output test). Test 2 gagal → 3 lulus              | Allowlist `DB_PUSH_ALLOWED_REFS` pre-link + docs           | `push-verify.mjs`, `WORKFLOW.md §4.3`          | `db-push-guard.test.ts` (3)           | hijau                  |
| R-8     | VALID   | `scripts/ci/` tanpa encoding check; tiada script/CI wiring. Test 3 gagal → 4 lulus                                   | `encoding-check.mjs` + script + step CI                    | `encoding-check.mjs`, `package.json`, `ci.yml` | `encoding-gate.test.ts` (4)           | hijau (692 file clean) |
| M-6     | VALID   | Hapus `--warning` dari salinan CSS → gate tetap hijau (fail-open). Test 2 gagal → 3 lulus                            | Unresolved = gagal + pairing ring 3:1; CSS tak diubah      | `check-contrast.mjs`                           | `check-contrast.test.ts` (3)          | hijau                  |

`PERUBAHAN PERILAKU`: T-1 (build Vercel Production + SKIP kini gagal eksplisit),
R-7 (`--push` tanpa allowlist/cocok kini exit 1), M-6 (token hilang kini gagal;
skrip terima arg path opsional — default sama).

## 2. Detail per temuan

### T-1 — SKIP_ENV_VALIDATION mematikan validasi di production (VALID)

Sebelum (`lib/env.ts:169,183-184`):

```ts
skipValidation: !!process.env.SKIP_ENV_VALIDATION,
...
const isVercelBuild = process.env.VERCEL === "1";
if (isVercelBuild && !process.env.SKIP_ENV_VALIDATION) { ...fail-fast... }
```

Kedua gerbang membaca variabel yang sama → `SKIP=1` di Production mematikan
validasi T3 DAN fail-fast diam-diam (README "jangan set di production" tanpa
penegakan). CI (`ci.yml:15` set SKIP=1, tanpa VERCEL_ENV) adalah pemakaian sah.

Test `lib/env-skip-production.test.ts` (isolasi via `vi.resetModules` + dynamic
import): production+SKIP resolve `{env: {... SKIP: "1" ...}}` padahal harus
reject → 1 gagal, 2 lulus (preview/CI lolos).

Sesudah: throw eksplisit bila `VERCEL_ENV=production && SKIP` (sebelum
`createEnv` — gagal jelas walau secret lengkap); `skipValidation` memakai
`skipEnvValidation` (SKIP diabaikan di production); gate memakai variabel
efektif. Preview/CI/lokal tak berubah. Test 3 passed; `typecheck` + `build`
hijau. `PERUBAHAN PERILAKU`.

### T-3 + R-4 — pin SHA, permissions, cloudflared (VALID)

Bukti (`rg`): 15 `uses:` (9 ci + 3 preview + 3 live-env) semua `@v4` tanpa SHA;
`permissions:` 0; `cloudflared .../releases/latest/...` tanpa checksum lalu
`chmod +x` + eksekusi.

SHA resmi (verbatim `git ls-remote`, 2026-10-04):

- `actions/checkout` v4/v4.4.0 → `11d5960a326750d5838078e36cf38b85af677262`
- `actions/setup-node` v4/v4.4.0 → `49933ea5288caeca8642d1e84afbd3f7d6820020`
- `pnpm/action-setup` v4 (= v4.3.0, peeled `v4^{}`) → `b906affcce14559ad1aafd4ab0e942779e9f58b1`
  (pin resolusi floating saat ini = nol perubahan perilaku; bukan upgrade ke v4.4.0)
- `foundry-rs/foundry-toolchain` v1 → `908c540300062bd5a7e473851cdb4282204cee09` (dipakai R-6)
- cloudflared `2026.9.3` (API `published_at 2026-09-24`) sha256
  `77e26d8d...e3fbac2` (diunduh sekali lalu hash; tidak ada file checksum resmi
  Cloudflare — didokumentasikan di komentar YAML; naikkan versi+hash bersamaan).

Fix: `permissions: contents: read` top-level di 3 workflow (semua job hanya
butuh baca; deploy preview pakai `VERCEL_TOKEN` dari secrets, bukan
GITHUB_TOKEN); 15 `uses:` → SHA + komentar versi; cloudflared versi-pin +
`sha256sum -c -` SEBELUM `chmod`; bonus: pola R-5 diterapkan ke gate
`preview.yml:15` dan `live-env-tests.yml:31` (interpolasi secret langsung yang
sama — ditemukan saat T-3). Test `workflow-hardening.test.ts` 4 gagal → 4
lulus; test R-5 lama tetap hijau. YAML valid (prettier parse OK).

### R-6 — job forge di CI (VALID)

`rg -n forge .github/workflows` → kosong. `contracts/` ada (foundry.toml solc
0.8.36, src, test 4 file, submodule forge-std + openzeppelin-contracts).
`where.exe forge` → tidak ada (forge lokal TIDAK dijalankan, sesuai arahan).

Test `workflow-contracts.test.ts` 2 gagal → tambah job `contracts` di `ci.yml`
(checkout pin + `submodules: recursive`, toolchain pin `# v1`, `forge build` +
`forge test` di `working-directory: contracts`) → 2 lulus. Job tanpa secret;
`permissions` warisan top-level.

### R-7 — guard `db:push:verify` (VALID, PERUBAHAN PERILAKU)

Skrip dibaca (TIDAK dijalankan manual): mode `--push` hanya cek kredensial ada
lalu `supabase link` + `db push`. Bukti runtime dari test: dengan kredensial
dummy, skrip MELEWATI tahap kredensial dan mengeksekusi
`supabase link --project-ref dummy-ref` (gagal hanya karena format token) —
tanpa allowlist, ref salah/crets prod keliru = push ke DB salah.

Fix di `scripts/db/push-verify.mjs`: parse `DB_PUSH_ALLOWED_REFS`
(koma-dipisah, trim); kosong → `fail` (exit 1); `ref ∉ allowlist` → `fail` —
keduanya SEBELUM `supabase link`. Test `db-push-guard.test.ts`: 2 statis
(ada + sebelum link) + 1 spawn `--push` (allowlist kosong → exit 1 berisi
`DB_PUSH_ALLOWED_REFS`, tanpa DB tersentuh) → 3 lulus. Docs: `WORKFLOW.md
§4.3`. `PERUBAHAN PERILAKU` (tercatat di header skrip + laporan).

### R-8 — gate encoding UTF-8 (VALID)

`ls scripts/ci/` + `rg encoding` → tidak ada. Test wiring 3 gagal →
`scripts/ci/encoding-check.mjs` baru (TextDecoder fatal, skip dir
dep/build/submodule-pihak-ketiga/`.kilo`/`.opencode`/`supabase/.temp` +
ekstensi biner + cap 1MB, cakupan termasuk `supabase/migrations` dan
`contracts/src|test|script`; arg dir opsional untuk test) + script
`encoding:check` di `package.json` + step di CI quality job (preflight tetap
7/7 — tidak diubah) → 4 lulus (termasuk fungsional: fixture `0xFF` ditolak,
dir bersih lolos). Repo: `clean (692 files)`; fixture buruk terbukti
tertangkap. Batasan jujur (di header skrip): U+FFFD yang sudah membaku adalah
UTF-8 valid (kasus K-1) — gate mencegah byte rusak baru, review menangkap
mojibake.

### M-6 — check-contrast fail-open + non-teks (VALID, tanpa ubah CSS)

Dua cacat terbukti: (1) `if (!fgHex || !bgResolved) continue` — salinan CSS
tanpa `--warning` → gate tetap hijau (test couvre ini, 1 gagal); (2) 0 pairing
non-teks WCAG 1.4.11.

Pengukuran sebelum fix (skrip, terukur): ring vs bg/card = 5.21/7.48 (light),
6.63/4.82 (dark) → lolos 3:1; border/input = 1.20/1.73 (light), 1.94/1.41
(dark) → GAGAL 3:1. Karena CSS dilarang diubah di temuan ini, border/input
SENGAJA tidak di-gate (dicatat di header skrip + diteruskan ke M-5 Batch D
dengan angka); yang di-gate: 14 teks + ring×2×2 tema.

Fix: arg path CSS opsional (default sama), unresolved → `failures++` +
pesan `UNRESOLVED <token>`, 2 pasang ring 3:1. Test 3 lulus (baseline hijau,
tampered merah 6 unresolved, statis ring). `pnpm check:contrast` hijau, nol
perubahan `app/globals.css` (`git diff --stat` CSS kosong).

## 3. TIDAK-VALID Batch B

Tidak ada — semua 6 klaim valid (penuh/sebagian dengan catatan border→M-5).

## 4. NEED-RUNTIME / keputusan

- R-6: forge tidak dijalankan lokal (tak terpasang). Verifikasi di CI pada PR
  berikutnya: tab Actions → job `contracts` hijau (`forge build` + `forge test`).
- T-3 cloudflared hash: dihitung dari unduhan 2026-10-04 (bukan file checksum
  resmi — Cloudflare tidak mempublikasikannya). Saat update versi, ganti
  `CLOUDFLARED_VERSION` + `CLOUDFLARED_SHA256` bersamaan.
- Tidak ada KEPUTUSAN-DESAIN di Batch B (border→M-5 di Batch D).

## 5. Migrasi baru

Tidak ada.

## 6. Gate sebelum vs sesudah

- Sebelum: 587 passed | 32 skipped (115 files); typecheck/lint hijau.
- Sesudah: `typecheck` ✅ `lint` ✅ `format:check` ✅ `test` **606 passed |
  32 skipped (121 files, 0 failed)** ✅ `i18n:check` ✅ `check:contrast` ✅
  `encoding:check` ✅ (692 files) `deps:audit` ✅ `secret:scan` ✅ `build` ✅
  61/61 `preflight` ✅ 7/7.
- Noise stderr saat `pnpm test` (`bad.txt`, `UNRESOLVED`, `DB_PUSH_ALLOWED_REFS`)
  adalah output child-process yang disengaja dari functional test — bukan
  kegagalan (suite 0 failed).
- Tidak ada `.env*`/secret dibaca; tidak ada push/link/deploy/jaringan tulis
  kecuali unduhan baca cloudflared + `ls-remote`/API baca untuk SHA.
