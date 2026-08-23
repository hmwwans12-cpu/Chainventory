# WORKFLOW.md

**Status:** Locked
**Last Updated:** 2026-08-13
**Companion to:** `PRD.md`, `ARSITEKTUR.md`, `TECHSTACK.md`

---

## 1. Aturan Kerja Utama

Setiap perubahan wajib mengikuti urutan:

```text
Baca dokumen relevan
→ definisikan scope dan acceptance criteria
→ implementasi kecil dan terisolasi
→ test sesuai risiko
→ security/UX review
→ review diff
→ merge/deploy
→ smoke test
```

Dokumen rujukan:

| Perubahan                   | Dokumen wajib dibaca      |
| --------------------------- | ------------------------- |
| Semua perubahan             | `PRD.md`, `ARSITEKTUR.md` |
| UI/UX                       | `DESIGN.md`               |
| Stack/dependency/deployment | `TECHSTACK.md`            |
| Task implementation         | `TODO.md`                 |
| Aturan AI/developer         | `AGENT.md`                |

## 2. Workflow Feature Biasa

Contoh: produk, dashboard, member, notifikasi.

1. Pastikan requirement dan permission matrix.
2. Tulis acceptance criteria dan state: loading, empty, error, permission denied, stale/offline.
3. Ubah database/migration terlebih dahulu bila diperlukan.
4. Tambahkan Route Handler dengan urutan: JWT → membership → permission → rate limit → business logic.
5. Terapkan RLS sebagai defense-in-depth.
6. Implement UI role-aware.
7. Tambahkan unit/integration test.
8. Jalankan lint, typecheck, build, dan test terkait.
9. Review diff untuk secret, data leakage, dan perubahan tak terkait.
10. Deploy preview dan lakukan QA manual.

## 3. Workflow Stock Movement

Untuk Stock In, Stock Out, Adjustment, dan Reversal:

```text
Validate input decimal/canonical unit
→ verify JWT + warehouse role
→ rate limit
→ idempotency check
→ PostgreSQL RPC atomik
   ├─ lock product/balance
   ├─ validate version, role, available stock
   ├─ write immutable movement
   ├─ update balance/version
   ├─ write audit log
   └─ create proof + outbox
→ return immediately: proof pending
→ QStash processor sends proof asynchronously
→ confirmation jobs update lifecycle
```

**Tidak boleh:**

- Menghitung lalu menyimpan stok dalam query terpisah.
- Menggunakan JavaScript floating point.
- Menunggu transaksi blockchain pada request user.
- Mengedit atau menghapus movement lama.

## 4. Workflow Database Migration

1. Tulis migration forward dan rollback/recovery plan.
2. Tambah foreign key, index, constraint, trigger, dan RLS dalam migration yang sama bila relevan.
3. Uji pada database lokal/preview dengan data realistis.
4. Uji policy sebagai user biasa dan pastikan service-role tidak dipakai oleh flow user.
5. Pastikan migration aman bila dijalankan ulang atau gagal di tengah.
6. Deploy migration sebelum kode yang bergantung padanya.
7. Pantau error dan query setelah deploy.

Migration yang menyentuh stok, ledger, proof, audit, ownership, atau RLS wajib mendapat review khusus.

### 4.1 Migration Breaking — Expand–Migrate–Contract

Migration breaking wajib memakai pola **expand–migrate–contract**:

```text
1. Expand   → tambahkan struktur baru yang backward-compatible
2. Deploy   → deploy kode yang kompatibel dengan struktur lama DAN baru
3. Migrate  → migrasikan/backfill data
4. Cutover  → pindahkan seluruh pembacaan/penulisan ke struktur baru
5. Contract → hapus struktur lama pada migration TERPISAH, setelah masa observasi
```

**Jangan** melakukan rename, drop, atau perubahan constraint incompatible dalam satu langkah.

## 5. Workflow Smart Contract

