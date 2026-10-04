# Risiko Proof Warehouse.sol v1 + Opsi v3 (temuan M-3)

Status: DOKUMENTASI — kontrak v1/v2 yang sudah di-deploy TIDAK diubah
(aturan besi). Verifikasi terhadap `contracts/src/Warehouse.sol`
(`recordProof`, tidak ada pembatasan submitter / replay window).

## Verifikasi (verbatim)

- `require(actor == msg.sender)` — penelepon hanya bisa mencatat proof
  untuk dirinya sendiri. TIDAK ada allowlist/submitter role on-chain;
  membership ditegakkan off-chain oleh BFF sebelum membuat intent.
- `require(!_proofs[proofId].recorded)` — satu proofId hanya sekali.
  TIDAK ada: batas waktu (timestamp dari caller, tak divalidasi),
  dedup payloadHash (payload sama bisa dicatat ulang dengan proofId baru),
  nonce/expiry/signature.
- `transferOwnership` terproteksi `onlyOwner`; bukan bagian temuan ini.

## Ringkasan risiko

1. Spam/self-attest: dompet mana pun bisa mencatat proof untuk dirinya
   (bayar gas sendiri) dengan timestamp arbitrer. Dampak terbatas:
   proof on-chain = klaim bertimestamp, kebenaran isi diverifikasi
   off-chain via payloadHash (intent → Treasury/pipeline). Tanpa
   verifikasi off-chain, pembaca naif bisa tertipu timestamp.
2. Replay payload: payloadHash yang sama dapat direkam N kali (proofId
   berbeda) — menggembungkan hitungan proof bila agregator menghitung
   mentah tanpa dedup payloadHash.
3. Tanpa expiry, intent lama bisa di-commit kapan pun (jendela replay
   tak terbatas) — mitigasi saat ini murni di DB (status intent,
   idempotency, lease).

## Opsi v3 (butuh keputusan desain + deploy kontrak baru)

- A: EIP-712 `recordProof` bertanda-tangan (domain, nonce, expiry) +
  verifikasi `ecrecover` on-chain; replay lintas proofId tertutup nonce.
- B: allowlist submitter (`mapping(address => bool)` + `onlyRecorder`)
  bila model kembali ke treasury-paid.
- C: jendela waktu on-chain (`block.timestamp - timestamp <= WINDOW`)
  - penolakan timestamp masa depan.
- D (tanpa kontrak baru): dedup payloadHash di agregator/indexer +
  kebijakan "first-seen wins" — mitigasi analitik, bukan konsensus.

Rekomendasi: D sekarang (tanpa deploy), A/C saat v3 bila ancaman
spam terbukti di Base Sepolia.
