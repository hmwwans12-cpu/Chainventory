-- ============================================================================
-- Chainventory — 0056: invitation preview email masking (audit segar NBE-11)
-- ============================================================================
-- Bug: get_invitation_by_token (0045) mengembalikan email tujuan +
-- warehouse_name + role ke SIAPA PUN yang authenticated dan memegang token
-- (bocor via log/email-forward) — tanpa cek status/expired/membership.
-- Token 24-byte tidak bisa di-bruteforce, tetapi prinsip least-privilege
-- tetap berlaku untuk PII.
--
-- Fix: email hanya penuh bila (a) undangan pending DAN belum expired
-- (satu-satunya state yang butuh pencocokan email di /invite/[token]),
-- atau (b) pemanggil OWNER/MANAGER warehouse tersebut. State lain
-- (accepted/expired/revoked) tetap mengembalikan baris (status +
-- expires_at) agar halaman bisa menampilkan pesan yang tepat — hanya
-- email yang NULL.
--
-- Additive: signature + grants tidak berubah (CREATE OR REPLACE).
-- ============================================================================

create or replace function public.get_invitation_by_token(p_token text)
returns table (
  email text,
  warehouse_id uuid,
  warehouse_name text,
  role text,
  status text,
  expires_at timestamptz
)
language plpgsql
security definer
set search_path to public
as $function$
begin
  return query
  select
    case
      when i.status = 'pending' and i.expires_at > now()
        then lower(i.email)
      when (select private.member_role(i.warehouse_id, auth.uid()))
        in ('OWNER', 'MANAGER')
        then lower(i.email)
      else null
    end as email,
    i.warehouse_id,
    w.name as warehouse_name,
    i.role,
    i.status,
    i.expires_at
  from public.invitations i
  join public.warehouses w on w.id = i.warehouse_id
  where i.token = p_token;
end;
$function$;

comment on function public.get_invitation_by_token(text) is
  'Lookup invitation by token (for /invite/[token] pre-check). Email hanya penuh untuk undangan pending-valid atau pemanggil OWNER/MANAGER (NBE-11); state lain mengembalikan email NULL agar PII tidak bocor via token yang diteruskan.';
