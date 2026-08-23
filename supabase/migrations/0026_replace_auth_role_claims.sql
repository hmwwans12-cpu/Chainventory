-- ============================================================================
-- Chainventory — 0026: ganti `auth.role()` (deprecated) dengan pembacaan
--                      JWT claims eksplisit (audit N-6, 2026-08-23)
-- ============================================================================
-- Latar: checklist keamanan Supabase mendeprakasi `auth.role()`; selain itu
-- `auth.role() = 'authenticated'` lolos juga untuk sesi ANONIM ketika
-- anonymous sign-ins aktif (anon membawa role `authenticated`).
--
-- Perubahan pada dua trigger SECURITY DEFINER:
--   * baca klaim via `auth.jwt()` → `role` + `is_anonymous`;
--   * perlakukan sesi anonim sebagai SESI PENGGUNA Data API (diperiksa/
--     ditolak oleh logika trigger), bukan jalur internal;
--   * service_role / pemanggil definer internal tetap bypass seperti
--     semula (otorisasi di layer atas).
--
-- Sifat: ADDITIVE (`create or replace` + `drop trigger if exists`) —
-- idempotent untuk re-apply, tidak mengubah tabel/policy/grant.
-- Catatan operasional: butuh apply ke database live (lihat TODO.md item 11).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. T3 products — archive/reactivate hanya MANAGER/OWNER (0007).
--    Versi baru: klaim eksplisit + blokir sesi anonim.
-- ----------------------------------------------------------------------------
create or replace function public.enforce_product_status_role()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_role text;
  v_jwt_role text;
  v_is_anonymous boolean;
begin
  v_jwt_role := coalesce(auth.jwt() ->> 'role', '');
  v_is_anonymous := coalesce(
    (nullif(auth.jwt() ->> 'is_anonymous', ''))::boolean,
    false
  );

  -- Server flow / processor (service_role) & definer intern / admin SQL
  -- tanpa konteks JWT: otorisasi sudah dicek di layer pemanggil; trigger
  -- tidak double-block (semantik identik dengan versi auth.role()).
  if v_jwt_role = 'authenticated' or v_is_anonymous then
    -- Sesi pengguna Data API nyata ATAU sesi anonim (diperkuat: anonim
    -- ikut diperiksa dan akan gagal di member_role karena bukan member).
    if NEW.status is distinct from OLD.status then
      if v_is_anonymous then
        raise exception 'anonymous sessions cannot change product status';
      end if;
      v_role := private.member_role(NEW.warehouse_id, auth.uid());
      if v_role not in ('MANAGER', 'OWNER') then
        raise exception 'only MANAGER or OWNER can archive/reactivate products';
      end if;
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists products_status_role on public.products;
create trigger products_status_role
  before update of status on public.products
  for each row execute function public.enforce_product_status_role();

-- ----------------------------------------------------------------------------
-- 2. T5 warehouses — kolom identitas immutable via Data API (0007 + GUC 0011).
--    Versi baru: klaim eksplisit + sesi anonim diperlakukan sebagai user.
-- ----------------------------------------------------------------------------
create or replace function public.enforce_warehouse_identity_immutable()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_jwt_role text;
  v_is_anonymous boolean;
begin
  v_jwt_role := coalesce(auth.jwt() ->> 'role', '');
  v_is_anonymous := coalesce(
    (nullif(auth.jwt() ->> 'is_anonymous', ''))::boolean,
    false
  );

  -- Sama dengan semula: HANYA sesi pengguna Data API yang diblokir, dan
  -- tulis identitas dibuka lewat GUC transaction-local yang diset fungsi
  -- security definer server flow (0011). Anonim diperlakukan sebagai user.
  if (v_jwt_role = 'authenticated' or v_is_anonymous)
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
