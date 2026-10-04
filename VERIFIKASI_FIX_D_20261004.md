# Verifikasi & Fix — Batch D (2026-10-04)

Baseline awal Batch D: HEAD `b0a468c`, `test` 622 passed | 32 skipped.
Hasil akhir: `test` **624 passed | 32 skipped, 126 files, 0 failed** (+2).
Prinsip Batch D dipatuhi: hitung-dulu-jangan-asal-ganti (M-4/M-5),
kontrak tak diubah (M-3), fitur baru tak dibangun (#15), e2e tak dijalankan.
Commit: `60a0577` (M-3 docs), `8208ac2` (#18 test).
`AUDIT_*.md` tetap kotor pra-sesi — tidak disentuh.

## 1. Tabel ringkas

| ID  | Verdict              | Bukti singkat                                                                                                                                                                     | Aksi                                       | File diubah                           | Test baru                             | Gate  |
| --- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | ------------------------------------- | ------------------------------------- | ----- |
| M-4 | KEPUTUSAN-DESAIN     | Pemakaian nyata = `accent-foreground` di atas `bg-accent` (dropdown/select focus, text-sm): dark 4.09:1 < 4.5; light 5.21 lolos. `text-accent/text-secondary` telanjang = 0 pakai | NOL ubah CSS; usulan `#1a5340` (6.22:1)    | —                                     | —                                     | hijau |
| M-5 | KEPUTUSAN-DESAIN     | border/input vs bg/card: 1.20/1.73 (light), 1.94/1.41 (dark) — semua < 3:1                                                                                                        | NOL ubah CSS; usulan `#7d6a5c` / `#5d8a76` | —                                     | —                                     | hijau |
| M-3 | DITUNDA/NEED-RUNTIME | `recordProof`: hanya `actor==msg.sender` + sekali-per-proofId; tanpa allowlist/window/expiry/dedup                                                                                | Docs risiko + opsi v3; NOL ubah kontrak    | `docs/warehouse-proof-replay-risk.md` | —                                     | hijau |
| #15 | MITIGASI-CUKUP       | Cap 100 DI SERVER (route:160, pasca-auth) + fail-cepat client (dialog:186) + maxDuration 60                                                                                       | NOL ubah kode; antrean chunk = FITUR-BARU  | —                                     | —                                     | hijau |
| #18 | VALID-SEBAGIAN       | Negatif ter-cover (7 test); fidelitas raw-body belum → +2 test mock-Receiver (lulus); E2E = NEED-RUNTIME                                                                          | Test raw-body                              | —                                     | `verify-request-raw-body.test.ts` (2) | hijau |

Tidak ada PERUBAHAN PERILAKU di Batch D.

## 2. Detail per temuan

### M-4 — `--accent` dark (KEPUTUSAN-DESAIN, jangan terapkan)

Koreksi metodologi penting: `--accent` tidak pernah dipakai sebagai TEKS
(`rg text-accent[^_-]` = 0; sama untuk `text-secondary[^_-]` = 0 — peringatan
desain final dipatuhi, tidak asal ganti token). Pemakaian nyata
(`dropdown-menu.tsx:94,119,168,209`, `select.tsx:162`):
`focus:bg-accent focus:text-accent-foreground` = TEKS accent-foreground DI
ATAS latar accent. Rasio terhitung (skrip luminansi relatif WCAG):

- dark `#e4d5c7` di atas `#247158` = **4.09:1** < 4.5 (text-sm 14px →
  butuh 4.5; state focus/transient, tapi tetap teks baca) → temuan
  TERKONFIRMASI secara angka.
- light `#186049` di atas `#e4d5c7` = 5.21:1 → lolos.

Usulan (JANGAN terapkan tanpa konfirmasi): `--accent` dark `#247158` →
`#1a5340` = **6.22:1** (klaim audit 6.16:1; selisih pembulatan — angka saya
yang berlaku). Perintah putusan: ganti nilai di `app/globals.css:151`,
jalankan `pnpm check:contrast`, tunjukkan hijau, baru commit.

### M-5 — `--border`/`--input` 3:1 (KEPUTUSAN-DESAIN, jangan terapkan)

Rasio terhitung vs `--background`/`--card` (keduanya dipakai sebagai latar
sebelahan di kartu/input):

- light `#d4c2b2` vs bg `#e4d5c7` = 1.20; vs card `#ffffff` = 1.73.
- dark `#2d5447` vs bg `#0e231b` = 1.94; vs card `#1a3d2f` = 1.41.
- Semua < 3:1 (WCAG 1.4.11) → klaim TERKONFIRMASI.

Usulan minimal-pindah (JANGAN terapkan; menyentuh DESIGN.md):
light `#d4c2b2` → `#7d6a5c` (3.58 vs bg, 5.14 vs card);
dark `#2d5447` → `#5d8a76` (4.21 vs bg, 3.06 vs card — margin tipis di
card, catat). Alternatif estetis: dark `#6ab29b` (= ring; 6.63/4.82) bila
desain mengizinkan unifikasi. Keputusan + token final di tangan owner.

### M-3 — Warehouse.sol tanpa batas submitter/replay (DOKUMENTASI)

Verbatim `contracts/src/Warehouse.sol:40-63`: `recordProof` hanya
`proofId != 0`, `!recorded`, `actor == msg.sender`. Tanpa allowlist,
expiry, nonce, batas timestamp (caller-supplied), dedup payloadHash.
Risiko: spam self-attest (bayar gas sendiri), replay payload lintas
proofId, jendela commit tak terbatas — mitigasi kini off-chain
(intent status/idempotency/lease + verifikasi payloadHash).
`docs/warehouse-proof-replay-risk.md` baru: verifikasi + 3 risiko +
opsi v3 (A EIP-712 nonce/expiry, B allowlist recorder, C jendela waktu,
D dedup agregator tanpa deploy — rekomendasi D kini, A/C saat v3).
NOL perubahan `contracts/src/*.sol` (aturan besi #3).

### #15 — bulk 1000 vs timeout 60 dtk (MITIGASI-CUKUP, FITUR-BARU)

Bukti server (`bulk/route.ts`): `maxDuration = 60` (:53) +
`if (products.length > 100) return invalid("Split imports...")` (:160-165,
SETELAH auth/permission/suspended-guard — tak bisa dilewati client) +
komentar BE-001 (tanpa cap = timeout parsial ambigu). Client
(`bulk-add-dialog.tsx:186`) fail-cepat via toast sebelum upload.
100 baris × ~4-6 roundtrip jauh di bawah 60 dtk → mitigasi cukup.
Antrean chunk + progress = FITUR-BARU (register: jangan kerjakan) →
backlog. NOL perubahan.

### #18 — E2E + signature callback (VALID-SEBAGIAN)

Ada: `verify-request.test.ts` 7 test (cron accept/reject + QStash
missing/malformed/garbage → false). Celah: tak ada yang mengunci
FIDELITAS raw-body (`verify-request.ts:33` `clone().text()` — benar,
tapi tanpa test, refactor ke `json()`+stringify akan lolos test lama dan
menolak signature valid di prod). Test baru
`verify-request-raw-body.test.ts` (mock `Receiver`, tangkap argumen):
byte mentah utuh diteruskan (bukan re-serialisasi) + body tak habis
(handler masih bisa baca). 2 lulus; 7 lama tetap lulus.
E2E tunnel + Upstash nyata = NEED-RUNTIME (aturan besi: `pnpm e2e*`
dilarang di sini). Langkah owner: siapkan secret E2E → `pnpm e2e:verify`
→ `pnpm e2e` di CI (job sudah ada).

## 3. TIDAK-VALID Batch D

Tidak ada (#15 = mitigasi-cukup yang terverifikasi, bukan klaim salah).

## 4. NEED-RUNTIME / keputusan owner

1. M-4: setuju `#1a5340`? (atau nilai lain ≥ 4.5) → saya terapkan + gate.
2. M-5: setuju `#7d6a5c` / `#5d8a76`? (atau arah lain) → idem + DESIGN.md.
3. M-3: opsi v3 (rekomendasi D kini) — keputusan arsitektur.
4. #18: jalankan E2E dengan secret (`pnpm e2e:verify`, `pnpm e2e`).
5. Batch C: apply 0078+0079 di staging (lihat laporan C §4).

## 5. Migrasi baru

Tidak ada (Batch D).

## 6. Gate sebelum vs sesudah

- Sebelum: 622 passed | 32 skipped (125 files).
- Sesudah: `typecheck` ✅ `lint` ✅ `format:check` ✅ `test` **624 passed |
  32 skipped (126 files, 0 failed)** ✅ `i18n:check` ✅ `check:contrast` ✅
  `encoding:check` ✅ (703 files) `deps:audit` ✅ `secret:scan` ✅ `build` ✅
  61/61 `preflight` ✅ 7/7.
- NOL perubahan CSS/kontrak/route; NOL `.env*`/secret dibaca; NOL
  infra nyata (indeks `rg` + komputasi lokal + baca kontrak saja).
