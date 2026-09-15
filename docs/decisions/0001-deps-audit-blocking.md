# ADR-0001: Dependency audit blocking dengan allow-list berekspirasi

- Status: diterima (2026-09-13)
- Konteks: temuan audit #10 (2 CVE critical RCE di next 16.3.0) lolos CI
  karena job `deps-audit` di-set `continue-on-error: true` permanen
  (temuan #12). Gate yang tidak pernah gagal bukan gate.
- Keputusan:
  1. Upgrade `next` 16.3.0 → 16.3.5 (gates hijau: tsc/eslint/vitest/build).
  2. `scripts/ci/deps-audit.mjs` gagal pada high/critical KECUALI ada
     entri allow-list yang belum kedaluwarsa.
  3. `.github/security-allowlist.json` mencatat tiap exception dengan
     `reason` + `expires` (awal: 5 moderate transitif rantai Privy,
     kedaluwarsa 2026-12-12).
  4. Hapus `continue-on-error` dari job CI.
- Konsekuensi: PR bisa merah karena advisory baru — itu tujuannya.
  Extend expiry dilarang tanpa re-assessment tercatat. Moderate ke
  bawah dilaporkan, tidak menggagalkan.
