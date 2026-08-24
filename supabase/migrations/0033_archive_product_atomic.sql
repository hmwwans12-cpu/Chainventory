-- ============================================================================
-- Chainventory — 0033: archive_product atomic RPC (audit P1-03)
-- ============================================================================
-- Archive harus atomic terhadap movement: lock product + balance row
-- dalam satu transaction, cek quantity = 0, baru set status archived.
-- Mencegah race: archive + concurrent stock_in = archived + positive stock.
-- ============================================================================

create or replace function public.archive_product(
  p_warehouse_id uuid,
  p_product_id uuid,
  p_actor_user_id uuid
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_balance_qty numeric;
  v_role text;
  v_product_id uuid;
begin
  -- Role check: MANAGER/OWNER saja (konsisten dengan enforce_product_status_role).
  v_role := private.member_role(p_warehouse_id, p_actor_user_id);
  if v_role not in ('MANAGER', 'OWNER') then
    raise exception 'FORBIDDEN: only MANAGER or OWNER can archive products'
      using errcode = 'insufficient_privilege';
  end if;

  -- Lock product row.
  select id into v_product_id
  from public.products
  where id = p_product_id and warehouse_id = p_warehouse_id
  for update;

  if v_product_id is null then
    raise exception 'product not found'
      using errcode = 'no_data_found';
  end if;

  -- Lock balance row (mencegah concurrent stock movement).
  select coalesce(sum(quantity), 0) into v_balance_qty
  from public.inventory_balances
  where warehouse_id = p_warehouse_id and product_id = p_product_id
  for update;

  if v_balance_qty > 0 then
    raise exception 'cannot archive product with remaining stock'
      using errcode = 'check_violation';
  end if;

  update public.products
  set status = 'archived', updated_at = now()
  where id = p_product_id and warehouse_id = p_warehouse_id;

  perform private.write_audit(
    p_warehouse_id, p_actor_user_id,
    'product_archived', 'products', p_product_id::text,
    null, null, null, 'archived'
  );
end;
$$;

grant execute on function public.archive_product(uuid, uuid, uuid) to authenticated;
revoke execute on function public.archive_product(uuid, uuid, uuid) from anon, public;
