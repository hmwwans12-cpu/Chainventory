-- ============================================================================
-- Chainventory - 0041: create_product_with_initial_stock + PROOF INTENT
-- dalam satu transaksi (audit 0.1.6 P1-07 / roadmap 0.1.7)
-- ============================================================================
-- Sebelumnya: warehouse deployed -> dua jalur (create lalu movement ber-proof
-- terpisah); kegagalan langkah kedua = produk ada, stok 0.
--
-- Kini SATU domain operation untuk SEMUA warehouse:
--   INSERT product
--    -> audit product_created
--    -> apply_stock_movement(stock_in)  [ledger + balance + audit]
--    -> proof + proof_outbox            [DALAM TRANSAKSI SAMA]
--   COMMIT -- blockchain confirmation tetap async via outbox/QStash.
--
-- BFF men-generate productId & movementId di muka agar payload proof
-- (yang memuat keduanya) bisa dibangun SEBELUM transaksi berjalan;
-- apply_stock_movement memvalidasi payload->movementId == p_movement_id.
-- ============================================================================

DROP FUNCTION IF EXISTS public.create_product_with_initial_stock(
  uuid, text, text, text, text, text, numeric, numeric
);

CREATE OR REPLACE FUNCTION public.create_product_with_initial_stock(
  p_warehouse_id uuid,
  p_sku text,
  p_name text,
  p_category text DEFAULT NULL,
  p_unit text DEFAULT 'pcs',
  p_description text DEFAULT NULL,
  p_low_stock_threshold numeric DEFAULT NULL,
  p_initial_quantity numeric DEFAULT NULL,
  p_product_id uuid DEFAULT NULL,
  p_movement_id uuid DEFAULT NULL,
  p_proof_payload jsonb DEFAULT NULL,
  p_proof_payload_hash text DEFAULT NULL
)
RETURNS public.products
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_role text;
  v_product public.products;
  v_move record;
  v_product_id uuid := COALESCE(p_product_id, gen_random_uuid());
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '28000';
  END IF;

  -- Warehouse harus aktif
  IF NOT EXISTS (
    SELECT 1 FROM public.warehouses
    WHERE id = p_warehouse_id AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  v_role := private.member_role(p_warehouse_id, v_user_id);
  IF v_role IS NULL OR v_role NOT IN ('STAFF', 'MANAGER', 'OWNER') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  IF p_initial_quantity IS NOT NULL AND p_initial_quantity <= 0 THEN
    RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE = '22023';
  END IF;

  -- Proof butuh movement id eksplisit agar payload->movementId valid.
  IF (p_proof_payload IS NOT NULL OR p_proof_payload_hash IS NOT NULL)
     AND p_movement_id IS NULL THEN
    RAISE EXCEPTION 'INVALID_INPUT' USING ERRCODE = '22023';
  END IF;

  -- Insert produk (id dari BFF saat initial stock ber-proof; constraint
  -- SKU unik per warehouse tetap berlaku).
  INSERT INTO public.products (
    id, warehouse_id, sku, name, category, unit,
    description, low_stock_threshold, status
  )
  VALUES (
    v_product_id, p_warehouse_id, p_sku, p_name, p_category, p_unit,
    p_description, p_low_stock_threshold, 'active'
  )
  RETURNING * INTO v_product;

  PERFORM private.write_audit(
    p_warehouse_id, v_user_id,
    'product_created', 'products', v_product.id::text,
    NULL, JSONB_BUILD_OBJECT('sku', p_sku, 'name', p_name),
    NULL, 'active'
  );

  -- Initial stock DALAM TRANSAKSI YANG SAMA lewat jalur ledger kanonik;
  -- proof/outbox dibuat di dalam apply_stock_movement bila payload ada.
  IF p_initial_quantity IS NOT NULL THEN
    SELECT * INTO v_move
    FROM public.apply_stock_movement(
      p_warehouse_id, v_product.id, 'stock_in', p_initial_quantity,
      0, 'Initial stock', NULL, NULL,
      NULL,           -- p_idempotency_key (create sekali; tidak perlu key)
      NULL,           -- p_actor_wallet
      p_movement_id,
      p_proof_payload,
      p_proof_payload_hash,
      NULL            -- p_request_fingerprint (key NULL -> opsional)
    );

    IF v_move.error_code IS NOT NULL THEN
      -- Abort seluruh transaksi: produk ikut rollback (atomic).
      RAISE EXCEPTION 'INITIAL_STOCK_FAILED %', v_move.error_code
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN v_product;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.create_product_with_initial_stock(
  uuid, text, text, text, text, text, numeric, numeric,
  uuid, uuid, jsonb, text
) TO authenticated, service_role;
