-- ============================================================================
-- Chainventory - 0040: idempotency fingerprint WAJIB + backfill legacy
-- (audit 0.1.6 P1-01a / P1-01b)
-- ============================================================================
-- P1-01a: sebelumnya fingerprint optional -- caller langsung ke RPC dapat
--         mengirim key sama dengan fingerprint NULL dan mendapat IDEMPOTENT
--         palsu. Kini: key ada tanpa fingerprint -> INVALID_INPUT; compare
--         strict IS DISTINCT FROM (existing NULL pun -> CONFLICT).
-- P1-01b: backfill request_fingerprint untuk baris legacy (key ada, fp NULL).
--         Format canonical SAMA dengan lib/inventory/fingerprint.ts:
--           [warehouseId, productId, movementType, quantity(normalized),
--            expectedBalanceVersion|'', reason|'', reference|'',
--            reversalOf|'', actor_wallet lower|''] di-join chr(1), sha256 hex.
--         Catatan: quantity di-normalize (strip trailing zero/dot) karena
--         kolom numeric(24,3); separator chr(1) dipakai karena PG text
--         melarang NUL -- fingerprint hasil backfill bersifat sintetis;
--         retry atas key sangat lama dapat CONFLICT (arah aman).
-- Plus:   CHECK constraint agar invariant terjaga di level DB:
--           idempotency_key IS NULL OR request_fingerprint IS NOT NULL
-- Signature TIDAK berubah (create or replace; grants tetap).
-- ============================================================================

-- 1. Backfill legacy rows (SEBELUM constraint) -------------------------------
UPDATE public.stock_movements sm
SET request_fingerprint = encode(
      sha256(convert_to(array_to_string(ARRAY[
        sm.warehouse_id::text,
        sm.product_id::text,
        sm.movement_type,
        trim(trailing '.' from trim(trailing '0' from sm.quantity::text)),
        COALESCE(sm.expected_balance_version::text, ''),
        COALESCE(sm.reason, ''),
        COALESCE(sm.reference, ''),
        COALESCE(sm.reversal_of::text, ''),
        COALESCE(lower(sm.actor_wallet), '')
      ], chr(1)), 'UTF8')),
    'hex')
WHERE sm.idempotency_key IS NOT NULL
  AND sm.request_fingerprint IS NULL;

-- 2. Invariant di level DB ---------------------------------------------------
ALTER TABLE public.stock_movements
  DROP CONSTRAINT IF EXISTS stock_movements_fingerprint_required;

ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_fingerprint_required
  CHECK (idempotency_key IS NULL OR request_fingerprint IS NOT NULL);

