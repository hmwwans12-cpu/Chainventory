-- ============================================================================
-- Chainventory — 0011: Create Warehouse flow fixes (ditemukan smoke test E2E live)
-- ============================================================================
-- Smoke test E2E via route `/api/warehouses/create` menemukan:
--
--   1. `create_warehouse_and_deployment` (0010) gagal dengan
--      "column reference warehouse_id is ambiguous" — kolom OUT `returns table`
--      bernama sama dengan kolom tabel target INSERT. Diperbaiki di 0010
--      (kolom output di-prefix `created_*`) dan sudah re-apply.
--
--   2. Update `contract_address` warehouses dari route (sesi authenticated)
--      diblokir trigger `enforce_warehouse_identity_immutable` (0007):
--      "warehouse identity columns are immutable via Data API". Identitas
--      memang IMMUTABLE via Data API, TAPI intent 0007 adalah "identity hanya
--      lewat fungsi security definer (server flow / processor)". Tambahkan
--      GUC opt-in `app.allow_identity_write` (transaction-local) yang HANYA
--      di-set oleh fungsi security definer milik server flow; trigger tetap
--      memblokir SEMUA tulis lain dari role authenticated.
--
-- Aliran: ADDITIVE + koreksi guard existing (expand–migrate–contract). Semua
-- `create or replace` / `drop trigger if exists` → idempotent untuk re-apply.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Koreksi guard identitas: izinkan tulis identitas HANYA saat fungsi
--    security definer server flow set `app.allow_identity_write = true`.
-- ----------------------------------------------------------------------------
create or replace function public.enforce_warehouse_identity_immutable()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.role() = 'authenticated'
     and coalesce(current_setting('app.allow_identity_write', true), '') <> 'true'
     and (
       NEW.warehouse_code is distinct from OLD.warehouse_code
       or NEW.owner_user_id is distinct from OLD.owner_user_id
       or NEW.on_chain_owner_wallet is distinct from OLD.on_chain_owner_wallet
       or NEW.contract_address is distinct from OLD.contract_address
     ) then
    raise exception 'warehouse identity columns are immutable via Data API';
  end if;
  return NEW;
end;
$$;

drop trigger if exists warehouses_identity_immutable on public.warehouses;
create trigger warehouses_identity_immutable
  before update on public.warehouses
  for each row execute function public.enforce_warehouse_identity_immutable();

-- ----------------------------------------------------------------------------
-- 2. set_warehouse_contract_address — catat alamat kontrak pasca-deploy
--    (PRD §6.4 "Contract address recorded"). SECURITY DEFINER + owner-check;
--    menandai GUC agar guard identitas 0011 membuka akses HANYA di sini.
-- ----------------------------------------------------------------------------
create or replace function public.set_warehouse_contract_address(
  p_warehouse_id uuid,
  p_contract_address text
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  if btrim(p_contract_address) = '' then
    raise exception 'contract address required';
  end if;

  if not exists (
    select 1 from public.warehouses
    where id = p_warehouse_id and owner_user_id = v_user_id
  ) then
    raise exception 'not owner of warehouse';
  end if;

  perform set_config('app.allow_identity_write', 'true', true);

  update public.warehouses
    set contract_address = lower(p_contract_address), updated_at = now()
  where id = p_warehouse_id;
end;
$$;

grant execute on function public.set_warehouse_contract_address(uuid, text) to authenticated;