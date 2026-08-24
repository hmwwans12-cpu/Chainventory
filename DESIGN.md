# DESIGN.md

# Inventory Management Web3 — Design System & UI/UX Specification

**Status:** Review — menunggu penyelarasan §25 dengan keputusan auth di `TECHSTACK.md`
**Version:** 1.0
**Related Documents:** PRD.md, TECHSTACK.md, ARSITEKTUR.md, WORKFLOW.md, AGENT.md

---

## 1. Design Goals

Sistem harus memiliki karakter:

- Simple
- Modern
- Professional
- Informative
- Clean
- Responsive
- Non-crypto-user friendly
- Tidak terlihat seperti dashboard crypto yang terlalu kompleks
- Blockchain harus terasa sebagai fitur validasi di belakang sistem, bukan menjadi pusat perhatian UI

### Primary UX Principle

> User harus bisa menggunakan inventory management tanpa harus memahami blockchain.

Informasi blockchain ditampilkan ketika relevan, misalnya:

- Wallet address
- Transaction status
- Contract address
- Blockchain proof
- Base Sepolia transaction
- Verification status

Tetapi informasi tersebut tidak boleh memenuhi UI utama.

---

## 2. Design Language

### 2.1 Visual Direction

Gunakan kombinasi:

- Shadcn-style UI
- Modern SaaS dashboard
- Minimal Web3 interface
- Soft rounded corners
- Subtle borders
- Soft shadows
- Clean typography
- Smooth micro-interactions

Hindari:

- Glassmorphism berlebihan
- Gradient berlebihan
- Neon crypto aesthetic
- Excessive glow
- Excessive animation
- UI terlalu padat
- Card berlebihan

---

## 3. Color System

### 3.1 Brand Colors

**Fun Green** — `#186049` — Primary color pada Light Mode.
**Eden** — `#247158` — Secondary green / surface accent.
**Tradewind** — `#6AB29B` — Accent utama Dark Mode.
**Dawn Pink** — `#E4D5C7` — Warm background / soft surface.

---

## 4. Light Mode

| Token           | Value                                                          |
| --------------- | -------------------------------------------------------------- |
| Main Background | `#E4D5C7`                                                      |
| Card / Surface  | `#F3ECE5`, `#FFFFFF` (putih untuk card penting/kontras tinggi) |
| Heading         | `#186049`                                                      |
| Body            | `#1C3B30`                                                      |
| Muted           | `#247158`                                                      |
| Primary         | `#186049`                                                      |
| Secondary       | `#6AB29B`                                                      |
| Border          | `#D4C2B2`                                                      |

---

## 5. Dark Mode

Dark mode tidak menjadi prioritas MVP awal. Namun design system harus disiapkan agar mudah ditambahkan.

| Token      | Value     |
| ---------- | --------- |
| Background | `#0E231B` |
| Card       | `#153227` |
| Heading    | `#E4D5C7` |
| Body       | `#E8F2EE` |
| Muted      | `#6AB29B` |
| Primary    | `#6AB29B` |
| Secondary  | `#247158` |
| Border     | `#23493C` |

---

## 6. Typography

Gunakan dua font:

**Primary Display Font — PP Grotesk**
Digunakan untuk: page heading, dashboard heading, hero heading, large statistic, important numbers.

**Body Font — Source Sans 3**
Digunakan untuk: paragraph, form, table, navigation, button, label, description, notification.

### Typography Principle

Heading harus memiliki visual identity yang lebih kuat. Body text harus tetap sangat readable. Jangan menggunakan terlalu banyak font weight.

Recommended: `Regular`, `Medium`, `Semibold`, `Bold`.

---

## 7. Icon System

Gunakan salah satu icon library secara konsisten.

Prioritas: 1. Lucide Icons — 2. Tabler Icons — 3. Phosphor Icons.

**Recommended:** Lucide Icons. Jangan menggunakan emoji sebagai icon UI utama.

