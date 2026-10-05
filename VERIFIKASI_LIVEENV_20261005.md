# Live-env Contract Tests — Perbaikan + Hijau (2026-10-05)

Workflow `live-env-tests` (jadwal harian) merah 6 run beruntun sejak
2026-09-30 — BUKAN regresi Batch A–E/apply staging (apply 04 Okt malam;
CI `quality`/`e2e` tetap hijau; E2E lokal 19/19 pasca-apply).

## Akar (terbukti, bukan dugaan)

Migrasi 0071 menambah constraint trigger deferred
(`memberships_owner_consistency`, `warehouses_owner_consistency`):
warehouse dengan `owner_user_id` wajib punya membership OWNER/ACTIVE saat
COMMIT. Semua 17 test gagal di langkah setup yang sama — insert warehouse
langsung via PostgREST (satu transaksi per request) commit sendirian
SEBELUM membership dibuat → `42501 warehouse owner must have an active
OWNER membership`. Direproduksi lokal persis sebelum diperbaiki.

## Perbaikan (14 file, commit 340f2a1)

Pola seragam: provisioning warehouse + OWNER membership secara atomik via
RPC `create_warehouse_and_deployment` (perlu primary wallet terverifikasi

- param deployment dummy format-valid; signature hanya dicek format).
  Deployment bawaan RPC langsung dihapus agar assertions tetap tepat;
  PATCH `contract_address`/`status` bila fixture membutuhkannya; cleanup
  +hapus deployments (SET NULL, bukan cascade).

Temuan lapisan kedua saat verifikasi:

- `apply-stock-movement` contract memakai shape 12-param pra-0065 →
  PGRST202 404 (hanya overload 15-arg yang live). Helper dilengkapi
  `p_movement_id/proof_payload/proof_hash = null` (warehouse test tanpa
  kontrak tak wajib proof).
- `rls-bypass` attacker ≠ owner di bawah 0071 (owner tanpa membership
  OWNER kini state mustahil) → user owner terpisah.
- `read-scope`/`blockchain`/`rpc-hardening`/`lifecycle`:
  OWNER dobel di-skip, deployment RPC dihapus, PATCH atribut.

Tidak ada assertion yang dilemahkan; tidak ada invariant produk diubah.

## Bukti hijau

- 14/14 file hijau individual live lawan staging (termasuk pipeline
  proof on-chain penuh 2x: `0x07aa…`, `0xb358…`, `0x3ece…`).
- Dispatch manual workflow pasca-push: run 37313038028
  `gate success / contract-tests success`.
- Unit suite 628 passed, `format:check`/lint/typecheck hijau.

## Catatan operasional

- Rate-limit auth Supabase (429) saat 14 run lokal beruntun dari 1 IP —
  artefak hammering saya, bukan produk. Tiap file hijau individual;
  run CI (IP runner segar) hijau penuh. Pelajaran: jangan verifikasi
  live berulang cepat.
- 2 tx proof on-chain dari treasury testnet tercatat di atas (BaseScan).
- Jadwal harian berikutnya akan hijau sendiri; tidak perlu dispatch lagi.
