# ADR-0005: Alur ownership transfer on-chain end-to-end

- Status: diimplementasikan (2026-09-13)
- Konteks: temuan audit #4 — kontrak punya `transferOwnership()`, tapi
  tidak ada UI/signing/sync; owner warehouse deployed yang mau keluar
  terblokir di layer produk (transfer off-chain diblokir A5 dengan benar).
- Keputusan (mengikuti pola verifyIntentProofTx):
  1. Dialog: pilih member → preview wallet primary verified (server,
     otoritatif) → owner sign `transferOwnership` via Privy.
  2. BFF verifikasi tx murni (`lib/blockchain/ownership-proof.ts`,
     unit-tested): sukses + kontrak tepat + from == owner on-chain +
     argumen == wallet member.
  3. RPC `confirm_ownership_transfer` (migrasi 0060) sinkron DB atomik:
     role baru→OWNER/lama→MANAGER, `owner_user_id` +
     `on_chain_owner_wallet`, notifikasi seperti jalur off-chain,
     idempoten untuk retry pasca-sukses.
  4. Guard berlapis: caller harus OWNER DB, warehouse deployed, target
     ACTIVE + verified wallet (anti lockout).
- Konsekuensi: transfer off-chain untuk warehouse deployed TETAP
  diblokir (divergensi). Self-approval tidak relevan di sini (signer
  = owner lama, diverifikasi on-chain).
