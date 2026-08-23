# Alur Pengguna End-to-End — Chainventory

Dokumentasi ini menjelaskan seluruh perjalanan pengguna dari pertama kali
mengunjungi situs sampai menggunakan fitur lanjutan. Ditulis untuk review
sebelum deploy final.

---

## 1. Kunjungan Pertama — Landing Page

### Apa yang user lihat

Halaman utama (`/`) menampilkan urutan section:

| #   | Section                    | Isi                                                                                                                                                                                                                      |
| --- | -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **Hero**                   | Tagline "Inventory management with blockchain verification". Tombol "Create Warehouse" (ke `/signup`) dan "Login" (ke `/login`). 3 statistik: Real-time stock, 5 roles, Proof on every movement. Preview mini-dashboard. |
| 2   | **Problem**                | 3 masalah: Spreadsheet yang out-of-date, Perselisihan siapa yang mengubah apa, Tim yang lambat sinkron.                                                                                                                  |
| 3   | **Features**               | 6 kartu: Centralized inventory, Stock in/out, Real-time sync, Role-based access, **Verifiable records** (tile besar dengan contoh proof hash), Built-in security.                                                        |
| 4   | **How It Works**           | 4 langkah: Create warehouse, Invite team, Manage stock in real time, Verify when needed.                                                                                                                                 |
| 5   | **Blockchain Explanation** | Panel "Kenapa blockchain?" dalam bahasa sederhana, 4 poin tentang verifikasi tanpa kompleksitas.                                                                                                                         |
| 6   | **Security**               | 4 poin: Defense in depth, Access you control, Append-only audit, Transparent verification.                                                                                                                               |
| 7   | **FAQ**                    | Pertanyaan umum.                                                                                                                                                                                                         |
| 8   | **CTA**                    | "Start managing inventory with verifiable records." Tulisan kecil: "No crypto knowledge needed. Free on Base Sepolia test network."                                                                                      |

### Apa yang user lakukan

- Scroll ke bawah membaca section satu per satu.
- Klik **"Create Warehouse"** di Hero atau CTA ke halaman Signup.
- Klik **"Login"** ke halaman Login.

### Di balik layar

Semua konten statis (server component). Tidak ada API call.

### Missing link

Tidak ada masalah. Semua tombol CTA terhubung ke halaman yang benar.

---

## 2. Signup — Daftar Akun

### Apa yang user lihat

Halaman `/signup`:

- Judul: "Create your account"
- Subjudul: "Your identity follows you across warehouses."
- Form: Name, Email, Gender (Male/Female), Password (min 8 karakter)
- Tombol: "Sign up"
- Link bawah: "Already have an account? Log in"

### Apa yang user lakukan

1. Isi nama, email, jenis kelamin, password.
2. Klik **"Sign up"**.

### Di balik layar

1. Client kirim form data ke `signupAction` (server action).
2. Validasi dilakukan di server (Zod schema).
3. `supabase.auth.signUp()` dipanggil — membuat user di Supabase Auth dengan email + password + metadata (`display_name`, `gender`).
4. **Privy embedded wallet OTOMATIS dibuat** — karena konfigurasi `createOnLogin: "all-users"` di Privy provider (`components/providers/privy-provider.tsx:47-51`). User tidak melihat ini terjadi, tapi di background:
   - Privy membuat Ethereum wallet baru (embedded type)
   - Wallet address dan private key dikelola oleh Privy (user tidak perlu backup seed phrase)
   - Wallet ini nanti dipakai untuk sign transaksi blockchain
5. Jika berhasil, redirect ke `/onboarding`.
6. **Jika Supabase email confirmation aktif**: user akan dikirim email verifikasi. Signup "berhasil" tapi session belum aktif sampai email dikonfirmasi.

### Hal yang perlu diperhatikan

