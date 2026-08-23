# Smoke Test Release Checklist

Pre-release smoke test untuk Chainventory. Jalankan SEMUA item sebelum
merge ke main / deploy production. Item yang gagal = BLOCKER.

**Referensi:** WORKFLOW.md §9, ARSITEKTUR.md §8, PRD §34.

---

## Pre-conditions

- [ ] CI hijau (typecheck, lint, vitest, build, secret scan)
- [ ] E2E Playwright hijau (smoke.spec.ts + main-flow.spec.ts + console.spec.ts)
- [ ] Migration sudah di-apply ke Supabase remote (`supabase db push`)
- [ ] Environment variables lengkap (cek Developer Console → Dependencies)

---

## 1. Authentication & Access Control

| #   | Item                             | Expected               | Status |
| --- | -------------------------------- | ---------------------- | ------ |
| 1.1 | Signup dengan email baru         | Redirect ke /dashboard |        |
| 1.2 | Login dengan akun yang sudah ada | Redirect ke /dashboard |        |
| 1.3 | Logout                           | Redirect ke /login     |        |
| 1.4 | Akses /dashboard tanpa login     | Redirect ke /login     |        |
| 1.5 | Akses /console tanpa allowlist   | 403 / redirect         |        |

## 2. Wallet & Blockchain

| #   | Item                          | Expected                         | Status |
| --- | ----------------------------- | -------------------------------- | ------ |
| 2.1 | Wallet seed (external)        | Address terdaftar di /wallets    |        |
| 2.2 | Wallet sign message (EIP-712) | Signature valid, nonce increment |        |
| 2.3 | Deploy warehouse              | Contract deployed, DB updated    |        |
| 2.4 | Cek contract di BaseScan      | Contract address valid           |        |

## 3. Inventory Operations

| #   | Item                       | Expected                               | Status |
| --- | -------------------------- | -------------------------------------- | ------ |
| 3.1 | Create product             | Product visible di /products           |        |
| 3.2 | Stock In                   | Balance bertambah, movement tercatat   |        |
| 3.3 | Stock Out                  | Balance berkurang, movement tercatat   |        |
| 3.4 | Stock Out melebihi balance | Error INSUFFICIENT_STOCK               |        |
| 3.5 | Realtime update            | Balance berubah real-time di 2 browser |        |

## 4. Proof Pipeline

| #   | Item                                        | Expected                             | Status |
| --- | ------------------------------------------- | ------------------------------------ | ------ |
| 4.1 | Proof status "pending" setelah Stock In/Out | Status = pending di /blockchain      |        |
| 4.2 | Proof status "confirmed" setelah mining     | Status = confirmed, tx hash valid    |        |
| 4.3 | Proof tidak bocor payload                   | Payload hash hanya (bukan plaintext) |        |

## 5. Members & RBAC

| #   | Item                              | Expected                        | Status |
| --- | --------------------------------- | ------------------------------- | ------ |
| 5.1 | Invite member (Manager/Staff)     | Invite terkirim, status PENDING |        |
| 5.2 | Approve member (Owner)            | Status → ACTIVE                 |        |
| 5.3 | Staff tidak bisa approve member   | Error FORBIDDEN                 |        |
| 5.4 | Manager tidak bisa manage Manager | Error FORBIDDEN                 |        |

## 6. Developer Console

| #   | Item                         | Expected                                  | Status |
| --- | ---------------------------- | ----------------------------------------- | ------ |
| 6.1 | Akses /console (allowlisted) | Dashboard terlihat                        |        |
| 6.2 | Summary cards                | Angka benar (warehouses, proofs, members) |        |
| 6.3 | Treasury balance             | Balance ETH terlihat                      |        |
| 6.4 | Dependencies status          | Supabase, Upstash, QStash, RPC hijau      |        |
| 6.5 | Export proofs CSV            | File terdownload, isi valid               |        |
| 6.6 | Export audit logs CSV        | File terdownload, isi valid               |        |
| 6.7 | Faucet claim                 | 0.001 ETH terkirim ke wallet              |        |
| 6.8 | Faucet cooldown              | Claim kedua ditolak dalam 12 jam          |        |

## 7. Notifications & Dashboard

| #   | Item               | Expected                      | Status |
| --- | ------------------ | ----------------------------- | ------ |
| 7.1 | Dashboard render   | Semua cards terlihat          |        |
| 7.2 | Notification bell  | Badge angka benar             |        |
| 7.3 | Notification click | Status berubah (read/dismiss) |        |

## 8. Error Handling & Edge Cases

| #   | Item        | Expected                               | Status |
| --- | ----------- | -------------------------------------- | ------ |
| 8.1 | RPC down    | Error state terlihat, tidak crash      |        |
| 8.2 | QStash down | Proof retry manual tersedia di console |        |
| 8.3 | Rate limit  | Request ditolak dengan pesan jelas     |        |
| 8.4 | 404 page    | Custom 404 ditampilkan                 |        |

## 9. Accessibility & Responsive

| #   | Item                | Expected                              | Status |
| --- | ------------------- | ------------------------------------- | ------ |
| 9.1 | Touch target ≥44px  | Semua button/link clickable di mobile |        |
| 9.2 | Keyboard navigation | Tab order logis                       |        |
| 9.3 | Screen reader       | Aria labels ada                       |        |
| 9.4 | Mobile layout       | Tidak ada horizontal scroll           |        |

---

## Post-Smoke-Test

- [ ] Semua item di atas PASS
- [ ] Developer Console → Dependencies semua hijau
- [ ] Tidak ada error di browser console
- [ ] Tidak ada secret/leak di page source
- [ ] Bundle size wajar (next build output)
