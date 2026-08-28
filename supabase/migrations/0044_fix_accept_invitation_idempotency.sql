-- ============================================================================
-- Chainventory — 0044: Fix accept_invitation idempotency for re-visits
-- ============================================================================
-- Bug: accept_invitation filters by status='pending' FIRST, so re-visits
-- to an already-accepted invitation return "invalid or expired" even though
-- the user is already a member. The idempotency block was AFTER the pending
-- filter, so never reached for re-visits.
-- Fix: Check token existence first, then handle each status case:
--   - accepted + already member → return membership (idempotent success)
--   - accepted + not member → "invitation already used"
--   - not pending/expired → "invalid or expired"
--   - pending → proceed with acceptance
-- ============================================================================

create or replace function public.accept_invitation(p_token text)
returns public.memberships
language plpgsql
security definer
set search_path to public
as $function$
declare
  v_user uuid := auth.uid();
  v_email text;
  v_inv public.invitations;
  v_membership public.memberships;
begin
  if v_user is null then
    raise exception 'not authenticated';
  end if;

  select lower(email) into v_email from public.users where id = v_user;

  -- First: find invitation by token regardless of status
  select * into v_inv
  from public.invitations
  where token = p_token;

  if v_inv is null then
    raise exception 'invitation not found';
  end if;

  -- Handle already-accepted invitations (re-visits)
  if v_inv.status = 'accepted' then
    if exists (
      select 1 from public.memberships
      where warehouse_id = v_inv.warehouse_id and user_id = v_user
    ) then
      -- Idempotent success: user already member, return membership
      select * into v_membership
      from public.memberships
      where warehouse_id = v_inv.warehouse_id and user_id = v_user;
      return v_membership;
    end if;
    raise exception 'invitation already used';
  end if;

  -- Handle expired/revoked/other non-pending statuses
  if v_inv.status <> 'pending' or v_inv.expires_at <= now() then
    raise exception 'invitation invalid or expired';
  end if;

  -- Verify email matches
  if v_inv.email <> v_email then
    raise exception 'invitation is for another email';
  end if;

  -- Idempoten: kalau sudah member (via jalur lain), tandai accepted lalu return
  if exists (
    select 1 from public.memberships
    where warehouse_id = v_inv.warehouse_id and user_id = v_user
  ) then
    update public.invitations set status = 'accepted', accepted_at = now()
    where id = v_inv.id;
    select * into v_membership
    from public.memberships
    where warehouse_id = v_inv.warehouse_id and user_id = v_user;
    return v_membership;
  end if;

  -- Normal acceptance flow
  insert into public.memberships (warehouse_id, user_id, role, status, joined_at)
  values (v_inv.warehouse_id, v_user, v_inv.role, 'ACTIVE', now())
  on conflict (warehouse_id, user_id) do update set
    role = excluded.role,
    status = 'ACTIVE',
    joined_at = now(),
    updated_at = now()
  returning * into v_membership;

  update public.invitations set status = 'accepted', accepted_at = now()
  where id = v_inv.id;

  return v_membership;
end;
$function$;

revoke execute on function public.accept_invitation(text) from public, anon;
grant execute on function public.accept_invitation(text) to authenticated;