1. Buat change request yang menjelaskan invariant yang terdampak.
2. Review apakah perubahan benar-benar perlu; kontrak v1 immutable.
3. Perbarui Solidity, ABI, typed-data schema, dan dokumentasi bersama-sama.
4. Jalankan Forge unit/fuzz test untuk signature, nonce, expiry, ownership, duplicate proof, dan access control.
5. Deploy ke Base Sepolia.
6. Verifikasi contract dan simpan address/ABI/version.
7. Jalankan smoke test end-to-end dari aplikasi.
8. Perbarui environment dan contract registry hanya setelah deployment tervalidasi.

**Tidak boleh** mengubah address Factory/Warehouse yang aktif secara diam-diam.

## 6. Workflow Async Proof dan QStash

- User request hanya membuat outbox; tidak melakukan blockchain write.
- QStash endpoint wajib memverifikasi signature.
- Processor harus memakai lease database dan aman terhadap duplicate delivery.
- Processor menghitung ulang hash dari payload immutable sebelum submit; mismatch → `manual_review` + audit log, bukan dikirim ke chain.
- Submit proof dan confirmation polling merupakan job berbeda.
- Retry maksimal lima kali dengan exponential backoff.
- Setelah itu `manual_review`; hanya Developer Console dapat menjadwalkan retry ulang.
- Reconciliation harian mencari outbox/proof yang tertinggal.
- Setiap status perubahan proof menghasilkan audit log dan, bila relevan, notifikasi in-app.

## 7. Workflow Keamanan

Setiap perubahan sensitif wajib mengecek:

- Tidak ada secret pada browser, repository, log, atau `NEXT_PUBLIC_*`.
- Route Handler memeriksa session dan authorization terlebih dahulu.
- Mutation sensitif fail-closed jika rate limit tidak tersedia.
- Input tervalidasi Zod dan query parameterized.
- RLS tetap aktif serta diuji sebagai layer kedua.
- Log memakai request ID dan tidak menyimpan JWT, private key, atau signature mentah.
- Dependency baru diperiksa ukuran, maintenance, lisensi, dan kebutuhan free tier.

## 8. Workflow Bug Fix dan Incident

1. Reproduksi dan klasifikasikan: UI, auth/RBAC, database, proof, RPC, QStash, atau provider.
2. Untuk keamanan/data integrity, hentikan endpoint atau feature flag terkait lebih dulu bila diperlukan.
3. Cari audit log, request ID, proof ID, dan transaction hash — bukan menebak dari UI.
4. Buat regression test sebelum atau bersama perbaikan.
5. Perbaiki minimal dan terisolasi.
6. Jalankan test, deploy preview, lalu production.
7. Validasi data/proof dan dokumentasikan root cause singkat.

**Untuk bukti blockchain gagal, stok tidak dibatalkan.** Gunakan lifecycle retry/manual review.

## 9. Workflow Release

```text
CI hijau
→ review approval
→ merge main
→ apply additive / expand migration
→ Vercel deploy
→ smoke test kompatibilitas
→ backfill bila diperlukan
→ contract migration terpisah setelah observasi
→ Base Sepolia smoke test
→ cek Developer Console dan provider health
→ release selesai
```

Migration additive/expand berjalan **sebelum** kode baru live. Untuk perubahan breaking, tahap contract/removal bukan bagian dari release awal dan harus dilakukan terpisah setelah kode kompatibel stabil.

Smoke test rilis wajib mencakup: login, wallet external/embedded, deploy warehouse, Stock In/Out, status proof, Realtime, dan akses role.

## 10. Definition of Done

Sebuah task selesai bila:

- Requirement dan acceptance criteria terpenuhi.
- RBAC + RLS + Route Handler enforcement benar.
- Error/loading/empty/permission/stale state ditangani.
- Test yang proporsional dengan risiko lulus.
- Lint, typecheck, build, dan CI lulus.
- Audit log/outbox/proof dibuat bila perubahan adalah aksi domain terkait.
- Dokumentasi PRD/DESIGN/TECHSTACK/ARSITEKTUR diperbarui jika keputusan berubah.
- Tidak ada secret atau perubahan di luar scope.
