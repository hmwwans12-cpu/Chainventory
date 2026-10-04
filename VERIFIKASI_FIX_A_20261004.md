# Verifikasi & Fix — Batch A (2026-10-04)

HEAD awal: `c2cc341` (di atas `b819b59`). 5 commit baru: `b576887`, `218657a`, `d1d398d`, `521e27b`, `181282a`.
File `AUDIT_ChaInventory_0.5.7_20261004.md` sudah kotor (M) sebelum sesi dimulai — **tidak disentuh / tidak di-commit**.

## 1. Tabel ringkas

| ID                 | Verdict         | Bukti singkat                                                                                                                                                                         | Aksi                                                | File diubah                    | Test baru                                             | Gate                       |
| ------------------ | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------- | ------------------------------ | ----------------------------------------------------- | -------------------------- |
| T-2                | VALID           | Kode lama: `neutralizeFormula("\t=1+1")` → tak berubah; `"-1+1"` → tak berubah. Test baru 27 gagal di kode lama, 48 lulus setelah fix                                                 | Perluas deteksi (`LEADING_BYPASS` + `PLAIN_NUMBER`) | `lib/csv/formula-injection.ts` | `lib/csv/formula-injection.test.ts` (48 test)         | hijau                      |
| M-8                | VALID           | `app/layout.tsx:98` `<html lang="en">` hardcode; `lib/i18n/server.ts:10` `getLocale()` bisa `id`. Test statis 3 gagal → 3 lulus                                                       | `RootLayout` async + `lang={locale}`                | `app/layout.tsx`               | `lib/i18n/layout-lang.test.ts`                        | hijau + `next build` lulus |
| R-5                | VALID           | `ci.yml:76` `if [ -z "${{ secrets.E2E_SUPABASE_URL }}" ]` di `run:`. Test statis 1 gagal → 2 lulus                                                                                    | Secret via `env:` step                              | `.github/workflows/ci.yml`     | `lib/security/workflow-secrets-interpolation.test.ts` | hijau                      |
| K-1                | VALID           | `node`: baris 381–382 berisi 4× U+FFFD (`efbfbd`); `count FFFD: 4` → setelah fix `0`                                                                                                  | `�` → `+` (ikut gaya `+` di baris 378–379)          | `ARSITEKTUR.md`                | — (verifikasi perintah)                               | hijau                      |
| #14                | TIDAK-VALID     | Guard SUDAH ada 3× (`stock-movement-dialog.tsx:120-125`, `create-warehouse-form.tsx:240-245`, `product-dialogs.tsx:94-99`) + blok tutup dialog saat busy                              | Tidak ubah kode                                     | —                              | —                                                     | —                          |
| #16                | TIDAK-VALID     | `rg transition-all` → 0 di kode (1 di komentar `marketing-header.tsx:45`, 1 di `TODO.md:306` historis). Kode sudah `transition-colors`/`transition-[...]` spesifik                    | Tidak ubah kode                                     | —                              | —                                                     | —                          |
| #17                | VALID-SEBAGIAN  | 3 call-site tanpa locale: `manual-review-table.tsx:145`, `audit-trail.tsx:88`, `stock-movement-dialog.tsx:927`. Test statis 1 gagal → 1 lulus. Body docs = backlog (tidak dikerjakan) | Teruskan `locale` ke formatter                      | 3 komponen (lihat bawah)       | `lib/i18n/relative-time-locale.test.ts`               | hijau, `i18n:check` hijau  |
| B1 #1/#4,#3,#5–#13 | LOLOS (regresi) | Detail §3                                                                                                                                                                             | Tidak ubah kode                                     | —                              | —                                                     | hijau                      |
| B1 #2              | NEED-RUNTIME    | File migrasi relay ada; apply ke remote = urusan pemilik                                                                                                                              | Tidak ubah kode                                     | —                              | —                                                     | —                          |

`PERUBAHAN PERILAKU`: M-8 (lang `en`→`id` untuk pengguna Indonesia — sesuai tujuan), #17 (format tanggal 3 widget mengikuti locale).

