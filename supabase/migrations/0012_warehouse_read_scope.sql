-- ============================================================================
-- Chainventory — 0012: Warehouse read scope untuk member (RLS fix, DESIGN §39)
-- ============================================================================
-- Latar: sejak 0003, SELECT `warehouses` & `warehouse_deployments` owner-only.
-- Komentar 0003 menjanjikan "SELECT untuk member lain dibuka di migration
-- 0004" tetapi tidak pernah terwujud. Akibatnya non-owner (MANAGER/STAFF/
-- AUDITOR/VIEWER) tidak bisa membaca contract_address warehouse sendiri —
-- bertentangan dengan DESIGN §39 (transparansi blockchain; CTA "View on
-- BaseScan" untuk siapa pun yang berkepentingan, bukan cuma Owner).
--
-- Solusi: scope baca berbasis VIEW (bukan membuka policy SELECT ke tabel
-- dasar, yang meng-ekspos SEMUA kolom):
--
--   - warehouse_summaries            : subset aman `warehouses`, termasuk
--                                      contract_address. TANPA owner_user_id
--                                      dan on_chain_owner_wallet (kolom
--                                      identitas owner / wallet owner).
--   - warehouse_deployment_summaries : subset aman `warehouse_deployments`
--                                      (status, tx_hash, factory_address, ...).
--                                      TANPA signature / idempotency_key /
--                                      deployment_nonce / expiry (material
--                                      penandatanganan), owner_address, dan
--                                      kolom error internal.
--
-- Mengapa bukan `security_invoker` + RLS view (PG15+)? RLS di view HANYA
-- berlaku untuk view security_invoker; security_invoker kembali tunduk ke RLS
-- tabel dasar (owner-only) → member dapat 0 baris. Maka dipakai view default
-- SECURITY DEFINER (bypass RLS tabel dasar) DENGAN gate `private.is_member`
-- di WHERE — otorisasi tetap ditegakkan di DB per pemanggil (auth.uid()
-- adalah GUC per-request, tetap merujuk user yang login meski view berjalan
-- sebagai definer). Kolom sensitif tidak pernah eksis di view (scope
-- struktural), dan tabel dasar TETAP owner-only (defense-in-depth) sehingga
-- member tidak bisa membaca kolom sensitif lewat jalur lain. Regresi ke
-- route/processor existing NOL: grant/policy tabel dasar tidak diubah.
--
-- Aliran: ADDITIVE murni (expand–migrate–contract). Semua klausa idempotent
-- (create or replace / drop policy) → aman di-re-apply parsial.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. warehouse_summaries — metadata warehouse yang boleh dibaca member.
-- ----------------------------------------------------------------------------
create or replace view public.warehouse_summaries
as
select
  w.id,
  w.warehouse_code,
  w.name,
  w.company_name,
  w.warehouse_type,
  w.status,
  w.contract_address,
  w.created_at,
  w.updated_at
from public.warehouses w
where (select private.is_member(w.id));

comment on view public.warehouse_summaries is
  'Subset `warehouses` untuk member (DESIGN §39): transparansi blockchain tanpa kolom identitas owner (owner_user_id, on_chain_owner_wallet). Gate otorisasi: private.is_member(id). Tabel dasar tetap owner-only.';

comment on column public.warehouse_summaries.contract_address is
  'Alamat kontrak Warehouse di Base Sepolia — dibaca SEMUA member untuk CTA View on BaseScan (DESIGN §39).';

grant select on table public.warehouse_summaries to authenticated;

-- ----------------------------------------------------------------------------
-- 2. warehouse_deployment_summaries — lifecycle deployment untuk member
--    (transparansi on-chain) tanpa material penandatanganan.
-- ----------------------------------------------------------------------------
create or replace view public.warehouse_deployment_summaries
as
select
  d.id,
  d.warehouse_id,
  d.factory_address,
  d.chain_id,
  d.status,
  d.tx_hash,
  d.created_at,
  d.updated_at
from public.warehouse_deployments d
where (select private.is_member(d.warehouse_id));

comment on view public.warehouse_deployment_summaries is
  'Subset `warehouse_deployments` untuk member (DESIGN §39): status + tx_hash untuk CTA BaseScan. TANPA signature/idempotency_key/nonce/expiry/owner_address/error (material penandatanganan & detail internal). Gate otorisasi: private.is_member(warehouse_id).';

grant select on table public.warehouse_deployment_summaries to authenticated;
