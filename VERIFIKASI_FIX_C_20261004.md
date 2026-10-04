# Verifikasi & Fix — Batch C (2026-10-04)

Baseline awal Batch C: HEAD `724b492`, `test` 606 passed | 32 skipped.
Hasil akhir: `test` **622 passed | 32 skipped, 125 files, 0 failed** (+16).
Aturan Batch C dipatuhi: hanya file migrasi BARU + test (+2 baris README untuk
klaim cakupan); NOL apply ke DB; NOL sentuh kontrak.
Commit: `90ff563` (M-2), `ce09af6` (M-1/R-2), `177f487` (M-7),
`6f382e2` (R-1/R-3). `AUDIT_*.md` tetap kotor pra-sesi — tidak disentuh.

## 1. Tabel ringkas

| ID      | Verdict    | Bukti singkat                                                                                                                                                      | Aksi                                                                       | File diubah                            | Test baru                               | Gate  |
| ------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------- | -------------------------------------- | --------------------------------------- | ----- |
| M-2     | VALID      | 3 trigger `BEFORE UPDATE OR DELETE FOR EACH ROW`; `TRUNCATE` tak cocok di migrasi (hanya REVOKE di products). Test 2 gagal → 2 lulus                               | Migrasi 0078: BEFORE TRUNCATE ×3, raise 42501                              | `0078_forbid_truncate_append_only.sql` | `append-only-truncate-0078.test.ts` (2) | hijau |
| M-1+R-2 | VALID      | 112 DEFINER live (drop-aware), 54 ber-path `public` (0 NONE setelah parse TO-syntax). 54/54 terverifikasi tanpa ref telanjang. Test 1 gagal (54 missing) → 1 lulus | Migrasi 0079: 54× ALTER SET '' + guard                                     | `0079_lock_definer_search_path.sql`    | `definer-search-path-0079.test.ts` (1)  | hijau |
| M-7     | VALID      | 8 RPC dispatch (`fn[action]`) tak terlihat harness (8 gagal); 21 nama publik tak tercakup = trigger/dead (triase). Test 8 gagal → 55 lulus                         | +8 entri, ekstraksi dispatch, guard entri, key per-signature, README 44→54 | `rpc-arg-parity.test.ts`, `README.md`  | (+9: 8 kontrak + 1 guard)               | hijau |
| R-1     | KONFIRMASI | Kedua view `WHERE (select private.is_member(...))` (0012+0020); tanpa security_invoker. `rg is_member` di test = 0 → kunci                                         | Test guard statis (1 lulus); NOL ubah view; security_invoker → v0.6        | —                                      | `view-member-guard.test.ts` (1)         | hijau |
| R-3     | KONFIRMASI | `getClientIp` + komentar BE-19 ada; dimensi IP teruji, `getClientIp` tanpa test (`rg` = 0) → kunci                                                                 | Test precedence header (3 lulus); NOL ubah kode                            | —                                      | `rate-limit-ip.test.ts` (3)             | hijau |

Tidak ada PERUBAHAN PERILAKU runtime di Batch C (migrasi belum di-apply;
test-only + file SQL baru).

## 2. Detail per temuan

### M-2 — TRUNCATE lolos guard append-only (VALID)

Trigger eksisting (`0047:104-106,157-159,182-184`): `before update or delete
... for each row` ×3. `rg TRUNCATE migrations` → hanya komentar/REVOKE
`products` (0037). Row trigger tak pernah menyala saat TRUNCATE (butuh
statement-level `BEFORE TRUNCATE`) — celah nyata.

Test `append-only-truncate-0078.test.ts` 2 gagal (file 0078 belum ada) →
migrasi `0078_forbid_truncate_append_only.sql` (fungsi bersama
`private.forbid_truncate_append_only()` pakai `TG_TABLE_NAME`,
`set search_path = ''`, 3 trigger statement-level, raise 42501 —
konsisten dengan guard 0047) → 2 lulus. Insiden kecil: test sempat membaca
"file terbaru" sehingga 0079 mengganggunya — diperbaiki ke pola `0078*`
spesifik (laporan jujur; test kini robust terhadap migrasi susulan).

Perintah apply (OWNER, staging dulu, JANGAN otomatis):
`supabase db push --linked` lalu verifikasi `TRUNCATE public.proofs;` →
error 42501 + data utuh.

### M-1 + R-2 — search_path SECURITY DEFINER (VALID, 54 dikunci, 0 defer)

Metode (anti false-alarm, pelajaran M-7): live-set direkonstruksi
drop/overload-aware (CREATE terakhir per signature ternormalisasi menang;
DROP menghapus; sintaks `SET search_path TO 'x'` ikut diparse — temuan
tengah jalan: 0020 memakai TO-syntax; parser `=`-only sempat salah
klasifikasi, diperbaiki dan diverifikasi ulang). Hasil: 112 DEFINER live
(58 sudah `''`, 54 `public`, 0 tanpa-SET).

Verifikasi keamanan per fungsi (bukan klaim): sapu semua body 54 — nol
referensi tabel tak-terkualifikasi (2 hit `proofs` = false positive:
`FROM public.proofs WHERE proofs.col` = alias kolom + literal string),
nol pemanggilan tak-terkualifikasi selain builtin pg_catalog
(lower/format/btrim/… — resolve walau path `''`), nol temp table/dynamic
catalog, sapu DML telanjang = hanya `v_*`/CTE. Daftar DEFERRED kosong.