- **Email confirmation**: Kalau diaktifkan di Supabase Dashboard, user harus klik link di email dulu sebelum bisa login. Untuk production flow ini bagus (verifikasi email), tapi untuk testing perlu dimatikan.
- **Tidak ada verifikasi nama/gender** — user bisa isi apa saja.

---

## 3. Onboarding — Pilih Langkah Pertama

### Apa yang user lihat

Halaman `/onboarding` menampilkan 2 kartu besar side-by-side:

| Kartu                | Judul                                | Deskripsi                             |
| -------------------- | ------------------------------------ | ------------------------------------- |
| **Create Warehouse** | "Start a new warehouse"              | "You automatically become its owner." |
| **Join Warehouse**   | "Request access to an existing team" | "Already have a warehouse code?"      |

### Apa yang user lakukan

- Klik **Create Warehouse** ke `/onboarding/create`
- Klik **Join Warehouse** ke `/onboarding/join`

### Di balik layar

Halaman navigasi murni. Tidak ada API call.

---

## 4. Create Warehouse — Membuat Gudang Baru

### Apa yang user lihat

Halaman `/onboarding/create`:

**Form:**

- Warehouse Name (wajib, max 200 karakter)
- Company/PT Name (opsional)
- Warehouse Type (opsional): General storage, Cold storage, Distribution center, Fulfillment center, Retail backroom, Other

**Info banner:**

> "Deploying is signed once with your wallet and submitted on your behalf. Transaction fees are covered by Chainventory."

**Tombol:** "Create Warehouse" — disabled saat wallet sedang sync.

### Apa yang user lakukan

1. Isi nama warehouse (dan opsional: nama perusahaan, tipe).
2. Klik **"Create Warehouse"**.

### Di balik layar — 5 tahap (deployment stepper)

Setelah klik Create Warehouse, user melihat **deployment stepper** vertikal dengan 5 tahap:

| Tahap             | Yang terjadi                                                                                                                                                                                                    |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Preparing**  | Server membaca data wallet user dari DB, mengecek nonce dari smart contract Factory, mengecek apakah user sudah punya warehouse aktif, generate kode warehouse `CHV-XXXXXXXX`.                                  |
| **2. Signing**    | Muncul **popup konfirmasi wallet** (Privy). Isi popup: EIP-712 typed data yang meminta user menandatangani otorisasi deploy. Ini **bukan transaksi blockchain** — hanya signature. User klik **Sign** di popup. |
| **3. Submitting** | Server memverifikasi signature, mengecek nonce belum stale, melakukan simulasi `eth_call` (tanpa gas), lalu mengirim transaksi deploy menggunakan **treasury wallet** (bukan wallet user).                      |
| **4. Confirming** | Menunggu transaksi terkonfirmasi di Base Sepolia (butuh beberapa detik).                                                                                                                                        |
| **5. Finalizing** | Membaca event `WarehouseDeployed` dari receipt untuk mendapatkan alamat kontrak. Menyimpan semua data ke database.                                                                                              |

### Hasil akhir

Success screen menampilkan:

- Warehouse code: `CHV-XXXXXXXX` (dengan tombol copy)
- Contract address: `0x...` (dengan link ke BaseScan)
- Tombol: "Go to dashboard"

### Kapan popup wallet muncul

Popup muncul **hanya sekali** di tahap Signing. Isinya:

- **Domain**: Chainventory
- **Action**: Otorisasi deploy warehouse
- **Data yang ditandatangani**: Alamat user, nonce, expiry time
- User klik **Sign** — ini bukan transaksi berbayar, hanya tanda tangan kriptografi

### Siapa yang bayar gas

**Chainventory (treasury) yang bayar, BUKAN user.** Treasury adalah EOA terpisah yang ditandatangani di server-side menggunakan `TREASURY_PRIVATE_KEY` (`lib/warehouses/chain.ts:43-49, 102-122`). User tidak perlu punya ETH di wallet mereka.

### Missing link

