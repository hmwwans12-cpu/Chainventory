create or replace function public.update_member_role(
  p_warehouse_id uuid,
  p_user_id uuid,
  p_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_target public.memberships;
  v_actor_name text;
  v_wh_name text;
  v_before_role text;
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

  perform m.id
  from public.memberships m
  where m.warehouse_id = p_warehouse_id
    and m.user_id in (p_user_id, v_actor_id)
  order by m.user_id
  for update;

  select * into v_target
  from public.memberships
  where warehouse_id = p_warehouse_id
    and user_id = p_user_id;
  if v_target.id is null then
    raise exception 'member not found';
  end if;
  if v_target.role = 'OWNER' then
    raise exception 'cannot change owner role';
  end if;

  v_actor_role := private.member_role(p_warehouse_id, v_actor_id);
  if v_actor_role is null then
    raise exception 'not a member';
  end if;
  if not private.can_assign_role(v_actor_role, v_target.role)
     or not private.can_assign_role(v_actor_role, p_role) then
    raise exception 'insufficient permission to assign %', p_role;
  end if;

  v_before_role := v_target.role;
  update public.memberships
  set role = p_role, updated_at = now()
  where id = v_target.id;

  perform private.write_audit(
    p_warehouse_id,
    v_actor_id,
    'membership_role_changed',
    'memberships',
    v_target.id::text,
    jsonb_build_object('role', v_before_role),
    jsonb_build_object('role', p_role),
    null,
    'active'
  );

  select coalesce(display_name, split_part(email, '@', 1), 'Pengguna')
    into v_actor_name
  from public.users where id = v_actor_id;
  select name into v_wh_name
  from public.warehouses where id = p_warehouse_id;
  perform private.write_notification(
    p_user_id,
    p_warehouse_id,
    'membership_role_changed',
    'Peran berubah',
    format('Peranmu di %s diubah menjadi %s oleh %s', v_wh_name, p_role, v_actor_name),
    jsonb_build_object('warehouse_id', p_warehouse_id, 'role', p_role),
    'role_change:' || p_warehouse_id::text || ':' || p_user_id::text
  );
end;
$function$;

revoke execute on function public.update_member_role(uuid, uuid, text) from public, anon;
grant execute on function public.update_member_role(uuid, uuid, text) to authenticated;

create or replace function public.remove_member(
  p_warehouse_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
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
    raise exception 'use leave_warehouse to leave';
  end if;

  perform private.ensure_warehouse_active(p_warehouse_id);
  perform 1
  from public.warehouses
  where id = p_warehouse_id
  for update;
  if not found then
    raise exception 'warehouse not found';
  end if;

  perform m.id
  from public.memberships m
  where m.warehouse_id = p_warehouse_id
    and m.user_id in (p_user_id, v_actor_id)
  order by m.user_id
  for update;

  select * into v_target
  from public.memberships
  where warehouse_id = p_warehouse_id
    and user_id = p_user_id;
  if v_target.id is null then
    raise exception 'member not found';
  end if;
  if v_target.role = 'OWNER' then
    raise exception 'cannot remove owner';
  end if;

  v_actor_role := private.member_role(p_warehouse_id, v_actor_id);
  if v_actor_role is null then
    raise exception 'not a member';
  end if;
  if not private.can_assign_role(v_actor_role, v_target.role) then
    raise exception 'insufficient role to remove %', v_target.role;
  end if;

  delete from public.memberships
  where id = v_target.id;

  update public.join_requests
  set status = 'cancelled', updated_at = now()
  where warehouse_id = p_warehouse_id
    and user_id = p_user_id
    and status in ('pending', 'approved');

  perform private.write_audit(
    p_warehouse_id,
    v_actor_id,
    'membership_removed',
    'memberships',
    v_target.id::text,
    jsonb_build_object('user_id', p_user_id, 'role', v_target.role),
    null,
    null,
    'removed'
  );

  select coalesce(display_name, split_part(email, '@', 1), 'Pengguna')
    into v_actor_name
  from public.users where id = v_actor_id;
  select name into v_wh_name
  from public.warehouses where id = p_warehouse_id;
  perform private.write_notification(
    p_user_id,
    p_warehouse_id,
    'membership_removed',
    'Kamu dihapus dari warehouse',
    format('Kamu dihapus dari %s oleh %s', v_wh_name, v_actor_name),
    jsonb_build_object('warehouse_id', p_warehouse_id, 'removed_by', v_actor_id),
    'member_removed:' || p_warehouse_id::text || ':' || p_user_id::text
  );
end;
$function$;

revoke execute on function public.remove_member(uuid, uuid) from public, anon;
grant execute on function public.remove_member(uuid, uuid) to authenticated;

create or replace function public.leave_warehouse(p_warehouse_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_membership public.memberships;
  v_name text;
  v_wh_name text;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  perform private.ensure_warehouse_active(p_warehouse_id);
  perform 1
  from public.warehouses
  where id = p_warehouse_id
  for update;
  if not found then
    raise exception 'warehouse not found';
  end if;

  select * into v_membership
  from public.memberships
  where warehouse_id = p_warehouse_id
    and user_id = v_user_id
  for update;
  if v_membership.id is null then
    raise exception 'not a member';
  end if;
  if v_membership.role = 'OWNER' then
    raise exception 'owner cannot leave warehouse; transfer ownership first';
  end if;

  delete from public.memberships where id = v_membership.id;
  update public.join_requests
  set status = 'cancelled', updated_at = now()
  where warehouse_id = p_warehouse_id
    and user_id = v_user_id
    and status in ('pending', 'approved');

  perform private.write_audit(
    p_warehouse_id,
    v_user_id,
    'membership_left',
    'memberships',
    v_membership.id::text,
    jsonb_build_object('user_id', v_user_id, 'role', v_membership.role),
    null,
    null,
    'left'
  );

  select coalesce(display_name, split_part(email, '@', 1), 'Pengguna')
    into v_name
  from public.users where id = v_user_id;
  select name into v_wh_name
  from public.warehouses where id = p_warehouse_id;
  perform private.notify_warehouse_managers(
    p_warehouse_id,
    'membership_left',
    'Member keluar',
    format('%s keluar dari %s', v_name, v_wh_name),
    jsonb_build_object('warehouse_id', p_warehouse_id, 'user_id', v_user_id),
    'member_left:' || p_warehouse_id::text || ':' || v_user_id::text
  );
end;
$function$;

revoke execute on function public.leave_warehouse(uuid) from public, anon;
grant execute on function public.leave_warehouse(uuid) to authenticated;

drop policy if exists audit_logs_select_managers on public.audit_logs;
create policy audit_logs_select_managers
  on public.audit_logs
  for select to authenticated
  using (
    warehouse_id is not null
    and (select private.member_role(warehouse_id, auth.uid()))
      in ('OWNER', 'MANAGER', 'AUDITOR')
  );

create or replace function private.assert_warehouse_owner_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_warehouse_id uuid;
  v_owner_user_id uuid;
begin
  if tg_table_name = 'warehouses' then
    v_warehouse_id := new.id;
  elsif tg_op = 'DELETE' then
    v_warehouse_id := old.warehouse_id;
  else
    v_warehouse_id := new.warehouse_id;
  end if;

  select owner_user_id into v_owner_user_id
  from public.warehouses
  where id = v_warehouse_id;

  if v_owner_user_id is not null and not exists (
    select 1
    from public.memberships
    where warehouse_id = v_warehouse_id
      and user_id = v_owner_user_id
      and role = 'OWNER'
      and status = 'ACTIVE'
  ) then
    raise exception 'warehouse owner must have an active OWNER membership';
  end if;
  return null;
end;
$function$;

drop trigger if exists memberships_owner_consistency on public.memberships;
create constraint trigger memberships_owner_consistency
after insert or update or delete on public.memberships
deferrable initially deferred
for each row execute function private.assert_warehouse_owner_membership();

drop trigger if exists warehouses_owner_consistency on public.warehouses;
create constraint trigger warehouses_owner_consistency
after insert or update on public.warehouses
deferrable initially deferred
for each row execute function private.assert_warehouse_owner_membership();

revoke all on function private.assert_warehouse_owner_membership() from public, anon, authenticated, service_role;
