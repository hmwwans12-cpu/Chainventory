-- ============================================================================
-- Chainventory - 0038: idempotency fingerprint + race-safe insert + scoped
-- unique constraint (audit 0.1.5 P1-01, P1-02, P1-03) + restore proof pipeline
-- ============================================================================
-- P1-01: simpan `request_fingerprint` (SHA-256 canonical payload, dihitung
--        BFF). Key sama + payload sama -> IDEMPOTENT; key sama + payload
--        beda -> IDEMPOTENCY_CONFLICT (bukan replay palsu).
-- P1-02: INSERT ... ON CONFLICT DO NOTHING pada index ter-scope; request
--        kalah race melakukan re-select lalu menjawab IDEMPOTENT /
--        IDEMPOTENCY_CONFLICT -- bukan generic unique-violation error.
-- P1-03: index unik global `stock_movements_idempotency_idx` (0006) diganti
--        partial unique (warehouse_id, idempotency_key) agar scope logika
--        lookup dan constraint database SAMA.
--
-- RESTORE (regresi 0035): blok pembuatan proofs+proof_outbox dalam transaksi
-- yang sama dan notifikasi adjustment_pending hilang saat rewrite 0035 --
-- dikembalikan dari 0032. Lock ordering product->balance FOR UPDATE dari
-- 0035 dan write_audit movement DIPERTAHANKAN.
--
-- CATATAN deploy: bila tabel sudah berisi key duplikat lintas warehouse,
-- pembuatan index baru gagal; dedup data dulu (keputusan bisnis, tidak
-- diotomatisasi).
-- ADDITIVE untuk caller: param baru p_request_fingerprint DEFAULT NULL.
-- ============================================================================

-- 1. Kolom fingerprint -------------------------------------------------------
ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS request_fingerprint text;

COMMENT ON COLUMN public.stock_movements.request_fingerprint IS
  'SHA-256 canonical request payload (BFF-computed); idempotency conflict detection (P1-01).';

-- 2. Scope constraint = scope lookup -----------------------------------------
DROP INDEX IF EXISTS public.stock_movements_idempotency_idx;

CREATE UNIQUE INDEX IF NOT EXISTS stock_movements_warehouse_idempotency_idx
  ON public.stock_movements (warehouse_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- 3. RPC apply_stock_movement (signature +14 argumen) ------------------------
DROP FUNCTION IF EXISTS public.apply_stock_movement(
  uuid, uuid, text, numeric, bigint, text, text, uuid, text, text, uuid, jsonb, text
);

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

  -- Idempotency pre-check (P1-01): fingerprint membedakan replay vs conflict.
  IF p_idempotency_key IS NOT NULL THEN
    SELECT * INTO v_existing
    FROM public.stock_movements
    WHERE idempotency_key = p_idempotency_key
      AND warehouse_id = p_warehouse_id
    LIMIT 1;

    IF found THEN
      IF p_request_fingerprint IS NOT NULL
         AND v_existing.request_fingerprint IS NOT NULL
         AND v_existing.request_fingerprint <> p_request_fingerprint THEN
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

  -- P0-03 (0035): lock product row FOR UPDATE sebelum cek status.
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

  -- P1-02: race-safe insert. Konflik (winner lain commit duluan) TIDAK
  -- melempar error; kita re-select lalu jawab IDEMPOTENT / CONFLICT.
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
    -- Kalah race: baris dengan key sama sudah ada (winner).
    SELECT * INTO v_existing
    FROM public.stock_movements
    WHERE idempotency_key = p_idempotency_key
      AND warehouse_id = p_warehouse_id;

    IF p_request_fingerprint IS NOT NULL
       AND v_existing.request_fingerprint IS NOT NULL
       AND v_existing.request_fingerprint <> p_request_fingerprint THEN
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

  -- Aktivitas nyata: reset counter inactivity.
  UPDATE public.warehouses
    SET last_activity_at = now()
  WHERE id = p_warehouse_id;

  -- Update saldo + version (hanya tipe langsung committed).
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

  -- Notifikasi adjustment (restore 0032): OWNER + MANAGER.
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

  -- Proof pipeline DALAM TRANSAKSI YANG SAMA (restore 0032; regresi 0035).
  -- Adjustment mendapat proof saat approve, bukan saat create.
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

-- 4. Grants (signature baru) -------------------------------------------------
GRANT EXECUTE ON FUNCTION public.apply_stock_movement(
  uuid, uuid, text, numeric, bigint, text, text, uuid, text, text, uuid, jsonb, text, text
) TO authenticated, service_role;
