-- ============================================================================
-- Chainventory - 0029: produk mutation diblokir saat warehouse suspended
-- ============================================================================
-- Audit C-02: RLS policies untuk products hanya cek membership/role,
-- tidak cek warehouse lifecycle status. Trigger ini menutup gap tersebut
-- sebagai defense-in-depth di level database.
--
-- Service_role / definer intern bypass (otorisasi di layer atas).
-- ADDITIVE: trigger saja, tidak mengubah tabel/fungsi existing.
-- ============================================================================

create or replace function public.enforce_warehouse_active_for_products()
returns trigger
language plpgsql
security definer set search_path = public
as $$
declare
  v_jwt_role text;
  v_wh_id uuid;
begin
  v_jwt_role := coalesce(auth.jwt() ->> 'role', '');

  -- Server flow / processor bypass.
  if v_jwt_role = 'service_role' then
    return coalesce(NEW, OLD);
  end if;

  -- Tentukan warehouse_id dari NEW (insert/update) atau OLD (delete).
  v_wh_id := coalesce(NEW.warehouse_id, OLD.warehouse_id);

  if v_wh_id is not null then
    if not exists (
      select 1 from public.warehouses
      where id = v_wh_id and status = 'active'
    ) then
      raise exception 'WAREHOUSE_SUSPENDED: product mutations are blocked while the warehouse is not active'
        using errcode = 'check_violation';
    end if;
  end if;

  return coalesce(NEW, OLD);
end;
$$;

drop trigger if exists products_warehouse_active on public.products;
create trigger products_warehouse_active
  before insert or update or delete on public.products
  for each row execute function public.enforce_warehouse_active_for_products();