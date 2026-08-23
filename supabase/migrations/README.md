# Supabase Migrations — Chainventory

Aturan yang wajib diikuti (WORKFLOW.md §4, AGENT.md):

## Expand–Migrate–Contract

1. **Expand (additive)** — migration hanya menambah struktur/kolom yang
   kompatibel mundur. Boleh dibuat kapan saja dan aman dijalankan ulang.
2. **Migrate / backfill** — isi data lama ke struktur baru dalam migration
   yang sama atau segera setelahnya.
3. **Contract** — hapus struktur lama pada migration TERPISAH, setelah masa
   observasi. JANGAN pernah rename/drop incompatible dalam satu migration
   yang dipakai produksi.

## Konvensi

- Penamaan: `NNNN_singkat_deskripsi.sql` berurutan.
- Semua migration **idempotent-friendly**: gunakan `create table if not exists`,
  `create or replace function`, `drop trigger if exists` sebelum re-create
  bila diperlukan.
- RLS wajib aktif di **semua** tabel aplikasi sejak dibuat.
- GRANT eksplisit: tabel tenant yang boleh diakses Data API diberi
  `grant ... to authenticated` (dan `anon` bila memang publik). Tabel
  ledger/proof/outbox (`stock_movements`, `proofs`, `proof_outbox`) **tidak**
  diberi GRANT ke browser — mutation hanya lewat PostgreSQL RPC/function
  atomik (AGENT.md).
- Jangan pernah menulis nilai secret/key di migration.
- Timestamp pakai `timestamptz` + `default now()`; quantity `NUMERIC(24,3)`.
- FK wajib; unique index sesuai scope warehouse.

## Cara menjalankan

```bash
supabase db reset            # terapkan semua migration ke DB lokal (jika ada)
supabase db push             # terapkan ke project cloud
```

## Daftar migration

| File                            | Isi                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------- |
| `0001_users_and_rls.sql`        | Tabel `users` (1:1 `auth.users`), trigger bootstrap, RLS, GRANT, helper health. |
| `0002_realtime_publication.sql` | Whitelist Realtime (awal: `users`).                                             |

> Migration P1 menambahkan tabel warehouses/memberships/join_requests/products/
> inventory_balances/stock_movements/proofs/proof_outbox/audit_logs/notifications
> beserta RLS + RPC atomik + penambahan publication masing-masing.
