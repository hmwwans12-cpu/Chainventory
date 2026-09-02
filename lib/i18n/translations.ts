export type Locale = "en" | "id";

export const LOCALES: { value: Locale; label: string }[] = [
  { value: "en", label: "English" },
  { value: "id", label: "Bahasa Indonesia" },
];

export const translations: Record<Locale, Record<string, string>> = {
  en: {
    // Sidebar groups
    "group.operations": "Operations",
    "group.governance": "Governance",
    "group.system": "System",
    "group.developer": "Developer",
    // Nav items (keyed by href)
    "nav./dashboard": "Overview",
    "nav./inventory/products": "Inventory",
    "nav./transactions": "Transactions",
    "nav./analytics": "Analytics",
    "nav./members": "Members",
    "nav./blockchain": "Audit Explorer",
    "nav./notifications": "Notifications",
    "nav./settings": "Settings",
    "nav./console": "Developer Console",
    // Sub items
    "sub.products": "Products",
    "sub.stock_movement": "Stock Movement",
    // Command palette
    "cmd.search": "Search pages and actions…",
    "cmd.group.navigate": "Navigate",
    "cmd.group.action": "Quick action",
    "cmd.products": "Products",
    "cmd.movements": "Stock Movements",
    "cmd.transactions": "Transactions",
    "cmd.members": "Members",
    "cmd.notifications": "Notifications",
    "cmd.audit_explorer": "Audit Explorer",
    "cmd.analytics": "Analytics",
    "cmd.settings": "Settings",
    "cmd.create_warehouse": "Create Warehouse",
    "cmd.join_warehouse": "Join Warehouse",
    "cmd.developer_console": "Developer Console",
    "cmd.no_results": "No results for “{query}”.",
    // Common
    "common.account_menu": "Account menu",
    "common.switch_warehouse": "Switch active warehouse",
    "common.active_warehouse": "Active warehouse",
    "common.no_warehouse": "No warehouse",
    "common.settings": "Settings",
    "common.sign_out": "Sign out",
    "common.theme.dark": "Switch to dark theme",
    "common.theme.light": "Switch to light theme",
    "common.search": "Search",
    "common.language": "Language",
    "common.open_command": "Open command palette",
    "common.close": "Close",
    // Landing - Hero
    "landing.hero.badge": "Blockchain verification on Base Sepolia",
    "landing.hero.title_main": "Inventory management with",
    "landing.hero.title_accent": "blockchain verification",
    "landing.hero.subtitle":
      "Real-time stock for your whole team, with a verifiable proof on every important record — no crypto knowledge needed.",
    "landing.hero.cta_primary": "Create Warehouse",
    "landing.hero.cta_secondary": "Login",
    "landing.hero.stat_stock_updates": "stock updates",
    "landing.hero.stat_fine_access": "fine-grained access",
    "landing.hero.stat_every_movement": "on every movement",
    "landing.hero.stat_real_time": "Real-time",
    "landing.hero.stat_5_roles": "5 roles",
    "landing.hero.stat_proof": "Proof",
    "landing.hero.preview_name": "Warehouse · Jakarta",
    "landing.hero.live": "Live",
    "landing.hero.total_products": "Total products",
    "landing.hero.stock_in_30": "Stock in (30d)",
    "landing.hero.stock_out_30": "Stock out (30d)",
    "landing.hero.chart_label": "Stock in - last 7 days",
    "landing.hero.blockchain_verified": "Blockchain verified",
    "landing.hero.base_sepolia": "Base Sepolia",
    "landing.hero.proof_verified": "Proof verified",
    "landing.hero.tamper_evident": "tamper-evident record",
    "landing.hero.live_sync": "Live sync",
    "landing.hero.updates_reach": "updates reach the team",
    // Landing - Problem
    "landing.problem.title": "Inventory is hard to keep consistent",
    "landing.problem.subtitle":
      "Warehouse teams juggle stock between spreadsheets, chats, and memory. Records drift apart, and nobody trusts the numbers.",
    "landing.problem.p1_title": "Spreadsheets go stale",
    "landing.problem.p1_desc":
      "Multiple people editing stock in parallel leads to outdated counts and conflicting numbers.",
    "landing.problem.p2_title": "Disputes over who changed what",
    "landing.problem.p2_desc":
      "When stock is wrong, there's no reliable record of what happened, when, and by whom.",
    "landing.problem.p3_title": "Slow, out-of-sync teams",
    "landing.problem.p3_desc":
      "Warehouse staff, managers, and auditors work from different views of the same inventory.",
    // Landing - Features
    "landing.features.title": "Everything a modern warehouse needs",
    "landing.features.subtitle":
      "Manage inventory the way a modern SaaS should feel- with trust and verification layered underneath.",
    "landing.features.f1_title": "Centralized inventory",
    "landing.features.f1_desc":
      "Products, stock levels, and units in one place. Add individually or import in bulk from CSV.",
    "landing.features.f2_title": "Stock in / stock out",
    "landing.features.f2_desc":
      "Every movement is recorded atomically- no lost updates or negative stock from concurrent edits.",
    "landing.features.f3_title": "Real-time sync",
    "landing.features.f3_desc":
      "Changes propagate to every connected team member instantly. No manual refresh required.",
    "landing.features.f4_title": "Role-based access",
    "landing.features.f4_desc":
      "Owners, managers, staff, auditors, and viewers each get exactly the access they need.",
    "landing.features.f5_title": "Verifiable records",
    "landing.features.f5_desc":
      "Important movements get a cryptographic proof you can verify anytime- without touching crypto yourself.",
    "landing.features.f6_title": "Built-in security",
    "landing.features.f6_desc":
      "Server-side authorization, audited history, and an append-only trail of who did what.",
    "landing.features.verified": "Verified",
    // Landing - How it works
    "landing.how.title": "From empty warehouse to running team in minutes",
    "landing.how.subtitle":
      "Four steps. No crypto setup, no contract addresses, no technical configuration.",
    "landing.how.s1_title": "Create your warehouse",
    "landing.how.s1_desc":
      "Give it a name and company. You automatically become the owner with a secure warehouse code.",
    "landing.how.s2_title": "Invite your team",
    "landing.how.s2_desc":
      "Share the code or a link. New members request access and get assigned an appropriate role.",
    "landing.how.s3_title": "Manage stock in real time",
    "landing.how.s3_desc":
      "Add products, record stock in and out, and watch updates reach the whole team instantly.",
    "landing.how.s4_title": "Verify when you need to",
    "landing.how.s4_desc":
      "Every movement gets a proof record. Open the history to see exactly who did what- anytime.",
    // Landing - Blockchain
    "landing.blockchain.badge": "Why blockchain?",
    "landing.blockchain.title": "Verification, without the complexity",
    "landing.blockchain.subtitle":
      "We use blockchain as an additional verification layer for important records. It provides proof of integrity and a tamper-evident history- while staying completely out of your way.",
    "landing.blockchain.point1":
      "Your inventory is managed normally- nothing about daily work changes.",
    "landing.blockchain.point2":
      "Important records get an additional, verifiable proof of authenticity.",
    "landing.blockchain.point3":
      "Records cannot be silently altered after the fact.",
    "landing.blockchain.point4":
      "You never need to understand crypto to use the product.",
    "landing.blockchain.typical_record": "A typical record",
    "landing.blockchain.col_product": "Product",
    "landing.blockchain.col_stock_out": "Stock out",
    "landing.blockchain.col_performed_by": "Performed by",
    "landing.blockchain.proof": "Proof",
    "landing.blockchain.verified": "Verified",
    "landing.blockchain.anchored_on": "Anchored on",
    "landing.blockchain.block": "Base Sepolia- block 12,845,201",
    // Landing - Security
    "landing.security.title": "Trustworthy records, clear accountability",
    "landing.security.subtitle":
      "Security isn't an afterthought. It's layered into the product from day one so your data stays accurate and answerable.",
    "landing.security.s1_title": "Defense in depth",
    "landing.security.s1_desc":
      "Database-level security backs up application-level checks so no single bug can expose your data.",
    "landing.security.s2_title": "Access you control",
    "landing.security.s2_desc":
      "Fine-grained roles decide who can view, edit, or approve- enforced server-side, not just in the UI.",
    "landing.security.s3_title": "Append-only audit history",
    "landing.security.s3_desc":
      "Every meaningful action is recorded. History can be reviewed but never silently edited.",
    "landing.security.s4_title": "Transparent verification",
    "landing.security.s4_desc":
      "Each movement carries a verifiable proof you can inspect with a single click.",
    // Landing - Testimonials
    "landing.testimonials.title": "Teams that stopped guessing",
    "landing.testimonials.subtitle":
      "Inventory decisions are only as good as the data behind them. Here's what changed for teams running Chainventory.",
    "landing.testimonials.q1":
      "We finally have one source of truth for our stock. The audit trail means a single disputed shipment no longer turns into a week of finger-pointing.",
    "landing.testimonials.a1": "Operations Lead, Mid-size Retailer",
    "landing.testimonials.q2":
      "Onboarding the team took an afternoon. Role-based access let us give auditors read-only proof without handing over the keys.",
    "landing.testimonials.a2": "Warehouse Manager, Distribution",
    "landing.testimonials.q3":
      "The blockchain proof is the part customers ask about. They don't care about crypto — they care that a movement is verifiable after the fact.",
    "landing.testimonials.a3": "Founder, Hardware Startup",
    // Landing - TrustedBy
    "landing.trustedby.label":
      "Trusted by operations teams that can't afford blind spots",
    // Landing - CTA
    "landing.cta.title": "Start managing inventory with verifiable records",
    "landing.cta.subtitle":
      "Create your warehouse in minutes. Your team gets real-time stock, role-based access, and proof you can trust.",
    "landing.cta.primary": "Create Warehouse",
    "landing.cta.secondary": "Login",
    "landing.cta.footnote":
      "No crypto knowledge needed- Free on the Base Sepolia test network",
    // Dashboard
    "dashboard.title": "Dashboard",
    "dashboard.description":
      "Overview of your warehouse inventory and activity.",
    "dashboard.empty_title": "No warehouse yet",
    "dashboard.empty_desc":
      "Create a warehouse to start managing inventory, or join one with a warehouse code.",
    "dashboard.create_warehouse": "Create Warehouse",
    "dashboard.join_warehouse": "Join Warehouse",
    "dashboard.total_products": "Total Products",
    "dashboard.total_stock": "Total Stock",
    "dashboard.stock_in": "Stock In",
    "dashboard.stock_out": "Stock Out",
    "dashboard.low_stock": "Low Stock",
    "dashboard.pending_requests": "Pending Requests",
    "dashboard.active_products": "Active products in this warehouse",
    "dashboard.units_all": "Units across all products",
    "dashboard.at_below_threshold": "Products at or below threshold",
    "dashboard.join_awaiting": "Join requests awaiting review",
    "dashboard.stock_in_out": "Stock In / Out",
    "dashboard.top_products": "Top Products",
    "dashboard.stock_movements": "Stock Movements",
    "dashboard.products": "Products",
    "dashboard.analytics": "Analytics",
    "dashboard.deployed_on_chain": "deployed on-chain",
    "dashboard.not_deployed": "not deployed",
    "dashboard.vs_previous": "vs previous {n} days",
    "settings.title": "Settings",
    "settings.description":
      "Your profile, wallet, and active warehouse details.",
    "settings.profile": "Profile",
    "settings.profile_desc": "Account identity in this workspace.",
    "settings.wallet": "Wallet",
    "settings.wallet_desc": "Primary wallet on Base Sepolia.",
    "settings.role": "Role",
    "settings.balance": "Balance",
    "settings.no_wallet": "No primary wallet connected yet.",
    "settings.warehouse": "Warehouse",
    "settings.warehouse_desc": "Active warehouse and on-chain contract.",
    "settings.no_contract": "No contract deployed yet.",
    "settings.account": "Account",
    "settings.signed_in": "Signed in as {email}",
    "settings.no_warehouse": "No warehouse yet",
    "settings.no_warehouse_desc":
      "Create or join a warehouse to see its details here.",
    // Inactivity banner
    "inactivity.suspended_title": "{name} suspended due to inactivity",
    "inactivity.suspended_desc":
      "This warehouse was suspended after {days} days without activity. Stock movements and membership are paused. Contact Chainventory support to reactivate it.",
    "inactivity.support_cta": "Email support",
    "inactivity.warning_title_critical":
      "{name} will be suspended in {days} day(s)",
    "inactivity.warning_title": "{name} will be suspended",
    "inactivity.warning_desc":
      "This warehouse has had no activity for {inactive} days. Record any stock movement within the next {days} day(s) to keep it active.",
    "inactivity.cta": "Record stock movement",
  },
  id: {
    "group.operations": "Operasional",
    "group.governance": "Tata Kelola",
    "group.system": "Sistem",
    "group.developer": "Developer",
    "nav./dashboard": "Ikhtisar",
    "nav./inventory/products": "Inventaris",
    "nav./transactions": "Transaksi",
    "nav./analytics": "Analitik",
    "nav./members": "Anggota",
    "nav./blockchain": "Penjelajah Audit",
    "nav./notifications": "Notifikasi",
    "nav./settings": "Pengaturan",
    "nav./console": "Konsol Developer",
    "sub.products": "Produk",
    "sub.stock_movement": "Pergerakan Stok",
    "cmd.search": "Cari halaman dan tindakan…",
    "cmd.group.navigate": "Navigasi",
    "cmd.group.action": "Tindakan cepat",
    "cmd.products": "Produk",
    "cmd.movements": "Pergerakan Stok",
    "cmd.transactions": "Transaksi",
    "cmd.members": "Anggota",
    "cmd.notifications": "Notifikasi",
    "cmd.audit_explorer": "Penjelajah Audit",
    "cmd.analytics": "Analitik",
    "cmd.settings": "Pengaturan",
    "cmd.create_warehouse": "Buat Gudang",
    "cmd.join_warehouse": "Gabung Gudang",
    "cmd.developer_console": "Konsol Developer",
    "cmd.no_results": "Tidak ada hasil untuk “{query}”.",
    "common.account_menu": "Menu akun",
    "common.switch_warehouse": "Ganti gudang aktif",
    "common.active_warehouse": "Gudang aktif",
    "common.no_warehouse": "Tidak ada gudang",
    "common.settings": "Pengaturan",
    "common.sign_out": "Keluar",
    "common.theme.dark": "Beralih ke tema gelap",
    "common.theme.light": "Beralih ke tema terang",
    "common.search": "Cari",
    "common.language": "Bahasa",
    "common.open_command": "Buka palette perintah",
    "common.close": "Tutup",
    // Landing - Hero
    "landing.hero.badge": "Verifikasi blockchain di Base Sepolia",
    "landing.hero.title_main": "Manajemen inventaris dengan",
    "landing.hero.title_accent": "verifikasi blockchain",
    "landing.hero.subtitle":
      "Stok real-time untuk seluruh tim, dengan bukti terverifikasi pada setiap catatan penting — tanpa perlu tahu kripto.",
    "landing.hero.cta_primary": "Buat Gudang",
    "landing.hero.cta_secondary": "Masuk",
    "landing.hero.stat_stock_updates": "pembaruan stok",
    "landing.hero.stat_fine_access": "akses terperinci",
    "landing.hero.stat_every_movement": "pada setiap pergerakan",
    "landing.hero.stat_real_time": "Real-time",
    "landing.hero.stat_5_roles": "5 peran",
    "landing.hero.stat_proof": "Bukti",
    "landing.hero.preview_name": "Gudang · Jakarta",
    "landing.hero.live": "Aktif",
    "landing.hero.total_products": "Total produk",
    "landing.hero.stock_in_30": "Stok masuk (30h)",
    "landing.hero.stock_out_30": "Stok keluar (30h)",
    "landing.hero.chart_label": "Stok masuk - 7 hari terakhir",
    "landing.hero.blockchain_verified": "Terverifikasi blockchain",
    "landing.hero.base_sepolia": "Base Sepolia",
    "landing.hero.proof_verified": "Bukti terverifikasi",
    "landing.hero.tamper_evident": "catatan anti-rusak",
    "landing.hero.live_sync": "Sinkronisasi langsung",
    "landing.hero.updates_reach": "pembaruan sampai ke tim",
    // Landing - Problem
    "landing.problem.title": "Inventaris sulit dijaga konsisten",
    "landing.problem.subtitle":
      "Tim gudang mencatat stok di spreadsheet, chat, dan ingatan. Catatan menyimpang, dan tak ada yang percaya pada angkanya.",
    "landing.problem.p1_title": "Spreadsheet usang",
    "landing.problem.p1_desc":
      "Banyak orang mengedit stok secara paralel menghasilkan hitungan usang dan angka yang bertentangan.",
    "landing.problem.p2_title": "Sengketa soal siapa yang ubah apa",
    "landing.problem.p2_desc":
      "Saat stok salah, tidak ada catatan andal tentang apa yang terjadi, kapan, dan oleh siapa.",
    "landing.problem.p3_title": "Tim lambat dan tidak sinkron",
    "landing.problem.p3_desc":
      "Staf gudang, manajer, dan auditor bekerja dari pandangan inventaris yang berbeda.",
    // Landing - Features
    "landing.features.title": "Semua yang gudang modern butuhkan",
    "landing.features.subtitle":
      "Kelola inventaris seperti SaaS modern seharusnya terasa- dengan kepercayaan dan verifikasi menyatu di bawahnya.",
    "landing.features.f1_title": "Inventaris terpusat",
    "landing.features.f1_desc":
      "Produk, level stok, dan unit di satu tempat. Tambah satu per satu atau impor massal dari CSV.",
    "landing.features.f2_title": "Stok masuk / stok keluar",
    "landing.features.f2_desc":
      "Setiap pergerakan dicatat atomik- tanpa pembaruan hilang atau stok negatif dari edit bersamaan.",
    "landing.features.f3_title": "Sinkronisasi real-time",
    "landing.features.f3_desc":
      "Perubahan langsung menyebar ke setiap anggota tim. Tanpa penyegaran manual.",
    "landing.features.f4_title": "Akses berbasis peran",
    "landing.features.f4_desc":
      "Owner, manajer, staf, auditor, dan penonton masing-masing mendapat akses persis yang mereka butuhkan.",
    "landing.features.f5_title": "Catatan terverifikasi",
    "landing.features.f5_desc":
      "Pergerakan penting mendapat bukti kriptografis yang bisa Anda verifikasi kapan saja- tanpa menyentuh kripto sendiri.",
    "landing.features.f6_title": "Keamanan bawaan",
    "landing.features.f6_desc":
      "Otorisasi server-side, riwayat diaudit, dan jejak siapa melakukan apa yang hanya bisa ditambah.",
    "landing.features.verified": "Terverifikasi",
    // Landing - How it works
    "landing.how.title": "Dari gudang kosong ke tim berjalan dalam menit",
    "landing.how.subtitle":
      "Empat langkah. Tanpa setup kripto, tanpa alamat kontrak, tanpa konfigurasi teknis.",
    "landing.how.s1_title": "Buat gudang Anda",
    "landing.how.s1_desc":
      "Beri nama dan perusahaan. Anda otomatis menjadi owner dengan kode gudang aman.",
    "landing.how.s2_title": "Undang tim Anda",
    "landing.how.s2_desc":
      "Bagikan kode atau tautan. Anggota baru meminta akses dan mendapat peran yang sesuai.",
    "landing.how.s3_title": "Kelola stok secara real-time",
    "landing.how.s3_desc":
      "Tambah produk, catat stok masuk dan keluar, dan lihat pembaruan sampai ke seluruh tim instan.",
    "landing.how.s4_title": "Verifikasi saat Anda butuh",
    "landing.how.s4_desc":
      "Setiap pergerakan mendapat catatan bukti. Buka riwayat untuk melihat persis siapa yang lakukan apa- kapan saja.",
    // Landing - Blockchain
    "landing.blockchain.badge": "Mengapa blockchain?",
    "landing.blockchain.title": "Verifikasi, tanpa kerumitan",
    "landing.blockchain.subtitle":
      "Kami menggunakan blockchain sebagai lapisan verifikasi tambahan untuk catatan penting. Memberi bukti integritas dan riwayat anti-rusak- sambil benar-benar tak mengganggu.",
    "landing.blockchain.point1":
      "Inventaris Anda dikelola seperti biasa- tak ada yang berubah dalam kerja harian.",
    "landing.blockchain.point2":
      "Catatan penting mendapat bukti keaslian tambahan yang terverifikasi.",
    "landing.blockchain.point3":
      "Catatan tak bisa diam-diam diubah setelahnya.",
    "landing.blockchain.point4":
      "Anda tak perlu paham kripto untuk menggunakan produk.",
    "landing.blockchain.typical_record": "Sebuah catatan khas",
    "landing.blockchain.col_product": "Produk",
    "landing.blockchain.col_stock_out": "Stok keluar",
    "landing.blockchain.col_performed_by": "Dilakukan oleh",
    "landing.blockchain.proof": "Bukti",
    "landing.blockchain.verified": "Terverifikasi",
    "landing.blockchain.anchored_on": "Ditambatkan pada",
    "landing.blockchain.block": "Base Sepolia- blok 12.845.201",
    // Landing - Security
    "landing.security.title": "Catatan terpercaya, akuntabilitas jelas",
    "landing.security.subtitle":
      "Keamanan bukan pikiran belakangan. Menyatu ke dalam produk sejak hari pertama agar data Anda tetap akurat dan bisa dipertanggungjawabkan.",
    "landing.security.s1_title": "Pertahanan berlapis",
    "landing.security.s1_desc":
      "Keamanan level database menopang cek level aplikasi sehingga tak ada bug tunggal yang membocorkan data Anda.",
    "landing.security.s2_title": "Akses yang Anda kendalikan",
    "landing.security.s2_desc":
      "Peran terperinci menentukan siapa yang bisa lihat, edit, atau setuju- ditegakkan server-side, bukan hanya di UI.",
    "landing.security.s3_title": "Riwayat audit hanya-tambah",
    "landing.security.s3_desc":
      "Setiap tindakan bermakna dicatat. Riwayat bisa ditinjau tapi tak pernah diam-diam diedit.",
    "landing.security.s4_title": "Verifikasi transparan",
    "landing.security.s4_desc":
      "Setiap pergerakan membawa bukti terverifikasi yang bisa Anda periksa dengan satu klik.",
    // Landing - Testimonials
    "landing.testimonials.title": "Tim yang berhenti menebak",
    "landing.testimonials.subtitle":
      "Keputusan inventaris hanya sebaik data di baliknya. Inilah yang berubah bagi tim yang menjalankan Chainventory.",
    "landing.testimonials.q1":
      "Kami akhirnya punya satu sumber kebenaran untuk stok. Jejak audit membuat satu pengiriman sengketa tak lagi jadi seminggu saling tunjuk.",
    "landing.testimonials.a1": "Lead Operasi, Ritel Menengah",
    "landing.testimonials.q2":
      "Onboarding tim cuma butuh satu sore. Akses berbasis peran memberi auditor bukti read-only tanpa menyerahkan kunci.",
    "landing.testimonials.a2": "Manajer Gudang, Distribusi",
    "landing.testimonials.q3":
      "Bukti blockchain adalah bagian yang ditanya pelanggan. Mereka tak peduli kripto- mereka peduli pergerakan terverifikasi setelahnya.",
    "landing.testimonials.a3": "Founder, Startup Hardware",
    // Landing - TrustedBy
    "landing.trustedby.label":
      "Dipercaya tim operasi yang tak boleh punya titik buta",
    // Landing - CTA
    "landing.cta.title": "Mulai kelola inventaris dengan catatan terverifikasi",
    "landing.cta.subtitle":
      "Buat gudang Anda dalam menit. Tim Anda dapat stok real-time, akses berbasis peran, dan bukti yang bisa dipercaya.",
    "landing.cta.primary": "Buat Gudang",
    "landing.cta.secondary": "Masuk",
    "landing.cta.footnote":
      "Tanpa perlu tahu kripto- Gratis di jaringan uji Base Sepolia",
    // Dashboard
    "dashboard.title": "Dasbor",
    "dashboard.description": "Ikhtisar inventaris dan aktivitas gudang Anda.",
    "dashboard.empty_title": "Belum ada gudang",
    "dashboard.empty_desc":
      "Buat gudang untuk mulai mengelola inventaris, atau gabung dengan kode gudang.",
    "dashboard.create_warehouse": "Buat Gudang",
    "dashboard.join_warehouse": "Gabung Gudang",
    "dashboard.total_products": "Total Produk",
    "dashboard.total_stock": "Total Stok",
    "dashboard.stock_in": "Stok Masuk",
    "dashboard.stock_out": "Stok Keluar",
    "dashboard.low_stock": "Stok Rendah",
    "dashboard.pending_requests": "Permintaan Menunggu",
    "dashboard.active_products": "Produk aktif di gudang ini",
    "dashboard.units_all": "Unit di seluruh produk",
    "dashboard.at_below_threshold": "Produk di ambang atau di bawahnya",
    "dashboard.join_awaiting": "Permintaan gabung menunggu tinjauan",
    "dashboard.stock_in_out": "Stok Masuk / Keluar",
    "dashboard.top_products": "Produk Teratas",
    "dashboard.stock_movements": "Pergerakan Stok",
    "dashboard.products": "Produk",
    "dashboard.analytics": "Analitik",
    "dashboard.deployed_on_chain": "dideploy on-chain",
    "dashboard.not_deployed": "belum dideploy",
    "dashboard.vs_previous": "vs {n} hari sebelumnya",
    "settings.title": "Pengaturan",
    "settings.description": "Profil, dompet, dan detail gudang aktif Anda.",
    "settings.profile": "Profil",
    "settings.profile_desc": "Identitas akun di ruang kerja ini.",
    "settings.wallet": "Dompet",
    "settings.wallet_desc": "Dompet utama di Base Sepolia.",
    "settings.role": "Peran",
    "settings.balance": "Saldo",
    "settings.no_wallet": "Belum ada dompet utama yang terhubung.",
    "settings.warehouse": "Gudang",
    "settings.warehouse_desc": "Gudang aktif dan kontrak on-chain.",
    "settings.no_contract": "Belum ada kontrak yang dideploy.",
    "settings.account": "Akun",
    "settings.signed_in": "Masuk sebagai {email}",
    "settings.no_warehouse": "Belum ada gudang",
    "settings.no_warehouse_desc":
      "Buat atau gabung gudang untuk melihat detailnya di sini.",
    // Inactivity banner
    "inactivity.suspended_title": "{name} disuspend karena tidak aktif",
    "inactivity.suspended_desc":
      "Gudang ini disuspend setelah {days} hari tanpa aktivitas. Mutasi stok dan keanggotaan dijeda. Hubungi dukungan Chainventory untuk mengaktifkannya kembali.",
    "inactivity.support_cta": "Email dukungan",
    "inactivity.warning_title_critical":
      "{name} akan disuspend dalam {days} hari",
    "inactivity.warning_title": "{name} akan disuspend",
    "inactivity.warning_desc":
      "Gudang ini belum ada aktivitas selama {inactive} hari. Lakukan stock movement dalam {days} hari ke depan untuk menjaganya tetap aktif.",
    "inactivity.cta": "Buat Stock Movement",
  },
};

export function translate(
  locale: Locale,
  key: string,
  params?: Record<string, string>
): string {
  const localized = translations[locale]?.[key];
  const fallback = translations.en[key];
  let result: string;
  if (localized) {
    result = localized;
  } else if (fallback) {
    // Audit v0.3.0 §5.1: warn di dev agar translator sadar saat key
    // hilang di locale target. Di prod, fallback ke EN dipakai.
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[i18n] missing ${locale} key "${key}", using en fallback`);
    }
    result = fallback;
  } else {
    if (process.env.NODE_ENV !== "production") {
      console.warn(`[i18n] missing key "${key}" in both ${locale} and en`);
    }
    result = key;
  }
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      result = result.replace(new RegExp(`\\{${k}\\}`, "g"), v);
    }
  }
  return result;
}