Tidak ada masalah. Flow dari form, signing, stepper, success, sampai dashboard terhubung dengan baik.

---

## 5. Join Warehouse — Gabung ke Gudang yang Sudah Ada

### Apa yang user lihat

Halaman `/onboarding/join`:

- Form satu field: **Warehouse Code** (format `CHV-XXXXXXXX`)
- Input auto-uppercase, monospace font
- Tombol: "Request to Join"

### Apa yang user lakukan

1. Masukkan kode warehouse yang diberikan oleh Owner/Manager.
2. Klik **"Request to Join"**.

### Di balik layar

1. Server memvalidasi kode warehouse ada di database.
2. Mengecek user belum menjadi member warehouse ini.
3. Mengecek warehouse menerima join request.
4. Membuat record `pending` di tabel membership.
5. **Notifikasi dikirim ke Owner + Manager** warehouse: "Ada yang ingin join."

### Setelah submit

User melihat **timeline 3 langkah**:

1. Request sent (selesai)
2. Owner approves (menunggu)
3. Access granted (belum terjadi)

Status: "Pending approval". User harus menunggu Owner atau Manager menyetujui.

### Kapan user bisa masuk dashboard

**Belum bisa.** User tetap di halaman "pending" sampai ada yang approve. Setelah diapprove:

- User mendapat notifikasi `join_approved`.
- User bisa login dan melihat warehouse di dashboard.

---

## 6. Setelah Masuk Dashboard — Tampilan Pertama

### Apa yang user lihat

Halaman `/dashboard`:

**Jika user belum punya warehouse** (fresh account, belum join):

- Empty state dengan pesan dan tombol "Create Warehouse" / "Join Warehouse".

**Jika user punya warehouse:**

- **Nama warehouse** + kode `CHV-XXXXXXXX`
- **Status badge** (active / suspended)
- **InactivityBanner** jika warehouse sudah lama tidak aktif (lihat bagian 13)
- **Quick action buttons**: "Stock Movements", "Products", "Analytics"

### Navigasi sidebar

| Menu                       | Akses                                 |
| -------------------------- | ------------------------------------- |
| Dashboard                  | Semua member                          |
| Inventory > Products       | Semua member                          |
| Inventory > Stock Movement | Semua member                          |
| Transactions               | Semua member                          |
| Members                    | Semua member                          |
| Analytics                  | Semua member                          |
| Notifications              | Semua member                          |
| Blockchain                 | Semua member                          |
| Settings                   | Semua member                          |
| Developer Console          | **Hanya developer yang di-allowlist** |

### Missing link

**Potensi masalah**: Jika user baru saja signup dan email confirmation aktif di Supabase, user mungkin tidak bisa login sama sekali. Harus pastikan flow email confirmation sudah diuji.

---

## 7. Kelola Produk

### Menambah Produk

**Apa yang user lihat:**

Dialog/form dengan field:

- Product Name (wajib)
- SKU (wajib)
- Category (opsional)
- Unit (wajib, **terkunci setelah ada stock movement pertama**)
- Description (opsional)
- Low Stock Threshold (opsional — kalau stok di bawah angka ini, ada warning di dashboard)
- **Initial Quantity** (opsional — hanya muncul saat create, bukan edit)

**Di balik layar:**

Kalau user isi Initial Quantity > 0, ada **2 langkah** di belakang:

1. Product record dibuat di database.
2. Stock movement `stock_in` dibuat otomatis dengan jumlah Initial Quantity.

Jadi user mengira "tambah produk sekaligus isi stok", tapi di belakang ini adalah 2 operasi terpisah.

### Bulk Add

**Apa yang user lihat:**

Dialog dengan 3 mode:

1. **Manual** — grid baris per baris, isi nama/SKU/unit satu per satu
2. **Paste Data** — tempel teks CSV
3. **Upload CSV** — pilih file CSV

**Flow:**