| Fungsi        | Icon                  |
| ------------- | --------------------- |
| Dashboard     | `LayoutDashboard`     |
| Inventory     | `Package`             |
| Stock In      | `PackagePlus`         |
| Stock Out     | `PackageMinus`        |
| Transactions  | `ArrowLeftRight`      |
| Members       | `Users`               |
| Analytics     | `ChartNoAxesCombined` |
| Notifications | `Bell`                |
| Settings      | `Settings`            |
| Wallet        | `Wallet`              |
| Blockchain    | `Blocks`              |
| Security      | `ShieldCheck`         |

---

## 8. Icon Rules

Icon harus: consistent stroke width, consistent size, aligned dengan text, tidak terlalu besar, tidak digunakan sebagai dekorasi tanpa fungsi.

Recommended sizes:

```text
16px → inline
18px → button
20px → navigation
24px → card/action
28-32px → empty state
```

---

## 9. Border Radius

| Elemen     | Radius |
| ---------- | ------ |
| Small      | 6px    |
| Button     | 8px    |
| Input      | 8px    |
| Card       | 12px   |
| Large Card | 16px   |
| Modal      | 16px   |

Jangan menggunakan radius ekstrem seperti `rounded-full` untuk semua komponen. Gunakan `rounded-full` hanya untuk: avatar, status badge tertentu, pills, small indicators.

---

## 10. Shadows

Gunakan shadow secara subtle.

```text
Default Card   → border
Elevated Card  → border + subtle shadow
Modal          → stronger shadow
Dropdown       → stronger shadow
```

Hindari heavy shadows.

---

## 11. Layout

Dashboard menggunakan Sidebar + Topbar + Main Content.

```text
┌──────────────┬──────────────────────────────┐
│              │ Topbar                       │
│   Sidebar    ├──────────────────────────────┤
│              │                              │
│              │ Main Content                 │
│              │                              │
└──────────────┴──────────────────────────────┘
```

---

## 12. Sidebar

Sidebar harus dapat di-collapse.

- **Expanded:** Icon + Label.
- **Collapsed:** Icon only.

Collapse button harus menggunakan icon yang jelas (`PanelLeftClose`, `PanelLeftOpen`, `ChevronLeft`, `ChevronRight`). Jangan menggunakan simbol `<` sebagai text biasa.

Tooltip harus muncul ketika sidebar collapsed.

---

## 13. Sidebar Navigation

```text
Dashboard

Inventory
  Products
  Stock Movement

Transactions

Members

Analytics

Notifications

Settings
```

Blockchain-related section dapat berada di `Blockchain`, atau di Settings / Warehouse detail. Jangan membuat blockchain menjadi navigation utama jika tidak diperlukan.

---

## 14. Topbar

Topbar minimal memiliki: Page Title/Breadcrumb, Notifications, Profile.

Notification menggunakan Bell icon + unread count. Jangan menampilkan notification sebagai popup terus menerus.

---

## 15. Notification

Gunakan notification center.

Notification dapat berasal dari: join request, join request approved/rejected, transaction completed/failed, blockchain confirmation/failure, member changes, warehouse status, security event, faucet status.

Unread indicator: Bell + `●` / numeric badge.

---

## 16. Toast

Gunakan **Gooey Toast** (reference: `https://goey-toast.vercel.app/`).

Toast digunakan untuk feedback singkat, contoh:

```text
✓ Product added successfully
✓ Stock in completed
✓ Join request approved
✕ Transaction failed
⚠ Blockchain confirmation delayed
```

Jangan menggunakan toast untuk informasi yang membutuhkan action panjang.

---

## 17. Toast Rules

Toast harus: short, informative, actionable jika diperlukan, tidak spam, auto dismiss.

Untuk error: **what happened + what user can do**.

```text
Transaction failed.

Your inventory was not changed.
Try again in a moment.
```

---

## 18. Motion & Animation

Gunakan motion library yang ringan. **Recommended:** Motion / Framer Motion.

Animation harus: smooth, fast, subtle, functional. Jangan menggunakan animation hanya untuk dekorasi.

---

## 19. Animation Timing

```text
Micro interaction   → 100–150ms
Button feedback     → 100–200ms
Dropdown            → 150–200ms
Modal                → 200–250ms
Page transition      → 200–300ms
```

