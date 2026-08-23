-- 0013: tambah kolom `description` opsional di `products` (DESIGN §35).
-- Additive murni: tidak mengubah policy/trigger/grant yang ada. RLS SELECT
-- pada `products` adalah row-level (`private.is_member`), sehingga kolom baru
-- otomatis terbaca member — tidak perlu grant tambahan.

alter table public.products
  add column if not exists description text;

comment on column public.products.description
  is 'Catatan produk (opsional). Form Product Creation (DESIGN §35).';
