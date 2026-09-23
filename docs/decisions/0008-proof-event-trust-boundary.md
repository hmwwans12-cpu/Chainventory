# ADR-0008: Event log on-chain tidak standalone-trustworthy (audit v3 §5)

- Status: DIPUTUSKAN (2026-09-16) — didokumentasikan, bukan diperbaiki
  di kode (kontrak v1 immutable).
- Konteks: `Warehouse.recordProof` hanya menegakkan `actor == msg.sender`.
  Alamat asing bisa merekam proof `actor = dirinya sendiri` ke warehouse
  mana pun; tidak ada test maupun guard untuk itu (disengaja — kontrak
  tidak tahu konsep member). UI tidak terdampak (baca tabel `proofs` DB).
- Keputusan:
  1. Terima sebagai known-limitation v1 immutable; JANGAN tambah
     allowlist member di kontrak (butuh state + governance sync —
     trade-off lebih besar dari nilainya untuk v1).
  2. Nyatakan eksplisit di ARSITEKTUR.md §5.2: event mentah/BaseScan
     tidak bisa dipercaya tanpa cross-check ke DB aplikasi.
  3. Bila indexer/subgraph dibangun nanti, filter sampah di level
     indexer (verifikasi `proofId` terhadap intent DB), bukan di kontrak.
- Konsekuensi: siapa pun yang mengaudit "audit trail on-chain" wajib
  membaca §5.2 dulu; klaim pemasaran dilarang menyebut event log
  "tidak bisa dipalsukan" tanpa kualifikasi cross-check DB.
