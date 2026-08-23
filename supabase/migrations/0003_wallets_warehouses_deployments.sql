-- ============================================================================
-- Chainventory — 0003: wallets + warehouses + warehouse_deployments + RLS
-- ============================================================================
-- Aliran: ADDITIVE murni (expand–migrate–contract, WORKFLOW §4). Setiap blok
-- memakai `create table if not exists` / idempotent guard sehingga aman
-- dijalankan ulang parsial.
--
-- Skema mengikuti keputusan IMPLEMENTATION_PLAN_04 §7.1–§7.3:
--   - wallets          : riwayat embedded/external wallet; TEPAT SATU primary
--                        aktif per user (partial unique index).
--   - warehouses       : warehouse code unik (auto-generated), owner user
--                        (off-chain) vs on-chain owner wallet (di kontrak)
--                        sebagai kolom terpisah (ARSITEKTUR §4.4). Satu aktif
--                        per user via partial unique index (enforcement
--                        on-chain tetap di Factory, PRD §8).
--   - warehouse_deployments : lifecycle EIP-712 deployment (deploymentNonce,
--                        signature, tx hash, error, idempotencyKey).
--
-- RLS aktif sejak lahir: SELECT scope tenant, mutasi via server flow.
-- GRANT eksplisit (Data API); service-role tidak dipakai untuk request user.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. wallets
-- ----------------------------------------------------------------------------
create table if not exists public.wallets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  address text not null,
  wallet_type text not null default 'embedded'
    check (wallet_type in ('embedded', 'external')),
  is_primary boolean not null default false,
  verification_state text not null default 'unverified'
    check (verification_state in ('unverified', 'verified')),
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint wallets_address_not_blank check (btrim(address) <> '')
);

comment on table public.wallets is
  'Riwayat embedded/external wallet user; tepat satu primary aktif per user (ARSITEKTUR §4.1).';

-- Address dinormalisasi lowercase (checksum tidak disimpan).
create unique index if not exists wallets_user_address_idx
  on public.wallets (user_id, lower(address));

-- Satu primary per user: hanya 0..1 baris dengan is_primary = true per user.
create unique index if not exists wallets_one_primary_idx
  on public.wallets (user_id)
  where is_primary;

create index if not exists wallets_user_idx on public.wallets (user_id);
create index if not exists wallets_address_idx on public.wallets (lower(address));

drop trigger if exists wallets_set_updated_at on public.wallets;
create trigger wallets_set_updated_at
  before update on public.wallets
  for each row execute function public.set_updated_at();

-- Verifikasi kepemilikan wallet (PRD §19): tandai verified saat bukti
-- kepemilikan tervalidasi server-side.
create or replace function public.verify_wallet(p_wallet_id uuid)
returns public.wallets
language plpgsql
security definer set search_path = public
as $$
declare
  v_wallet public.wallets;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  update public.wallets
    set verification_state = 'verified',
        verified_at = now(),
        updated_at = now()
  where id = p_wallet_id
    and user_id = auth.uid()
  returning * into v_wallet;

  if v_wallet is null then
    raise exception 'wallet not found or not owned';
  end if;

  return v_wallet;
end;
$$;

-- Sync wallet server-side (dipanggil oleh server flow saat Privy menerbitkan
-- embedded wallet / user connect external wallet). Menegakkan satu primary
-- per user (ARSITEKTUR §4.4): wallet pertama menjadi primary. Wallet
-- berikutnya is_primary=false (ownership transfer flow P1 menangani
-- penggantian primary dengan otorisasi on-chain).
create or replace function public.register_wallet(
  p_address text,
  p_wallet_type text default 'embedded'
)
returns public.wallets
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_wallet public.wallets;
  v_has_primary boolean;
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  if p_wallet_type not in ('embedded', 'external') then
    raise exception 'invalid wallet type';
  end if;

  if btrim(p_address) = '' then
    raise exception 'wallet address required';
  end if;

  select exists (
    select 1 from public.wallets
    where user_id = v_user_id and is_primary
  ) into v_has_primary;

  insert into public.wallets (user_id, address, wallet_type, is_primary)
  values (v_user_id, lower(p_address), p_wallet_type, not coalesce(v_has_primary, false))
  on conflict (user_id, lower(address)) do update set
    wallet_type = excluded.wallet_type,
    updated_at = now()
  returning * into v_wallet;

  return v_wallet;
end;
$$;

-- ----------------------------------------------------------------------------
-- 2. warehouses
-- ----------------------------------------------------------------------------
create table if not exists public.warehouses (
  id uuid primary key default gen_random_uuid(),
  warehouse_code text not null,
  name text not null,
  company_name text,
  warehouse_type text,
  owner_user_id uuid not null references public.users (id) on delete cascade,
  on_chain_owner_wallet text not null,
  contract_address text,
  status text not null default 'active'
    check (status in ('active', 'suspended')),
  created_at timestamptz not null default now(),
  suspended_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint warehouses_code_not_blank check (btrim(warehouse_code) <> ''),
  constraint warehouses_name_not_blank check (btrim(name) <> '')
);

comment on table public.warehouses is
  'Warehouse off-chain. owner_user_id (user aplikasi) terpisah dari on_chain_owner_wallet (address wallet owner yang tercatat di kontrak) dan contract_address (alamat kontrak warehouse) (ARSITEKTUR §4.4).';