1. Isi/upload data, lalu Preview step menampilkan "Valid rows: X / Invalid rows: Y" dengan error review per baris.
2. Klik Import, lalu Import step menampilkan progress.
3. Result step: "Created: X, Failed: Y" dengan detail error per baris.

**Di balik layar:** Setiap baris diproses satu per satu (bukan all-or-nothing). Baris yang gagal tidak memblokir baris lain.

### Edit Produk

Form yang sama dengan Create, tapi **field Unit terkunci** kalau sudah ada stock movement. User harus menghubungi admin jika ingin mengubah satuan.

### Archive Produk

Konfirmasi dialog destructive. Produk yang diarsipkan tidak terhapus — statusnya berubah dan tidak muncul di tabel utama. Stok final tercatat.

---

## 8. Stock In/Out — Mutasi Stok

### Apa yang user lihat

Form dialog dengan field:

- **Product** — dropdown pencarian (atau sudah pre-selected kalau dari tabel produk)
- **Type** — stock_in, stock_out, adjustment, reversal
- **Quantity** — desimal, max 3 angka di belakang koma
- **Reason** — wajib untuk adjustment/reversal, opsional untuk stock in/out

### Apa yang user lakukan

1. Pilih produk dan tipe mutasi.
2. Masukkan jumlah.
3. Isi alasan (jika diperlukan).
4. Klik Submit.

### Di balik layar

1. Client kirim request ke server.
2. Server memanggil Supabase RPC `apply_stock_movement`.
3. **Optimistic concurrency check**: Server membandingkan `expectedBalanceVersion` — kalau sudah ada mutasi lain yang mengubah stok di saat yang sama, proses gagal.
4. Record dibuat di tabel `stock_movements` dengan status `committed`.
5. Balance produk di-update.
6. **Proof otomatis dibuat** — hash payload dikirim ke blockchain (lihat bagian 9).

### Error handling

**STALE_STOCK:**

- Pesan: "Stock updated by another user. Refreshing inventory..."
- Otomatis refresh data setelah 1.2 detik.
- User harus coba lagi dengan data terbaru.

**INSUFFICIENT_STOCK:**

- Pesan: "Not enough stock available for this stock out."
- Menampilkan stok saat ini.

### Tipe mutasi

| Tipe       | Siapa yang bisa       | Approval?                                  |
| ---------- | --------------------- | ------------------------------------------ |
| stock_in   | Staff, Manager, Owner | Langsung committed                         |
| stock_out  | Staff, Manager, Owner | Langsung committed                         |
| adjustment | Staff, Manager, Owner | **Butuh approval** dari Owner/Manager lain |
| reversal   | Staff, Manager, Owner | **Butuh approval** dari Owner/Manager lain |

---

## 9. Proof Blockchain — Verifikasi di Base Sepolia

### Apa yang user lihat

**Di halaman Stock Movements (`/inventory/movements`):**

- Kolom **Proof** menampilkan status: pending, submitted, confirmed, failed, manual_review
- Jika confirmed: link tx hash ke BaseScan
- Jika pending: status badge amber dengan animasi

**Di halaman Blockchain (`/blockchain`):**

- **Summary cards**: Total proofs, Confirmed (hijau), Pending (amber), Need attention (merah)
- **Warehouse Contract Card**: Alamat kontrak, link BaseScan, status deployment
- **Proofs Ledger Table**: Daftar semua proof dengan status, tx hash, attempts, tanggal
- **Failure Recovery Section**: Jika ada proof gagal, tombol Retry

### Di balik layar — Pipeline

```
Stock movement committed
    |
    v
[1] Proof created (status: pending) -> masuk outbox
    |
    v
[2] Treasury submit tx (status: submitted) -> via QStash
    |
    v
[3] Confirmation check (status: confirming) -> polling setiap 5-80 detik
    |
    v
[4] >= 2 block confirmations -> status: confirmed
```

