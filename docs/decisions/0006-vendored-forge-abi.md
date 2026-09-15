# ADR-0006: Dua artefak ABI forge di-vendor ke git

- Status: diterima (2026-09-15)
- Konteks: `lib/blockchain/contracts.ts` (`getWarehouseFactory`, dipakai
  route create/submit/lifecycle) dan `lib/proof/treasury.ts` (relay proof)
  membaca ABI dari `contracts/out/**/*.json` saat RUNTIME. Seluruh `contracts/out/`
  di-`.gitignore`, sehingga checkout segar (CI, Vercel production) tidak punya
  file itu → `loadAbi` null → throw → route on-chain 500. Ditemukan lewat
  E2E CI yang gagal di `prepare` (500) padahal hijau di lokal.
- Keputusan: vendor DUA file saja (total ~95KB), bukan seluruh `out/` (3,4MB):
  1. `contracts/out/WarehouseFactory.sol/WarehouseFactory.json`
     (dirujuk `abiPath` di `contracts/deployments/base-sepolia.json`)
  2. `contracts/out/Warehouse.sol/Warehouse.json`
     (dirujuk `WAREHOUSE_ABI_PATH` di `lib/proof/treasury.ts`)
     Keduanya di-`git add -f` (tetap tracked walau `contracts/out/` di-ignore).
- Konsekuensi / aturan:
  1. Setiap ubah `.sol` yang menyentuh interface kedua kontrak ini, WAJIB
     `forge build` ulang lalu commit artefak hasil rebuild bersamaan.
  2. Jangan vendor file `out/` lain (test artifact, build-info) — tetap ignore.
  3. Bila interface Factory v1/v2 divergen di masa depan, ADR ini harus
     direvisi (ABI yang di-vendor harus menutup kedua versi atau dipisah).
