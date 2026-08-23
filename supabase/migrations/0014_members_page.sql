-- ============================================================================
-- Chainventory — 0014: members page (profil co-member, role assignment, transfer)
-- ============================================================================
-- Aliran ADDITIVE (expand–migrate–contract). Menutup tiga gap backend yang
-- dibutuhkan halaman Members:
--
--   1. `users_select_member`  — member warehouse membaca profil (display_name,
--      email) member lain warehouse yang sama. Sebelumnya RLS `users_select_own`
--      hanya mengizinkan profil sendiri, sehingga list member tak bisa
--      menampilkan nama/email via Data API.
--   2. `update_member_role`   — ubah role member EXISTING (tidak hanya saat
--      approve join request). Otorisasi: `private.can_assign_role(actor, role)`,
--      role OWNER tidak dapat diubah. (PRD §9.2 / AGENT.md §3.)
--   3. `transfer_ownership`   — OWNER menyerahkan kepemilikan; member target
--      ACTIVE menjadi OWNER, aktor turun ke MANAGER, `warehouses.owner_user_id`
--      ikut dipindah. (PRD §11 — owner tidak bisa leave/remove sebelum transfer.)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. users: SELECT untuk member warehouse yang sama (kolaborasi).
-- ----------------------------------------------------------------------------
drop policy if exists users_select_member on public.users;
create policy "users_select_member"
  on public.users
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.memberships m
      where m.status = 'ACTIVE'
        and m.user_id = public.users.id
        and m.warehouse_id in (
          select m2.warehouse_id
          from public.memberships m2
          where m2.user_id = auth.uid()
            and m2.status = 'ACTIVE'
        )
    )
  );

comment on policy "users_select_member" on public.users is
  'Member membaca profil member lain yang berbagi setidaknya satu warehouse ACTIVE.';

-- ----------------------------------------------------------------------------
-- 2. update_member_role — ubah role member existing (security definer).
-- ----------------------------------------------------------------------------
create or replace function public.update_member_role(p_warehouse_id uuid, p_user_id uuid, p_role text)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_target public.memberships;
begin
  if v_actor_id is null then
    raise exception 'not authenticated';
  end if;

  if p_user_id = v_actor_id then
    raise exception 'cannot change own role';
  end if;

  select * into v_target
  from public.memberships
  where warehouse_id = p_warehouse_id and user_id = p_user_id;

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

  if not private.can_assign_role(v_actor_role, p_role) then
    raise exception 'insufficient permission to assign %', p_role;
  end if;

  update public.memberships
    set role = p_role, updated_at = now()
  where id = v_target.id;
end;
$$;

comment on function public.update_member_role(uuid, uuid, text) is
  'Ubah role member. WAJIB can_assign_role(actor, p_role); OWNER immutable.';

-- ----------------------------------------------------------------------------
-- 3. transfer_ownership — serahkan kepemilikan warehouse.
-- ----------------------------------------------------------------------------
create or replace function public.transfer_ownership(p_warehouse_id uuid, p_new_owner_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_target public.memberships;
begin
  if v_actor_id is null then
    raise exception 'not authenticated';
  end if;

  if p_new_owner_id = v_actor_id then
    raise exception 'already the owner';
  end if;

  v_actor_role := private.member_role(p_warehouse_id, v_actor_id);
  if v_actor_role <> 'OWNER' then
    raise exception 'only owner can transfer ownership';
  end if;

  select * into v_target
  from public.memberships
  where warehouse_id = p_warehouse_id and user_id = p_new_owner_id;

  if v_target is null then
    raise exception 'target is not a member';
  end if;

  if v_target.status <> 'ACTIVE' then
    raise exception 'target membership is not active';
  end if;

  update public.memberships
    set role = 'OWNER', updated_at = now()
  where id = v_target.id;

  update public.memberships
    set role = 'MANAGER', updated_at = now()
  where warehouse_id = p_warehouse_id and user_id = v_actor_id;

  -- Pemindahan owner_user_id = tulis identitas; buka GUC milik server flow
  -- agar guard `enforce_warehouse_identity_immutable` (0011) mengizinkannya.
  perform set_config('app.allow_identity_write', 'true', true);

  update public.warehouses
    set owner_user_id = p_new_owner_id
  where id = p_warehouse_id;
end;
$$;

comment on function public.transfer_ownership(uuid, uuid) is
  'OWNER menyerahkan kepemilikan ke member ACTIVE lain; aktor menjadi MANAGER.';

-- ----------------------------------------------------------------------------
-- 4. GRANT execute (server flow).
-- ----------------------------------------------------------------------------
grant execute on function public.update_member_role(uuid, uuid, text) to authenticated;
grant execute on function public.transfer_ownership(uuid, uuid) to authenticated;