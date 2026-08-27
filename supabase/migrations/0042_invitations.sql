-- ============================================================================
-- Chainventory — 0042: email invitations (audit: email invites)
-- ============================================================================
-- Mengundang member lewat alamat email (bukan sekadar share kode gudang).
-- Alur: OWNER/MANAGER membuat invitation -> token 24-byte -> link
-- /invite/<token>. Penerima (user dengan email cocok) membuka link ->
-- accept_invitation membuat membership ACTIVE. Email keluar (delivery) adalah
-- urusan infrastruktur (provider email); di sini kita hasilkan token + link,
-- UI menyalin/membagikannya. Semua mutasi lewat RPC SECURITY DEFINER sehingga
-- client TIDAK dapat INSERT/UPDATE tabel invitations secara langsung.
-- ============================================================================

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses (id) on delete cascade,
  email text not null,
  role text not null check (role in ('STAFF', 'MANAGER', 'AUDITOR', 'VIEWER')),
  token text not null unique default encode(gen_random_bytes(24), 'hex'),
  invited_by uuid references public.users (id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'expired', 'revoked')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz
);

comment on table public.invitations is
  'Undangan member berbasis email. Satu token = satu undangan; kedaluwarsa 7 hari.';

create index if not exists invitations_warehouse_idx
  on public.invitations (warehouse_id, status);
create index if not exists invitations_email_idx
  on public.invitations (lower(email));

-- ----------------------------------------------------------------------------
-- create_invitation — hanya OWNER/MANAGER yang boleh, dan hanya untuk role
-- yang bisa mereka assign (can_assign_role).
-- ----------------------------------------------------------------------------
create or replace function public.create_invitation(
  p_warehouse_id uuid,
  p_email text,
  p_role text
)
returns public.invitations
language plpgsql
security definer
set search_path to public
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

  v_actor_role := private.member_role(p_warehouse_id, v_actor);
  if v_actor_role is null then
    raise exception 'not a member';
  end if;

  if not private.can_assign_role(v_actor_role, p_role) then
    raise exception 'insufficient permission to invite as %', p_role;
  end if;

  v_email := lower(btrim(p_email));
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'invalid email';
  end if;

  -- Sudah member? (termasuk yang pending) -> tolak.
  if exists (
    select 1 from public.memberships
    where warehouse_id = p_warehouse_id
      and user_id = (select id from public.users where lower(email) = v_email)
  ) then
    raise exception 'already a member';
  end if;

  -- Cabut undangan pending lama ke email + warehouse yang sama.
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

-- ----------------------------------------------------------------------------
-- accept_invitation — user login harus cocok dengan email undangan.
-- ----------------------------------------------------------------------------
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

  select * into v_inv
  from public.invitations
  where token = p_token and status = 'pending' and expires_at > now();

  if v_inv is null then
    raise exception 'invitation invalid or expired';
  end if;

  if v_inv.email <> v_email then
    raise exception 'invitation is for another email';
  end if;

  -- Idempoten: kalau sudah member, tandai accepted lalu lempar.
  if exists (
    select 1 from public.memberships
    where warehouse_id = v_inv.warehouse_id and user_id = v_user
  ) then
    update public.invitations set status = 'accepted', accepted_at = now()
    where id = v_inv.id;
    raise exception 'already a member';
  end if;

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

-- ----------------------------------------------------------------------------
-- RLS: hanya OWNER/MANAGER warehouse yang boleh melihat undangan.
-- ----------------------------------------------------------------------------
alter table public.invitations enable row level security;

drop policy if exists invitations_select_managers on public.invitations;
create policy invitations_select_managers on public.invitations
  for select to authenticated
  using (private.member_role(warehouse_id, auth.uid()) in ('OWNER', 'MANAGER'));
