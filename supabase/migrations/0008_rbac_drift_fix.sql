-- ============================================================================
-- Chainventory — 0008: RBAC drift fix (architecture hardening v05)
-- ============================================================================
-- Perbaikan dari architecture review (candidate 2, blocker sebelum Step 5):
--
--   Drift ditemukan: `reject_join` memakai `private.has_role(... 'OWNER') OR
--   private.has_role(... 'MANAGER')` (0005) — LIST ROLE HARDCODE — sedangkan
--   konsep TS-nya `JOIN_REQUEST_APPROVE` (lib/auth/permissions.ts). Dua sumber
--   kebenaran untuk satu pertanyaan "siapa boleh menolak join".
--
--   Akibat SAAT INI: tidak ada window escalation — `JOIN_REQUEST_APPROVE` TS
--   hanya OWNER/MANAGER, dan SQL juga hanya OWNER/MANAGER → keputusan identik
--   untuk semua kombinasi role (diverifikasi RBAC contract test).
--   Risiko MASA DEPAN: jika matrix berubah (mis. STAFF dapat approve), TS
--   ikut berubah tapi SQL `has_role` hardcode tetap kaku → drift menyimpang
--   diam-diam, kelas bug yang sama dengan escalation ban (PRD §9.2, AGENT §3).
--
--   FIX: helper `private.can_manage_join_requests(...)` yang TURUN DARI
--   `private.can_assign_role(actor_role, 'VIEWER')` (role terendah yang bisa
--   dikelola). Satu sumber matrix, bukan list role hardcode. `reject_join`
--   memakainya; `approve_join` tetap `can_assign_role` langsung.
--
-- ADDITIVE + idempotent guard (create or replace).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Helper: dapatkah member mengelola join request (approve/reject)?
-- Definisi = actor dapat meng-assign role VIEWER (role join terendah yang
-- boleh diberikan) → mengikuti matrix can_assign_role secara otomatis.
-- ----------------------------------------------------------------------------
create or replace function private.can_manage_join_requests(p_warehouse_id uuid, p_user_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select private.can_assign_role(
    (
      select role
      from public.memberships
      where warehouse_id = p_warehouse_id
        and user_id = p_user_id
        and status = 'ACTIVE'
      limit 1
    ),
    'VIEWER'
  );
$$;

revoke execute on function private.can_manage_join_requests(uuid, uuid) from PUBLIC, anon, service_role;
grant execute on function private.can_manage_join_requests(uuid, uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- reject_join — gunakan helper yang turun dari matrix, bukan list role hardcode.
-- ----------------------------------------------------------------------------
create or replace function public.reject_join(p_request_id uuid, p_reason text default null)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_request public.join_requests;
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

  -- Satu sumber kebenaran: can_manage_join_requests turun dari can_assign_role
  -- (bukan `has_role OWNER OR has_role MANAGER` seperti 0005). Konsisten dengan
  -- JOIN_REQUEST_APPROVE TS — drift matrix masa depan otomatis ketahuan via
  -- RBAC contract test, bukan menyimpang diam-diam.
  if not private.can_manage_join_requests(v_request.warehouse_id, v_actor_id) then
    raise exception 'insufficient permission to reject';
  end if;

  update public.join_requests
    set status = 'rejected', decided_by = v_actor_id, decided_at = now(),
        reason = coalesce(p_reason, reason)
  where id = p_request_id;
end;
$$;

-- GRANT execute (server flow) — idempotent.
grant execute on function public.reject_join(uuid, text) to authenticated;
