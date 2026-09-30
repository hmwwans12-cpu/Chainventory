alter table public.warehouse_deployments
  add column if not exists relay_payload text,
  add column if not exists relay_attempts integer not null default 0,
  add column if not exists relay_last_error text,
  add column if not exists relay_next_attempt_at timestamptz not null default now();

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'warehouse_deployments_relay_payload_check'
      and conrelid = 'public.warehouse_deployments'::regclass
  ) then
    alter table public.warehouse_deployments
      add constraint warehouse_deployments_relay_payload_check
      check (
        relay_payload is null
        or (
          relay_payload ~ '^0x[0-9a-f]+$'
          and length(relay_payload) <= 200000
        )
      );
  end if;
end;
$$;

create index if not exists warehouse_deployments_relay_pending_idx
  on public.warehouse_deployments (relay_next_attempt_at, created_at)
  where status in ('pending', 'submitted')
    and relay_payload is not null;

create or replace function public.create_warehouse_and_deployment_with_relay(
  p_warehouse_code text,
  p_name text,
  p_company_name text,
  p_warehouse_type text,
  p_on_chain_owner_wallet text,
  p_factory_address text,
  p_chain_id bigint,
  p_warehouse_code_hash text,
  p_deployment_nonce bigint,
  p_expiry bigint,
  p_signature text,
  p_idempotency_key text,
  p_actor_user_id uuid,
  p_tx_hash text,
  p_relay_payload text
)
returns table (created_warehouse_id uuid, created_deployment_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_created record;
begin
  if p_actor_user_id is null then
    raise exception 'actor required';
  end if;
  if p_tx_hash is null or btrim(p_tx_hash) !~* '^0x[0-9a-f]{64}$' then
    raise exception 'invalid transaction hash';
  end if;
  if p_relay_payload is null
     or btrim(p_relay_payload) !~* '^0x[0-9a-f]+$'
     or length(p_relay_payload) > 200000 then
    raise exception 'invalid relay payload';
  end if;

  select *
    into v_created
  from public.create_warehouse_and_deployment(
    p_warehouse_code,
    p_name,
    p_company_name,
    p_warehouse_type,
    p_on_chain_owner_wallet,
    p_factory_address,
    p_chain_id,
    p_warehouse_code_hash,
    p_deployment_nonce,
    p_expiry,
    p_signature,
    p_idempotency_key,
    p_actor_user_id
  );

  perform public.update_warehouse_deployment_status(
    v_created.created_deployment_id,
    'submitted',
    p_tx_hash,
    null,
    p_actor_user_id
  );

  update public.warehouse_deployments
  set relay_payload = p_relay_payload,
      relay_attempts = 0,
      relay_last_error = null,
      relay_next_attempt_at = now(),
      updated_at = now()
  where id = v_created.created_deployment_id;

  if not found then
    raise exception 'deployment relay record was not created';
  end if;

  return query
    select v_created.created_warehouse_id, v_created.created_deployment_id;
end;
$$;

revoke execute on function public.create_warehouse_and_deployment_with_relay(
  text, text, text, text, text, text, bigint, text, bigint, bigint,
  text, text, uuid, text, text
) from public, anon, authenticated;
grant execute on function public.create_warehouse_and_deployment_with_relay(
  text, text, text, text, text, text, bigint, text, bigint, bigint,
  text, text, uuid, text, text
) to service_role;
