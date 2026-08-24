-- ============================================================================
-- Chainventory - 0039: create_product_with_initial_stock atomik (audit P1-06)
-- ============================================================================
-- Sebelumnya: createProduct lalu applyMovement(stock_in) dua transaksi
-- terpisah. Kegagalan langkah kedua -> produk ada, saldo 0 (state menggantung).
--
-- Fix: satu RPC = validasi + INSERT produk + stock_in via apply_stock_movement
-- (satu-satunya jalur mutasi saldo tetap terjaga: row lock + version + audit)
-- dalam SATU transaksi. Gagal di mana pun -> ROLLBACK total.
--
-- CATATAN proof: dipanggil BFF hanya saat warehouse BELUM deployed (belum ada
-- kontrak -> memang tidak ada proof yang mungkin). Warehouse deployed
-- tetap memakai jalur movement biasa agar proof ikut dibuat.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_product_with_initial_stock(
  p_warehouse_id uuid,
  p_sku text,
  p_name text,
  p_category text DEFAULT NULL,
  p_unit text DEFAULT 'pcs',
  p_description text DEFAULT NULL,
  p_low_stock_threshold numeric DEFAULT NULL,
  p_initial_quantity numeric DEFAULT NULL
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

  -- Insert produk (constraint SKU unik per warehouse tetap berlaku).
  INSERT INTO public.products (
    warehouse_id, sku, name, category, unit,
    description, low_stock_threshold, status
  )
  VALUES (
    p_warehouse_id, p_sku, p_name, p_category, p_unit,
    p_description, p_low_stock_threshold, 'active'
  )
  RETURNING * INTO v_product;

  PERFORM private.write_audit(
    p_warehouse_id, v_user_id,
    'product_created', 'products', v_product.id::text,
    NULL, JSONB_BUILD_OBJECT('sku', p_sku, 'name', p_name),
    NULL, 'active'
  );

  -- Initial stock DALAM TRANSAKSI YANG SAMA lewat jalur ledger kanonik.
  IF p_initial_quantity IS NOT NULL THEN
    SELECT * INTO v_move
    FROM public.apply_stock_movement(
      p_warehouse_id, v_product.id, 'stock_in', p_initial_quantity,
      0, 'Initial stock', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL
    );

    IF v_move.error_code IS NOT NULL THEN
      -- Abort seluruh transaksi: produk ikut rollback (atomic, P1-06).
      RAISE EXCEPTION 'INITIAL_STOCK_FAILED %', v_move.error_code
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  RETURN v_product;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.create_product_with_initial_stock(
  uuid, text, text, text, text, text, numeric, numeric
) TO authenticated, service_role;
