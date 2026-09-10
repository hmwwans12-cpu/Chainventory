-- ============================================================================
-- Chainventory — 0055: intent proof ON CONFLICT scope (audit segar NBE-10)
-- ============================================================================
-- Bug: 0047 (H-01) menghapus constraint global proofs_payload_hash_unique
-- dan menggantinya dengan index unik komposit (warehouse_id, payload_hash)
-- (proofs_warehouse_hash_unique_idx). Tetapi commit_user_paid_stock_intent
-- (0024) masih memakai `ON CONFLICT (payload_hash) DO NOTHING` — tidak ada
-- lagi constraint yang cocok sehingga Postgres melempar
-- "there is no unique or exclusion constraint matching the ON CONFLICT
-- specification" dan SETIAP finalize intent gagal 500 permanen.
--
-- Fix: sesuaikan target konflik ke komposit (warehouse_id, payload_hash).
-- v_intent.warehouse_id selalu ada (kolom NOT NULL). Additive murni:
-- CREATE OR REPLACE function yang sama, tanpa ubah signature/grants.
-- ============================================================================

create or replace function public.commit_user_paid_stock_intent(p_id uuid)
returns table (movement_id uuid, balance_version bigint, error_code text, message text)
language plpgsql security definer set search_path = public as $$
declare v_intent public.stock_intents; v_result record;
begin
  select * into v_intent from public.stock_intents where id = p_id and actor_user_id = auth.uid() for update;
  if not found then return query select null::uuid, null::bigint, 'NOT_FOUND', 'intent not found'; return; end if;
  if v_intent.status = 'committed' then
    return query select v_intent.id, coalesce((select version from public.inventory_balances where warehouse_id=v_intent.warehouse_id and product_id=v_intent.product_id), 0), null::text, 'already committed'; return;
  end if;
  if v_intent.status <> 'submitted' then return query select null::uuid, null::bigint, 'INTENT_NOT_ACTIVE', 'intent not submitted'; return; end if;
  select * into v_result from public.apply_stock_movement(v_intent.warehouse_id, v_intent.product_id, v_intent.movement_type, v_intent.quantity, v_intent.expected_balance_version, v_intent.reason, v_intent.reference, null, v_intent.idempotency_key, v_intent.actor_wallet, v_intent.id, null, null);
  if v_result.error_code is not null and v_result.error_code <> 'IDEMPOTENT' then
    update public.stock_intents set status='failed', error=v_result.message, updated_at=now() where id=p_id;
    return query select null::uuid, v_result.balance_version, v_result.error_code, v_result.message; return;
  end if;
  -- NBE-10: target komposit (warehouse_id, payload_hash) sesuai
  -- proofs_warehouse_hash_unique_idx (0047). Versi lama (payload_hash)
  -- melempar "no unique constraint matching" di setiap finalize.
  insert into public.proofs (warehouse_id, warehouse_address, movement_id, payload, payload_version, payload_hash, status, tx_hash, confirmation_count)
  select v_intent.warehouse_id, lower(w.contract_address), v_intent.id, v_intent.payload, 2, v_intent.payload_hash, 'confirmed', v_intent.tx_hash, 1
  from public.warehouses w where w.id = v_intent.warehouse_id
  on conflict (warehouse_id, payload_hash) do nothing;
  update public.stock_intents set status='committed', updated_at=now() where id=p_id;
  perform private.write_audit(v_intent.warehouse_id, auth.uid(), 'stock_movement_committed', 'stock_movements', v_intent.id::text, null, jsonb_build_object('tx_hash', v_intent.tx_hash), v_intent.tx_hash, 'confirmed');
  return query select v_intent.id, v_result.balance_version, null::text, 'ok';
end; $$;
