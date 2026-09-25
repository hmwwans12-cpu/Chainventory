create index if not exists proof_outbox_lease_expires_idx
  on public.proof_outbox (lease_expires_at)
  where status = 'leased';

create index if not exists proof_outbox_pending_stale_idx
  on public.proof_outbox (status, updated_at)
  where status = 'pending';

update public.proof_outbox ob
set status = case
      when p.status in ('pending', 'retrying') then 'pending'
      else 'failed'
    end,
    lease_token = null,
    lease_expires_at = null,
    next_attempt_at = case
      when p.status in ('pending', 'retrying') then coalesce(ob.next_attempt_at, now())
      else null
    end,
    error = case
      when p.status in ('pending', 'retrying') then null
      else coalesce(ob.error, 'lease expired')
    end,
    updated_at = now()
from public.proofs p
where p.id = ob.proof_id
  and ob.status = 'leased'
  and (
    ob.lease_expires_at is null
    or ob.lease_expires_at <= now()
    or nullif(btrim(ob.lease_token), '') is null
  );

update public.proof_outbox
set lease_token = null
where status <> 'leased' and lease_token is not null;

update public.proof_outbox
set lease_expires_at = null
where status <> 'leased' and lease_expires_at is not null;

alter table public.proof_outbox
  drop constraint if exists proof_outbox_lease_shape_check;

alter table public.proof_outbox
  add constraint proof_outbox_lease_shape_check
  check (
    (
      status = 'leased'
      and lease_expires_at is not null
      and nullif(btrim(lease_token), '') is not null
    )
    or (
      status <> 'leased'
      and lease_token is null
      and lease_expires_at is null
    )
  ) not valid;

alter table public.proof_outbox
  validate constraint proof_outbox_lease_shape_check;

drop function if exists public.proof_lease(uuid);

