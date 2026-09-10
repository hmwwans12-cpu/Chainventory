-- ============================================================================
-- Chainventory — seed.sql (CF-18, NCF-13): bootstrap dev/preview minimal
-- ============================================================================
-- CARA PAKAI (runnable di psql MAUPUN Dashboard SQL editor):
--   1. Buat demo auth user dulu (Supabase Dashboard → Authentication →
--      Add user, atau `supabase auth`), salin UUID-nya.
--   2. Ganti DEMO_USER_ID di bawah (sebuah UUID literal — bukan psql
--      variable, agar jalan di semua klien) dengan UUID tersebut.
--      public.users.id FK ke auth.users(id); tanpa baris auth yang cocok
--      file ini gagal FK violation (disengaja, anti profil yatim).
--
-- Idempoten + transaksional: aman dijalankan ulang; gagal di tengah =
-- rollback total (tidak ada state parsial). HANYA untuk dev/preview
-- lokal — JANGAN jalankan di production. E2E memakai cleanup sendiri
-- (e2e/support/cleanup.ts), bukan file ini.
-- ============================================================================

begin;

-- >>> GANTI dengan UUID demo auth user (lihat langkah 1-2 di atas).
-- Contoh: '3fa85f64-5717-4562-b3fc-2c963f66afa6'
insert into public.users (id, email, display_name)
values ('00000000-0000-4000-8000-000000000001', 'demo@chainventory.local', 'Demo Owner')
on conflict (id) do nothing;

insert into public.wallets (user_id, address, wallet_type, is_primary, verification_state, verified_at)
values ('00000000-0000-4000-8000-000000000001', '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef', 'embedded', true, 'verified', now())
on conflict do nothing;

insert into public.warehouses (id, warehouse_code, name, company_name, owner_user_id, on_chain_owner_wallet, status)
values (
  '00000000-0000-4000-8000-000000000101',
  'DEMO01',
  'Demo Warehouse',
  'PT Demo Logistik',
  '00000000-0000-4000-8000-000000000001',
  '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
  'active'
)
on conflict (id) do nothing;

insert into public.memberships (warehouse_id, user_id, role, status, joined_at)
values ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000001', 'OWNER', 'ACTIVE', now())
on conflict (warehouse_id, user_id) do nothing;

insert into public.products (warehouse_id, sku, name, category, unit)
values
  ('00000000-0000-4000-8000-000000000101', 'DEMO-SKU-001', 'Demo Widget', 'General', 'pcs'),
  ('00000000-0000-4000-8000-000000000101', 'DEMO-SKU-002', 'Demo Gizmo', 'General', 'box')
on conflict (warehouse_id, sku) do nothing;

commit;
