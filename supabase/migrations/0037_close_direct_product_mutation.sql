-- ============================================================================
-- Chainventory — 0037: tutup direct product mutation bypass (audit P0-01/02)
-- ============================================================================
-- P0-01: Authenticated user dapat bypass BFF via PostgREST langsung.
-- P0-02: STAF dapat archive/unarchive via direct REST (RLS hanya cek role,
--        tidak cek status change permission).
--
-- Fix:
--   1. Revoke INSERT/UPDATE/DELETE/TRUNCATE products dari authenticated
--   2. Drop mutation RLS policies (insert_staff, update_staff)
--   3. Buat SECURITY DEFINER RPC untuk create/update product
--   4. SELECT tetap terbuka via RLS products_select_member (read-only)
--
-- Setelah migrasi ini, satu-satunya jalur mutation produk adalah:
--   Browser → BFF route → RPC SECURITY DEFINER → PostgreSQL
-- ============================================================================

-- 1. Revoke direct mutation privileges
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.products FROM authenticated;

-- 2. Drop mutation RLS policies (SELECT tetap)
DROP POLICY IF EXISTS products_insert_staff ON public.products;
DROP POLICY IF EXISTS products_update_staff ON public.products;

-- 3. SECURITY DEFINER RPC: create product
CREATE OR REPLACE FUNCTION public.create_product_rpc(
  p_warehouse_id uuid,
  p_sku text,
  p_name text,
  p_category text DEFAULT NULL,
  p_unit text DEFAULT 'pcs',
  p_description text DEFAULT NULL,
  p_low_stock_threshold numeric DEFAULT NULL
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

  -- Role check
  v_role := private.member_role(p_warehouse_id, v_user_id);
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  -- Permission: PRODUCT_CREATE = STAFF/MANAGER/OWNER
  IF v_role NOT IN ('STAFF', 'MANAGER', 'OWNER') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

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

  RETURN v_product;
END;
$function$;

-- 4. SECURITY DEFINER RPC: update product
CREATE OR REPLACE FUNCTION public.update_product_rpc(
  p_product_id uuid,
  p_warehouse_id uuid,
  p_sku text,
  p_name text,
  p_category text DEFAULT NULL,
  p_unit text DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_low_stock_threshold numeric DEFAULT NULL
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

  -- Product harus ada & milik warehouse ini
  SELECT * INTO v_product
  FROM public.products
  WHERE id = p_product_id AND warehouse_id = p_warehouse_id;

  IF v_product IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE = 'no_data_found';
  END IF;

  -- Archived product read-only (P2-07)
  IF v_product.status = 'archived' THEN
    RAISE EXCEPTION 'Archived products cannot be edited.'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Role check
  v_role := private.member_role(p_warehouse_id, v_user_id);
  IF v_role IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  IF v_role NOT IN ('STAFF', 'MANAGER', 'OWNER') THEN
    RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE = '42501';
  END IF;

  UPDATE public.products
  SET sku = p_sku,
      name = p_name,
      category = p_category,
      unit = COALESCE(p_unit, unit),
      description = p_description,
      low_stock_threshold = p_low_stock_threshold,
      updated_at = now()
  WHERE id = p_product_id AND warehouse_id = p_warehouse_id
  RETURNING * INTO v_product;

  PERFORM private.write_audit(
    p_warehouse_id, v_user_id,
    'product_updated', 'products', v_product.id::text,
    NULL, JSONB_BUILD_OBJECT('sku', p_sku, 'name', p_name),
    NULL, 'active'
  );

  RETURN v_product;
END;
$function$;

-- 5. Grant execute pada RPC baru
GRANT EXECUTE ON FUNCTION public.create_product_rpc(uuid, text, text, text, text, text, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_product_rpc(uuid, uuid, text, text, text, text, text, numeric) TO authenticated;

-- 6. Revoke function lama yang punya p_actor_user_id (sudah diganti 0034)
REVOKE ALL ON FUNCTION public.archive_product(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
