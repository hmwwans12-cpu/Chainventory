-- ============================================================================
-- Chainventory — 0061: RPC trust-boundary hardening (audit v3 full-stack)
-- ============================================================================
-- Akar masalah (v2 + v3): verifikasi berat terjadi di Next.js route,
-- sedangkan RPC SECURITY DEFINER yang di-GRANT ke `authenticated` tidak
-- menegakkan ulang — sehingga pemanggilan RPC langsung via Data API
-- mem-bypass route (termasuk rate-limit route).
--
-- Isi migration ini (additive, idempotent-friendly):
--   1. transfer_ownership — tolak warehouse yang SUDAH deployed
--      (contract_address not null). Fix A5 sebelumnya hanya ada di route
--      handler; RPC-nya sendiri buta deployment → divergensi permanen
--      off-chain ≠ on-chain via 2 UUID (v3 §2, prioritas #1).
--   2. verify_wallet — EXECUTE service_role saja + param p_user_id.
--      Sebelumnya user mana pun bisa menandai wallet miliknya verified
--      tanpa bukti kriptografis (route /api/wallets/verify membuktikan
--      personal_sign; RPC tidak). Route kini memanggil via service
--      client setelah verifikasi signature (v2 §2.2).
--   3. set_warehouse_contract_address — validasi format 0x + 40 hex dan
--      one-way latch (tolak overwrite bila sudah tercatat). Sebelumnya
--      owner bisa menulis address bebas berulang kali (v2 §2.3). Route
--      finalizeIfMined hanya memanggil saat kosong dengan address hasil
--      konfirmasi on-chain, jadi latch tidak merusak alur sah.
--   4. proof_retry — EXECUTE service_role saja + param p_actor_user_id
--      (pola proof_manual_retry 0021 yang sudah benar). Sebelumnya member
--      mana pun (termasuk Viewer) bisa retry proof tanpa allowlist,
--      regresi dari fix C-09 yang hanya ditempel di route (v3 §4).
--   5. confirm_ownership_transfer — EXECUTE service_role saja + param
--      p_actor_user_id. Sebelumnya owner bisa memanggil langsung dengan
--      tx_hash sembarang (tanpa verifikasi on-chain route) sekaligus
--      mem-bypass rate-limit ownership-transfer (v2 §2.1).
--
-- CATATAN DEPLOY: fungsi yang berubah signature (2, 4, 5) di-DROP dulu
-- agar signature lama yang longgar tidak tetap callable. Route pemanggil
-- diperbarui di commit yang sama (service client + param actor).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. transfer_ownership — guard deployed (Fix A5 pindah ke DB)
-- ----------------------------------------------------------------------------
create or replace function public.transfer_ownership(p_warehouse_id uuid, p_new_owner_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_actor_id uuid := auth.uid();
  v_actor_role text;
  v_target public.memberships;
  v_actor_name text;
  v_new_owner_name text;
  v_wh_name text;
begin
  if v_actor_id is null then
    raise exception 'not authenticated';
  end if;

  if p_new_owner_id = v_actor_id then
    raise exception 'already the owner';
  end if;

  perform private.ensure_warehouse_active(p_warehouse_id);

  -- v3 §2 (Fix A5 di level DB): warehouse yang sudah deployed punya owner
  -- on-chain (Warehouse.owner + Factory.activeWarehouse). Transfer off-chain
  -- murni bikin divergen permanen off-chain ≠ on-chain (ARSITEKTUR §4.4/§5).
  -- Guard identik sebelumnya hanya ada di route handler; RPC yang di-GRANT
  -- ke authenticated harus menegakkannya sendiri.
  if exists (
    select 1 from public.warehouses
    where id = p_warehouse_id and contract_address is not null
  ) then
    raise exception 'warehouse_deployed_use_onchain_transfer';
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

  -- Notifikasi: owner baru + owner lama.
  select coalesce(display_name, split_part(email, '@', 1), 'Pengguna') into v_actor_name
  from public.users where id = v_actor_id;
  select coalesce(display_name, split_part(email, '@', 1), 'Pengguna') into v_new_owner_name
  from public.users where id = p_new_owner_id;
  select name into v_wh_name from public.warehouses where id = p_warehouse_id;
  perform private.write_notification(
    p_new_owner_id, p_warehouse_id, 'ownership_transferred',
    'Kepemilikan warehouse',
    format('Kamu kini pemilik %s (dialihkan oleh %s)', v_wh_name, v_actor_name),
    jsonb_build_object('warehouse_id', p_warehouse_id, 'previous_owner', v_actor_id),
    'ownership:' || p_warehouse_id::text
  );
  perform private.write_notification(
    v_actor_id, p_warehouse_id, 'ownership_transferred',
    'Kepemilikan warehouse',
    format('Kepemilikan %s berpindah ke %s', v_wh_name, v_new_owner_name),
    jsonb_build_object('warehouse_id', p_warehouse_id, 'new_owner', p_new_owner_id),
    'ownership:' || p_warehouse_id::text
  );
end;
$function$;

comment on function public.transfer_ownership(uuid, uuid) is
  'Transfer ownership off-chain (warehouse BELUM deployed). Menolak warehouse deployed (gunakan jalur on-chain + confirm_ownership_transfer). Caller harus OWNER, target member ACTIVE.';

-- ----------------------------------------------------------------------------
-- 2. verify_wallet — service_role saja (v2 §2.2)
-- ----------------------------------------------------------------------------
drop function if exists public.verify_wallet(uuid);

create or replace function public.verify_wallet(p_wallet_id uuid, p_user_id uuid)
returns public.wallets
language plpgsql
security definer set search_path = public
as $$
declare
  v_wallet public.wallets;
begin
  -- v3: hanya service_role yang boleh EXECUTE (lihat GRANT di bawah).
  -- Bukti kriptografis (personal_sign) diverifikasi route
  -- /api/wallets/verify SEBELUM memanggil; RPC mengikat hasil ke user
  -- yang sudah dibuktikan route tersebut. Tanpa ini, user bisa menandai
  -- wallet miliknya verified tanpa signature apa pun.
  if p_user_id is null then
    raise exception 'user required';
  end if;

  update public.wallets
    set verification_state = 'verified',
        verified_at = now(),
        updated_at = now()
  where id = p_wallet_id
    and user_id = p_user_id
  returning * into v_wallet;

  if v_wallet is null then
    raise exception 'wallet not found or not owned';
  end if;

  return v_wallet;
end;
$$;

comment on function public.verify_wallet(uuid, uuid) is
  'Tandai wallet verified. EXECUTE hanya service_role; route membuktikan personal_sign dulu lalu mengikat ke user id.';

revoke all on function public.verify_wallet(uuid, uuid) from public;
revoke all on function public.verify_wallet(uuid, uuid) from anon;
revoke all on function public.verify_wallet(uuid, uuid) from authenticated;
grant execute on function public.verify_wallet(uuid, uuid) to service_role;

-- ----------------------------------------------------------------------------
-- 3. set_warehouse_contract_address — format + one-way latch (v2 §2.3)
-- ----------------------------------------------------------------------------
create or replace function public.set_warehouse_contract_address(
  p_warehouse_id uuid,
  p_contract_address text
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'not authenticated';
  end if;

  -- v3: tolak address sembarang (sebelumnya string bebas apa pun diterima).
  if p_contract_address !~* '^0x[0-9a-f]{40}$' then
    raise exception 'invalid contract address';
  end if;

  if not exists (
    select 1 from public.warehouses
    where id = p_warehouse_id and owner_user_id = v_user_id
  ) then
    raise exception 'not owner of warehouse';
  end if;

  perform set_config('app.allow_identity_write', 'true', true);

  -- v3: one-way latch — address tercatat sekali, tidak bisa di-overwrite
  -- ke kontrak lain (sebelumnya bisa ditulis ulang bebas). Alur sah
  -- (finalizeIfMined) hanya memanggil saat kolom masih kosong.
  update public.warehouses
    set contract_address = lower(p_contract_address), updated_at = now()
  where id = p_warehouse_id and contract_address is null;

  if not found then
    raise exception 'contract address already recorded';
  end if;
end;
$$;

comment on function public.set_warehouse_contract_address(uuid, text) is
  'Catat alamat kontrak pasca-deploy: format 0x+40hex, owner-only, one-way latch (tidak bisa overwrite).';

-- ----------------------------------------------------------------------------
-- 4. proof_retry — service_role saja (v3 §4, pola proof_manual_retry)
-- ----------------------------------------------------------------------------
drop function if exists public.proof_retry(uuid);

create or replace function public.proof_retry(p_proof_id uuid, p_actor_user_id uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_wh uuid;
  v_status text;
begin
  -- v3 §4: hanya service_role yang boleh EXECUTE (lihat GRANT di bawah).
  -- Gate allowlist developer ditegakkan route pemanggil (blockchain/proofs
  -- action=retry via getConsoleActor); RPC mempertahankan invarian member
  -- + audit actor, mencontoh proof_manual_retry (0021). Sebelumnya member
  -- mana pun (termasuk Viewer) bisa retry langsung tanpa allowlist.
  if p_actor_user_id is null then
    raise exception 'actor required';
  end if;

  select warehouse_id, status into v_wh, v_status
  from public.proofs
  where id = p_proof_id;

  if v_wh is null then
    raise exception 'proof not found';
  end if;

  if private.member_role(v_wh, p_actor_user_id) is null then
    raise exception 'not a member';
  end if;

  if v_status not in ('failed', 'retrying') then
    raise exception 'proof not retryable';
  end if;

  update public.proofs
    set status = 'pending', error = null, updated_at = now()
  where id = p_proof_id;

  update public.proof_outbox
    set status = 'pending', error = null, next_attempt_at = now(),
        lease_token = null, lease_expires_at = null, updated_at = now()
  where proof_id = p_proof_id;

  perform private.write_audit(
    v_wh, p_actor_user_id, 'proof_retry', 'proofs', p_proof_id::text,
    null, jsonb_build_object('from', v_status), null, 'pending'
  );
end;
$$;

comment on function public.proof_retry(uuid, uuid) is
  'Kembalikan proof failed/retrying ke antrian. EXECUTE hanya service_role; route gate allowlist developer. manual_review TIDAK retry-able. Attempt count dipertahankan.';

revoke all on function public.proof_retry(uuid, uuid) from public;
revoke all on function public.proof_retry(uuid, uuid) from anon;
revoke all on function public.proof_retry(uuid, uuid) from authenticated;
grant execute on function public.proof_retry(uuid, uuid) to service_role;

-- ----------------------------------------------------------------------------
-- 5. confirm_ownership_transfer — service_role saja (v2 §2.1)
-- ----------------------------------------------------------------------------
drop function if exists public.confirm_ownership_transfer(uuid, uuid, text);

create or replace function public.confirm_ownership_transfer(
  p_warehouse_id uuid,
  p_new_owner_id uuid,
  p_tx_hash text,
  p_actor_user_id uuid
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_actor_id uuid := p_actor_user_id;
  v_target public.memberships;
  v_target_wallet text;
  v_actor_name text;
  v_new_owner_name text;
  v_wh_name text;
  v_warehouse public.warehouses;
begin
  -- v3: hanya service_role yang boleh EXECUTE (lihat GRANT di bawah).
  -- Verifikasi on-chain (tx valid milik owner lama, target = wallet
  -- verified member) dilakukan route transfer_confirm SEBELUM memanggil;
  -- RPC mempertahankan semua guard DB 0060. Sebelumnya owner bisa
  -- memanggil langsung dengan tx_hash sembarang sekaligus mem-bypass
  -- rate-limit ownership-transfer di route.
  if v_actor_id is null then
    raise exception 'not authenticated';
  end if;

  select * into v_warehouse
  from public.warehouses
  where id = p_warehouse_id;

  if v_warehouse is null then
    raise exception 'warehouse not found';
  end if;

  if v_warehouse.contract_address is null then
    raise exception 'warehouse is not deployed on-chain';
  end if;

  if v_warehouse.owner_user_id <> v_actor_id then
    raise exception 'only owner can confirm ownership transfer';
  end if;

  if p_new_owner_id = v_actor_id then
    raise exception 'already the owner';
  end if;

  -- Idempoten: transfer sudah tercatat (retry pasca-sukses).
  if v_warehouse.owner_user_id = p_new_owner_id then
    return;
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

  select address into v_target_wallet
  from public.wallets
  where user_id = p_new_owner_id
    and is_primary
    and verification_state = 'verified';

  if v_target_wallet is null then
    raise exception 'target has no verified primary wallet';
  end if;

  update public.memberships
    set role = 'OWNER', updated_at = now()
  where id = v_target.id;

  update public.memberships
    set role = 'MANAGER', updated_at = now()
  where warehouse_id = p_warehouse_id and user_id = v_actor_id;

  -- Tulis identitas seperti 0014: buka GUC milik server flow agar guard
  -- `enforce_warehouse_identity_immutable` mengizinkannya.
  perform set_config('app.allow_identity_write', 'true', true);

  update public.warehouses
    set owner_user_id = p_new_owner_id,
        on_chain_owner_wallet = lower(v_target_wallet)
  where id = p_warehouse_id;

  -- Notifikasi: sama seperti jalur off-chain (0020) agar kedua jalur
  -- menghasilkan pengalaman identik bagi owner baru + lama.
  select coalesce(display_name, split_part(email, '@', 1), 'Pengguna') into v_actor_name
  from public.users where id = v_actor_id;
  select coalesce(display_name, split_part(email, '@', 1), 'Pengguna') into v_new_owner_name
  from public.users where id = p_new_owner_id;
  select name into v_wh_name from public.warehouses where id = p_warehouse_id;
  perform private.write_notification(
    p_new_owner_id, p_warehouse_id, 'ownership_transferred',
    'Kepemilikan warehouse',
    format('Kamu kini pemilik %s (dialihkan oleh %s)', v_wh_name, v_actor_name),
    jsonb_build_object('warehouse_id', p_warehouse_id, 'previous_owner', v_actor_id, 'tx_hash', p_tx_hash),
    'ownership:' || p_warehouse_id::text
  );
  perform private.write_notification(
    v_actor_id, p_warehouse_id, 'ownership_transferred',
    'Kepemilikan warehouse',
    format('Kepemilikan %s berpindah ke %s', v_wh_name, v_new_owner_name),
    jsonb_build_object('warehouse_id', p_warehouse_id, 'new_owner', p_new_owner_id, 'tx_hash', p_tx_hash),
    'ownership:' || p_warehouse_id::text
  );

  perform private.write_audit(
    p_warehouse_id, v_actor_id, 'ownership_transferred',
    'warehouses', p_warehouse_id::text, null,
    jsonb_build_object('tx_hash', p_tx_hash, 'new_owner_id', p_new_owner_id),
    p_tx_hash, 'confirmed'
  );
end;
$$;

comment on function public.confirm_ownership_transfer(uuid, uuid, text, uuid) is
  'Sinkron DB pasca transferOwnership on-chain: EXECUTE hanya service_role; route sudah verifikasi tx. Caller (actor) harus owner lama; target member ACTIVE ber-wallet verified; idempoten bila sudah tercatat.';

revoke all on function public.confirm_ownership_transfer(uuid, uuid, text, uuid) from public;
revoke all on function public.confirm_ownership_transfer(uuid, uuid, text, uuid) from anon;
revoke all on function public.confirm_ownership_transfer(uuid, uuid, text, uuid) from authenticated;
grant execute on function public.confirm_ownership_transfer(uuid, uuid, text, uuid) to service_role;
