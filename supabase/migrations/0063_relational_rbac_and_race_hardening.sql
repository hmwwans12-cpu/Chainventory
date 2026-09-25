create or replace function public.update_member_role(
  p_warehouse_id uuid,
  p_user_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_target public.memberships;
  v_actor_name text;
  v_wh_name text;
begin
  if v_actor_id is null then
    raise exception 'not authenticated';
  end if;

  if p_user_id = v_actor_id then
    raise exception 'cannot change own role';
  end if;

  perform private.ensure_warehouse_active(p_warehouse_id);

  perform 1
  from public.warehouses
  where id = p_warehouse_id
  for update;
  if not found then
    raise exception 'warehouse not found';
  end if;

  select * into v_target
  from public.memberships
  where warehouse_id = p_warehouse_id
    and user_id = p_user_id
  for update;

  if v_target is null then
    raise exception 'member not found';
  end if;

  if v_target.role = 'OWNER' then
    raise exception 'cannot change owner role';
  end if;

  v_actor_role := private.member_role(p_warehouse_id, v_actor_id);
  if v_actor_role is null then
    raise exception 'not a member';
  end if;

  if not private.can_assign_role(v_actor_role, v_target.role) then
    raise exception 'insufficient permission to manage %', v_target.role;
  end if;

  if not private.can_assign_role(v_actor_role, p_role) then
    raise exception 'insufficient permission to assign %', p_role;
  end if;

  update public.memberships
    set role = p_role, updated_at = now()
  where id = v_target.id;

  select coalesce(display_name, split_part(email, '@', 1), 'Pengguna') into v_actor_name
  from public.users where id = v_actor_id;
  select name into v_wh_name from public.warehouses where id = p_warehouse_id;
  perform private.write_notification(
    p_user_id, p_warehouse_id, 'membership_role_changed',
    'Peran berubah',
    format('Peranmu di %s diubah menjadi %s oleh %s', v_wh_name, p_role, v_actor_name),
    jsonb_build_object('warehouse_id', p_warehouse_id, 'role', p_role),
    'role_change:' || p_warehouse_id::text || ':' || p_user_id::text
  );
end;
$function$;

create or replace function public.archive_product(
  p_warehouse_id uuid,
  p_product_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_balance_qty numeric;
  v_role text;
  v_product_id uuid;
begin
  if v_user_id is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;

  if not exists (
    select 1
    from public.warehouses
    where id = p_warehouse_id
      and status = 'active'
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  v_role := private.member_role(p_warehouse_id, v_user_id);
  if v_role is null or v_role not in ('MANAGER', 'OWNER') then
    raise exception 'FORBIDDEN: only MANAGER or OWNER can archive products'
      using errcode = 'insufficient_privilege';
  end if;

  select id into v_product_id
  from public.products
  where id = p_product_id
    and warehouse_id = p_warehouse_id
  for update;

  if v_product_id is null then
    raise exception 'product not found'
      using errcode = 'no_data_found';
  end if;

  select coalesce(quantity, 0) into v_balance_qty
  from public.inventory_balances
  where warehouse_id = p_warehouse_id
    and product_id = p_product_id
  for update;

  v_balance_qty := coalesce(v_balance_qty, 0);

  if v_balance_qty > 0 then
    raise exception 'cannot archive product with remaining stock'
      using errcode = 'check_violation';
  end if;

  update public.products
    set status = 'archived', updated_at = now()
  where id = p_product_id
    and warehouse_id = p_warehouse_id;

  perform private.write_audit(
    p_warehouse_id, v_user_id,
    'product_archived', 'products', p_product_id::text,
    null, null, null, 'archived'
  );
end;
$function$;

create or replace function public.enforce_product_status_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
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

  if v_jwt_role = 'authenticated' or v_is_anonymous then
    if new.status is distinct from old.status then
      if v_is_anonymous then
        raise exception 'anonymous sessions cannot change product status';
      end if;
      v_role := private.member_role(new.warehouse_id, auth.uid());
      if v_role is null or v_role not in ('MANAGER', 'OWNER') then
        raise exception 'only MANAGER or OWNER can archive/reactivate products';
      end if;
    end if;
  end if;

  return new;
end;
$function$;

create or replace function public.update_product_rpc(
  p_product_id uuid,
  p_warehouse_id uuid,
  p_sku text,
  p_name text,
  p_category text default null,
  p_unit text default null,
  p_description text default null,
  p_low_stock_threshold numeric default null
)
returns public.products
language plpgsql
security definer
set search_path = public
as $function$
declare
  v_user_id uuid := auth.uid();
  v_role text;
  v_product public.products;
begin
  if v_user_id is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;

  if not exists (
    select 1
    from public.warehouses
    where id = p_warehouse_id
      and status = 'active'
  ) then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  select * into v_product
  from public.products
  where id = p_product_id
    and warehouse_id = p_warehouse_id
  for update;

  if v_product is null then
    raise exception 'NOT_FOUND' using errcode = 'no_data_found';
  end if;

  if v_product.status <> 'active' then
    raise exception 'Archived products cannot be edited.'
      using errcode = 'check_violation';
  end if;

  v_role := private.member_role(p_warehouse_id, v_user_id);
  if v_role is null then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  if v_role not in ('STAFF', 'MANAGER', 'OWNER') then
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  update public.products
    set sku = p_sku,
        name = p_name,
        category = p_category,
        unit = coalesce(p_unit, unit),
        description = p_description,
        low_stock_threshold = p_low_stock_threshold,
        updated_at = now()
  where id = p_product_id
    and warehouse_id = p_warehouse_id
    and status = 'active'
  returning * into v_product;

  perform private.write_audit(
    p_warehouse_id, v_user_id,
    'product_updated', 'products', v_product.id::text,
    null, jsonb_build_object('sku', p_sku, 'name', p_name),
    null, 'active'
  );

  return v_product;
end;
$function$;

revoke execute on function public.archive_product(uuid, uuid, uuid)
from public, anon, authenticated;