Gunakan easing yang natural.

---

## 20. Motion Examples

- **Sidebar:** smooth width transition.
- **Modal:** fade + slight scale.
- **Dropdown:** fade + translate.
- **Card:** subtle hover.
- **Loading:** skeleton shimmer.
- **Success:** small check animation.

Animation tidak boleh mengganggu workflow.

---

## 21. Landing Page

Landing page adalah halaman pertama user.

```text
Navigation: Logo | Features | About | FAQ | Login | Sign Up
CTA utama: Get Started
CTA kedua: Login
```

---

## 22. Landing Page Sections

```text
Hero
↓
Problem
↓
Features
↓
How It Works
↓
Blockchain Explanation
↓
Security
↓
FAQ
↓
CTA
↓
Footer
```

---

## 23. Hero

Hero harus menjelaskan sistem dalam beberapa detik.

Positioning: _"Inventory Management with Blockchain Verification"_

Subtitle menjelaskan: inventory management, real-time stock, role-based access, blockchain verification.

CTA: `Create Warehouse`. Secondary: `Login`.

---

## 24. Blockchain Explanation

Jangan menggunakan istilah teknis berlebihan.

**Jelaskan:**

> Your inventory remains managed normally. Blockchain is used as an additional verification layer for important records.

**Bukan:**

> Decentralized immutable cryptographic inventory protocol...

---

## 25. Authentication UI

> **Catatan penyelarasan:** Flow berikut mengikuti keputusan identity architecture yang dikunci di `TECHSTACK.md` §2 — **Supabase Auth sebagai identitas utama** (email/Google, JWT asymmetric/JWKS), **Privy sebagai wallet layer** yang menerima custom-auth token dari sesi Supabase. Ini menggantikan draf awal yang menempatkan Privy sebagai auth utama.

Flow:

```text
Enter Warehouse Code (opsional, untuk join)
        ↓
Continue
        ↓
Supabase Auth (Email / Google)
        ↓
Session established → JWT issued
        ↓
Privy custom-auth menerima token sesi Supabase
        ↓
Embedded wallet tersedia otomatis
        ↓
Login / Signup selesai
```

Dari sudut pandang user, ini **tetap terasa sebagai satu langkah login** — pembagian Supabase/Privy di baliknya tidak perlu terlihat di UI. User tidak disuguhi dua layar login terpisah.

UI harus membuat perbedaan jelas dan tidak membingungkan antara:

- **Continue with Google / Email** (Supabase Auth — identitas utama)
- **Connect existing wallet** (opsi tambahan di layer Privy, untuk user yang ingin memakai external wallet alih-alih embedded wallet)

External wallet connection adalah pilihan sekunder yang muncul **setelah** identitas Supabase terbentuk, bukan gerbang login pertama.

---

## 26. Signup

Signup meminta: Name, Email (optional), Gender.

Setelah signup: `Create Warehouse` OR `Join Warehouse`.

---

## 27. Create Warehouse

Form: Warehouse Name, Company/PT Name, Warehouse Type.

Warehouse Code: Auto Generated. Contract: Auto Generated. User tidak perlu memasukkan contract address secara manual.

---

## 28. Deployment UX

Karena deployment menggunakan blockchain, UI harus menunjukkan progress:

```text
Creating warehouse...

✓ Preparing warehouse
✓ Authorization signed
✓ Deployment submitted
● Waiting for confirmation
○ Finalizing warehouse
```

Jika gagal:

```text
Warehouse deployment failed.

No warehouse was created.

[Try Again]
```

---

## 29. Dashboard

Dashboard harus langsung memberikan informasi penting.

```text
Profile / Wallet Card
Statistics
Charts
Recent Stock Movement
Recent Transactions
Notifications / Activity
```

---

## 30. Profile / Wallet Card

Card dapat diklik. Menampilkan: Name, Role, Wallet Address, Base Sepolia Balance.

Optional: Warehouse, Contract Address.

Click membuka: Profile & Wallet.

---

## 31. Statistics Cards

Minimal: Total Products, Total Stock, Stock In, Stock Out.