comment on column public.warehouses.on_chain_owner_wallet is
  'Address WALLET OWNER (EOA/embedded/external) yang tercatat sebagai owner di kontrak warehouse. Bukan alamat kontrak. Disinkronkan dengan wallets.is_primary oleh Proof Job Processor saat ownership transfer (ARSITEKTUR §4.4).';

comment on column public.warehouses.contract_address is
  'Alamat kontrak Warehouse di Base Sepolia. Berbeda dari on_chain_owner_wallet (ARSITEKTUR §4.4).';

create unique index if not exists warehouses_code_idx
  on public.warehouses (warehouse_code);

-- Satu warehouse AKTIF per owner (off-chain). Enforcement on-chain tetap
-- di Factory: Factory: owner has active warehouse (PRD §8).
create unique index if not exists warehouses_one_active_per_owner_idx
  on public.warehouses (owner_user_id)
  where status = 'active';

create index if not exists warehouses_owner_idx on public.warehouses (owner_user_id);

drop trigger if exists warehouses_set_updated_at on public.warehouses;
create trigger warehouses_set_updated_at
  before update on public.warehouses
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 3. warehouse_deployments — lifecycle deployment EIP-712 (PRD §7, §38).
-- ----------------------------------------------------------------------------
create table if not exists public.warehouse_deployments (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid references public.warehouses (id) on delete set null,
  factory_address text not null,
  chain_id bigint not null,
  owner_address text not null,
  warehouse_code_hash text not null,
  deployment_nonce bigint not null,
  expiry bigint not null,
  signature text not null,
  status text not null default 'pending'
    check (status in ('pending', 'submitting', 'submitted', 'confirmed', 'failed')),
  tx_hash text,
  error text,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint warehouse_deployments_code_hash_not_blank check (btrim(warehouse_code_hash) <> '')
);

comment on table public.warehouse_deployments is
  'Lifecycle deployment warehouse via Factory (EIP-712). idempotency_key (TTL 24 jam) != deploymentNonce on-chain (PRD §7.5, Invariant D).';

-- Idempotency: satu idempotencyKey hanya boleh dipakai sekali (PRD §32).
create unique index if not exists warehouse_deployments_idempotency_key_idx
  on public.warehouse_deployments (idempotency_key);

create index if not exists warehouse_deployments_warehouse_idx
  on public.warehouse_deployments (warehouse_id);

create index if not exists warehouse_deployments_owner_idx
  on public.warehouse_deployments (owner_address);

drop trigger if exists warehouse_deployments_set_updated_at on public.warehouse_deployments;
create trigger warehouse_deployments_set_updated_at
  before update on public.warehouse_deployments
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------
-- 4. RLS
-- ----------------------------------------------------------------------------
alter table public.wallets enable row level security;
alter table public.warehouses enable row level security;
alter table public.warehouse_deployments enable row level security;

-- wallets: SELECT hanya milik sendiri. Mutasi (INSERT via sync wallet flow,
-- UPDATE verify/primary) lewat fungsi security definer di atas / server flow.
drop policy if exists wallets_select_own on public.wallets;
create policy "wallets_select_own"
  on public.wallets
  for select
  to authenticated
  using (auth.uid() = user_id);

-- warehouses: SELECT milik sendiri (owner). SELECT untuk member lain dibuka
-- di migration 0004 saat tabel memberships ada (defense-in-depth, bukan
-- selamanya deny).
drop policy if exists warehouses_select_own on public.warehouses;
create policy "warehouses_select_own"
  on public.warehouses
  for select
  to authenticated
  using (auth.uid() = owner_user_id);

-- warehouse_deployments: SELECT untuk owner warehouse terkait saja.
drop policy if exists warehouse_deployments_select_own on public.warehouse_deployments;
create policy "warehouse_deployments_select_own"
  on public.warehouse_deployments
  for select
  to authenticated
  using (
    exists (
      select 1 from public.warehouses w
      where w.id = warehouse_deployments.warehouse_id
        and w.owner_user_id = auth.uid()
    )
  );

-- INSERT warehouse hanya terjadi via create-warehouse server flow yang
-- memvalidasi EIP-712 + relay; policy dibuat ketat: hanya sebagai milik
-- sendiri. UPDATE status (suspend) oleh owner, di 0004 ditambah guard
-- membership. INSERT/UPDATE/DELETE deployment: deny by default (hanya
-- server flow / fungsi security definer).
drop policy if exists warehouses_insert_own on public.warehouses;
create policy "warehouses_insert_own"
  on public.warehouses
  for insert
  to authenticated
  with check (auth.uid() = owner_user_id);

drop policy if exists warehouses_update_own on public.warehouses;
create policy "warehouses_update_own"
  on public.warehouses
  for update
  to authenticated
  using (auth.uid() = owner_user_id)
  with check (auth.uid() = owner_user_id);

-- ----------------------------------------------------------------------------
-- 5. GRANT eksplisit (Data API).
-- ----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;

grant select on table public.wallets to authenticated;
grant select, insert, update on table public.warehouses to authenticated;
grant select on table public.warehouse_deployments to authenticated;

grant execute on function public.verify_wallet(uuid) to authenticated;
grant execute on function public.register_wallet(text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- 6. Realtime (whitelist eksplisit, ARSITEKTUR §6).
-- ----------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'wallets'
  ) then
    alter publication supabase_realtime add table public.wallets;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'warehouses'
  ) then
    alter publication supabase_realtime add table public.warehouses;
  end if;
end;
$$;