**Retry otomatis:**

- Maksimal 5 percobaan
- Exponential backoff: 30s, 60s, 120s, 240s, 480s
- Setelah 5x gagal, pindah ke `manual_review`

**Siapa yang bayar gas proof?**
Sama seperti warehouse — **treasury yang bayar**, bukan user.

### Bagaimana user tahu proof sudah confirmed

- **Realtime update**: Halaman movements dan blockchain menggunakan Supabase Realtime — status berubah langsung tanpa refresh.
- **Notifikasi**: User dapat notifikasi `proof_confirmed` atau `proof_failed` / `proof_manual_review`.
- **BaseScan**: Link langsung ke transaksi di BaseScan (testnet explorer).

---

## 10. Kelola Member

### Invite lewat kode warehouse

Owner/Manager membagikan kode warehouse `CHV-XXXXXXXX` ke orang yang mau diinvite. Tidak ada fitur invite via email — hanya kode manual.

### Approve Join Request

**Apa yang user lihat di halaman Members:**

- Daftar join request yang pending
- Setiap request menampilkan: nama user, email, waktu request
- Tombol **Approve** dan **Reject**

**Approve:**

1. Owner/Manager klik Approve.
2. Pilih role yang akan diberikan (dropdown).
3. Submit.

**Siapa yang bisa approve role apa:**

| Role yang bisa diberikan | Owner                | Manager              |
| ------------------------ | -------------------- | -------------------- |
| MANAGER                  | Ya                   | **Tidak**            |
| STAFF                    | Ya                   | Ya                   |
| AUDITOR                  | Ya                   | Ya                   |
| VIEWER                   | Ya                   | Ya                   |
| OWNER via join           | **Tidak** (diblokir) | **Tidak** (diblokir) |

**Reject:**

- Owner atau Manager bisa reject.
- Bisa kasih alasan (opsional).
- User yang request mendapat notifikasi `join_rejected`.

### Perbedaan Owner vs Manager

| Aksi                                      | Owner | Manager   |
| ----------------------------------------- | ----- | --------- |
| Approve join sebagai MANAGER              | Ya    | **Tidak** |
| Approve join sebagai STAFF/AUDITOR/VIEWER | Ya    | Ya        |
| Assign role MANAGER                       | Ya    | **Tidak** |
| Transfer ownership                        | Ya    | **Tidak** |
| Remove member                             | Ya    | Ya        |
| Edit warehouse settings                   | Ya    | Ya        |

### Missing link

**Catatan**: Tidak ada flow "invite via email" atau "link invite". Owner harus share kode warehouse secara manual (WhatsApp, email, dll). Ini bukan bug — desain sengaja manual untuk kontrol akses.

---

## 11. Notifikasi

### Kapan user dapat notifikasi

| Event                         | Notifikasi dikirim ke | Tipe                           |
| ----------------------------- | --------------------- | ------------------------------ |
| Ada yang request join         | Owner + Manager       | `join_requested`               |
| Join request di-approve       | User yang request     | `join_approved`                |
| Join request di-reject        | User yang request     | `join_rejected`                |
| Role berubah                  | User yang terpengaruh | `membership_role_changed`      |
| User di-remove dari warehouse | User yang di-remove   | `membership_removed`           |
| User leave warehouse          | Owner + Manager       | `membership_left`              |
| Ownership ditransfer          | Old + new owner       | `ownership_transferred`        |
| Adjustment butuh approval     | Owner + Manager       | `adjustment_pending`           |
| Adjustment di-approve         | User yang request     | `adjustment_approved`          |
| Adjustment di-reject          | User yang request     | `adjustment_rejected`          |
| Proof berhasil on-chain       | Actor + Owner         | `proof_confirmed`              |
| Proof gagal                   | Actor + Owner         | `proof_failed`                 |
| Proof perlu manual review     | Actor + Owner         | `proof_manual_review`          |
| Warehouse mulai tidak aktif   | Owner + Manager       | `warehouse_inactivity_warning` |
| Warehouse disuspend           | Owner + Manager       | `warehouse_suspended`          |

