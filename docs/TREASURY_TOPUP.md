# Treasury Top-Up Procedure

Prosedur top-up treasury Base Sepolia testnet ETH. Jalankan kalau Developer
Console → Treasury menunjukkan saldo < 0.05 ETH (atau sisa klaim faucet < 50).

---

## Cek Saldo

1. Buka **Developer Console → Treasury** di Chainventory
2. Catat `balanceEther` dan `remainingClaims`
3. Atau cek langsung di BaseScan: `https://sepolia.basescan.org/address/<TREASURY_ADDRESS>`

Treasury address: `0x463841123df8f45F2d58bBFCD276493750Bbf004`
(Base Sepolia — test ETH, no real value)

Address di-derive dari `TREASURY_PRIVATE_KEY` — bisa dilihat juga di
Developer Console → Treasury → Address.

---

## Top-Up Options (Ranked by Speed)

### Option A: Chainstack Faucet (Recommended — 0.5 ETH/24h, no signup)

1. Buka `https://faucet.chainstack.com/`
2. Paste treasury address
3. Pilih **Base Sepolia**
4. Solve captcha → **Request Funds**
5. ~30 detik sampai. Cek balance di Developer Console.

### Option B: Chainlink Faucet (0.5 ETH/24h, no signup)

1. Buka `https://faucets.chain.link/base-sepolia`
2. Connect wallet (MetaMask/Coinbase Wallet) ATAU paste address langsung
3. Pilih **ETH** → **0.5 ETH**
4. Click **Send request**
5. ~1-2 menit sampai.

### Option C: Coinbase CDP Faucet (0.0001 ETH × 1000 claims/hari)

Gunakan kalau butuh drip kecil-kecilan, atau faucet lain rate-limited.

1. Buka `https://portal.cdp.coinbase.com/products/faucet`
2. Login Coinbase account
3. Paste treasury address → pilih **Base Sepolia** → **ETH**
4. Click **Get Tokens**
5. Ulangi sampai cukup (0.0001 ETH per klaim)

### Option D: Alchemy Faucet (0.5 ETH/24h, requires signup)

1. Buka `https://basefaucet.com/`
2. Login/create Alchemy account (gratis)
3. Paste treasury address → **Send Me ETH**

---

## Troubleshooting

| Masalah | Solusi |
|---------|--------|
| Semua faucet rate-limited | Tunggu 24h, atau pakai CDP faucet (1000 claims/hari) |
| Transaksi pending lama | Base Sepolia biasanya ~2s. Kalau > 5 menit, cek di BaseScan |
| Balance 0, sisa klaim 0 | Prioritas tinggi — demo bisa gagal. Pakai Option A atau B |
| RPC error di console | Cek health endpoint `/api/health` — mungkin RPC down |

---

## Minimum Balance Threshold

- **< 0.01 ETH**: KRITIS — segera top-up
- **0.01 - 0.05 ETH**: WARNING — rencanakan top-up
- **> 0.05 ETH**: AMAN untuk demo (cukup untuk ~50 deployment + proof)
