-- ============================================================================
-- Chainventory - 0036: intent hardening (audit P1-03/P1-04/P1-06)
-- ============================================================================
-- P1-03: wallet WAJIB verification_state = verified
-- P1-04: qty/type divalidasi SEBELUM user membayar gas
-- P1-06: payload_hash dibandingkan saat idempotent replay
-- ============================================================================

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
  p_payload_hash text
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
    idempotency_key, payload, payload_hash
  )
  VALUES (
    p_id, p_warehouse_id, p_product_id, auth.uid(), LOWER(p_actor_wallet),
    p_movement_type, p_quantity, p_expected_balance_version, p_reason,
    p_reference, p_idempotency_key, p_payload, p_payload_hash
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