-- 3. RPC: fingerprint wajib saat key ada + strict compare --------------------
CREATE OR REPLACE FUNCTION public.apply_stock_movement(
  p_warehouse_id uuid,
  p_product_id uuid,
  p_movement_type text,
  p_quantity numeric,
  p_expected_balance_version bigint DEFAULT NULL::bigint,
  p_reason text DEFAULT NULL::text,
  p_reference text DEFAULT NULL::text,
  p_reversal_of uuid DEFAULT NULL::uuid,
  p_idempotency_key text DEFAULT NULL::text,
  p_actor_wallet text DEFAULT NULL::text,
  p_movement_id uuid DEFAULT NULL::uuid,
  p_proof_payload jsonb DEFAULT NULL::jsonb,
  p_proof_payload_hash text DEFAULT NULL::text,
  p_request_fingerprint text DEFAULT NULL::text
)
 RETURNS TABLE(movement_id uuid, balance_version bigint, proof_pending boolean, error_code text, message text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text;
  v_product public.products;
  v_balance public.inventory_balances;
  v_existing public.stock_movements;
  v_movement_id uuid;
  v_inserted_id uuid;
  v_new_qty numeric;
  v_new_version bigint;
  v_original_qty numeric;
  v_original_type text;
  v_reversed_total numeric;
  v_wh_address text;
  v_proof_id uuid;
  v_proof_pending boolean;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, NULL::bigint, FALSE, 'UNAUTHENTICATED', 'not authenticated';
    RETURN;
  END IF;

  IF p_quantity IS NULL OR p_quantity <= 0 THEN
    RETURN QUERY SELECT NULL::uuid, NULL::bigint, FALSE, 'INVALID_INPUT',
           'quantity must be greater than zero';
    RETURN;
  END IF;

  -- P1-01a: key tanpa fingerprint ditolak (DB final authority, bukan BFF).
  IF p_idempotency_key IS NOT NULL AND p_request_fingerprint IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, NULL::bigint, FALSE, 'INVALID_INPUT',
           'request fingerprint is required when idempotency key is provided';
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.warehouses WHERE id = p_warehouse_id AND status = 'active') THEN
    RETURN QUERY SELECT NULL::uuid, NULL::bigint, FALSE, 'FORBIDDEN', 'warehouse is suspended';
    RETURN;
  END IF;

  v_role := private.member_role(p_warehouse_id, v_user_id);
  IF v_role IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, NULL::bigint, FALSE, 'FORBIDDEN', 'not a member of warehouse';
    RETURN;
  END IF;

  IF p_movement_type IN ('stock_in', 'stock_out') THEN
    IF v_role NOT IN ('STAFF', 'MANAGER', 'OWNER') THEN
      RETURN QUERY SELECT NULL::uuid, NULL::bigint, FALSE, 'FORBIDDEN', 'insufficient permission';
      RETURN;
    END IF;
  ELSIF p_movement_type IN ('adjustment', 'reversal') THEN
    IF v_role NOT IN ('MANAGER', 'OWNER') THEN
      RETURN QUERY SELECT NULL::uuid, NULL::bigint, FALSE, 'FORBIDDEN', 'insufficient permission';
      RETURN;
    END IF;
  ELSE
    RETURN QUERY SELECT NULL::uuid, NULL::bigint, FALSE, 'INVALID_INPUT', 'invalid movement type';
    RETURN;
  END IF;

  -- Idempotency pre-check (strict compare: IS DISTINCT FROM menutup
  -- kasus existing fingerprint NULL maupun payload berbeda).
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM public.stock_movements
    WHERE idempotency_key = p_idempotency_key
      AND warehouse_id = p_warehouse_id
    LIMIT 1;

    IF found THEN
      IF v_existing.request_fingerprint IS DISTINCT FROM p_request_fingerprint THEN
        RETURN QUERY SELECT NULL::uuid, NULL::bigint, FALSE, 'IDEMPOTENCY_CONFLICT',
               'idempotency key was already used for a different request';
        RETURN;
      END IF;

      RETURN QUERY
        SELECT v_existing.id,
               COALESCE((
                 SELECT version FROM public.inventory_balances
                 WHERE warehouse_id = p_warehouse_id AND product_id = v_existing.product_id
               ), 0),
               EXISTS(SELECT 1 FROM public.proofs WHERE proofs.movement_id = v_existing.id),
               'IDEMPOTENT', 'already processed';
      RETURN;
    END IF;
  END IF;

  -- Proof: payload/hash wajib menyertakan movement_id (BFF), warehouse deployed.
  IF p_proof_payload IS NOT NULL OR p_proof_payload_hash IS NOT NULL THEN
    IF p_movement_id IS NULL THEN
      RETURN QUERY SELECT NULL::uuid, NULL::bigint, FALSE, 'INVALID_INPUT', 'proof requires p_movement_id';
      RETURN;
    END IF;
    SELECT contract_address INTO v_wh_address
    FROM public.warehouses WHERE id = p_warehouse_id;
    IF v_wh_address IS NULL
       OR LOWER(COALESCE(p_proof_payload ->> 'warehouseAddress', '')) <> LOWER(v_wh_address)
       OR COALESCE(p_proof_payload ->> 'movementId', '') <> p_movement_id::text THEN
      RETURN QUERY SELECT NULL::uuid, NULL::bigint, FALSE, 'INVALID_INPUT',
        'proof requires a deployed warehouse and matching payload';
      RETURN;
    END IF;
  END IF;

  -- Lock ordering konsisten dengan archive_product:
  --   product FOR UPDATE -> balance FOR UPDATE
  SELECT * INTO v_product
  FROM public.products
  WHERE id = p_product_id AND warehouse_id = p_warehouse_id
  FOR UPDATE;

  IF v_product IS NULL THEN
    RETURN QUERY SELECT NULL::uuid, NULL::bigint, FALSE, 'NOT_FOUND', 'product not found or archived';
    RETURN;
  END IF;

  IF v_product.status <> 'active' THEN
    RETURN QUERY SELECT NULL::uuid, NULL::bigint, FALSE, 'NOT_FOUND', 'product is archived';
    RETURN;
  END IF;

  -- Reversal: target committed, product sama, cumulative reversal <= asli.
  IF p_movement_type = 'reversal' THEN
    IF p_reversal_of IS NULL THEN
      RETURN QUERY SELECT NULL::uuid, NULL::bigint, FALSE, 'INVALID_INPUT', 'reversal_of required';
      RETURN;
    END IF;

    SELECT movement_type INTO v_original_type
    FROM public.stock_movements
    WHERE id = p_reversal_of AND product_id = p_product_id AND status = 'committed';

    IF v_original_type IS NULL OR v_original_type NOT IN ('stock_in', 'stock_out') THEN
      RETURN QUERY SELECT NULL::uuid, NULL::bigint, FALSE, 'INVALID_REVERSAL',
             'reversal target must be a committed stock_in or stock_out movement';
      RETURN;
    END IF;

    SELECT quantity INTO v_original_qty
    FROM public.stock_movements
    WHERE id = p_reversal_of
    FOR UPDATE;

    SELECT COALESCE(SUM(quantity), 0) INTO v_reversed_total
    FROM public.stock_movements
    WHERE reversal_of = p_reversal_of AND status = 'committed';

    IF v_reversed_total + p_quantity > v_original_qty THEN
      RETURN QUERY
        SELECT NULL::uuid, NULL::bigint, FALSE, 'INVALID_REVERSAL',
               FORMAT('reversal exceeds original quantity: already reversed %s of %s, tried %s',
                      v_reversed_total, v_original_qty, p_quantity);
      RETURN;
    END IF;
  END IF;

  v_new_version := 0;
  v_new_qty := 0;

  IF p_movement_type IN ('stock_in', 'stock_out', 'reversal') THEN
    SELECT * INTO v_balance
    FROM public.inventory_balances
    WHERE warehouse_id = p_warehouse_id AND product_id = p_product_id
    FOR UPDATE;

    IF v_balance IS NULL THEN
      INSERT INTO public.inventory_balances (warehouse_id, product_id, quantity, version, updated_by)
      VALUES (p_warehouse_id, p_product_id, 0, 0, v_user_id)
      ON CONFLICT (warehouse_id, product_id) DO NOTHING;

      SELECT * INTO v_balance
      FROM public.inventory_balances
      WHERE warehouse_id = p_warehouse_id AND product_id = p_product_id
      FOR UPDATE;
    END IF;

    IF p_expected_balance_version IS NOT NULL
       AND v_balance.version <> p_expected_balance_version THEN
      RETURN QUERY
        SELECT NULL::uuid, v_balance.version, FALSE, 'STALE_STOCK',
               FORMAT('expected version %s but current is %s', p_expected_balance_version, v_balance.version);
      RETURN;
    END IF;

    v_new_qty := v_balance.quantity;
    IF p_movement_type = 'stock_in' THEN
      v_new_qty := v_new_qty + p_quantity;
    ELSIF p_movement_type = 'stock_out' THEN
      IF v_balance.quantity < p_quantity THEN
        RETURN QUERY
          SELECT NULL::uuid, v_balance.version, FALSE, 'INSUFFICIENT_STOCK',
                 FORMAT('insufficient stock: have %s, need %s', v_balance.quantity, p_quantity);
        RETURN;
      END IF;
      v_new_qty := v_new_qty - p_quantity;
    ELSIF p_movement_type = 'reversal' THEN
      SELECT movement_type INTO v_original_type
      FROM public.stock_movements WHERE id = p_reversal_of;

      IF v_original_type = 'stock_out' THEN
        v_new_qty := v_new_qty + p_quantity;
      ELSE
        IF v_balance.quantity < p_quantity THEN
          RETURN QUERY
            SELECT NULL::uuid, v_balance.version, FALSE, 'INSUFFICIENT_STOCK',
                   FORMAT('insufficient stock to reverse: have %s, need %s', v_balance.quantity, p_quantity);
          RETURN;
        END IF;
        v_new_qty := v_new_qty - p_quantity;
      END IF;
    END IF;

    v_new_version := v_balance.version + 1;
  END IF;

  -- Race-safe insert: konflik tidak melempar error; re-select lalu jawab
  -- IDEMPOTENT / IDEMPOTENCY_CONFLICT.
  v_inserted_id := NULL;
  v_movement_id := COALESCE(p_movement_id, gen_random_uuid());

  INSERT INTO public.stock_movements (
    id, warehouse_id, product_id, movement_type, quantity,
    actor_user_id, actor_wallet, role_at_time, reason, reference,
    reversal_of, status, expected_balance_version, idempotency_key,
    request_fingerprint
  )
  VALUES (
    v_movement_id, p_warehouse_id, p_product_id, p_movement_type, p_quantity,
    v_user_id, p_actor_wallet, v_role, p_reason, p_reference,
    p_reversal_of,
    CASE WHEN p_movement_type = 'adjustment' THEN 'pending_approval' ELSE 'committed' END,
    CASE WHEN p_movement_type IN ('stock_in', 'stock_out', 'reversal') THEN v_balance.version ELSE NULL END,
    p_idempotency_key,
    p_request_fingerprint
  )
  ON CONFLICT (warehouse_id, idempotency_key) WHERE idempotency_key IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_inserted_id;

  IF v_inserted_id IS NULL THEN
    SELECT * INTO v_existing
    FROM public.stock_movements
    WHERE idempotency_key = p_idempotency_key
      AND warehouse_id = p_warehouse_id;

    IF v_existing.request_fingerprint IS DISTINCT FROM p_request_fingerprint THEN
      RETURN QUERY SELECT NULL::uuid, NULL::bigint, FALSE, 'IDEMPOTENCY_CONFLICT',
             'idempotency key was already used for a different request';
      RETURN;
    END IF;

    RETURN QUERY
      SELECT v_existing.id,
             COALESCE((
               SELECT version FROM public.inventory_balances
               WHERE warehouse_id = p_warehouse_id AND product_id = v_existing.product_id
             ), 0),
             EXISTS(SELECT 1 FROM public.proofs WHERE proofs.movement_id = v_existing.id),
             'IDEMPOTENT', 'already processed';
    RETURN;
  END IF;

  UPDATE public.warehouses
    SET last_activity_at = now()
  WHERE id = p_warehouse_id;

  IF p_movement_type IN ('stock_in', 'stock_out', 'reversal') THEN
    UPDATE public.inventory_balances
      SET quantity = v_new_qty,
          version = v_new_version,
          updated_at = now(),
          updated_by = v_user_id
    WHERE id = v_balance.id;
  END IF;

  PERFORM private.write_audit(
    p_warehouse_id, v_user_id, p_movement_type, 'stock_movements',
    v_movement_id::text, NULL,
    JSONB_BUILD_OBJECT('type', p_movement_type, 'qty', p_quantity),
    NULL,
    CASE WHEN p_movement_type = 'adjustment' THEN 'pending_approval' ELSE 'committed' END
  );

  IF p_movement_type = 'adjustment' THEN
    PERFORM private.notify_warehouse_managers(
      p_warehouse_id, 'adjustment_pending',
      'Penyesuaian butuh persetujuan',
      FORMAT('Penyesuaian %s (%s %s) menunggu persetujuan',
        COALESCE(v_product.name, 'produk'), p_quantity, COALESCE(v_product.unit, 'unit')),
      JSONB_BUILD_OBJECT('warehouse_id', p_warehouse_id, 'movement_id', v_movement_id,
        'product_id', p_product_id, 'quantity', p_quantity),
      'adjustment_pending:' || v_movement_id::text
    );
  END IF;

  -- Proof pipeline DALAM TRANSAKSI YANG SAMA.
  v_proof_pending := FALSE;
  IF p_proof_payload IS NOT NULL AND p_proof_payload_hash IS NOT NULL
     AND p_movement_type <> 'adjustment' THEN
    v_proof_id := gen_random_uuid();
    INSERT INTO public.proofs (
      id, warehouse_id, warehouse_address, movement_id, payload,
      payload_version, payload_hash, status
    )
    VALUES (
      v_proof_id, p_warehouse_id, LOWER(v_wh_address), v_movement_id,
      p_proof_payload, 1, p_proof_payload_hash, 'pending'
    );

    INSERT INTO public.proof_outbox (id, proof_id, status, attempt_count, next_attempt_at)
    VALUES (gen_random_uuid(), v_proof_id, 'pending', 0, now());

    v_proof_pending := TRUE;

    PERFORM private.write_audit(
      p_warehouse_id, v_user_id, 'proof_created', 'proofs', v_proof_id::text,
      NULL, JSONB_BUILD_OBJECT('movement_id', v_movement_id, 'payload_hash', p_proof_payload_hash),
      NULL, 'pending'
    );
  END IF;

  RETURN QUERY
    SELECT v_movement_id, v_new_version, v_proof_pending, NULL::text, NULL::text;
END;
$function$;
