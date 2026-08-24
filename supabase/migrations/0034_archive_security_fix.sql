-- ============================================================================
-- Chainventory - 0034: archive_product security fix (audit P0-01/P0-02)
-- ============================================================================
-- P0-01: p_actor_user_id dihapus - actor WAJIB dari auth.uid()
--        (mencegah impersonasi: STAFF memakai OWNER UUID untuk lolos role check)
-- P0-02: FOR UPDATE pada balance ROW (bukan aggregate SUM yang invalid SQL)
-- Lock ordering: product FOR UPDATE -> balance FOR UPDATE
--                (konsisten dengan apply_stock_movement)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.archive_product(
  p_warehouse_id uuid,
  p_product_id uuid
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_balance_qty numeric;
  v_role text;
  v_product_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHENTICATED' USING ERRCODE = '28000';
  END IF;

  v_role := private.member_role(p_warehouse_id, v_user_id);
  IF v_role NOT IN ('MANAGER', 'OWNER') THEN
    RAISE EXCEPTION 'FORBIDDEN: only MANAGER or OWNER can archive products'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Lock product row (P0-03: lock ordering konsisten dengan movement).
  SELECT id INTO v_product_id
  FROM public.products
  WHERE id = p_product_id AND warehouse_id = p_warehouse_id
  FOR UPDATE;

  IF v_product_id IS NULL THEN
    RAISE EXCEPTION 'product not found'
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Lock balance ROW (P0-02: bukan aggregate SUM + FOR UPDATE).
  SELECT COALESCE(quantity, 0) INTO v_balance_qty
  FROM public.inventory_balances
  WHERE warehouse_id = p_warehouse_id AND product_id = p_product_id
  FOR UPDATE;

  v_balance_qty := COALESCE(v_balance_qty, 0);

  IF v_balance_qty > 0 THEN
    RAISE EXCEPTION 'cannot archive product with remaining stock'
      USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.products
  SET status = 'archived', updated_at = now()
  WHERE id = p_product_id AND warehouse_id = p_warehouse_id;

  PERFORM private.write_audit(
    p_warehouse_id, v_user_id,
    'product_archived', 'products', p_product_id::text,
    NULL, NULL, NULL, 'archived'
  );
END;
$function$;

-- Grant signature baru, revoke signature lama
GRANT EXECUTE ON FUNCTION public.archive_product(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.archive_product(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;