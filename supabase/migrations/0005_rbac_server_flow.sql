-- ============================================================================
-- Chainventory — 0005: RBAC server flow RPC (security definer)
-- ============================================================================
-- Aliran: ADDITIVE murni. Fungsi dipanggil SERVER flow (Route Handler /
-- Server Action) dengan sesi user (auth.uid() dari JWT). Semua mutasi
-- membership/join_request lewat sini — client TIDAK boleh INSERT/UPDATE
-- langsung (RLS deny by default; lihat 0004).
--
-- Matrix otorisasi (kanonik lib/auth/permissions.ts canAssignRole):
--   - OWNER   : boleh mengelola MANAGER, STAFF, AUDITOR, VIEWER
--   - MANAGER : boleh mengelola STAFF, AUDITOR, VIEWER
--   - lainnya : tidak boleh assign role
-- Owner tidak bisa di-assign via join (owner ditetapkan saat create
-- warehouse / ownership transfer on-chain, ARSITEKTUR §4.4).
--
-- Fungsi memakai SECURITY DEFINER + `set search_path` + cek auth.uid()
-- eksplisit (security-rls-performance: jangan pernah andalkan RLS saja
-- untuk fungsi mutasi; PLAN_04 §9.6).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helper: role member aktif di warehouse (security definer, private).
-- ----------------------------------------------------------------------------
create or replace function private.member_role(p_warehouse_id uuid, p_user_id uuid)
returns text
language sql
security definer
set search_path = ''
as $$
  select role
  from public.memberships
  where warehouse_id = p_warehouse_id
    and user_id = p_user_id
    and status = 'ACTIVE'
  limit 1;
$$;

-- Helper: canAssignRole matrix di sisi DB (sama dengan lib/auth/permissions.ts).
create or replace function private.can_assign_role(p_actor_role text, p_target_role text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select
    p_actor_role in ('OWNER', 'MANAGER')
    and
    case
      when p_actor_role = 'OWNER' then p_target_role in ('MANAGER', 'STAFF', 'AUDITOR', 'VIEWER')
      when p_actor_role = 'MANAGER' then p_target_role in ('STAFF', 'AUDITOR', 'VIEWER')
      else false
    end;
$$;

-- Helper: apakah user adalah member ACTIVE dengan role tertentu.
create or replace function private.has_role(p_warehouse_id uuid, p_user_id uuid, p_role text)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships
    where warehouse_id = p_warehouse_id
      and user_id = p_user_id
      and status = 'ACTIVE'
      and role = p_role
  );
$$;