Migrasi `0079_lock_definer_search_path.sql`: 54×
`ALTER FUNCTION <sig-penuh> SET search_path = ''` (per-signature =
overload-safe; nilai `''` ikut pola 0064+/0077). Test guard
(`definer-search-path-0079.test.ts`) mem-parse ulang live-set dan menuntut
setiap DEFINER lemah tercakup ALTER 0079 / DEFERRED → RPC/fungsi baru
ber-path lemah = gagal (daftar 54 missing dikutip verbatim saat gagal).

Caveat jujur: bila fungsi di-CREATE-ulang setelah 0079 dengan path lemah,
ALTER 0079 (yang jalan lebih dulu) tertimpa — test tetap hijau. Mitigasi:
pola repo ke depan = tulis `set search_path = ''` di CREATE (seperti
0064+); verifikasi pasca-apply tersedia di header migrasi
(`pg_proc.prosecdef/proconfig` + panggil RPC kritis).

Perintah apply (OWNER): `supabase db push --linked` di staging, smoke test
RPC kritis, baru prod.

### M-7 — cakupan rpc-arg-parity (VALID)

Fakta ukur: `.rpc("literal")` di kode = 46 nama = 46 entri (nama cocok);
21 nama publik lain = helper trigger (`enforce_*`, `handle_new_user`,
`guard_*`) + legacy tercabut (`create_invitation`, `create_product_rpc`,
`register_wallet` lama — REVOKE di 0070) + service-only
(`purge_expired…`) — benar tidak di-parity (tak pernah dipanggil).
Celah NYATA: `app/api/warehouses/membership/route.ts:311`
`supabase.rpc(fn[action], rpcArgs[action])` — 8 RPC hidup
(request/approve/reject/cancel/join, leave, remove, update_member_role,
transfer_ownership) tak terlihat pemindai literal.

Fix di `rpc-arg-parity.test.ts`: +8 entri (8 gagal dulu persis seperti
klaim), ekstraksi `fn`+`rpcArgs` map (8 lulus — sekaligus membuktikan
argumen route cocok dua arah dengan overload DB), guard "RPC dipanggil
tanpa entri = gagal" (literal semua kode non-test + nilai dispatch map;
helper mati tak memicu), key overload aritas→signature ternormalisasi
(alias int/timestamptz; 13-arg bigint vs integer tak lagi menimpa),
README `44`→`54`. Hasil: 55 passed, nol false alarm.

### R-1 — view tanpa security_invoker (KONFIRMASI, tunda v0.6)

`0012:43-56,70-82` + `0020:60-74`: kedua view `WHERE (select
private.is_member(...))`, `grant select ... to authenticated`, tanpa
`security_invoker`. Test `view-member-guard.test.ts` mengunci kehadiran
filter di SEMUA definisi historis (sengaja TIDAK menuntut absennya
security_invoker agar migrasi v0.6 tak pecah). NOL perubahan view.

### R-3 — dimensi IP rate-limit (KONFIRMASI)

`lib/security/rate-limit.ts:209-225`: komentar BE-19 + `getClientIp`
(x-real-ip prioritas, XFF fallback, null) sudah benar; dimensi `user:`
otoritatif, IP lunak. Dimensi IP di `checkMutationRateLimit` sudah teruji;
yang hilang = test `getClientIp` itu sendiri (`rg` = 0). Test
`rate-limit-ip.test.ts` (3) menguncinya. NOL perubahan kode.

## 3. TIDAK-VALID Batch C

Tidak ada (R-1/R-3 = konfirmasi-yang-diperlukan-test, bukan bug kode).

## 4. NEED-RUNTIME / keputusan owner

1. Apply `0078` + `0079` di STAGING (`supabase db push --linked`), lalu:
   `TRUNCATE public.proofs;` → harus 42501; smoke RPC kritis
   (apply_stock_movement, analytics_dashboard, mark_notifications_read...);
   cek `pg_proc` proconfig `search_path=''`.
2. R-1 security_invoker → v0.6 + E2E (tidak dikerjakan di sini).
3. M-7 dead/legacy RPC (revoked/service-only) = tidak dihapus (kontrak
   hapus struktur = migrasi contract terpisah pasca-observasi).

## 5. Migrasi baru

- `supabase/migrations/0078_forbid_truncate_append_only.sql` (fungsi +
  3 trigger TRUNCATE).
- `supabase/migrations/0079_lock_definer_search_path.sql` (54 ALTER).
- Keduanya BELUM di-apply (tugas owner, perintah di §4.1).

## 6. Gate sebelum vs sesudah

- Sebelum: 606 passed | 32 skipped (121 files).
- Sesudah: `typecheck` ✅ `lint` ✅ (1 unused-import warning diperbaiki)
  `format:check` ✅ (SQL tanpa parser prettier — OK) `test` **622 passed |
  32 skipped (125 files, 0 failed)** ✅ `i18n:check` ✅ `check:contrast` ✅
  `encoding:check` ✅ (700 files) `deps:audit` ✅ `secret:scan` ✅ `build` ✅
  61/61 `preflight` ✅ 7/7.
- Tidak ada `.env*`/secret dibaca; tidak ada DB/chain/browser disentuh
  (indeks `rg` + parser statis saja).
