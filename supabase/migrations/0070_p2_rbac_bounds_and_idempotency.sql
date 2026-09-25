create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  insert into public.users (id, email, display_name)
  values (
    new.id,
    lower(coalesce(new.email, '')),
    new.raw_user_meta_data ->> 'name'
  )
  on conflict (id) do update set
    email = excluded.email,
    display_name = coalesce(excluded.display_name, public.users.display_name),
    updated_at = now();
  return new;
end;
$function$;

update public.users
set email = lower(email)
where email is distinct from lower(email);

alter table public.users
  drop constraint if exists users_email_lowercase_check;
alter table public.users
  add constraint users_email_lowercase_check check (email = lower(email));

create or replace function public.archive_product(
  p_warehouse_id uuid,
  p_product_id uuid,
  p_actor_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_balance_qty numeric;
  v_role text;
  v_product_id uuid;
begin
  if p_actor_user_id is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;

  perform private.ensure_warehouse_active(p_warehouse_id);

  v_role := private.member_role(p_warehouse_id, p_actor_user_id);
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
    raise exception 'product not found' using errcode = 'no_data_found';
  end if;

  select quantity into v_balance_qty
  from public.inventory_balances
  where warehouse_id = p_warehouse_id
    and product_id = p_product_id
  for update;

  if coalesce(v_balance_qty, 0) > 0 then
    raise exception 'cannot archive product with remaining stock'
      using errcode = 'check_violation';
  end if;

  update public.products
  set status = 'archived', updated_at = now()
  where id = p_product_id
    and warehouse_id = p_warehouse_id;

  perform private.write_audit(
    p_warehouse_id,
    p_actor_user_id,
    'product_archived',
    'products',
    p_product_id::text,
    null,
    null,
    null,
    'archived'
  );
end;
$function$;

revoke execute on function public.archive_product(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.archive_product(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.archive_product(uuid, uuid, uuid) to service_role;

create or replace function public.update_product_rpc(
  p_product_id uuid,
  p_warehouse_id uuid,
  p_sku text,
  p_name text,
  p_category text,
  p_unit text,
  p_description text,
  p_low_stock_threshold numeric,
  p_actor_user_id uuid
)
returns public.products
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_role text;
  v_product public.products;
begin
  if p_actor_user_id is null then
    raise exception 'UNAUTHENTICATED' using errcode = '28000';
  end if;

  perform private.ensure_warehouse_active(p_warehouse_id);

  select * into v_product
  from public.products
  where id = p_product_id
    and warehouse_id = p_warehouse_id
  for update;

  if v_product.id is null then
    raise exception 'NOT_FOUND' using errcode = 'no_data_found';
  end if;
  if v_product.status <> 'active' then
    raise exception 'Archived products cannot be edited.'
      using errcode = 'check_violation';
  end if;

  v_role := private.member_role(p_warehouse_id, p_actor_user_id);
  if v_role is null or v_role not in ('STAFF', 'MANAGER', 'OWNER') then
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
    p_warehouse_id,
    p_actor_user_id,
    'product_updated',
    'products',
    v_product.id::text,
    null,
    jsonb_build_object('sku', p_sku, 'name', p_name),
    null,
    'active'
  );
  return v_product;
end;
$function$;

revoke execute on function public.update_product_rpc(uuid, uuid, text, text, text, text, text, numeric) from public, anon, authenticated;
revoke execute on function public.update_product_rpc(uuid, uuid, text, text, text, text, text, numeric, uuid) from public, anon, authenticated;
grant execute on function public.update_product_rpc(uuid, uuid, text, text, text, text, text, numeric, uuid) to service_role;

revoke execute on function public.create_product_rpc(uuid, text, text, text, text, text, numeric) from public, anon, authenticated;

create or replace function public.create_invitation(
  p_warehouse_id uuid,
  p_email text,
  p_role text
)
returns public.invitations
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := auth.uid();
  v_actor_role text;
  v_email text;
  v_inv public.invitations;
begin
  if v_actor is null then
    raise exception 'not authenticated';
  end if;

  perform private.ensure_warehouse_active(p_warehouse_id);

  v_actor_role := private.member_role(p_warehouse_id, v_actor);
  if v_actor_role is null then
    raise exception 'not a member';
  end if;
  if not private.can_assign_role(v_actor_role, p_role) then
    raise exception 'insufficient permission to invite as %', p_role;
  end if;

  v_email := lower(btrim(p_email));
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid email';
  end if;

  if exists (
    select 1
    from public.memberships m
    where m.warehouse_id = p_warehouse_id
      and exists (
        select 1
        from public.users u
        where u.id = m.user_id
          and lower(u.email) = v_email
      )
  ) then
    raise exception 'already a member';
  end if;

  update public.invitations
  set status = 'revoked'
  where warehouse_id = p_warehouse_id
    and lower(email) = v_email
    and status = 'pending';

  insert into public.invitations (warehouse_id, email, role, invited_by)
  values (p_warehouse_id, v_email, p_role, v_actor)
  returning * into v_inv;

  return v_inv;
end;
$function$;

revoke execute on function public.create_invitation(uuid, text, text) from public, anon;
grant execute on function public.create_invitation(uuid, text, text) to authenticated;

with ranked as (
  select id,
    row_number() over (
      partition by warehouse_id, lower(email)
      order by created_at desc, id desc
    ) as position
  from public.invitations
  where status = 'pending'
)
update public.invitations i
set status = 'revoked'
from ranked r
where i.id = r.id
  and r.position > 1;

create unique index if not exists invitations_pending_warehouse_email_idx
  on public.invitations (warehouse_id, lower(email))
  where status = 'pending';

create or replace function public.accept_invitation(p_token text)
returns public.memberships
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_inv public.invitations;
  v_warehouse public.warehouses;
  v_membership public.memberships;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;
  if p_token is null or btrim(p_token) = '' then
    raise exception 'invitation not found';
  end if;

  select lower(btrim(email)) into v_email
  from auth.users
  where id = v_user;
  if v_email is null or v_email = '' then
    raise exception 'authenticated identity email required';
  end if;

  select * into v_inv
  from public.invitations
  where token = p_token
  for update;
  if v_inv.id is null then
    raise exception 'invitation not found';
  end if;
  if lower(btrim(v_inv.email)) <> v_email then
    raise exception 'invitation is for another email';
  end if;

  if v_inv.status = 'accepted' then
    select * into v_membership
    from public.memberships
    where warehouse_id = v_inv.warehouse_id
      and user_id = v_user
      and status = 'ACTIVE'
    for update;
    if v_membership.id is not null then
      return v_membership;
    end if;
    raise exception 'invitation already used';
  end if;

  if v_inv.status <> 'pending' or v_inv.expires_at <= now() then
    raise exception 'invitation invalid or expired';
  end if;

  select * into v_warehouse
  from public.warehouses
  where id = v_inv.warehouse_id
  for update;
  if v_warehouse.id is null then
    raise exception 'warehouse not found';
  end if;
  if v_warehouse.status is distinct from 'active' then
    raise exception 'warehouse is not active';
  end if;

  select * into v_membership
  from public.memberships
  where warehouse_id = v_inv.warehouse_id
    and user_id = v_user
  for update;

  if v_membership.id is null then
    insert into public.memberships (
      warehouse_id, user_id, role, status, joined_at
    ) values (
      v_inv.warehouse_id, v_user, v_inv.role, 'ACTIVE', now()
    )
    on conflict (warehouse_id, user_id) do nothing;

    select * into v_membership
    from public.memberships
    where warehouse_id = v_inv.warehouse_id
      and user_id = v_user
    for update;
  end if;

  update public.invitations
  set status = 'accepted',
      accepted_at = coalesce(accepted_at, now())
  where id = v_inv.id
    and status = 'pending';
  if not found then
    raise exception 'invitation already processed';
  end if;

  return v_membership;
end;
$function$;

revoke execute on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated;

create or replace function private.revoke_invites_for_membership_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_warehouse_id uuid;
  v_user_id uuid;
  v_role text;
  v_status text;
begin
  if tg_op = 'DELETE' then
    v_warehouse_id := old.warehouse_id;
    v_user_id := old.user_id;
    v_role := old.role;
    v_status := old.status;
  else
    v_warehouse_id := new.warehouse_id;
    v_user_id := new.user_id;
    v_role := new.role;
    v_status := new.status;
  end if;

  if v_status is distinct from 'ACTIVE'
     or v_role not in ('OWNER', 'MANAGER') then
    update public.invitations
    set status = 'revoked'
    where warehouse_id = v_warehouse_id
      and invited_by = v_user_id
      and status = 'pending';
  end if;

  return null;
end;
$function$;

drop trigger if exists memberships_revoke_invites on public.memberships;
create trigger memberships_revoke_invites
after update of role, status or delete on public.memberships
for each row execute function private.revoke_invites_for_membership_change();

revoke all on function private.revoke_invites_for_membership_change() from public, anon, authenticated, service_role;

create or replace function public.list_transactions(
  p_warehouse_id uuid,
  p_movement_type text default null,
  p_proof_bucket text default null,
  p_page integer default 1,
  p_per_page integer default 20,
  p_search text default null
)
returns json
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_uid uuid := auth.uid();
  v_total bigint;
  v_rows jsonb;
  v_search text;
  v_page integer := least(greatest(coalesce(p_page, 1), 1), 100000);
  v_per_page integer := least(greatest(coalesce(p_per_page, 20), 1), 100);
begin
  if v_uid is null then
    raise exception 'not authenticated';
  end if;
  if private.member_role(p_warehouse_id, v_uid) is null then
    raise exception 'not a member';
  end if;
  if p_proof_bucket is not null
     and p_proof_bucket not in ('confirmed', 'pending', 'failed') then
    raise exception 'invalid proof bucket: %', p_proof_bucket;
  end if;

  if p_search is not null and btrim(p_search) <> '' then
    v_search := '%' || left(
      regexp_replace(btrim(p_search), '[%_\\]', '', 'g'),
      100
    ) || '%';
  end if;

  select count(*) into v_total
  from public.stock_movements sm
  join public.products pr on pr.id = sm.product_id
  where sm.warehouse_id = p_warehouse_id
    and (p_movement_type is null or sm.movement_type = p_movement_type)
    and (
      v_search is null
      or sm.reference ilike v_search
      or sm.reason ilike v_search
      or sm.actor_wallet ilike v_search
      or pr.name ilike v_search
      or pr.sku ilike v_search
    )
    and (
      p_proof_bucket is null
      or (p_proof_bucket = 'confirmed' and exists (
        select 1 from public.proofs p
        where p.movement_id = sm.id and p.status = 'confirmed'
      ))
      or (p_proof_bucket = 'pending'
        and not exists (
          select 1 from public.proofs p
          where p.movement_id = sm.id and p.status = 'confirmed'
        )
        and not exists (
          select 1 from public.proofs p
          where p.movement_id = sm.id and p.status in ('failed', 'manual_review')
        ))
      or (p_proof_bucket = 'failed' and exists (
        select 1 from public.proofs p
        where p.movement_id = sm.id and p.status in ('failed', 'manual_review')
      ))
    );

  select coalesce(
    jsonb_agg(t order by t.created_at desc, t.id desc),
    '[]'::jsonb
  ) into v_rows
  from (
    select
      sm.id,
      sm.movement_type,
      trim_scale(sm.quantity)::text as quantity,
      sm.status,
      sm.reason,
      sm.reference,
      sm.actor_wallet,
      sm.expected_balance_version,
      sm.created_at,
      jsonb_build_object(
        'id', pr.id,
        'name', pr.name,
        'sku', pr.sku,
        'unit', pr.unit
      ) as product,
      case
        when pp.id is null then null
        else jsonb_build_object(
          'id', pp.id,
          'status', pp.status,
          'tx_hash', pp.tx_hash,
          'error', pp.error
        )
      end as proof
    from public.stock_movements sm
    join public.products pr on pr.id = sm.product_id
    left join lateral (
      select p.*
      from public.proofs p
      where p.movement_id = sm.id
      order by p.created_at desc, p.id desc
      limit 1
    ) pp on true
    where sm.warehouse_id = p_warehouse_id
      and (p_movement_type is null or sm.movement_type = p_movement_type)
      and (
        v_search is null
        or sm.reference ilike v_search
        or sm.reason ilike v_search
        or sm.actor_wallet ilike v_search
        or pr.name ilike v_search
        or pr.sku ilike v_search
      )
      and (
        p_proof_bucket is null
        or (p_proof_bucket = 'confirmed' and exists (
          select 1 from public.proofs p2
          where p2.movement_id = sm.id and p2.status = 'confirmed'
        ))
        or (p_proof_bucket = 'pending'
          and not exists (
            select 1 from public.proofs p2
            where p2.movement_id = sm.id and p2.status = 'confirmed'
          )
          and not exists (
            select 1 from public.proofs p2
            where p2.movement_id = sm.id
              and p2.status in ('failed', 'manual_review')
          ))
        or (p_proof_bucket = 'failed' and exists (
          select 1 from public.proofs p2
          where p2.movement_id = sm.id
            and p2.status in ('failed', 'manual_review')
        ))
      )
    order by sm.created_at desc, sm.id desc
    limit v_per_page offset (v_page - 1) * v_per_page
  ) t;

  return json_build_object('total', v_total, 'rows', v_rows);
end;
$function$;

revoke all on function public.list_transactions(uuid, text, text, integer, integer, text) from public;
grant execute on function public.list_transactions(uuid, text, text, integer, integer, text) to authenticated;

create index if not exists stock_movements_warehouse_created_id_idx
  on public.stock_movements (warehouse_id, created_at desc, id desc);

create or replace function public.create_invitation_for_user(
  p_warehouse_id uuid,
  p_email text,
  p_role text,
  p_actor_user_id uuid
)
returns public.invitations
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_role text;
  v_email text;
  v_inv public.invitations;
begin
  if p_actor_user_id is null or not exists (
    select 1 from public.users where id = p_actor_user_id
  ) then
    raise exception 'actor required';
  end if;

  perform private.ensure_warehouse_active(p_warehouse_id);

  v_actor_role := private.member_role(p_warehouse_id, p_actor_user_id);
  if v_actor_role is null then
    raise exception 'not a member';
  end if;
  if not private.can_assign_role(v_actor_role, p_role) then
    raise exception 'insufficient permission to invite as %', p_role;
  end if;

  v_email := lower(btrim(p_email));
  if v_email is null or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid email';
  end if;

  if exists (
    select 1
    from public.memberships m
    where m.warehouse_id = p_warehouse_id
      and exists (
        select 1
        from public.users u
        where u.id = m.user_id
          and lower(u.email) = v_email
      )
  ) then
    raise exception 'already a member';
  end if;

  update public.invitations
  set status = 'revoked'
  where warehouse_id = p_warehouse_id
    and lower(email) = v_email
    and status = 'pending';

  insert into public.invitations (warehouse_id, email, role, invited_by)
  values (p_warehouse_id, v_email, p_role, p_actor_user_id)
  returning * into v_inv;
  return v_inv;
end;
$function$;

revoke execute on function public.create_invitation_for_user(uuid, text, text, uuid) from public, anon, authenticated;
grant execute on function public.create_invitation_for_user(uuid, text, text, uuid) to service_role;
revoke execute on function public.create_invitation(uuid, text, text) from public, anon, authenticated;

create or replace function public.register_wallet_for_user(
  p_user_id uuid,
  p_address text,
  p_wallet_type text
)
returns public.wallets
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_wallet public.wallets;
  v_has_primary boolean;
begin
  if p_user_id is null or not exists (
    select 1 from public.users where id = p_user_id
  ) then
    raise exception 'user not found';
  end if;
  if p_wallet_type not in ('embedded', 'external') then
    raise exception 'invalid wallet type';
  end if;
  if p_address is null
     or lower(btrim(p_address)) !~ '^0x[0-9a-f]{40}$' then
    raise exception 'invalid wallet address';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text, 0));

  select exists (
    select 1
    from public.wallets
    where user_id = p_user_id
      and is_primary
  ) into v_has_primary;

  insert into public.wallets (user_id, address, wallet_type, is_primary)
  values (
    p_user_id,
    lower(btrim(p_address)),
    p_wallet_type,
    not coalesce(v_has_primary, false)
  )
  on conflict (user_id, lower(address)) do update set
    wallet_type = excluded.wallet_type,
    updated_at = now()
  returning * into v_wallet;

  return v_wallet;
end;
$function$;

revoke execute on function public.register_wallet_for_user(uuid, text, text) from public, anon, authenticated;
grant execute on function public.register_wallet_for_user(uuid, text, text) to service_role;
revoke execute on function public.register_wallet(text, text) from public, anon, authenticated;

create or replace function private.guard_warehouse_delete_dependencies()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if exists (
    select 1
    from public.memberships
    where warehouse_id = old.id
      and (
        user_id is distinct from old.owner_user_id
        or role is distinct from 'OWNER'
        or status is distinct from 'ACTIVE'
      )
  ) or exists (
    select 1 from public.products where warehouse_id = old.id
  ) or exists (
    select 1 from public.stock_movements where warehouse_id = old.id
  ) or exists (
    select 1 from public.inventory_balances where warehouse_id = old.id
  ) then
    raise exception 'warehouse has dependent data; manual recovery required';
  end if;
  return old;
end;
$function$;

drop trigger if exists warehouses_guard_delete_dependencies on public.warehouses;
create trigger warehouses_guard_delete_dependencies
before delete on public.warehouses
for each row execute function private.guard_warehouse_delete_dependencies();

revoke all on function private.guard_warehouse_delete_dependencies() from public, anon, authenticated, service_role;
