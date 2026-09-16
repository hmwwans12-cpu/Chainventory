-- ============================================================================
-- Chainventory — 0060: sinkron DB pasca transferOwnership on-chain
-- (temuan audit #4 — alur ownership transfer end-to-end)
-- ============================================================================
-- Masalah: kontrak Warehouse.transferOwnership() SUDAH ada (onlyOwner +
-- callback factory.onOwnershipTransfer), dan transfer off-chain untuk
-- warehouse deployed DIBLOKIR dengan benar (Fix A5) — tetapi tidak ada
-- jalan untuk menyelesaikan transfer on-chain: tidak ada UI signing,
-- tidak ada verifikasi tx, tidak ada sinkron owner_user_id /
-- on_chain_owner_wallet / role membership. Owner warehouse deployed yang
-- mau keluar praktis terblokir di layer produk.
--
-- Desain (mengikuti pola transfer_ownership off-chain 0014):
--   1. Owner lama tanda tangan transferOwnership(newOwnerWallet) dari
--      wallet-nya via Privy (client) → txHash.
--   2. BFF verifikasi tx on-chain (to == kontrak, fungsi tepat, from ==
--      on_chain_owner_wallet DB pra-transfer, newOwner == wallet primary
--      verified milik member target, plus post-condition owner() pasca-tx
--      == wallet target) — lihat lib/blockchain/ownership-proof.ts
--      (resolveOwnershipTransferExpectation; fix P0-1 audit §10.1:
--      owner() pasca-mined adalah owner BARU, jangan dipakai sebagai
--      ekspektasi `from`).
--   3. RPC ini melakukan sinkron DB atomik. Verifikasi on-chain TIDAK
--      dilakukan di sini (RPC tak bisa panggil chain) — route handler
--      yang menjaminnya sebelum memanggil (fail-closed: tanpa itu, RPC
--      tidak pernah dipanggil).
--
-- Guard di RPC (defense-in-depth bila handler di-bypass):
--   - caller = OWNER saat ini (state DB pra-transfer),
--   - warehouse deployed (contract_address NOT NULL),
--   - target member ACTIVE dan bukan caller,
--   - target punya primary wallet VERIFIED (samakan dengan hasil verifikasi
--     handler; cegah lockout ke alamat tak terkendali),
--   - idempoten: bila owner_user_id sudah == target, no-op sukses
--     (aman untuk retry setelah sukses yang responsnya hilang).
-- Efek: memberships target → OWNER, lama → MANAGER; warehouses.owner_user_id
-- + on_chain_owner_wallet = target; audit log. Notifikasi ikut via trigger
-- yang sama dengan jalur off-chain (tidak diduplikasi di sini).
-- ============================================================================

create or replace function public.confirm_ownership_transfer(
  p_warehouse_id uuid,
  p_new_owner_id uuid,
  p_tx_hash text
)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_actor_id uuid := auth.uid();
  v_target public.memberships;
  v_target_wallet text;
  v_warehouse public.warehouses;
  v_actor_name text;
  v_new_owner_name text;
  v_wh_name text;
begin
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

comment on function public.confirm_ownership_transfer(uuid, uuid, text) is
  'Sinkron DB pasca transferOwnership on-chain: caller harus owner lama; target member ACTIVE ber-wallet verified; idempoten bila sudah tercatat.';

revoke all on function public.confirm_ownership_transfer(uuid, uuid, text) from public;
grant execute on function public.confirm_ownership_transfer(uuid, uuid, text) to authenticated;