### Apa yang user lihat

- **Bell icon di topbar** menampilkan jumlah unread (maks "99+").
- **Realtime**: Notifikasi muncul langsung tanpa refresh (subscribe ke Supabase Realtime).
- **Flash animation**: Notifikasi baru trigger animasi flash + badge "pop".
- **Klik notifikasi**: Langsung navigate ke halaman terkait (misal klik notifikasi join_request, pindah ke `/members`).
- **"Mark all read"** button di halaman `/notifications`.

### Fail-safe

Notifikasi dibuat di database menggunakan `BEGIN/EXCEPTION` block. Jika insert notifikasi gagal, error di-log ke `notification_errors` tapi **tidak membatalkan** operasi utama (misal approval tetap berhasil meskipun notifikasi gagal dikirim).

---

## 12. Faucet Claim — Dapatkan Testnet ETH

### Kapan tombol ini relevan

Hanya relevan untuk user yang ingin test transaksi di Base Sepolia (testnet). Faucet memberikan **0.001 Base Sepolia ETH** per claim.

### Siapa yang bisa claim

**Hanya developer yang di-allowlist** — user biasa tidak melihat tombol ini. Akses ke Developer Console diatur via `DEVELOPER_ALLOWLIST` env var (email atau wallet address).

### Dimana tombolnya

Di halaman **Developer Console** (`/console`), dalam **Treasury Card**:

- Menampilkan saldo treasury saat ini
- Tombol: "Claim 0.001 Base Sepolia"
- Cooldown: 12 jam antara claim

### Apa yang terjadi setelah klik

1. Rate limit check via Upstash Redis (jika Redis down, claim ditolak — fail-closed).
2. DB record dibuat via atomic RPC `claim_faucet`.
3. **0.001 ETH dikirim dari treasury ke wallet user** via Base Sepolia.
4. Tombol berubah menjadi countdown timer: "Available in HH:MM:SS".
5. Tx hash ditampilkan dengan link ke BaseScan.

### Anti-abuse (6 layer)

1. Wallet validation (regex)
2. Rate limit via Upstash Redis (12 jam)
3. DB unique constraint (tidak bisa claim 2x dalam 12 jam)
4. Atomic RPC check + insert
5. On-chain ETH transfer
6. Audit log

---

## 13. Warehouse Lifecycle — Inaktivitas dan Suspend

### Apa yang dianggap "aktif"

Warehouse dianggap aktif jika ada:

- Stock movement apapun (stock_in, stock_out, adjustment, reversal)
- Member join/approve
- Proof confirmed di blockchain

**Login, melihat dashboard, atau keep-alive pings TIDAK dihitung sebagai aktivitas.**

### Timeline inaktivitas

| Hari tanpa aktivitas | Yang terjadi                                                                                                                                                                                                      |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0-22 hari            | Tidak ada warning                                                                                                                                                                                                 |
| **23 hari**          | **Warning banner** muncul di dashboard: "{name} akan disuspend. Warehouse ini belum ada aktivitas selama {N} hari. Lakukan stock movement apa pun dalam {daysLeft} hari ke depan." Tombol: "Buat Stock Movement". |
| **27 hari**          | **Critical warning** — notifikasi `warehouse_inactivity_warning` dikirim ke Owner + Manager.                                                                                                                      |
| **30 hari**          | **Warehouse disuspend** — status berubah ke `suspended`. Notifikasi `warehouse_suspended` dikirim. Semua mutasi stok dan keanggotaan **dijeda** (error "warehouse is suspended").                                 |

### Apa yang user lihat

**Warning (23-29 hari):**

