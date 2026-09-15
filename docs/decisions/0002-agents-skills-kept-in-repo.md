# ADR-0002: Skill AI-assistant tetap di repo (tidak dipisah)

- Status: diterima (2026-09-13)
- Konteks: temuan audit #14 menyarankan `.agents/skills/*` +
  `skills-lock.json` dipisah dari source tree (supply-chain hygiene).
- Keputusan: TETAP di repo. Alasan:
  1. Nol dampak runtime — diverifikasi tidak ada satu pun import dari
     `app/`, `components/`, `lib/`, `scripts/` ke `.agents/` maupun
     `skills-lock.json`. File-file ini tidak pernah masuk bundle.
  2. Kontrak tooling: skill dimuat via path absolut repo oleh AI
     assistant; pemindahan merusak path tanpa manfaat runtime.
  3. Skill di repo ini spesifik-proyek (brand/design taste), bukan
     tooling generik — kedekatannya dengan source adalah fitur,
     bukan kebetulan.
- Konsekuensi: dependensi ke repo pihak ketiga (taste-skill) tetap
  ada sebagai referensi konten, bukan dependensi build. Bila suatu
  saat skill perlu di-version terpisah, ADR ini harus direvisi
  eksplisit — jangan pindah diam-diam.