Optional: Low Stock, Pending Requests, Transactions.

Card harus clickable jika memiliki detail page.

---

## 32. Charts

Dashboard memiliki chart Stock In/Out (line/bar chart).

Time range: `7 Days`, `30 Days`, `90 Days`.

---

## 33. Additional Analytics

Recommended: Stock Movement Trend, Top Products, Recent Activity, Transaction Activity.

Jangan terlalu banyak chart. Dashboard harus tetap mudah dibaca.

---

## 34. Inventory Page

Inventory menggunakan table.

Columns: Product, SKU/Code, Quantity, Unit, Status, Updated, Actions.

Actions: View, Edit, Stock In, Stock Out.

---

## 35. Product Creation

Form harus mendukung: Product Name, Product Code, Category, Unit, Initial Quantity, Description.

Harga beli dan supplier tidak diperlukan. Maximum stock juga tidak diperlukan.

---

## 36. Bulk Add Product

UI: `Bulk Add Products` dengan pilihan Upload CSV / Paste Data / Manual Bulk Form.

Harus ada preview sebelum submit:

```text
Valid rows: 98
Invalid rows: 2

[Review Errors]
[Import]
```

---

## 37. Stock Movement

Types: `STOCK IN`, `STOCK OUT`.

Form: Product, Quantity, Notes.

Tidak membutuhkan approval manager untuk stock in/out.

---

## 38. Transaction Approval

Approval digunakan untuk transaction yang memang membutuhkan approval berdasarkan business rule (Adjustment/Reversal).

UI: `Pending`, `Approved`, `Rejected`, `Failed`.

Detail transaction: Actor, Role, Action, Product, Quantity, Timestamp, Blockchain Status.

---

## 39. Blockchain Proof

User tidak perlu melihat raw transaction data secara default.

Tampilkan: `Blockchain Verified ✓` — Base Sepolia — Transaction confirmed.

CTA: `View on BaseScan`.

Detail dapat menampilkan: Transaction Hash, Block, Contract Address, Timestamp.

---

## 40. Members

Members table: Name, Wallet, Role, Status, Joined, Actions.

Role: `OWNER`, `MANAGER`, `STAFF`, `AUDITOR`, `VIEWER`.

---

## 41. Role Badge

Gunakan color + icon + text. Jangan hanya mengandalkan warna.

---

## 42. Join Request

Status: `Pending`, `Approved`, `Rejected`.

Manager dapat approve join request sesuai authorization rules. Manager hanya dapat assign `STAFF`, `AUDITOR`, `VIEWER`. Owner dapat mengelola role yang lebih tinggi.

---

## 43. Empty State

Setiap halaman harus memiliki empty state, contoh inventory:

```text
No products yet.

Start adding products to manage your warehouse inventory.

[Add Product]
[Bulk Add]
```

Empty state harus memiliki: icon, title, description, primary CTA, optional secondary CTA.

---

## 44. Loading State

Gunakan skeleton loading. Jangan menampilkan spinner untuk seluruh page jika hanya sebagian data yang loading.

Skeleton harus mengikuti bentuk konten sebenarnya (Card → Card skeleton, Table → Row skeleton, Chart → Chart skeleton).

---

## 45. Lazy Loading

Gunakan lazy loading untuk: heavy charts, large tables, modal content, non-critical components.

Initial dashboard harus tetap cepat.

---

## 46. Error State

Error state harus informatif:

```text
Unable to load inventory.

Something went wrong while retrieving your inventory.

[Retry]
```

Jangan hanya menampilkan `Error 500`.

---

## 47. Responsive Design

Website harus support: Desktop, Tablet, Mobile.

---

## 48. Mobile Navigation

Desktop: Sidebar. Mobile: Topbar + Drawer/Sheet navigation.

Sidebar tidak boleh mengambil seluruh layar secara permanen di mobile.

---

## 49. Mobile Tables

Strategy responsive: Horizontal scroll atau Card layout.

Jangan membuat table menjadi terlalu kecil hanya supaya semuanya muat.

---

## 50. Forms