create function public.proof_lease(p_proof_id uuid)
returns table (
  proof_id uuid,
  warehouse_address text,
  movement_id uuid,
  payload jsonb,
  payload_hash text,
  attempt_count int,
  lease_token text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text := gen_random_uuid()::text;
begin
  update public.proof_outbox ob
  set status = 'leased',
      lease_expires_at = now() + interval '10 minutes',
      lease_token = v_token,
      attempt_count = ob.attempt_count + 1,
      next_attempt_at = now(),
      error = null,
      updated_at = now()
  where ob.proof_id = p_proof_id
    and (
      (
        ob.status in ('pending', 'failed')
        and (ob.next_attempt_at is null or ob.next_attempt_at <= now())
      )
      or (
        ob.status = 'leased'
        and (ob.lease_expires_at is null or ob.lease_expires_at <= now())
      )
    )
    and exists (
      select 1
      from public.proofs p
      where p.id = ob.proof_id
        and p.status in ('pending', 'retrying')
    );

  if not found then
    return;
  end if;

  return query
  select pr.id, pr.warehouse_address, pr.movement_id, pr.payload, pr.payload_hash,
         ob.attempt_count, ob.lease_token
  from public.proofs pr
  join public.proof_outbox ob on ob.proof_id = pr.id
  where pr.id = p_proof_id
    and ob.status = 'leased'
    and ob.lease_token = v_token;
end;
$$;

drop function if exists public.proof_complete(uuid, text, text, text);

create function public.proof_complete(
  p_proof_id uuid,
  p_tx_hash text,
  p_status text,
  p_lease_token text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_proof public.proofs%rowtype;
  v_outbox public.proof_outbox%rowtype;
  v_tx_hash text;
begin
  if p_status is distinct from 'submitted' then
    raise exception 'invalid proof completion status' using errcode = '22023';
  end if;
  if p_tx_hash is null or p_tx_hash !~* '^0x[0-9a-f]{64}$' then
    raise exception 'invalid proof transaction hash' using errcode = '22023';
  end if;
  if nullif(btrim(coalesce(p_lease_token, '')), '') is null then
    return false;
  end if;

  select * into v_proof
  from public.proofs
  where id = p_proof_id
  for update;
  if v_proof.id is null then
    return false;
  end if;

  select * into v_outbox
  from public.proof_outbox
  where proof_id = p_proof_id
  for update;
  if v_outbox.id is null
     or v_outbox.status <> 'leased'
     or v_outbox.lease_token is distinct from p_lease_token
     or v_proof.status not in ('pending', 'retrying') then
    return false;
  end if;

  v_tx_hash := lower(btrim(p_tx_hash));
  if v_proof.tx_hash is not null
     and lower(btrim(v_proof.tx_hash)) <> v_tx_hash then
    return false;
  end if;
  update public.proof_outbox
  set status = 'sent',
      lease_token = null,
      lease_expires_at = null,
      error = null,
      updated_at = now()
  where id = v_outbox.id
    and status = 'leased'
    and lease_token = p_lease_token;
  if not found then
    return false;
  end if;

  update public.proofs
  set status = 'submitted',
      tx_hash = v_tx_hash,
      error = null,
      updated_at = now()
  where id = p_proof_id
    and status in ('pending', 'retrying');

  perform private.write_audit(
    v_proof.warehouse_id,
    null,
    'proof_submitted',
    'proofs',
    p_proof_id::text,
    null,
    jsonb_build_object('status', 'submitted', 'tx_hash', v_tx_hash),
    v_tx_hash,
    'submitted'
  );
  return true;
end;
$$;

create or replace function public.proof_complete(
  p_proof_id uuid,
  p_tx_hash text,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
  v_proof_status text;
  v_outbox_status text;
begin
  select p.status, ob.status, ob.lease_token
    into v_proof_status, v_outbox_status, v_token
  from public.proofs p
  join public.proof_outbox ob on ob.proof_id = p.id
  where p.id = p_proof_id
  for update;

  if v_proof_status is null then
    return;
  end if;
  if v_outbox_status = 'leased' and v_token is not null then
    perform public.proof_complete(p_proof_id, p_tx_hash, p_status, v_token);
    return;
  end if;
  if v_outbox_status in ('pending', 'failed')
     and v_proof_status in ('pending', 'retrying') then
    v_token := gen_random_uuid()::text;
    update public.proof_outbox
    set status = 'leased',
        lease_expires_at = now() + interval '10 minutes',
        lease_token = v_token,
        next_attempt_at = now(),
        error = null,
        updated_at = now()
    where proof_id = p_proof_id
      and status in ('pending', 'failed');
    if found then
      perform public.proof_complete(p_proof_id, p_tx_hash, p_status, v_token);
    end if;
  end if;
end;
$$;

drop function if exists public.proof_requeue(uuid, text, timestamptz, text);

create function public.proof_requeue(
  p_proof_id uuid,
  p_error text,
  p_next_attempt_at timestamptz,
  p_lease_token text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_proof public.proofs%rowtype;
  v_outbox public.proof_outbox%rowtype;
  v_attempts int;
  v_error text;
begin
  if nullif(btrim(coalesce(p_lease_token, '')), '') is null then
    return false;
  end if;

  select * into v_proof
  from public.proofs
  where id = p_proof_id
  for update;
  if v_proof.id is null then
    return false;
  end if;

  select * into v_outbox
  from public.proof_outbox
  where proof_id = p_proof_id
  for update;
  if v_outbox.id is null
     or v_outbox.status <> 'leased'
     or v_outbox.lease_token is distinct from p_lease_token
     or v_proof.status not in ('pending', 'retrying') then
    return false;
  end if;

  v_attempts := v_outbox.attempt_count;
  v_error := p_error;
  if v_attempts >= 5 then
    update public.proofs
    set status = 'manual_review', error = v_error, updated_at = now()
    where id = p_proof_id
      and status in ('pending', 'retrying');
    update public.proof_outbox
    set status = 'failed',
        lease_token = null,
        lease_expires_at = null,
        next_attempt_at = null,
        error = v_error,
        updated_at = now()
    where id = v_outbox.id
      and status = 'leased'
      and lease_token = p_lease_token;
    perform private.write_audit(
      v_proof.warehouse_id,
      null,
      'proof_manual_review',
      'proofs',
      p_proof_id::text,
      null,
      jsonb_build_object('error', v_error, 'attempts', v_attempts),
      null,
      'manual_review'
    );
    perform private.notify_proof_event(
      p_proof_id,
      'proof_manual_review',
      'Butuh review manual',
      'Proof {product} masuk review manual: {error}',
      v_error
    );
  else
    update public.proofs
    set status = 'retrying', error = v_error, updated_at = now()
    where id = p_proof_id
      and status in ('pending', 'retrying');
    update public.proof_outbox
    set status = 'failed',
        lease_token = null,
        lease_expires_at = null,
        next_attempt_at = p_next_attempt_at,
        error = v_error,
        updated_at = now()
    where id = v_outbox.id
      and status = 'leased'
      and lease_token = p_lease_token;
    perform private.write_audit(
      v_proof.warehouse_id,
      null,
      'proof_retrying',
      'proofs',
      p_proof_id::text,
      null,
      jsonb_build_object(
        'error', v_error,
        'attempt', v_attempts,
        'next_attempt_at', p_next_attempt_at
      ),
      null,
      'retrying'
    );
  end if;
  return true;
end;
$$;

create or replace function public.proof_requeue(
  p_proof_id uuid,
  p_error text,
  p_next_attempt_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
  v_proof_status text;
  v_outbox_status text;
begin
  select p.status, ob.status, ob.lease_token
    into v_proof_status, v_outbox_status, v_token
  from public.proofs p
  join public.proof_outbox ob on ob.proof_id = p.id
  where p.id = p_proof_id
  for update;

  if v_proof_status is null then
    return;
  end if;
  if v_outbox_status = 'leased' and v_token is not null then
    perform public.proof_requeue(p_proof_id, p_error, p_next_attempt_at, v_token);
    return;
  end if;
  if v_outbox_status in ('pending', 'failed')
     and v_proof_status in ('pending', 'retrying') then
    v_token := gen_random_uuid()::text;
    update public.proof_outbox
    set status = 'leased',
        lease_expires_at = now() + interval '10 minutes',
        lease_token = v_token,
        next_attempt_at = now(),
        error = null,
        updated_at = now()
    where proof_id = p_proof_id
      and status in ('pending', 'failed');
    if found then
      perform public.proof_requeue(p_proof_id, p_error, p_next_attempt_at, v_token);
    end if;
  end if;
end;
$$;

drop function if exists public.proof_mark_manual(uuid, text, text);

create function public.proof_mark_manual(
  p_proof_id uuid,
  p_error text,
  p_lease_token text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_proof public.proofs%rowtype;
  v_outbox public.proof_outbox%rowtype;
begin
  if nullif(btrim(coalesce(p_lease_token, '')), '') is null then
    return false;
  end if;

  select * into v_proof
  from public.proofs
  where id = p_proof_id
  for update;
  if v_proof.id is null then
    return false;
  end if;

  select * into v_outbox
  from public.proof_outbox
  where proof_id = p_proof_id
  for update;
  if v_outbox.id is null
     or v_outbox.status <> 'leased'
     or v_outbox.lease_token is distinct from p_lease_token
     or v_proof.status not in ('pending', 'retrying', 'submitted', 'confirming') then
    return false;
  end if;

  update public.proofs
  set status = 'manual_review', error = p_error, updated_at = now()
  where id = p_proof_id
    and status in ('pending', 'retrying', 'submitted', 'confirming');
  update public.proof_outbox
  set status = 'failed',
      lease_token = null,
      lease_expires_at = null,
      next_attempt_at = null,
      error = p_error,
      updated_at = now()
  where id = v_outbox.id
    and status = 'leased'
    and lease_token = p_lease_token;

  perform private.write_audit(
    v_proof.warehouse_id,
    null,
    'proof_manual_review',
    'proofs',
    p_proof_id::text,
    null,
    jsonb_build_object('error', p_error),
    null,
    'manual_review'
  );
  perform private.notify_proof_event(
    p_proof_id,
    'proof_manual_review',
    'Butuh review manual',
    'Proof {product} masuk review manual: {error}',
    p_error
  );
  return true;
end;
$$;

create or replace function public.proof_mark_manual(
  p_proof_id uuid,
  p_error text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_token text;
  v_proof_status text;
  v_outbox_status text;
begin
  select p.status
    into v_proof_status
  from public.proofs p
  where p.id = p_proof_id
  for update;

  if v_proof_status is null
     or v_proof_status not in ('pending', 'retrying', 'submitted', 'confirming') then
    return;
  end if;

  select ob.status, ob.lease_token
    into v_outbox_status, v_token
  from public.proof_outbox ob
  where ob.proof_id = p_proof_id
  for update;
  if v_outbox_status = 'leased' and v_token is not null then
    perform public.proof_mark_manual(p_proof_id, p_error, v_token);
    return;
  end if;

  if v_outbox_status is null then
    insert into public.proof_outbox (proof_id, status, attempt_count, error)
    values (p_proof_id, 'failed', 0, p_error)
    on conflict (proof_id) do nothing;
    select status, lease_token
      into v_outbox_status, v_token
    from public.proof_outbox
    where proof_id = p_proof_id
    for update;
  end if;

  if v_outbox_status in ('pending', 'failed', 'sent') then
    v_token := gen_random_uuid()::text;
    update public.proof_outbox
    set status = 'leased',
        lease_expires_at = now() + interval '10 minutes',
        lease_token = v_token,
        next_attempt_at = now(),
        error = p_error,
        updated_at = now()
    where proof_id = p_proof_id
      and status in ('pending', 'failed', 'sent');
    if found then
      perform public.proof_mark_manual(p_proof_id, p_error, v_token);
    end if;
  end if;
end;
$$;

create or replace function public.proof_set_confirmation(
  p_proof_id uuid,
  p_count int,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_proof public.proofs%rowtype;
begin
  if p_count is null or p_count < 0 then
    raise exception 'confirmation_count must be non-negative' using errcode = '22023';
  end if;
  if p_status is null or p_status not in ('confirming', 'confirmed') then
    raise exception 'invalid proof confirmation status' using errcode = '22023';
  end if;

  select * into v_proof
  from public.proofs
  where id = p_proof_id
  for update;
  if v_proof.id is null then
    raise exception 'proof not found' using errcode = 'P0002';
  end if;
  if v_proof.status = 'confirmed' then
    return;
  end if;
  if v_proof.status not in ('pending', 'retrying', 'submitted', 'confirming') then
    raise exception 'proof is not awaiting confirmation' using errcode = '42501';
  end if;
  if p_count < v_proof.confirmation_count then
    raise exception 'confirmation_count cannot decrease' using errcode = '22023';
  end if;
  if p_status = 'confirmed' and p_count < 2 then
    raise exception 'confirmed status requires confirmation_count >= 2' using errcode = '22023';
  end if;
  if v_proof.status = p_status and v_proof.confirmation_count = p_count then
    return;
  end if;

  update public.proofs
  set confirmation_count = p_count,
      status = p_status,
      error = null,
      updated_at = now()
  where id = p_proof_id;

  perform private.write_audit(
    v_proof.warehouse_id,
    null,
    'proof_confirmation',
    'proofs',
    p_proof_id::text,
    null,
    jsonb_build_object('confirmation_count', p_count, 'status', p_status),
    null,
    p_status
  );

  if p_status = 'confirmed' then
    update public.warehouses
    set last_activity_at = now()
    where id = v_proof.warehouse_id;
    perform private.notify_proof_event(
      p_proof_id,
      'proof_confirmed',
      'Terkonfirmasi di blockchain',
      format('Movement {product} terkonfirmasi on-chain (%s konfirmasi)', p_count)
    );
  end if;
end;
$$;

drop function if exists public.proof_republish(uuid);

create function public.proof_republish(p_proof_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_proof public.proofs%rowtype;
  v_outbox public.proof_outbox%rowtype;
begin
  select * into v_proof
  from public.proofs
  where id = p_proof_id
  for update;
  if v_proof.id is null or v_proof.status not in ('pending', 'retrying') then
    return false;
  end if;

  select * into v_outbox
  from public.proof_outbox
  where proof_id = p_proof_id
  for update;
  if v_outbox.id is null or v_outbox.status = 'sent' then
    return false;
  end if;
  if v_outbox.status = 'leased'
     and v_outbox.lease_expires_at is not null
     and v_outbox.lease_expires_at > now() then
    return false;
  end if;
  if v_outbox.status = 'failed'
     and v_outbox.next_attempt_at is not null
     and v_outbox.next_attempt_at > now() then
    return false;
  end if;
  if v_outbox.status = 'pending'
     and v_outbox.updated_at >= now() - interval '10 minutes' then
    return false;
  end if;

  update public.proof_outbox
  set status = 'pending',
      lease_token = null,
      lease_expires_at = null,
      next_attempt_at = now(),
      error = null,
      updated_at = now()
  where id = v_outbox.id
    and status in ('failed', 'pending', 'leased');

  return found;
end;
$$;

create or replace function public.proof_reconcile_candidates()
returns table (kind text, proof_id uuid)
language sql
security definer
set search_path = ''
as $$
  select 'republish'::text, ob.proof_id
  from public.proof_outbox ob
  join public.proofs p on p.id = ob.proof_id
  where p.status in ('pending', 'retrying')
    and (
      (
        ob.status = 'failed'
        and (ob.next_attempt_at is null or ob.next_attempt_at <= now())
      )
      or (
        ob.status = 'leased'
        and (ob.lease_expires_at is null or ob.lease_expires_at <= now())
      )
      or (
        ob.status = 'pending'
        and (ob.next_attempt_at is null or ob.next_attempt_at <= now())
        and ob.updated_at < now() - interval '10 minutes'
      )
    )
  union all
  select 'orphan'::text, p.id
  from public.proofs p
  where p.status in ('pending', 'retrying')
    and not exists (
      select 1 from public.proof_outbox ob where ob.proof_id = p.id
    )
  union all
  select 'confirm'::text, p.id
  from public.proofs p
  where p.status in ('submitted', 'confirming')
    and p.confirmation_count < 2
    and p.updated_at < now() - interval '5 minutes'
$$;

revoke all on function public.proof_lease(uuid) from public, anon, authenticated;
revoke all on function public.proof_complete(uuid, text, text, text) from public, anon, authenticated;
revoke all on function public.proof_complete(uuid, text, text) from public, anon, authenticated;
revoke all on function public.proof_requeue(uuid, text, timestamptz, text) from public, anon, authenticated;
revoke all on function public.proof_requeue(uuid, text, timestamptz) from public, anon, authenticated;
revoke all on function public.proof_mark_manual(uuid, text, text) from public, anon, authenticated;
revoke all on function public.proof_mark_manual(uuid, text) from public, anon, authenticated;
revoke all on function public.proof_set_confirmation(uuid, integer, text) from public, anon, authenticated;
revoke all on function public.proof_republish(uuid) from public, anon, authenticated;
revoke all on function public.proof_reconcile_candidates() from public, anon, authenticated;

grant execute on function public.proof_lease(uuid) to service_role;
grant execute on function public.proof_complete(uuid, text, text, text) to service_role;
grant execute on function public.proof_complete(uuid, text, text) to service_role;
grant execute on function public.proof_requeue(uuid, text, timestamptz, text) to service_role;
grant execute on function public.proof_requeue(uuid, text, timestamptz) to service_role;
grant execute on function public.proof_mark_manual(uuid, text, text) to service_role;
grant execute on function public.proof_mark_manual(uuid, text) to service_role;
grant execute on function public.proof_set_confirmation(uuid, integer, text) to service_role;
grant execute on function public.proof_republish(uuid) to service_role;
grant execute on function public.proof_reconcile_candidates() to service_role;

create or replace function private.write_audit(
  p_warehouse_id uuid,
  p_actor_user_id uuid,
  p_action text,
  p_entity text,
  p_entity_id text default null,
  p_before_state jsonb default null,
  p_after_state jsonb default null,
  p_related_tx_hash text default null,
  p_status text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_warehouse_id uuid := p_warehouse_id;
  v_entity_id uuid;
begin
  if v_warehouse_id is null
     and p_entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    begin
      v_entity_id := p_entity_id::uuid;
    exception when invalid_text_representation then
      v_entity_id := null;
    end;
  end if;

  if v_warehouse_id is null and v_entity_id is not null and p_entity = 'warehouses' then
    select id into v_warehouse_id
    from public.warehouses
    where id = v_entity_id;
  elsif v_warehouse_id is null and v_entity_id is not null and p_entity = 'warehouse_deployments' then
    select warehouse_id into v_warehouse_id
    from public.warehouse_deployments
    where id = v_entity_id;
  end if;

  insert into public.audit_logs (
    warehouse_id,
    actor_user_id,
    action,
    entity,
    entity_id,
    before_state,
    after_state,
    related_tx_hash,
    status
  )
  values (
    v_warehouse_id,
    p_actor_user_id,
    p_action,
    p_entity,
    p_entity_id,
    p_before_state,
    p_after_state,
    p_related_tx_hash,
    p_status
  );
end;
$$;

revoke all on function private.write_audit(uuid, uuid, text, text, text, jsonb, jsonb, text, text)
  from public, anon, authenticated;
