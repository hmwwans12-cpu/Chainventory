-- Chainventory — 0066: identity, RBAC, and wallet boundary hardening.
-- Apply after 0062–0065; existing public RPC signatures remain unchanged.

revoke insert, update, delete on table public.users from anon, authenticated;
revoke update (email, privy_user_id, notification_preferences)
  on table public.users from authenticated;
grant select on table public.users to anon, authenticated;
grant update (display_name, avatar_url)
  on table public.users to authenticated;

drop policy if exists users_update_own on public.users;
create policy users_update_own
  on public.users
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create or replace function public.bind_privy_user(
  p_user_id uuid,
  p_privy_user_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_privy_user_id text;
begin
  if p_user_id is null then
    raise exception 'user required';
  end if;

  v_privy_user_id := pg_catalog.btrim(p_privy_user_id);
  if v_privy_user_id is null
     or v_privy_user_id = ''
     or pg_catalog.length(v_privy_user_id) > 255 then
    raise exception 'invalid privy identity';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(2026, 66066);

  if not exists (
    select 1
    from public.users
    where id = p_user_id
  ) then
    raise exception 'user not found';
  end if;

  if exists (
    select 1
    from public.users
    where id <> p_user_id
      and privy_user_id = v_privy_user_id
  ) then
    raise exception 'privy identity already bound';
  end if;

  update public.users
  set privy_user_id = v_privy_user_id,
      updated_at = pg_catalog.now()
  where id = p_user_id
    and (privy_user_id is null or privy_user_id = v_privy_user_id);

  if not found then
    raise exception 'privy identity already bound';
  end if;
end;
$function$;

comment on function public.bind_privy_user(uuid, text) is
  'Bind a verified Privy identity to an application user; service_role only.';

revoke all on function public.bind_privy_user(uuid, text) from public, anon, authenticated;
grant execute on function public.bind_privy_user(uuid, text) to service_role;

create or replace function public.upsert_notification_preferences(p_prefs jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_prefs jsonb := coalesce(p_prefs, '{}'::jsonb);
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  if pg_catalog.jsonb_typeof(v_prefs) <> 'object' then
    raise exception 'invalid notification preferences';
  end if;

  update public.users
  set notification_preferences = v_prefs,
      updated_at = pg_catalog.now()
  where id = v_user_id;

  if not found then
    raise exception 'user not found';
  end if;
end;
$function$;

revoke all on function public.upsert_notification_preferences(jsonb) from public, anon, authenticated;
grant execute on function public.upsert_notification_preferences(jsonb) to authenticated;

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

  if p_token is null or pg_catalog.btrim(p_token) = '' then
    raise exception 'invitation not found';
  end if;

  select pg_catalog.lower(pg_catalog.btrim(email))
    into v_email
  from auth.users
  where id = v_user;

  if v_email is null or v_email = '' then
    raise exception 'authenticated identity email required';
  end if;

  select *
    into v_inv
  from public.invitations
  where token = p_token
  for update;

  if v_inv.id is null then
    raise exception 'invitation not found';
  end if;

  if pg_catalog.lower(pg_catalog.btrim(v_inv.email)) <> v_email then
    raise exception 'invitation is for another email';
  end if;

  if v_inv.status = 'accepted' then
    select *
      into v_membership
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

  if v_inv.status <> 'pending' or v_inv.expires_at <= pg_catalog.now() then
    raise exception 'invitation invalid or expired';
  end if;

  select *
    into v_warehouse
  from public.warehouses
  where id = v_inv.warehouse_id
  for update;

  if v_warehouse.id is null then
    raise exception 'warehouse not found';
  end if;

  if v_warehouse.status is distinct from 'active' then
    raise exception 'warehouse is not active';
  end if;

  select *
    into v_membership
  from public.memberships
  where warehouse_id = v_inv.warehouse_id
    and user_id = v_user
  for update;

  if v_membership.id is not null then
    update public.memberships
    set role = v_inv.role,
        status = 'ACTIVE',
        joined_at = pg_catalog.now(),
        updated_at = pg_catalog.now()
    where id = v_membership.id
      and warehouse_id = v_inv.warehouse_id
      and user_id = v_user
    returning * into v_membership;

    if not found then
      raise exception 'membership changed';
    end if;
  else
    insert into public.memberships (
      warehouse_id,
      user_id,
      role,
      status,
      joined_at
    ) values (
      v_inv.warehouse_id,
      v_user,
      v_inv.role,
      'ACTIVE',
      pg_catalog.now()
    )
    on conflict (warehouse_id, user_id) do update
    set role = excluded.role,
        status = 'ACTIVE',
        joined_at = excluded.joined_at,
        updated_at = pg_catalog.now()
    returning * into v_membership;
  end if;

  update public.invitations
  set status = 'accepted',
      accepted_at = coalesce(accepted_at, pg_catalog.now())
  where id = v_inv.id
    and status = 'pending';

  if not found then
    raise exception 'invitation already processed';
  end if;

  return v_membership;
end;
$function$;

comment on function public.accept_invitation(text) is
  'Accept an invitation only for the authenticated auth.users email; re-visits are idempotent.';

revoke all on function public.accept_invitation(text) from public, anon, authenticated;
grant execute on function public.accept_invitation(text) to authenticated;

create or replace function public.transfer_ownership(p_warehouse_id uuid, p_new_owner_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_actor_membership public.memberships;
  v_target_membership public.memberships;
  v_warehouse public.warehouses;
  v_actor_name text;
  v_new_owner_name text;
  v_wh_name text;
begin
  if v_actor_id is null then
    raise exception 'not authenticated';
  end if;

  if p_new_owner_id is null then
    raise exception 'new owner required';
  end if;

  if p_new_owner_id = v_actor_id then
    raise exception 'already the owner';
  end if;

  select *
    into v_warehouse
  from public.warehouses
  where id = p_warehouse_id
  for update;

  if v_warehouse.id is null then
    raise exception 'warehouse not found';
  end if;

  if v_warehouse.status is distinct from 'active' then
    raise exception 'warehouse is not active';
  end if;

  if v_warehouse.contract_address is not null then
    raise exception 'warehouse_deployed_use_onchain_transfer';
  end if;

  if exists (
    select 1
    from public.warehouse_deployments
    where warehouse_id = p_warehouse_id
      and status in ('pending', 'submitting', 'submitted')
  ) then
    raise exception 'warehouse_deployment_pending';
  end if;

  if v_warehouse.owner_user_id is distinct from v_actor_id then
    raise exception 'only owner can transfer ownership';
  end if;

  select *
    into v_actor_membership
  from public.memberships
  where warehouse_id = p_warehouse_id
    and user_id = v_actor_id
  for update;

  v_actor_role := private.member_role(p_warehouse_id, v_actor_id);
  if v_actor_membership.id is null
     or v_actor_membership.status is distinct from 'ACTIVE'
     or v_actor_role is null
     or v_actor_role <> 'OWNER' then
    raise exception 'only owner can transfer ownership';
  end if;

  select *
    into v_target_membership
  from public.memberships
  where warehouse_id = p_warehouse_id
    and user_id = p_new_owner_id
  for update;

  if v_target_membership.id is null then
    raise exception 'target is not a member';
  end if;

  if v_target_membership.status is distinct from 'ACTIVE' then
    raise exception 'target membership is not active';
  end if;

  if v_target_membership.role = 'OWNER' then
    raise exception 'target is already owner';
  end if;

  update public.memberships
  set role = 'OWNER',
      updated_at = pg_catalog.now()
  where id = v_target_membership.id
    and warehouse_id = p_warehouse_id
    and user_id = p_new_owner_id
    and status = 'ACTIVE'
    and role is distinct from 'OWNER'
  returning * into v_target_membership;

  if not found then
    raise exception 'target membership changed';
  end if;

  update public.memberships
  set role = 'MANAGER',
      updated_at = pg_catalog.now()
  where id = v_actor_membership.id
    and warehouse_id = p_warehouse_id
    and user_id = v_actor_id
    and status = 'ACTIVE'
    and role = 'OWNER'
  returning * into v_actor_membership;

  if not found then
    raise exception 'owner membership changed';
  end if;

  perform pg_catalog.set_config('app.allow_identity_write', 'true', true);

  update public.warehouses
  set owner_user_id = p_new_owner_id
  where id = p_warehouse_id
    and owner_user_id = v_actor_id
    and status = 'active'
    and contract_address is null
  returning name into v_wh_name;

  if not found then
    raise exception 'warehouse ownership changed';
  end if;

  perform pg_catalog.set_config('app.allow_identity_write', 'false', true);

  select coalesce(display_name, pg_catalog.split_part(email, '@', 1), 'Pengguna')
    into v_actor_name
  from public.users
  where id = v_actor_id;
  select coalesce(display_name, pg_catalog.split_part(email, '@', 1), 'Pengguna')
    into v_new_owner_name
  from public.users
  where id = p_new_owner_id;

  perform private.write_notification(
    p_new_owner_id,
    p_warehouse_id,
    'ownership_transferred',
    'Kepemilikan warehouse',
    pg_catalog.format(
      'Kamu kini pemilik %s (dialihkan oleh %s)',
      v_wh_name,
      v_actor_name
    ),
    pg_catalog.jsonb_build_object(
      'warehouse_id', p_warehouse_id,
      'previous_owner', v_actor_id
    ),
    'ownership:' || p_warehouse_id::text
  );
  perform private.write_notification(
    v_actor_id,
    p_warehouse_id,
    'ownership_transferred',
    'Kepemilikan warehouse',
    pg_catalog.format(
      'Kepemilikan %s berpindah ke %s',
      v_wh_name,
      v_new_owner_name
    ),
    pg_catalog.jsonb_build_object(
      'warehouse_id', p_warehouse_id,
      'new_owner', p_new_owner_id
    ),
    'ownership:' || p_warehouse_id::text
  );
end;
$function$;

comment on function public.transfer_ownership(uuid, uuid) is
  'Transfer an undeployed warehouse from the current OWNER to an ACTIVE member; locked and idempotent-safe.';

revoke all on function public.transfer_ownership(uuid, uuid) from public, anon, authenticated;
grant execute on function public.transfer_ownership(uuid, uuid) to authenticated;

revoke update on table public.warehouses from authenticated;
revoke update on table public.warehouses from anon;
drop policy if exists warehouses_update_own on public.warehouses;