Form harus: clear labels, helpful descriptions, inline validation, error messages, loading state, disabled state.

```text
Warehouse Name

[________________]

Name used to identify your warehouse.
```

---

## 51. Form Validation

Error harus berada dekat dengan field:

```text
Warehouse Name

[________________]

⚠ Warehouse name is required.
```

Jangan hanya menggunakan toast untuk validation.

---

## 52. Confirmation Dialog

Gunakan confirmation dialog untuk destructive actions:

```text
Delete Product?

This action cannot be undone.

[Cancel]
[Delete Product]
```

Untuk warehouse deletion gunakan confirmation yang lebih ketat.

---

## 53. Destructive Actions

`Delete`, `Remove`, `Revoke`, `Reject`, `Transfer Ownership` harus memiliki confirmation.

Ownership transfer harus memiliki confirmation tambahan dan informasi konsekuensi.

---

## 54. Security UX

Security event harus mudah terlihat:

```text
✓ Wallet verified
✓ Role verified
✓ Warehouse verified
```

Jika ada masalah:

```text
⚠ Blockchain verification unavailable
```

Jangan membuat user panik jika hanya RPC sedang unavailable.

---

## 55. Faucet UI

Dashboard/profile dapat menampilkan Base Sepolia Balance.

Jika saldo rendah: `Low testnet balance` — `Claim 0.001 Base Sepolia`.

Cooldown: `Available in 08:32:14`.

Jangan menampilkan faucet sebagai fitur utama.

---

## 56. Wallet UI

Wallet address harus dipendekkan: `0x8F2A...91C4`.

Actions: Copy, View on BaseScan.

Balance: `0.024 BASE`.

---

## 57. Warehouse Identity

Warehouse Code dan Contract Address harus dapat diakses dengan mudah:

```text
Warehouse Code
WH-7K29-XP4

Contract
0x92A...B31
```

Actions: Copy, View on BaseScan.

---

## 58. Developer Dashboard

Developer mempunyai dashboard terpisah. Developer berada di level tertinggi sistem (allowlist environment variable, bukan role warehouse — lihat `ARSITEKTUR.md` §7.4). Developer dashboard harus sangat informatif.

---

## 59. Developer Dashboard Metrics

```text
Total Users
Active Users
Total Warehouses
Active Warehouses
Suspended Warehouses
Total Transactions
Failed Transactions
Blockchain Transactions
Failed Blockchain Transactions
Treasury Balance
Faucet Distribution
Factory Deployments
```

---

## 60. Developer Monitoring

Developer harus dapat melihat: System Health, Database Health, RPC Health, Blockchain Health, Treasury Status, Factory Status.

---

## 61. Developer Activity

Activity log: Timestamp, User, Wallet, Action, IP/Request metadata, Resource, Result.

Audit log tidak boleh diedit.

---

## 62. Developer Notifications

Mencakup: treasury balance low, RPC failure spike, factory deployment failures, faucet abuse, database errors, blockchain sync failures, system errors.

---

## 63. Realtime UI

Data penting harus realtime: stock quantity, stock movement, transactions, join requests, notifications, member changes.

UI harus memperbarui tanpa full page refresh.

```text
● Live  →  ● Reconnecting...  →  ✓ Live
```

---

## 64. Concurrent Update UX

Jika dua user melakukan perubahan bersamaan, UI harus menunjukkan hasil terbaru (mengikuti response `STALE_STOCK` dari `ARSITEKTUR.md` §4):

```text
Stock updated by another user.
Refreshing inventory...
```

Jangan silently overwrite data.

---

## 65. Status Indicators

Gunakan status indicator konsisten: `Success`, `Pending`, `Failed`, `Warning`, `Inactive`, `Suspended`.

Status harus menggunakan icon + text + color, bukan color saja.

---

## 66. Accessibility

Minimal: keyboard navigable, focus state jelas, proper labels, accessible buttons, accessible dialogs, contrast yang cukup, tooltip untuk icon-only button, screen-reader friendly labels.

---

## 67. Button Hierarchy