## 2. Detail per temuan

### T-2 — CSV formula injection (VALID)

Sebelum (`git show HEAD:lib/csv/formula-injection.ts`, verbatim):

```ts
const FORMULA_PREFIX = /^[=+@]/;
const NEGATIVE_NOT_NUMBER = /^-(?!\d)/; // `-` followed by a non-digit

export function neutralizeFormula(value: string): string {
  if (FORMULA_PREFIX.test(value) || NEGATIVE_NOT_NUMBER.test(value)) {
    return `'${value}`;
  }
  return value;
}
```

Konsumen (satu-satunya security control, keduanya delegasi ke helper):

```ts
// lib/inventory/csv.ts:112-118
export function csvCell(value: string): string {
  const safe = neutralizeFormula(value);
  return /[",\r\n]/.test(safe) ? `"${safe.replaceAll('"', '""')}"` : safe;
}
// lib/console/csv.ts:34
s = neutralizeFormula(s);
```

Route ekspor memakai keduanya:

- `app/api/warehouses/export/route.ts:10,205` → `toCsv` (inventory)
- `app/api/console/export/route.ts:6,41,56` → `toCsv` (console)

Reproduksi (test baru dijalankan di atas kode lama):

```text
corepack pnpm vitest run lib/csv/formula-injection.test.ts
→ 27 failed | 21 passed (48)
contoh: prefix "\t=1+1", "\r=1+1", "-1+1", "-2+3", " =1+1" → expected true, received false
```

Perintah + bukti gagal-lalu-lulus didokumentasikan penuh di sesi (27 gagal → setelah restore fix 48 lulus).

Sesudah (`lib/csv/formula-injection.ts:39-74`, diff `b576887`):

- `LEADING_BYPASS = /^[\t\r\n\v\f ]+/` — deteksi setelah strip kontrol untuk `probe`, nilai asli tidak dipotong (prefix tepat 1×, idempoten karena `'` bukan bypass).
- `PLAIN_NUMBER = /^-?\d+(?:\.\d+)?$/` — `-30`/`-30.5` tetap numerik; `-1+1`/`-2+3` (dieksekusi spreadsheet) kini di-prefix. Menutup lubang `^-(?!\d)` yang hanya cek 1 karakter.
- Nilai berawalan kontrol/spasi selalu di-prefix (parser spreadsheet/trim bisa mengarang formula).

Test: `lib/csv/formula-injection.test.ts` — 16 DANGEROUS + 9 SAFE + idempotensi + kedua exporter (`csvCell`/`csvEscape`) + RFC 4180 quoting. `corepack pnpm vitest run lib/csv/formula-injection.test.ts` → 48 passed.

### M-8 — `<html lang="en">` hardcode (VALID)

Sebelum (`app/layout.tsx:92-98`):

```tsx
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
```

`lib/i18n/server.ts:10-14`: `getLocale()` baca cookie `locale`, kembalikan `"id"` bila `locale=id`, else `"en"`. Layout mengabaikannya → pengguna Indonesia dapat lang salah.

Test statis `lib/i18n/layout-lang.test.ts` (gagal 3/3 sebelum): assert `getLocale` dipakai, tidak ada `<html lang="en">`, ada `<html lang={locale|lang}>`.

Sesudah (diff `218657a`): import `getLocale`, `RootLayout` → `async`, `const locale = await getLocale()`, `<html lang={locale}>`. `AuthShell` tetap sinkron (tidak disentuh) — error boundary client aman. `PERUBAHAN PERILAKU`: lang kini `id` untuk pengguna Indonesia.

Bukti: test 3 passed; `corepack pnpm typecheck`, `lint`, `next build` (61/61 static) + `preflight` 7/7 hijau.

### R-5 — interpolasi secret di `run:` (VALID)

Sebelum (`.github/workflows/ci.yml:70-81`):

```yaml
- name: Evaluate E2E secret availability
  id: gate
  run: |
    if [ -z "${{ secrets.E2E_SUPABASE_URL }}" ]; then
```

`rg -n "secrets\." .github/workflows/ci.yml` → satu-satunya interpolasi di `run:` adalah baris 76; sisanya (89–105, 180) sudah di `env:` — benar.

Test statis `lib/security/workflow-secrets-interpolation.test.ts`: parse semua blok `run:`, assert tak ada `secrets.`. Gagal 1/2 sebelum (blok gate dikutip verbatim), lulus 2/2 sesudah.

Sesudah (diff `d1d398d`):

```yaml
env:
  E2E_SUPABASE_URL_AVAILABLE: ${{ secrets.E2E_SUPABASE_URL }}
run: |
  if [ -z "$E2E_SUPABASE_URL_AVAILABLE" ]; then
```

Logika gate identik — bukan perubahan perilaku, hanya anti script-injection.

### K-1 — karakter rusak ARSITEKTUR.md (VALID)

Perintah + output:

```text
node -e "..."
379-383:
"4. **Trigger**: warehouse active � product status role � warehouse_id immutable � unit immutable"
"5. **RLS**: tenant boundary (warehouse_id scoping) � SELECT only untuk authenticated"
hex: ...efbfbd... (U+FFFD) | count FFFD: 4
```

Hanya 4 FFFD di file (baris 381–382). `?` di baris 311–317 adalah literal `?`, bukan rusak — tidak disentuh (di luar register).

Fix: `�` → `+` mengikuti gaya daftar yang sama (baris 378–379, 318 memakai `+`):

```text
4. **Trigger**: warehouse active + product status role + warehouse_id immutable + unit immutable
5. **RLS**: tenant boundary (warehouse_id scoping) + SELECT only untuk authenticated
```

Verifikasi: `FFFD left: 0`; `git diff ARSITEKTUR.md` 2 baris. Commit `521e27b`.

### #14 — beforeunload guard (TIDAK-VALID, sudah dimitigasi)

Guard sudah ada di ketiga alur kritis (pola identik BE-002, aktif hanya saat `busy`, cleanup listener):

- `components/inventory/stock-movement-dialog.tsx:118-125` (+ blok tutup dialog `674: if (busy && !next) return`)
- `components/warehouses/create-warehouse-form.tsx:238-245` (`busy = phase ∉ form/error/success`)
- `components/inventory/product-dialogs.tsx:91-99`

`busy` di movement menutupi seluruh `submitViaIntent` (signing wallet `eth_sendTransaction` + polling intent) dan `applyMovement` (`safeSetBusy(true)` di 554 → false di 563/588). Hook `useBeforeUnloadGuard` yang disarankan = refactor tanpa perubahan perilaku; tidak dibuat (aturan minimal). Tidak ada file diubah.

### #16 — `transition-all` (TIDAK-VALID)

```text
rg -n "transition-all" . → marketing-header.tsx:45 (komentar), TODO.md:306 (catatan historis)
```

Nol utilitas `transition-all` di atribut class yang dikirim. Kode nyata sudah spesifik: `transition-colors`, `transition-opacity`, `transition-shadow`, `transition-[width]`, `transition-[margin,opacity]`, dll. (contoh `marketing-header.tsx:85` memakai `transition-colors`). Komentar baris 45 historis, bukan kode. Tidak ada file diubah.

### #17 — formatter tanpa locale (VALID-SEBAGIAN)

`rg formatTimeAgo|formatDateTime|formatDate` → mayoritas call-site sudah `locale` (pasca `b819b59`). Tiga lolos:

- `components/console/manual-review-table.tsx:145` `{formatDateTime(proof.updatedAt)}` (punya `useLocale` tapi hanya `t`)
- `components/console/audit-trail.tsx:88` `{formatDateTime(entry.createdAt)}` (sama)
- `components/inventory/stock-movement-dialog.tsx:927` `{formatDate(item.created_at)}` (opsi reversal)

Test statis `lib/i18n/relative-time-locale.test.ts` gagal sebelum (`formatDateTime(proof.updatedAt)` tanpa locale), lulus sesudah.

Fix (commit `181282a`, `PERUBAHAN PERILAKU` untuk pengguna `id`): `{ t }` → `{ t, locale }` + teruskan `locale` di ketiga call-site. Body docs panjang = backlog, tidak dikerjakan (sesuai register). `pnpm i18n:check` hijau (tidak ada key baru).

## 3. B1 regression check

| ID    | Cek + perintah                                                                                                                                                                          | Hasil                                |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| #1/#4 | `rg persistWalletRegistration\|register_wallet_for_user lib/wallets/sync.ts` → default writer `persistWalletRegistration` (service-role); `vitest run sync.test.ts sync-client.test.ts` | 32 passed                            |
| #3    | `rg UNSUPPORTED_PROOF_MODE stock-movement-dialog.tsx` → 262 + fallback `applyMovement` 574                                                                                              | ada                                  |
| #5    | `rg email_placeholder translations.ts` → EN:92 + ID:1877; `pnpm i18n:check`                                                                                                             | hijau                                |
| #6    | `h-8` di lifecycle-button + api-error-action → keduanya + `before:-inset-2` ekspansi hit-area; `pnpm preflight`                                                                         | 7/7                                  |
| #7    | 0076 CHECK memuat `'low_stock'` (75–83); `vitest notification-type-parity`                                                                                                              | passed                               |
| #8    | 0077: `GET DIAGNOSTICS v_step = row_count` (bukan pola buggy `v = v + ROW_COUNT`) + `WHERE NOT EXISTS` (60,81) + `archive_*_id_idx` (26,28); `vitest archive-old-logs-0077`             | passed                               |
| #9    | `vitest rpc-arg-parity`                                                                                                                                                                 | 46 passed                            |
| #10   | `AuthShell`: `export function` (sinkron); `pnpm build`                                                                                                                                  | hijau                                |
| #11   | `fail` = arrow `(message, code)` di 114; semua `fail(` = panggilan, tanpa definisi rekursif                                                                                             | ok                                   |
| #12   | `package.json: next 16.3.8`; `pnpm deps:audit`                                                                                                                                          | hijau (hanya allowlist berekspirasi) |
| #13   | `0075/0076/0077_*.sql` ada                                                                                                                                                              | ada                                  |
| #2    | `20260925143242_warehouse_deployment_relay_outbox.sql` ada; parity mencakup `create_warehouse_and_deployment_with_relay`; status apply                                                  | `NEED-RUNTIME` (tugas pemilik)       |

## 4. NEED-RUNTIME / keputusan

- B1 #2: verifikasi apply migrasi relay di staging/prod — contoh: `supabase migration list` / cek tabel `deployment_outbox` di dashboard. Tidak dilakukan sesi ini (aturan besi #2).
- Tidak ada KEPUTUSAN-DESAIN di Batch A (M-4/M-5 di Batch D).

## 5. Migrasi baru

Tidak ada (Batch A tidak menyentuh DB).

## 6. Gate sebelum vs sesudah

- Sebelum (tree kotor awal, sudah termasuk fix T-2 yang belum di-commit): `test` 581 passed | 32 skipped (112 files), `typecheck`/`lint` hijau.
- Sesudah (5 commit Batch A): `typecheck` ✅, `lint` ✅, `format:check` ✅ (setelah `prettier --write` 1 file), `test` **587 passed | 32 skipped, 115 files passed | 3 skipped, 0 failed**, `i18n:check` ✅, `check:contrast` ✅, `deps:audit` ✅, `secret:scan` ✅ clean, `build` ✅ (61/61), `preflight` ✅ 7/7.
- Catatan: `format:check` sempat merah pada file test baru → diperbaiki via prettier, bukan via edit manual.
- Tidak ada `.env*`/secret dibaca; tidak ada perintah infra nyata dijalankan.
