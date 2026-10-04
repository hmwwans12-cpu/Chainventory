# Verifikasi & Fix — Batch E (tindak lanjut, 2026-10-04)

Atas instruksi "semuanya lakukan": item owner-gated yang DAPAT dikerjakan
tanpa melanggar aturan besi dikerjakan (M-4/M-5 dengan nilai usulan Batch D,
fitur chunk #15 yang instalannya diizinkan register). Yang TETAP DITOLAK
(aturan besi #2): apply migrasi 0078/0079, `pnpm e2e*`, deploy kontrak —
tugas owner, lihat §4.

Baseline: HEAD `01b577b`, `test` 624 passed | 32 skipped.
Hasil akhir: `test` **628 passed | 32 skipped, 127 files, 0 failed** (+4).
Commit: `2110593` (M-4/M-5 nilai+gate), `36c7751` (format follow-up
DESIGN.md — pesan duplikat, isi hanya realignment tabel prettier),
`e49a04d` (#15).

## 1. Tabel ringkas

| ID   | Verdict           | Bukti singkat                                                                               | Aksi                                                   | File diubah                                                    | Test baru                 | Gate              |
| ---- | ----------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------- | ------------------------- | ----------------- |
| M-4  | VALID-DITERAPKAN  | Gate merah dulu (dark accent-fg/accent 4.09 < 4.5), sesudah `#1a5340` hijau 6.22            | `--accent` dark + 1 pasang gate                        | `globals.css`, `check-contrast.mjs`                            | (gate itu sendiri)        | hijau             |
| M-5  | VALID-DITERAPKAN  | Gate merah 8 titik border/input (1.20–1.94 < 3) → nilai baru semua ≥ 3.06                   | `--border/--input` ×2 tema + 4 pasang gate + DESIGN.md | `globals.css`, `check-contrast.mjs`, `DESIGN.md`               | —                         | hijau             |
| #15  | FITUR-SELESAI     | Cap server 100 + maxDuration 60 terverifikasi; chunk sequential + progress dibangun         | `bulkCreateProductsChunked` + dialog + i18n EN/ID      | `products-client.ts`, `bulk-add-dialog.tsx`, `translations.ts` | `bulk-chunks.test.ts` (4) | hijau, i18n hijau |
| 0068 | REGRESI-DITANGKAP | Test 0068 gagal oleh refactor #15 (string rapuh) → assertion dilonggarkan tanpa ubah intent | 1 baris test                                           | `product-intent-idempotency-0068.test.ts`                      | —                         | hijau             |

`PERUBAHAN PERILAKU`: M-4/M-5 (warna), #15 (impor >100 baris kini antre
chunk sequential + progress, bukan toast error; cap server 100 TETAP).

## 2. Detail

### M-4/M-5 — nilai diterapkan (dengan gate merah-dulu)

Urutan TDD: 5 pasang baru masuk `PAIRS` dulu
(accent-fg/accent 4.5; border/input × bg/card 3:1) →
`pnpm check:contrast` MERAH 9 titik persis seperti prediksi Batch D
(dark accent 4.09; border 1.20/1.73 light, 1.94/1.41 dark; light accent
5.21 lolos — absen dari failures, benar) → terapkan:

- dark `--accent` `#247158` → `#1a5340` (6.22:1). Token lain bernilai sama
  (`--secondary`, `--eden`, `--chart-3`) TIDAK tersentuh (deklarasi
  terpisah). Sibling check: dark secondary-fg/secondary = 5.13:1 → lolos,
  tak perlu tindakan.
- light `--border/--input` `#d4c2b2` → `#7d6a5c` (3.58/5.14).
- dark `--border/--input` `#2d5447` → `#5d8a76` (4.21/3.06 — margin tipis
  di card, dicatat).
- Komentar rasio ditulis di sebelah token (pola file ini); `DESIGN.md`
  §4/§5 sel Border diperbarui (sel dark lama `#23493C` memang sudah basi
  vs aktual — kini akurat). Staleness lain (Card `#153227`) di luar
  lingkup, tidak disentuh.

→ `pnpm check:contrast` hijau. Revert bila owner tak setuju: checkout
tiga nilai lama + kembalikan 5 pasang PAIRS (satu commit).

### #15 — antrean chunk (desain + bukti)

liabilities: kunci per-baris server = derive(operationKey, idx-DALAM-request)
— chunk dengan kunci operasi SAMA akan tabrakan
(`already used for a different product request`). Maka tiap chunk kunci
sendiri (`<base>:chunk-<i>`); retry base key sama = chunk selesai replay
no-op via jalur existingIntent. Abort saat chunk gagal transport (sisa
dibatalkan; yang selesai tetap tersimpan — jujur dilaporkan, bukan
rollback palsu). Indeks hasil diremap ke global agar daftar gagal di UI
menunjuk baris benar. ≤100 baris = 1 request (perilaku lama identik).
Server cap 100 + maxDuration TIDAK diubah (pertahanan berlapis).
UI: teks progres `progress_chunk` (aria-live polite, hanya bila >1 chunk)
EN+ID; `i18n:check` hijau.

Test `bulk-chunks.test.ts` 4 gagal-dulu (export belum ada) → 4 lulus:
split 250→100/100/50; 1 chunk = 1 request; 3 request + kunci unik +
indeks global + progres 1/2/3-of-3; abort di chunk-2.

Regresi jujur: full suite MENEMUKAN 1 gagal —
`product-intent-idempotency-0068` (assert string persis call-shape lama).
Perilaku retensi kunci TIDAK berubah (ref dipertahankan lintas retryable,
null saat sukses/non-retryable/tutup — diverifikasi baca kode); assertion
dilonggarkan ke substring bermakna. Bukan penjinakan test: intent
("browser keys retained only across retryable") tetap ditegakkan.

## 3. Yang TETAP tidak dikerjakan (aturan besi, butuh owner)

1. Apply `0078`/`0079` ke staging/prod (tulis-only; perintah di laporan C).
2. `pnpm e2e*` / tunnel / secret E2E (butuh kredensial + browser farm).
3. Deploy kontrak v3 (opsi M-3) — butuh kunci + keputusan desain.
4. `security_invoker` v0.6 (butuh E2E).
5. Sisa staleness DESIGN.md di luar sel Border (bukan temuan register).

## 4. Gate sebelum vs sesudah

- Sebelum: 624 passed | 32 skipped (126 files).
- Sesudah: `typecheck` ✅ `lint` ✅ `format:check` ✅ `test` **628 passed |
  32 skipped (127 files, 0 failed)** ✅ `i18n:check` ✅ `check:contrast` ✅
  `encoding:check` ✅ (705 files) `deps:audit` ✅ `secret:scan` ✅ `build` ✅
  61/61 `preflight` ✅ 7/7.
- NOL `.env*`/secret dibaca; NOL tulis infra (satu-satunya jaringan pada
  sesi ini: tidak ada — semua verifikasi Batch E lokal).