- **Primary:** Create Warehouse, Add Product, Stock In.
- **Secondary:** Cancel, View, Details.
- **Destructive:** Delete, Revoke, Reject.
- **Ghost:** Copy, View, More.

---

## 68. Data Density

Inventory dashboard adalah business application. Prioritaskan information density, tetapi tetap readable, scannable, organized.

Jangan membuat semua data menjadi card. Gunakan Table, Chart, Card, List sesuai kebutuhan.

---

## 69. Design Consistency

Komponen yang sama harus memiliki behavior yang sama — semua "Copy address" menggunakan icon dan feedback yang sama, semua "Delete" menggunakan confirmation pattern yang sama, semua "Loading" menggunakan skeleton pattern yang sama.

---

## 70. Component Strategy

Prioritaskan reusable components:

```text
Button, Input, Select, Dialog, Sheet, Dropdown, Tooltip,
Toast, Badge, Card, Table, Tabs, Skeleton, Avatar,
Breadcrumb, Pagination, Command
```

Business components:

```text
WalletCard, WarehouseCard, ProductTable, StockMovementTable,
TransactionTable, MemberTable, BlockchainStatus,
TransactionStatus, RoleBadge, NotificationBell
```

---

## 71. UX Priority

```text
1. Correctness
2. Clarity
3. Speed
4. Accessibility
5. Visual polish
6. Animation
```

Visual tidak boleh mengorbankan correctness.

---

## 72. Web3 UX Principle

Blockchain harus terasa **simple, safe, understandable** — bukan complex, technical, crypto-heavy.

**Buruk:** _"Submit calldata to factory contract."_
**Bagus:** _"Authorize Warehouse Creation"_

---

## 73. Blockchain Loading State

Gunakan progress step: `Preparing → Signing → Submitting → Confirming → Completed`.

Jika pending terlalu lama:

```text
Blockchain confirmation is taking longer than expected.

You can safely leave this page.
We'll notify you when it's confirmed.
```

---

## 74. Failure Recovery

Setiap blockchain failure harus menjelaskan: apa yang terjadi, apa yang terdampak, apakah user perlu retry.

```text
Blockchain confirmation failed.

Your inventory data was not lost.

[Retry]
```

---

## 75. Accessibility + Blockchain

Jangan mengandalkan `green = success` / `red = failure` saja. Gunakan Icon + Label + Color.

---

## 76. Performance UX

Prioritas: fast initial load, progressive rendering, skeleton, lazy loading, realtime updates, optimistic UI hanya di tempat yang aman.

> **Catatan batas optimistic UI:** Larangan ini berarti UI tidak boleh menampilkan status "berhasil" **sebelum** respons mutation dari server diterima — bukan melarang UI menampilkan hasil segera **setelah** PostgreSQL RPC atomik commit. Mengikuti `ARSITEKTUR.md` §6: update Stock In/Out tampil dari respons mutation (yang sudah pasti commit di database), lalu direkonsiliasi oleh Realtime. Yang dilarang adalah menampilkan sukses murni di client sebelum ada konfirmasi database — bukan blockchain confirmation, yang memang secara desain berjalan async di belakang (lihat §73).

Untuk operasi sensitif seperti stock movement dan blockchain transaction: **jangan menggunakan optimistic update yang membuat UI terlihat sukses sebelum respons database diterima.**

---

## 77. SEO

Landing page harus SEO-ready. Minimal: Title, Description, Canonical, Open Graph, Twitter/X metadata, Structured Data, Sitemap, Robots.

Dashboard tidak perlu menjadi fokus SEO karena berada di area authenticated.

---

## 78. SEO Content

Landing page harus memiliki: Semantic HTML, Proper H1, H2 hierarchy, Descriptive links, Accessible images, Structured metadata.

---

## 79. Responsive Breakpoints

Gunakan breakpoint konsisten dari design system. Minimal: Mobile, Tablet, Desktop, Large Desktop.

Jangan mendesain berdasarkan device tertentu saja.

---

## 80. Design Do's

- Keep UI simple.
- Use whitespace.
- Use consistent icons.
- Show useful feedback.
- Explain blockchain in plain language.
- Use skeleton loading.
- Use realtime indicators.
- Make destructive actions explicit.
- Make responsive layouts.
- Keep dashboard information-dense but readable.