- Banner kuning/amber di top dashboard
- Clock icon
- Pesan: "Warehouse ini belum ada aktivitas selama N hari. Lakukan stock movement apa pun dalam X hari ke depan untuk menjaganya tetap aktif."
- Tombol "Buat Stock Movement" → link ke `/inventory/movements`

**Suspended (30+ hari):**

- Banner merah di top dashboard
- Ban icon
- Pesan: "{name} disuspend karena tidak aktif. Warehouse ini disuspend setelah 30 hari tanpa aktivitas. Mutasi stok dan keanggotaan dijeda. Hubungi dukungan Chainventory untuk mengaktifkannya kembali."

### Bagaimana mengaktifkan kembali

Lakukan **stock movement apapun** sebelum 30 hari. Setelah disuspend, user harus **hubungi dukungan Chainventory** — tidak ada self-service reactivation.

### Di balik layar

Cron job `run_warehouse_lifecycle` berjalan setiap hari jam 05:00 (via Vercel Cron). Mengecek semua warehouse active yang sudah >= 23 hari tanpa aktivitas.

---

## 14. Developer Console — Fitur Admin

### Siapa yang bisa akses

**Hanya developer yang di-allowlist** via `DEVELOPER_ALLOWLIST` env var. Role Owner/Manager di warehouse **TIDAK memberikan akses** ke console — ini sistem terpisah.

### Dimana aksesnya

Sidebar: **Developer Console** (hanya muncul jika user di-allowlist). Route: `/console`.

### Apa yang bisa dilakukan

| Fitur                   | Deskripsi                                                                                            |
| ----------------------- | ---------------------------------------------------------------------------------------------------- |
| **Summary Cards**       | Statistik platform-wide: total/active/suspended warehouses, members, proofs by status, outbox status |
| **Manual Review Table** | Proofs stuck di `manual_review` — bisa di-requeue untuk retry                                        |
| **Treasury Card**       | Saldo signer, faucet eligibility, claim button                                                       |
| **Dependencies Card**   | Status kesehatan layanan eksternal (API keys, connectivity)                                          |
| **Error Summary**       | Gagal proofs/errors                                                                                  |
| **Audit Trail**         | Log audit semua aktivitas                                                                            |
| **Export**              | Export data                                                                                          |

### API routes

| Route                            | Method | Fungsi                    |
| -------------------------------- | ------ | ------------------------- |
| `/api/console/summary`           | GET    | Platform stats            |
| `/api/console/proofs`            | GET    | Manual review proofs      |
| `/api/console/proofs/[id]/retry` | POST   | Requeue proof             |
| `/api/console/errors`            | GET    | Error summary             |
| `/api/console/audit`             | GET    | Audit trail               |
| `/api/console/treasury`          | GET    | Treasury balance + faucet |
| `/api/console/dependencies`      | GET    | Service health            |
| `/api/console/export`            | GET    | Data export               |

---

## Ringkasan Flow Lengkap

```
Landing Page
    |
    v
Signup (email/password)
    |  -> Privy embedded wallet dibuat otomatis
    v
Onboarding
    |  -> Create Warehouse  OR  Join Warehouse
    |
    v (Create)
Form -> Popup Sign EIP-712 (sekali saja)
    |  -> Deployment Stepper (5 tahap)
    |  -> Treasury bayar gas (bukan user)
    v
Dashboard
    |
    +-> Tambah Produk (with optional initial stock)
    +-> Stock In/Out (dengan error handling STALE/INSUFFICIENT)
    +-> Proof blockchain otomatis (pending -> submitted -> confirmed)
    +-> Kelola Members (invite via kode, approve/reject)
    +-> Lihat Notifikasi (realtime)
    +-> Blockchain page (semua proof, BaseScan links)
    +-> Developer Console (hanya untuk admin)
    |
    v
Warehouse Lifecycle
    23 hari tanpa aktivitas -> Warning banner
    30 hari -> Suspend (semua mutasi dijeda)
```
