-- ============================================================================
-- Chainventory — 0023: profil pemohon join request terlihat oleh approver
-- ============================================================================
-- Aliran ADDITIVE murni (expand–migrate–contract, WORKFLOW §4): menambah SATU
-- policy SELECT baru pada `users`; policy lama tidak diubah. Aman dijalankan
-- ulang (idempotent guard).
--
-- Gap yang ditutup:
--   Halaman Members wajib menampilkan nama/email pemohon join request agar
--   OWNER/MANAGER tahu siapa yang di-approve/reject (PRD §9, DESIGN §42).
--   Policy `users_select_member` (0014) hanya membuka profil user yang sudah
--   member ACTIVE di warehouse bersama — pemohon berstatus PENDING otomatis
--   tak terlihat, sehingga kartu join request tampil tanpa identitas.
--
-- Desain policy (konsisten dengan `join_requests_select_admin`, 0004/0007):
--   Predikat DB hanya "pemohon punya join_request pending di warehouse tempat
--   aktor member ACTIVE" (via helper ter-index `private.is_member`).
--   Otorisasi siapa boleh approve/reject TETAP di server flow + RPC
--   (`approve_join`/`reject_join` menegakkan matrix `can_assign_role`,
--   PRD §9.2 / AGENT.md §3) — policy ini hanya melengkapi keterbacaan data
--   untuk keperluan review, bukan gerbang aksi.
--
-- Rollback/recovery: drop policy tunggal, tidak menyentuh data.
-- ============================================================================

drop policy if exists users_select_join_requester on public.users;
create policy "users_select_join_requester"
  on public.users
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.join_requests jr
      where jr.user_id = public.users.id
        and jr.status = 'pending'
        and private.is_member(jr.warehouse_id)
    )
  );

comment on policy "users_select_join_requester" on public.users is
  'Member warehouse dapat membaca profil pemohon join request PENDING di warehouse tersebut (identitas diperlukan untuk approve/reject, PRD §9). Otorisasi aksi tetap di RPC approve_join/reject_join.';