---

## 81. Design Don'ts

- Overuse gradients.
- Overuse animations.
- Use emoji as primary icons.
- Spam toast.
- Show raw blockchain data everywhere.
- Use huge cards for every metric.
- Hide important errors.
- Make mobile an afterthought.
- Make users understand blockchain before using inventory.
- Use color as the only status indicator.

---

## 82. Final Design Principle

> The system should feel like a modern inventory management SaaS first, and a blockchain application second.

Blockchain exists to improve: Verification, Integrity, Authorization, Auditability. It should not make ordinary inventory operations feel complicated.

---

## 83. Design Lock

Berikut dianggap terkunci kecuali diubah secara eksplisit:

- Shadcn-style UI
- PP Grotesk + Source Sans 3
- Fun Green / Eden / Tradewind / Dawn Pink palette
- Lucide Icons preferred
- Gooey Toast
- Motion-based subtle animation
- Collapsible sidebar
- Responsive design
- Skeleton loading
- Lazy loading
- Realtime UI
- Clickable profile/wallet card
- Blockchain proof via BaseScan
- Developer dashboard
- Informative empty/error states
- Accessibility considerations
- SEO-ready landing page
- Simple non-crypto-user-friendly Web3 UX
- Authentication flow: Supabase Auth (identitas) → Privy custom-auth (wallet) — lihat §25

---

## 84. UI Consistency Addendum (2026-08-24)

### 84.1 Spacing Scale (frozen)

| Tier      | Nilai                                             | Pemakaian               |
| --------- | ------------------------------------------------- | ----------------------- |
| Micro     | `4px` / `8px` (`gap-1`, `gap-2`)                  | icon↔label, label↔value |
| Component | `12px` / `16px` (`gap-3`, `gap-4`)                | antar-field, dalam card |
| Section   | `24px` / `32px` (`gap-6`, `gap-8`)                | antar-section halaman   |
| Page      | `24px` mobile → `32px` desktop (`py-6`→`md:py-8`) | padding main content    |

Nilai di luar skala (`gap-5`, `p-5`, dst.) tidak dipakai untuk kode baru.

### 84.2 Card Anatomy & Density

| Tipe                        | Min-height                      | Isi wajib                                   |
| --------------------------- | ------------------------------- | ------------------------------------------- |
| Stat card                   | `148px` (`min-h-[148px]`)       | label, value besar, delta/takeaway opsional |
| Standard card               | konten-driven, `gap-4` internal | header + body                               |
| Large content (tabel/chart) | auto                            | header + toolbar/body                       |

Semua stat card memakai komponen `StatCard` — dilarang bikin stat ad-hoc.

### 84.3 Main Content Width

Dashboard main dibatasi `max-w-[1600px] mx-auto` agar proporsional di ultrawide.

### 84.4 Status Color Semantics

| Makna                         | Token                |
| ----------------------------- | -------------------- |
| Success / Stock In            | `primary` (+ icon ✓) |
| Warning / Pending / Low stock | `warning`            |
| Failed / danger               | `destructive`        |
| Neutral / Archived            | `muted`              |
| Info / Stock Out delta        | `secondary`          |

Dilarang memakai raw palette Tailwind (amber/emerald/red) — audit 2026-08-24 telah membersihkan semuanya.

### 84.5 CSV Export Encoding

CSV export wajib BOM UTF-8 (Excel), delimiter koma standar, timestamp `YYYY-MM-DD HH:mm:ss` UTC. Baris hint `sep=` dilarang (tidak reliable dengan BOM).

### 84.6 Keputusan Flow Stok

- **Stock In/Out manual** = user-paid intent flow v2 (wallet member menandatangani proof).
- **CSV initial stock** = server initialization flow via Owner/Manager ter-autentikasi — SENGAJA tidak melalui wallet-paid intent (bulk, tanpa interaksi wallet per baris). Invariant tetap terjaga karena kedua jalur sama-sama melalui RPC atomik + audit + proof.