revoke execute on function private.member_role(uuid, uuid) from PUBLIC, anon, service_role;
grant execute on function private.member_role(uuid, uuid) to authenticated;
revoke execute on function private.can_assign_role(text, text) from PUBLIC, anon, service_role;
grant execute on function private.can_assign_role(text, text) to authenticated;
revoke execute on function private.has_role(uuid, uuid, text) from PUBLIC, anon, service_role;
grant execute on function private.has_role(uuid, uuid, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 1. request_join — user bergabung via warehouse code (JOIN_REQUEST_READ; PRD §10).
--    Membuat join_request 'pending'. Mencegah join ganda (unique constraint).
-- ----------------------------------------------------------------------------
create or replace function public.request_join(p_warehouse_code text)
returns public.join_requests
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_warehouse public.warehouses;
  v_request public.join_requests;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  select * into v_warehouse
  from public.warehouses
  where warehouse_code = upper(btrim(p_warehouse_code));

  if v_warehouse is null then
    raise exception 'warehouse not found';
  end if;

  if v_warehouse.status <> 'active' then
    raise exception 'warehouse not accepting joins';
  end if;

  -- Sudah member? (termasuk yang menunggu) → tolak.
  if exists (
    select 1 from public.memberships
    where warehouse_id = v_warehouse.id and user_id = v_user_id
  ) then
    raise exception 'already a member';
  end if;

  -- Request yang masih pending/approved: tidak bisa duplikat.
  if exists (
    select 1 from public.join_requests
    where warehouse_id = v_warehouse.id and user_id = v_user_id
      and status in ('pending', 'approved')
  ) then
    raise exception 'join request already exists';
  end if;

  -- Request lama yang sudah rejected/cancelled: reactivate jadi pending
  -- (user boleh apply lagi; unique (warehouse_id, user_id) mencegah duplikat).
  update public.join_requests
    set status = 'pending',
        role = null,
        decided_by = null,
        decided_at = null,
        reason = null,
        updated_at = now()
  where warehouse_id = v_warehouse.id and user_id = v_user_id
    and status in ('rejected', 'cancelled')
  returning * into v_request;

  if v_request is null then
    insert into public.join_requests (warehouse_id, user_id, status, role)
    values (v_warehouse.id, v_user_id, 'pending', null)
    returning * into v_request;
  end if;

  return v_request;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. approve_join — menyetujui request (WAJIB canAssignRole).
-- ----------------------------------------------------------------------------
create or replace function public.approve_join(p_request_id uuid, p_role text)
returns public.memberships
language plpgsql
security definer set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_request public.join_requests;
  v_actor_role text;
  v_membership public.memberships;
begin
  if v_actor_id is null then
    raise exception 'not authenticated';
  end if;

  select * into v_request
  from public.join_requests
  where id = p_request_id;

  if v_request is null then
    raise exception 'join request not found';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'join request not pending';
  end if;

  v_actor_role := private.member_role(v_request.warehouse_id, v_actor_id);

  if v_actor_role is null then
    raise exception 'not a member';
  end if;

  -- PRD §9.2 / AGENT.md §3: assign role WAJIB lewat canAssignRole.
  if not private.can_assign_role(v_actor_role, p_role) then
    raise exception 'insufficient role to assign %', p_role;
  end if;

  -- Role yang di-assign saat approve TIDAK boleh OWNER (owner via create
  -- warehouse / ownership transfer on-chain).
  if p_role = 'OWNER' then
    raise exception 'cannot assign OWNER via join request';
  end if;

  -- Transaksi: request → approved + membership ACTIVE (role sesuai matrix).
  update public.join_requests
    set status = 'approved', role = p_role, decided_by = v_actor_id, decided_at = now()
  where id = p_request_id;

  insert into public.memberships (warehouse_id, user_id, role, status, joined_at)
  values (v_request.warehouse_id, v_request.user_id, p_role, 'ACTIVE', now())
  on conflict (warehouse_id, user_id) do update set
    role = excluded.role,
    status = 'ACTIVE',
    joined_at = now(),
    updated_at = now()
  returning * into v_membership;

  return v_membership;
end;
$$;

-- ----------------------------------------------------------------------------
-- 3. reject_join — menolak request (WAJIB canAssignRole pemohon).
--    (`p_role` tidak dipakai untuk reject; diisi matrix actor saat approve.
--     Reject hanya butuh MEMBER_MANAGE — actor harus member dengan hak.)
-- ----------------------------------------------------------------------------
create or replace function public.reject_join(p_request_id uuid, p_reason text default null)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_request public.join_requests;
  v_actor_role text;
begin
  if v_actor_id is null then
    raise exception 'not authenticated';
  end if;

  select * into v_request
  from public.join_requests
  where id = p_request_id;

  if v_request is null then
    raise exception 'join request not found';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'join request not pending';
  end if;

  v_actor_role := private.member_role(v_request.warehouse_id, v_actor_id);
  if v_actor_role is null then
    raise exception 'not a member';
  end if;

  -- Member yang berhak menolak = yang berhak approve (member dengan
  -- JOIN_REQUEST_APPROVE capability, di level DB: role yang bisa mengelola
  -- setidaknya satu role target = OWNER/MANAGER).
  if not private.has_role(v_request.warehouse_id, v_actor_id, 'OWNER')
     and not private.has_role(v_request.warehouse_id, v_actor_id, 'MANAGER') then
    raise exception 'insufficient permission to reject';
  end if;

  update public.join_requests
    set status = 'rejected', decided_by = v_actor_id, decided_at = now(),
        reason = coalesce(p_reason, reason)
  where id = p_request_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 4. cancel_join — pemohon membatalkan request sendiri.
-- ----------------------------------------------------------------------------
create or replace function public.cancel_join(p_request_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_request public.join_requests;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  select * into v_request
  from public.join_requests
  where id = p_request_id;

  if v_request is null then
    raise exception 'join request not found';
  end if;

  if v_request.user_id <> v_user_id then
    raise exception 'not owner of join request';
  end if;

  if v_request.status <> 'pending' then
    raise exception 'join request not pending';
  end if;

  update public.join_requests
    set status = 'cancelled', updated_at = now()
  where id = p_request_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 5. leave_warehouse — member keluar (owner TIDAK bisa leave; PRD §11).
-- ----------------------------------------------------------------------------
create or replace function public.leave_warehouse(p_warehouse_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_membership public.memberships;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  select * into v_membership
  from public.memberships
  where warehouse_id = p_warehouse_id and user_id = v_user_id;

  if v_membership is null then
    raise exception 'not a member';
  end if;

  -- Owner tidak boleh leave sebelum transfer ownership (PRD §11, AGENT Invariant).
  if v_membership.role = 'OWNER' then
    raise exception 'owner cannot leave warehouse; transfer ownership first';
  end if;

  delete from public.memberships
  where warehouse_id = p_warehouse_id and user_id = v_user_id;

  -- Bersihkan join request yang tersisa (jika ada) untuk konsistensi.
  update public.join_requests
    set status = 'cancelled', updated_at = now()
  where warehouse_id = p_warehouse_id and user_id = v_user_id
    and status in ('pending', 'approved');
end;
$$;

-- ----------------------------------------------------------------------------
-- 6. remove_member — aktor menghapus member (WAJIB canAssignRole target).
-- ----------------------------------------------------------------------------
create or replace function public.remove_member(p_warehouse_id uuid, p_user_id uuid)
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
    raise exception 'use leave_warehouse to leave';
  end if;

  select * into v_target
  from public.memberships
  where warehouse_id = p_warehouse_id and user_id = p_user_id;

  if v_target is null then
    raise exception 'member not found';
  end if;

  if v_target.role = 'OWNER' then
    raise exception 'cannot remove owner';
  end if;

  v_actor_role := private.member_role(p_warehouse_id, v_actor_id);
  if v_actor_role is null then
    raise exception 'not a member';
  end if;

  -- Remove = operasi assign-role terkait (PRD §9.2): wajib canAssignRole
  -- terhadap role target.
  if not private.can_assign_role(v_actor_role, v_target.role) then
    raise exception 'insufficient role to remove %', v_target.role;
  end if;

  delete from public.memberships
  where warehouse_id = p_warehouse_id and user_id = p_user_id;

  -- Bersihkan join request yang tersisa (pending ATAU approved) untuk
  -- konsistensi: user sudah bukan member, request lama tidak valid lagi.
  update public.join_requests
    set status = 'cancelled', updated_at = now()
  where warehouse_id = p_warehouse_id and user_id = p_user_id
    and status in ('pending', 'approved');
end;
$$;

-- ----------------------------------------------------------------------------
-- GRANT execute (server flow).
-- ----------------------------------------------------------------------------
grant execute on function public.request_join(text) to authenticated;
grant execute on function public.approve_join(uuid, text) to authenticated;
grant execute on function public.reject_join(uuid, text) to authenticated;
grant execute on function public.cancel_join(uuid) to authenticated;
grant execute on function public.leave_warehouse(uuid) to authenticated;
grant execute on function public.remove_member(uuid, uuid) to authenticated;
