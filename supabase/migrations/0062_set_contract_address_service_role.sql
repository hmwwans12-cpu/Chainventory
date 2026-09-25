-- ============================================================================
-- Chainventory — 0062: set_warehouse_contract_address BFF-only (tutup front-run)
-- ============================================================================
-- Masalah (sisa audit v0.5.5 §4 + ARSITEKTUR §12.3 "Known boundary"): 0061
-- menambahkan validasi format 0x + one-way latch, tetapi fungsi masih
-- `GRANT EXECUTE ... TO authenticated`. Akibatnya owner bisa memanggil RPC
-- langsung via PostgREST dengan address valid-format sembarang SEBELUM
-- `finalizeIfMined` sah berjalan — first-write-wins mengunci address palsu
-- dan memblokir finalisasi asli (latch menolak overwrite).
--
-- Fix (pola sama seperti verify_wallet / proof_retry /
-- confirm_ownership_transfer di 0061):
--   1. DROP signature lama (uuid, text) agar tidak tetap callable.
--   2. Buat ulang (uuid, text, uuid) dengan `p_actor_user_id` eksplisit
--      untuk owner-check (tidak lagi mengandalkan auth.uid() dari JWT
--      pemanggil langsung).
--   3. EXECUTE hanya `service_role`; route `finalizeIfMined` (yang sudah
--      memverifikasi receipt on-chain via waitForWarehouseDeployment)
--      adalah satu-satunya pemanggil, lewat service client + rate-limit
--      + owner-check di route. Guard format + one-way latch 0061
--      dipertahankan penuh di dalam RPC.
--
-- Aliran: ADDITIVE + DROP signature lama (expand–migrate–contract, WORKFLOW
-- §4). Idempotent untuk re-apply (`drop ... if exists` / `create or replace`
-- / revoke-then-grant).
-- ============================================================================

-- Signature lama yang longgar harus hilang (jangan tetap callable).
drop function if exists public.set_warehouse_contract_address(uuid, text);

create or replace function public.set_warehouse_contract_address(
  p_warehouse_id uuid,
  p_contract_address text,
  p_actor_user_id uuid
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_actor_id uuid := p_actor_user_id;
begin
  -- Hanya service_role yang boleh EXECUTE (lihat GRANT di bawah).
  -- Verifikasi on-chain (receipt confirmed + warehouseAddress dari event)
  -- dilakukan route finalizeIfMined SEBELUM memanggil; RPC mempertahankan
  -- semua guard DB 0061 (format + owner + latch). Sebelum 0062, owner bisa
  -- memanggil langsung dengan address valid-format sembarang (front-run).
  if v_actor_id is null then
    raise exception 'actor required';
  end if;

  if p_contract_address !~* '^0x[0-9a-f]{40}$' then
    raise exception 'invalid contract address';
  end if;

  if not exists (
    select 1 from public.warehouses
    where id = p_warehouse_id and owner_user_id = v_actor_id
  ) then
    raise exception 'not owner of warehouse';
  end if;

  perform set_config('app.allow_identity_write', 'true', true);

  -- One-way latch — address tercatat sekali, tidak bisa di-overwrite
  -- ke kontrak lain. Alur sah (finalizeIfMined) hanya memanggil saat
  -- kolom masih kosong.
  update public.warehouses
    set contract_address = lower(p_contract_address), updated_at = now()
  where id = p_warehouse_id and contract_address is null;

  if not found then
    raise exception 'contract address already recorded';
  end if;
end;
$$;

comment on function public.set_warehouse_contract_address(uuid, text, uuid) is
  'Catat alamat kontrak pasca-deploy: EXECUTE hanya service_role; route finalizeIfMined sudah verifikasi receipt. Format 0x+40hex, owner-only (actor eksplisit), one-way latch.';

revoke all on function public.set_warehouse_contract_address(uuid, text, uuid) from public;
revoke all on function public.set_warehouse_contract_address(uuid, text, uuid) from anon;
revoke all on function public.set_warehouse_contract_address(uuid, text, uuid) from authenticated;
grant execute on function public.set_warehouse_contract_address(uuid, text, uuid) to service_role;
