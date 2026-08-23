-- ============================================================================
-- Chainventory — 0025: race-safe idempotent insert pada
--                      create_user_paid_stock_intent (audit N-4, 2026-08-23)
-- ============================================================================
-- Masalah: 0024 memakai pola cek-then-insert untuk idempotency key. Dua
-- request KONSENTRUS dengan key sama membuat salah satunya gagal unique
-- violation mentah ("duplicate key ...") → 500 RPC_FAILED, padahal semantik
-- yang benar adalah mengembalikan baris eksisting (idempotent).
--
-- Perbaikan: INSERT ... ON CONFLICT (actor_user_id, idempotency_key)
-- DO NOTHING lalu re-select bila returning kosong. Constraint target sudah
-- ada sejak 0024 (`unique (actor_user_id, idempotency_key)`).
--
-- Sifat: ADDITIVE murni (`create or replace`, signature identik) — grant
-- dari 0024 tetap berlaku; tidak menyentuh tabel/policy/RLS.
-- Catatan operasional: butuh apply ke database live (lihat TODO.md item 11).
-- ============================================================================

create or replace function public.create_user_paid_stock_intent(
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
returns public.stock_intents
language plpgsql
security definer set search_path = public
as $$
declare
  v_role text;
  v_intent public.stock_intents;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHENTICATED';
  end if;

  v_role := private.member_role(p_warehouse_id, auth.uid());
  if v_role not in ('OWNER', 'MANAGER', 'STAFF') then
    raise exception 'FORBIDDEN';
  end if;

  if not exists (
    select 1 from public.products
    where id = p_product_id
      and warehouse_id = p_warehouse_id
      and status = 'active'
  ) then
    raise exception 'NOT_FOUND';
  end if;

  -- Fast path: intent dengan key sama milik user ini sudah ada → replay.
  select * into v_intent
  from public.stock_intents
  where actor_user_id = auth.uid()
    and idempotency_key = p_idempotency_key;
  if found then
    return v_intent;
  end if;

  -- Insert balapan-aman: konflik unik (request konkuren menang) TIDAK
  -- melempar exception; kita baca baris pemenang sebagai hasil idempotent.
  insert into public.stock_intents (
    id, warehouse_id, product_id, actor_user_id, actor_wallet,
    movement_type, quantity, expected_balance_version, reason, reference,
    idempotency_key, payload, payload_hash
  )
  values (
    p_id, p_warehouse_id, p_product_id, auth.uid(), lower(p_actor_wallet),
    p_movement_type, p_quantity, p_expected_balance_version, p_reason,
    p_reference, p_idempotency_key, p_payload, p_payload_hash
  )
  on conflict (actor_user_id, idempotency_key) do nothing
  returning * into v_intent;

  if not found then
    select * into v_intent
    from public.stock_intents
    where actor_user_id = auth.uid()
      and idempotency_key = p_idempotency_key;
  end if;

  return v_intent;
end;
$$;
