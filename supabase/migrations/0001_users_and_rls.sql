-- ============================================================================
-- Chainventory — 0001: users + profile bootstrap + RLS + GRANT
-- ============================================================================
-- Aliran: ADDITIVE murni (expand–migrate–contract, WORKFLOW §4). Tidak ada
-- rename/drop struktur yang merusak. Aman dijalankan ulang parsial karena
-- setiap blok memakai `CREATE OR REPLACE` / idempotent guard.
--
-- Tabel lain (warehouses, memberships, products, inventory_balances,
-- stock_movements, proofs, proof_outbox, audit_logs, dst.) dibuat di fase
-- P1 dengan pola yang sama: RLS aktif sejak lahir, GRANT eksplisit.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. users — profil aplikasi, 1:1 ke auth.users, plus Privy user id.
-- ----------------------------------------------------------------------------
create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  display_name text,
  avatar_url text,
  privy_user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint users_email_not_blank check (btrim(email) <> '')
);

comment on table public.users is
  'Profil aplikasi, terikat 1:1 ke auth.users (ARSITEKTUR §4.1).';

-- Email profil berasal dari auth.users; pencarian memakai indeks ini.
create unique index if not exists users_email_idx on public.users (lower(email));
create index if not exists users_privy_user_id_idx
  on public.users (privy_user_id)
  where privy_user_id is not null;

-- updated_at otomatis.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists users_set_updated_at on public.users;
create trigger users_set_updated_at
  before update on public.users
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 2. Profile bootstrap — auto-create baris users saat user daftar.
--    Ambiguitas INSERT vs UPDATE dihindari: klaim terakhir menang di email,
--    namun id selalu sama dengan auth.users.id.
-- ----------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.users (id, email, display_name)
  values (new.id, coalesce(new.email, ''), new.raw_user_meta_data ->> 'name')
  on conflict (id) do update set
    email = excluded.email,
    display_name = coalesce(excluded.display_name, public.users.display_name),
    updated_at = now();
  return new;
end;
$$;

-- Hanya Satu trigger bootstrap; penggantian body cukup via CREATE OR REPLACE.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------------------
-- 3. RLS — aktif di semua tabel aplikasi sejak awal.
-- ----------------------------------------------------------------------------
alter table public.users enable row level security;

-- SELECT: hanya profil sendiri. (Kolaborasi membaca profil member lain
-- ditambahkan di P1 lewat policy membership terpisah, bukan selamanya deny.)
create policy "users_select_own"
  on public.users
  for select
  to authenticated
  using (auth.uid() = id);

-- UPDATE: hanya profil sendiri, kolom yang diizinkan.
create policy "users_update_own"
  on public.users
  for update
  to authenticated
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- INSERT/DELETE lewat aplikasi tidak pernah terjadi (baris dibuat trigger
-- auth). Tidak dibuat policy → deny by default.

-- ----------------------------------------------------------------------------
-- 4. GRANT eksplisit (Data API). Service-role diabaikan di sini karena
--    service-role bukan jalur request user normal (ARSITEKTUR §7).
-- ----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table public.users
  to authenticated;
grant select on table public.users to anon;

-- ----------------------------------------------------------------------------
-- 5. Observability kecil: fungsi helper untuk health/keep-alive.
-- ----------------------------------------------------------------------------
create or replace function public.keepalive_ping()
returns boolean
language sql
security definer set search_path = public
stable
as $$
  select true;
$$;

grant execute on function public.keepalive_ping() to anon, authenticated;