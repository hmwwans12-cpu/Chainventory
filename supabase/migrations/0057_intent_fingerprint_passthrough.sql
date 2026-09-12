-- ============================================================================
-- Chainventory - 0057: intent fingerprint passthrough (live-test 2026-09-12)
-- ============================================================================
-- Root cause: 0040 mewajibkan request_fingerprint saat idempotency_key ada
-- di apply_stock_movement, tetapi commit_user_paid_stock_intent (0055)
-- memanggilnya TANPA fingerprint -> SETIAP finalize intent user-paid gagal
-- permanen ("request fingerprint is required when idempotency key is
-- provided"), sehingga Stock In/Out manual tidak pernah commit.
--
-- Fix: simpan fingerprint kanonis di stock_intents saat create (dihitung BFF
-- via lib/inventory/fingerprint.ts, format canonical yang SAMA dengan jalur
-- movements langsung), lalu teruskan saat commit. Additive murni untuk
-- caller: param baru DEFAULT NULL; guard 0040 tetap otoritatif di DB.
-- ============================================================================

-- 1. Kolom fingerprint di intents -------------------------------------------
ALTER TABLE public.stock_intents
  ADD COLUMN IF NOT EXISTS request_fingerprint text;

COMMENT ON COLUMN public.stock_intents.request_fingerprint IS
  'Canonical request fingerprint (lib/inventory/fingerprint.ts), diteruskan ke apply_stock_movement saat commit (0057).';

-- 2. create: terima + simpan fingerprint ------------------------------------
-- DROP dulu agar tidak tersisa overload signature lama (param baru).
DROP FUNCTION IF EXISTS public.create_user_paid_stock_intent(uuid, uuid, uuid, text, numeric, bigint, text, text, text, text, jsonb, text);

CREATE OR REPLACE FUNCTION public.create_user_paid_stock_intent(
  p_id uuid,
  p_warehouse_id uuid,
  p_product_id uuid,
  p_movement_type text,
  p_quantity numeric,
  p_expected_balance_version bigint,
  p_reason text,
  p_reference text,
  p_actor_wallet text,
  p_idempotency_key text,
  p_payload jsonb,
  p_payload_hash text,
  p_request_fingerprint text DEFAULT NULL::text
)
 RETURNS stock_intents
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_role text;
  v_intent public.stock_intents;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED';
  END IF;

  -- P1-04: validasi SEBELUM wallet transaction.
  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RAISE EXCEPTION 'INVALID_QUANTITY' USING ERRCODE = '22023';
  END IF;

  IF p_movement_type NOT IN ('stock_in', 'stock_out') THEN
    RAISE EXCEPTION 'INVALID_MOVEMENT_TYPE' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.warehouses
    WHERE id = p_warehouse_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  v_role := private.member_role(p_warehouse_id, auth.uid());
  IF v_role NOT IN ('OWNER', 'MANAGER', 'STAFF') THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;

  -- P1-03: wallet harus milik user DAN verified.
  IF NOT EXISTS (
    SELECT 1 FROM public.wallets
    WHERE user_id = auth.uid()
      AND LOWER(address) = LOWER(p_actor_wallet)
      AND verification_state = 'verified'
  ) THEN
    RAISE EXCEPTION 'WALLET_NOT_VERIFIED' USING ERRCODE = '28000';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.products
    WHERE id = p_product_id
      AND warehouse_id = p_warehouse_id
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;

  SELECT * INTO v_intent
  FROM public.stock_intents
  WHERE actor_user_id = auth.uid()
    AND idempotency_key = p_idempotency_key;

  IF found THEN
    -- P1-06: payload_hash dibandingkan - same key + different payload = conflict.
    IF v_intent.payload_hash <> p_payload_hash THEN
      RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE = '23505';
    END IF;
    RETURN v_intent;
  END IF;

  INSERT INTO public.stock_intents (
    id, warehouse_id, product_id, actor_user_id, actor_wallet,
    movement_type, quantity, expected_balance_version, reason, reference,
    idempotency_key, payload, payload_hash, request_fingerprint
  )
  VALUES (
    p_id, p_warehouse_id, p_product_id, auth.uid(), LOWER(p_actor_wallet),
    p_movement_type, p_quantity, p_expected_balance_version, p_reason,
    p_reference, p_idempotency_key, p_payload, p_payload_hash,
    p_request_fingerprint
  )
  ON CONFLICT (actor_user_id, idempotency_key) DO NOTHING
  RETURNING * INTO v_intent;

  IF NOT FOUND THEN
    SELECT * INTO v_intent
    FROM public.stock_intents
    WHERE actor_user_id = auth.uid()
      AND idempotency_key = p_idempotency_key;
  END IF;

  RETURN v_intent;
END;
$function$;

revoke all on function public.create_user_paid_stock_intent(uuid, uuid, uuid, text, numeric, bigint, text, text, text, text, jsonb, text, text) from public;
grant execute on function public.create_user_paid_stock_intent(uuid, uuid, uuid, text, numeric, bigint, text, text, text, text, jsonb, text, text) to authenticated;

-- 3. commit: teruskan fingerprint tersimpan ke apply --------------------------
-- Body identik 0055 (NBE-10 composite conflict intact), satu-satunya beda:
-- argumen terakhir apply_stock_movement = v_intent.request_fingerprint.
CREATE OR REPLACE FUNCTION public.commit_user_paid_stock_intent(p_id uuid)
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
  select * into v_result from public.apply_stock_movement(v_intent.warehouse_id, v_intent.product_id, v_intent.movement_type, v_intent.quantity, v_intent.expected_balance_version, v_intent.reason, v_intent.reference, null, v_intent.idempotency_key, v_intent.actor_wallet, v_intent.id, null, null, v_intent.request_fingerprint);
  if v_result.error_code is not null and v_result.error_code <> 'IDEMPOTENT' then
    update public.stock_intents set status='failed', error=v_result.message, updated_at=now() where id=p_id;
    return query select null::uuid, v_result.balance_version, v_result.error_code, v_result.message; return;
  end if;
  -- NBE-10: target komposit (warehouse_id, payload_hash) sesuai
  -- proofs_warehouse_hash_unique_idx (0047).
  insert into public.proofs (warehouse_id, warehouse_address, movement_id, payload, payload_version, payload_hash, status, tx_hash, confirmation_count)
  select v_intent.warehouse_id, lower(w.contract_address), v_intent.id, v_intent.payload, 2, v_intent.payload_hash, 'confirmed', v_intent.tx_hash, 1
  from public.warehouses w where w.id = v_intent.warehouse_id
  on conflict (warehouse_id, payload_hash) do nothing;
  update public.stock_intents set status='committed', updated_at=now() where id=p_id;
  perform private.write_audit(v_intent.warehouse_id, auth.uid(), 'stock_movement_committed', 'stock_movements', v_intent.id::text, null, jsonb_build_object('tx_hash', v_intent.tx_hash), v_intent.tx_hash, 'confirmed');
  return query select v_intent.id, v_result.balance_version, null::text, 'ok';
end; $$;
