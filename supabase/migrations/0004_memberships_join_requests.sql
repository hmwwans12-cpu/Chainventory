-- ============================================================================
-- Chainventory — 0004: memberships + join_requests + RLS + grant
-- ============================================================================
-- Aliran: ADDITIVE murni (expand–migrate–contract, WORKFLOW §4). Aman
-- dijalankan ulang parsial (idempotent guard).
--
-- Skema mengikuti IMPLEMENTATION_PLAN_04 §7.4–§7.5 + RBAC kanonik
-- `lib/auth/permissions.ts` (ROLES, MEMBERSHIP_STATUS, canAssignRole matrix).
--
--   - memberships   : keanggotaan warehouse dengan role & status.
--                     Unique (warehouse_id, user_id). JOIN_REQUEST_APPROVE
--                     hanya via canAssignRole (PRD §9.2, AGENT.md §3).
--   - join_requests : join by warehouse code; status lifecycle pending →
--                     approved/rejected/cancelled; decided_by diisi saat
--                     keputusan.
--
-- RLS aktif sejak lahir; mutasi (join/approve/reject/leave/remove/suspend)
-- lewat fungsi security definer + server flow (defense-in-depth).
-- GRANT eksplisit (Data API).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. memberships
-- ----------------------------------------------------------------------------
create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  role text not null
    check (role in ('OWNER', 'MANAGER', 'STAFF', 'AUDITOR', 'VIEWER')),
  status text not null default 'ACTIVE'
    check (status in ('PENDING', 'ACTIVE', 'SUSPENDED')),
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.memberships is
  'Keanggotaan warehouse (RBAC). OWNER ditenagai warehouse owner (arsitektur §4).';

-- Satu membership per (warehouse, user).
create unique index if not exists memberships_warehouse_user_idx
  on public.memberships (warehouse_id, user_id);

-- Index untuk RLS policy (security-rls-performance: index kolom yang dipakai
-- policy; `warehouse_id` untuk lookup tenant, `user_id` untuk lookup milik).
create index if not exists memberships_warehouse_idx on public.memberships (warehouse_id);
create index if not exists memberships_user_idx on public.memberships (user_id);

drop trigger if exists memberships_set_updated_at on public.memberships;
create trigger memberships_set_updated_at
  before update on public.memberships
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 2. join_requests
-- ----------------------------------------------------------------------------
create table if not exists public.join_requests (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouses (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  role text
    check (role in ('OWNER', 'MANAGER', 'STAFF', 'AUDITOR', 'VIEWER')),
  decided_by uuid references public.users (id) on delete set null,
  decided_at timestamptz,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.join_requests is
  'Permintaan join warehouse via kode. role diisi saat approve sesuai matrix (NULL saat pending).';

-- Satu request aktif per (warehouse, user) — mencegah join ganda.
create unique index if not exists join_requests_warehouse_user_idx
  on public.join_requests (warehouse_id, user_id);

create index if not exists join_requests_warehouse_idx on public.join_requests (warehouse_id);
create index if not exists join_requests_user_idx on public.join_requests (user_id);

drop trigger if exists join_requests_set_updated_at on public.join_requests;
create trigger join_requests_set_updated_at
  before update on public.join_requests
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 3. Helper RLS (security definer, private schema) — tenant membership check
-- ----------------------------------------------------------------------------
-- Schema privat untuk helper security definer; TIDAK diberi GRANT penggunaan
-- ke publik sehingga tidak bisa dipanggil langsung dari Data API/klien.
create schema if not exists private;
-- `private.is_member` dipakai di policy SELECT untuk tabel tenant (produk,
-- movement, dst.) agar lookup terindex (bukan per-row). SELALU mengecek
-- auth.uid() di dalam fungsi.
create or replace function private.is_member(p_warehouse_id uuid)
returns boolean
language sql
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.memberships m
    where m.warehouse_id = p_warehouse_id
      and m.user_id = (select auth.uid())
      and m.status = 'ACTIVE'
  );
$$;

-- Hanya bisa dipanggil dari policy/RPC internal: revoke dari PUBLIC/anon/
-- service_role. `authenticated` DIBIARKAN punya EXECUTE karena policy SELECT
-- dievaluasi sebagai role authenticated — revoke ke authenticated akan
-- membuat policy `permission denied for function is_member`. Keamanan tetap
-- terjaga: schema `private` TIDAK diberi USAGE ke publik sehingga klien tak
-- bisa memanggil fungsi ini langsung via Data API.
revoke execute on function private.is_member(uuid) from PUBLIC, anon, service_role;
grant execute on function private.is_member(uuid) to authenticated;

-- ----------------------------------------------------------------------------
-- 4. RLS
-- ----------------------------------------------------------------------------
alter table public.memberships enable row level security;
alter table public.join_requests enable row level security;

-- memberships SELECT:
--   - user melihat membership miliknya sendiri;
--   - user yang sudah menjadi member warehouse juga bisa melihat daftar member
--     warehouse tersebut (kolaborasi; MEMBER_READ untuk role >= STAFF di
--     level aplikasi, predicate DB tetap "member of warehouse").
drop policy if exists memberships_select_own on public.memberships;
create policy "memberships_select_own"
  on public.memberships
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists memberships_select_member on public.memberships;
create policy "memberships_select_member"
  on public.memberships
  for select
  to authenticated
  using ((select private.is_member(warehouse_id)));

-- join_requests SELECT: pemilik request; admin (member dengan role yang
-- berhak approve — JOIN_REQUEST_APPROVE) melihat request masuk. Predikat DB
-- hanya "member of warehouse"; otorisasi role tetap di server flow.
drop policy if exists join_requests_select_own on public.join_requests;
create policy "join_requests_select_own"
  on public.join_requests
  for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists join_requests_select_admin on public.join_requests;
create policy "join_requests_select_admin"
  on public.join_requests
  for select
  to authenticated
  using (
    (select private.is_member(warehouse_id))
    and status = 'pending'
  );

-- Mutasi memberships/join_requests TIDAK diizinkan langsung via Data API
-- (deny by default). Semua lewat fungsi security definer + server flow:
--   request_join, approve_join, reject_join, cancel_join, leave, remove_member,
--   suspend/activate (migration 0005/audit).

-- ----------------------------------------------------------------------------
-- 5. GRANT eksplisit (Data API).
-- ----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;

grant select on table public.memberships to authenticated;
grant select on table public.join_requests to authenticated;

-- ----------------------------------------------------------------------------
-- 6. Realtime (whitelist eksplisit, ARSITEKTUR §6).
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'memberships'
  ) then
    alter publication supabase_realtime add table public.memberships;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'join_requests'
  ) then
    alter publication supabase_realtime add table public.join_requests;
  end if;
end;
$$;
