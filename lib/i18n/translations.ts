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
    "group.developer": "Pengembang",
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
    "common.search_placeholder": "Search products, movements, transactions…",
    "common.close": "Close",
    "common.cancel": "Cancel",
    "common.confirm": "Confirm",
    // Landing - Hero
    "landing.hero.badge": "Blockchain verification on Base Sepolia",
    "landing.hero.title_main": "Inventory management with",
    "landing.hero.title_accent": "blockchain verification",
    "landing.hero.subtitle":
      "Real-time stock for your whole team, with a verifiable proof on every important record. No crypto knowledge needed.",
    "landing.hero.cta_primary": "Create Warehouse",
    "landing.hero.cta_secondary": "Login",
    "landing.hero.stat_100": "100%",
    "landing.hero.stat_100_label": "Every movement anchored",
    "landing.hero.stat_5_roles": "5 roles",
    "landing.hero.stat_5_roles_label": "Owner → Viewer, server-side",
    "landing.hero.stat_1_day": "< 1 day",
    "landing.hero.stat_1_day_label": "Team onboarding time",
    "landing.hero.preview_label": "Chainventory dashboard preview",
    "landing.hero.preview_ribbon": "Illustrative static preview",
    "landing.hero.preview_latency": "Live sync: 0.12s latency",
    "landing.hero.preview_tap": "Tap to verify",
    "landing.hero.preview_name": "Warehouse",
    "landing.hero.live": "Live",
    "landing.hero.total_products": "Total Products in Custody",
    "landing.hero.stock_in_30": "Stock In (30d)",
    "landing.hero.stock_out_30": "Stock Out (30d)",
    "landing.hero.chart_label": "Weekly Stock Dispatches",
    "landing.hero.blockchain_verified": "Blockchain verified",
    "landing.hero.base_sepolia": "Base Sepolia",
    "landing.hero.proof_verified": "Proof verified",
    "landing.hero.tamper_evident": "Tamper-Evident Record",
    "landing.hero.live_sync": "Live sync",
    "landing.hero.updates_reach": "updates reach the team",
    // Landing - Problem
    "landing.problem.title": "Inventory is hard to keep consistent",
    "landing.problem.subtitle":
      "Traditional warehouses struggle with spreadsheets and paper trails. Chainventory guarantees undeniable truth between warehouse floors, finance desks, and compliance inspectors.",
    "landing.problem.without_title": "Without Chainventory",
    "landing.problem.with_title": "With Chainventory",
    "landing.problem.verified_cockpit": "Verified Cockpit",
    "landing.problem.without_outcome":
      "Outcome: 4.8 hrs spent weekly chasing missing counts",
    "landing.problem.with_outcome":
      "Outcome: Instant audits & zero reconciliation overhead",
    "landing.problem.p1_title": "Spreadsheets go stale",
    "landing.problem.p1_desc":
      "Multiple manual edits lead to conflicting counts, untracked loss, and stockout emergencies.",
    "landing.problem.p2_title": "Disputes over who changed what",
    "landing.problem.p2_desc":
      "No tamper-proof log of who made adjustments, why numbers dropped, or who authorized releases.",
    "landing.problem.p3_title": "Slow, out-of-sync teams",
    "landing.problem.p3_desc":
      "Floor staff, managers, and external auditors see mismatched numbers, demanding weekly reconciliations.",
    "landing.proof.w1_title": "One source of truth, updated in real time",
    "landing.proof.w1_desc":
      "Atomically synced across all connected devices the instant a barcode or pallet is scanned.",
    "landing.proof.w2_title": "Every change has a verifiable record",
    "landing.proof.w2_desc":
      "Cryptographic tamper-evident ledger proofs verify exactly who initiated and recorded the stock event.",
    "landing.proof.w3_title": "Everyone sees the same numbers",
    "landing.proof.w3_desc":
      "Role-based views ensure floor staff, logistics leads, and compliance auditors share zero discrepancies.",
    // Landing - Features
    "landing.features.title": "Everything a modern warehouse needs",
    "landing.features.subtitle":
      "Engineered for rapid warehouse operations, total team transparency, and effortless proof stamping.",
    "landing.features.ledger_anchored": "Ledger Anchored",
    "landing.features.sample_proof": "See a sample proof record",
    "landing.features.f1_title": "Centralized inventory",
    "landing.features.f1_desc":
      "Track multi-aisle locations, batch SKUs, and expiration thresholds from a consolidated real-time operational dashboard.",
    "landing.features.f1_foot": "Aisle & Rack Tracking",
    "landing.features.f2_title": "Stock In / Stock Out",
    "landing.features.f2_desc":
      "Perform intake and outbound dispatches in two quick steps. Scan barcodes or lookup purchase order manifests directly.",
    "landing.features.f2_foot": "Instant Barcode Lookup",
    "landing.features.f3_title": "Real-time sync",
    "landing.features.f3_desc":
      "Low-latency distributed state changes reflect across hand scanners, floor tablets, and remote office terminals instantly.",
    "landing.features.f3_foot": "Sub-second Push",
    "landing.features.f4_title": "Role-based access",
    "landing.features.f4_desc":
      "Strict permissions for Owner, Manager, Staff, Auditor, and Viewer ensure users only access the controls they need.",
    "landing.features.f4_foot": "5 Discrete Roles",
    "landing.features.f5_title": "Verifiable records",
    "landing.features.f5_desc":
      "Every dispatched movement, adjustment, and receipt receives an immutable cryptographic fingerprint anchored on Base Sepolia. Proof without revealing sensitive pricing or partner details.",
    "landing.features.f6_title": "Built-in security",
    "landing.features.f6_desc":
      "Server-side authorization, audited history, and an append-only trail of who did what.",
    "landing.features.verified": "Verified",
    // Landing - How it works
    "landing.how.eyebrow": "Execution Pipeline",
    "landing.how.title": "How It Works",
    "landing.how.subtitle":
      "Simple four-step setup engineered for immediate adoption across non-technical floor crews.",
    "landing.how.s1_title": "Create your warehouse",
    "landing.how.s1_desc":
      "Automatically register as warehouse owner and generate an isolated, secure depot identity code.",
    "landing.how.s1_foot": "Takes 60 seconds",
    "landing.how.s2_title": "Invite your team",
    "landing.how.s2_desc":
      "Share code or invite links to designate roles: Owner, Manager, Staff, Auditor, or Viewer.",
    "landing.how.s2_foot": "Role-gated access",
    "landing.how.s3_title": "Manage stock in real time",
    "landing.how.s3_desc":
      "Record Stock In / Stock Out batches and observe immediate synchronized stock counts across floor scanners.",
    "landing.how.s3_foot": "Real-time socket sync",
    "landing.how.s4_title": "Verify when you need to",
    "landing.how.s4_desc":
      "Every movement gets a proof record. Open the history to see exactly who did what, anytime.",
    "landing.how.s4_foot": "Cryptographic proof",
    // Landing - Strip / Band / Trust / Pilot (reference public_2 + public_1)
    "landing.strip.s1_title": "Defense in depth",
    "landing.strip.s1_desc":
      "Isolated server validations guard against unauthorized client inputs.",
    "landing.strip.s2_title": "Access you control",
    "landing.strip.s2_desc":
      "Server-enforced RBAC gates sensitive actions per team tier.",
    "landing.strip.s3_title": "Append-only audit history",
    "landing.strip.s3_desc":
      "Past records cannot be erased; corrections require counter-entries.",
    "landing.strip.s4_title": "Transparent verification",
    "landing.strip.s4_desc":
      "Cryptographic root state publicly confirmed on Base Sepolia testnet.",
    "landing.band.badge": "Base Sepolia Layer 2",
    "landing.band.title": "Verification, without the complexity",
    "landing.band.subtitle":
      "You don't need gas tokens, crypto wallets, or private key management. Chainventory handles state-anchoring natively under the hood.",
    "landing.band.b1_title": "Zero Gas Overhead",
    "landing.band.b1_desc":
      "Transactions are batched and sponsored through our managed relayer infrastructure.",
    "landing.band.b2_title": "Tamper-Evident Merkle Proofs",
    "landing.band.b2_desc":
      "If a past database row is altered, the cryptographic root mismatch alerts managers instantly.",
    "landing.band.b3_title": "Public Audit Transparency",
    "landing.band.b3_desc":
      "External auditors verify inventory movements on-chain without exposing trade secrets.",
    "landing.band.inspector_title": "Ledger Proof Inspector",
    "landing.band.tx_hash": "Transaction Hash",
    "landing.band.dispatched_by": "Dispatched By",
    "landing.band.role_auth": "Role Authorization",
    "landing.band.proof_status": "Cryptographically Verified",
    "landing.band.view_basescan": "View on BaseScan Sepolia Explorer",
    "landing.trust.title": "Trustworthy records, clear accountability",
    "landing.trust.subtitle":
      "Defense-in-depth architecture combining web security standards with immutable cryptographic ledger audits.",
    "landing.trust.t1_title": "Server-Enforced RBAC",
    "landing.trust.t1_desc":
      "Every permission is verified on the server before anything reaches the ledger. The UI never decides who can do what.",
    "landing.trust.t2_title": "Append-Only Movement Log",
    "landing.trust.t2_desc":
      "Records can never be edited or deleted. Corrections happen through reasoned offsetting Stock In / Out transactions.",
    "landing.trust.t3_title": "Privacy-Preserving Hashes",
    "landing.trust.t3_desc":
      "Addresses and pricing stay encrypted in the database. Only Merkle proofs go on-chain.",
    "landing.pilot.text": "Currently piloting with early warehouse teams.",
    "landing.pilot.cta": "Join the pilot waitlist",
    // Landing - Blockchain
    "landing.blockchain.badge": "Why blockchain?",
    "landing.blockchain.title": "Verification, without the complexity",
    "landing.blockchain.subtitle":
      "We use blockchain as an additional verification layer for important records. It provides proof of integrity and a tamper-evident history, while staying completely out of your way.",
    "landing.blockchain.point1":
      "Your inventory is managed normally. Nothing about daily work changes.",
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
    "landing.blockchain.block": "Base Sepolia, block 12,845,201",
    // Landing - Security
    "landing.security.title": "Trustworthy records, clear accountability",
    "landing.security.subtitle":
      "Security isn't an afterthought. It's layered into the product from day one so your data stays accurate and answerable.",
    "landing.security.s1_title": "Defense in depth",
    "landing.security.s1_desc":
      "Database-level security backs up application-level checks so no single bug can expose your data.",
    "landing.security.s2_title": "Access you control",
    "landing.security.s2_desc":
      "Fine-grained roles decide who can view, edit, or approve, enforced server-side, not just in the UI.",
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
      "The blockchain proof is the part customers ask about. They don't care about crypto. They care that a movement is verifiable after the fact.",
    "landing.testimonials.a3": "Founder, Hardware Startup",
    // Landing - TrustedBy
    "landing.trustedby.label":
      "Trusted by operations teams that can't afford blind spots",
    // Landing - PeakProof (audit v0.3.7 §7.1#4)
    "landing.peak_proof.eyebrow": "Why teams stay",
    "landing.peak_proof.title": "Records that hold up long after the day ends",
    "landing.peak_proof.subtitle":
      "Peak-end matters: the moment a visitor closes this page should be the one they remember. Here is the proof, in numbers.",
    "landing.peak_proof.stat1_value": "100%",
    "landing.peak_proof.stat1_label":
      "Every stock movement leaves a verifiable on-chain anchor you can inspect later.",
    "landing.peak_proof.stat2_value": "5 roles",
    "landing.peak_proof.stat2_label":
      "Owner, Manager, Staff, Auditor, Viewer, enforced server-side, not just in the UI.",
    "landing.peak_proof.stat3_value": "< 1 day",
    "landing.peak_proof.stat3_label":
      "Average time for a new team to onboard and start recording stock with confidence.",
    // Landing - CTA
    "landing.cta.title": "Start managing inventory with verifiable records",
    "landing.cta.subtitle":
      "Eliminate disputes, accelerate audits, and give your logistics team an undeniable single source of truth.",
    "landing.cta.primary": "Create Warehouse",
    "landing.cta.secondary": "Login",
    "landing.cta.footnote":
      "No crypto knowledge needed. Free on the Base Sepolia test network.",
    "landing.faq.title": "Frequently asked questions",
    "landing.faq.subtitle":
      "The quick answers. No blockchain vocabulary required.",
    "landing.faq.q1": "Do I need to understand blockchain to use Chainventory?",
    "landing.faq.a1":
      "No. You manage inventory the same way you would with any modern tool. Blockchain works quietly in the background as a verification layer for important records.",
    "landing.faq.q2": "How does blockchain verification help me?",
    "landing.faq.a2":
      "Every stock movement gets a verifiable proof that the record is authentic and hasn't been altered. If anyone ever disputes a number, you have a tamper-evident answer.",
    "landing.faq.q3": "Can my whole team work on the same warehouse at once?",
    "landing.faq.a3":
      "Yes. Multiple users can operate on one warehouse concurrently. Stock updates are atomic and synchronize in real time to everyone connected.",
    "landing.faq.q4": "What roles are available?",
    "landing.faq.a4":
      "There are five roles: Owner, Manager, Staff, Auditor, and Viewer. Each controls exactly what a person can see and do, from full control down to read-only.",
    "landing.faq.q5": "What network is used for blockchain verification?",
    "landing.faq.a5":
      "Chainventory currently runs on Base Sepolia, a test network. This keeps things free and safe while the product matures.",
    "landing.faq.q6": "Is my inventory data stored on the blockchain?",
    "landing.faq.a6":
      "No. Your operational data lives in a secure database. Only proof records (not your full inventory) are anchored for verification.",
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
    "dashboard.active_products": "Active products",
    "dashboard.unit_skus_active": "SKUs Active",
    "dashboard.unit_units_on_hand": "Units on hand",
    "dashboard.units_all": "Total units",
    "dashboard.at_below_threshold": "Products at or below threshold",
    "dashboard.join_awaiting": "Join requests awaiting review",
    "dashboard.stock_in_out": "Stock In / Out",
    "dashboard.stock_velocity": "Stock Movement Velocity",
    "dashboard.stock_velocity_desc":
      "Daily inward and outward volume comparison.",
    "dashboard.top_products": "Top Products",
    "dashboard.top_products_desc": "Ranked by {n}-day velocity.",
    "dashboard.stock_movements": "Stock Movements",
    "dashboard.products": "Products",
    "dashboard.analytics": "Analytics",
    "dashboard.deployed_on_chain": "deployed on-chain",
    "dashboard.not_deployed": "not deployed",
    "dashboard.vs_previous": "vs last {n} days",
    // FE-16: dashboard memakai kunci ini (bukan hardcode EN).
    "dashboard.needs_attention_one": "Needs attention: 1 item",
    "dashboard.needs_attention_other": "Needs attention: {n} items",
    "dashboard.below_minimum_one": "1 product below minimum stock",
    "dashboard.below_minimum_other": "{n} products below minimum stock",
    "dashboard.join_requests_one": "1 join request awaiting approval",
    "dashboard.join_requests_other": "{n} join requests awaiting approval",
    "dashboard.review": "Review",
    "dashboard.review_products": "Review Products",
    "dashboard.review_members": "Review Members",
    "dashboard.below_threshold_suffix": "below minimum stock threshold",
    "dashboard.pending_approval_suffix":
      "pending join requests awaiting warehouse approval",
    "dashboard.setup_title": "Set up your warehouse",
    "dashboard.setup_progress": "{done}/4 completed",
    "dashboard.step_create": "Create warehouse",
    "dashboard.step_ready": "{name} is ready",
    "dashboard.step_products_add": "Add first product",
    "dashboard.step_products_manage": "Manage products",
    "dashboard.step_products_empty": "No products yet",
    "dashboard.step_products_count": "{n} products",
    "dashboard.step_invite": "Invite team",
    "dashboard.step_invite_desc": "Share warehouse code",
    "dashboard.step_team_count": "{n} members",
    "dashboard.step_movement": "Record stock movement",
    "dashboard.step_movement_desc": "Stock In / Out",
    "dashboard.step_movement_done": "First movement recorded",
    "dashboard.setup_hint":
      "Your warehouse is ready. Add your first product to start the checklist.",
    "dashboard.health_title": "Warehouse Operations Health",
    "dashboard.health_inventory": "Inventory",
    "dashboard.health_members": "Members",
    "dashboard.health_stable": "Stable",
    "dashboard.health_pending": "{n} pending",
    "dashboard.live_hub": "Live Hub",
    "dashboard.last_range": "Last {n} days",
    "dashboard.ledger_synced": "Ledger Synced",
    "dashboard.urgent_action": "Urgent Action",
    "dashboard.action_needed": "Action needed",
    "dashboard.manage_invites": "Manage Invites",
    "dashboard.health_realtime": "Realtime Sync",
    "dashboard.node_code": "Node Code",
    "activity.tab_all": "All",
    "activity.tab_inventory": "Inventory",
    "activity.tab_members": "Members",
    "activity.tab_audit": "Audit",
    "activity.filter_label": "Activity filter",
    "activity.view_all": "View All",
    "activity.empty": "Nothing to review yet.",
    "activity.open_notifications": "Open Notifications",
    "activity.empty_suffix": "to see join requests and blockchain events.",
    "activity.no_match": "No {tab} activity.",
    "activity.show_all": "Show All",
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
    "settings.wallet_address": "Wallet address",
    "settings.copy_wallet": "Copy wallet address",
    "settings.wallet_verified": "Verified",
    "settings.wallet_unverified": "Unverified",
    "settings.verify_wallet": "Verify wallet",
    "settings.verify_wallet_hint":
      "Stock movements need a verified wallet. Sign a free message to prove you own this address — no gas fee.",
    "settings.verify_wallet_signing": "Waiting for wallet signature…",
    "settings.verify_wallet_success": "Wallet verified. You can now record stock movements.",
    "settings.verify_wallet_failed": "Verification failed. Please try again.",
    "settings.verify_wallet_unavailable":
      "Wallet not available in this browser session. Reconnect and try again.",
    "settings.contract_address": "Contract address",
    "settings.copy_contract": "Copy contract address",
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
    "inactivity.warning_desc_one":
      "This warehouse has had no activity for {inactive} days. Record any stock movement within the next day to keep it active.",
    "inactivity.warning_desc_other":
      "This warehouse has had no activity for {inactive} days. Record any stock movement within the next {days} days to keep it active.",
    "inactivity.cta": "Record stock movement",
  },
  id: {
    "group.operations": "Operasional",
    "group.governance": "Tata Kelola",
    "group.system": "Sistem",
    "group.developer": "Pengembang",
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
    "cmd.developer_console": "Konsol Pengembang",
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
    "common.search_placeholder": "Cari produk, pergerakan, transaksi…",
    "common.close": "Tutup",
    "common.cancel": "Batal",
    "common.confirm": "Konfirmasi",
    // Landing - Hero
    "landing.hero.badge": "Verifikasi blockchain di Base Sepolia",
    "landing.hero.title_main": "Manajemen inventaris dengan",
    "landing.hero.title_accent": "verifikasi blockchain",
    "landing.hero.subtitle":
      "Stok real-time untuk seluruh tim, dengan bukti terverifikasi pada setiap catatan penting. Tanpa perlu tahu kripto.",
    "landing.hero.cta_primary": "Buat Gudang",
    "landing.hero.cta_secondary": "Masuk",
    "landing.hero.stat_100": "100%",
    "landing.hero.stat_100_label": "Setiap pergerakan ditambatkan",
    "landing.hero.stat_5_roles": "5 peran",
    "landing.hero.stat_5_roles_label": "Owner → Viewer, sisi server",
    "landing.hero.stat_1_day": "< 1 hari",
    "landing.hero.stat_1_day_label": "Waktu onboarding tim",
    "landing.hero.preview_label": "Pratinjau dasbor Chainventory",
    "landing.hero.preview_ribbon": "Pratinjau statis ilustratif",
    "landing.hero.preview_latency": "Sinkronisasi live: latensi 0,12 dtk",
    "landing.hero.preview_tap": "Ketuk untuk verifikasi",
    "landing.hero.preview_name": "Gudang",
    "landing.hero.live": "Aktif",
    "landing.hero.total_products": "Total Produk dalam Penitipan",
    "landing.hero.stock_in_30": "Stok Masuk (30h)",
    "landing.hero.stock_out_30": "Stok Keluar (30h)",
    "landing.hero.chart_label": "Pengiriman Stok Mingguan",
    "landing.hero.blockchain_verified": "Terverifikasi blockchain",
    "landing.hero.base_sepolia": "Base Sepolia",
    "landing.hero.proof_verified": "Bukti terverifikasi",
    "landing.hero.tamper_evident": "catatan anti-rusak",
    "landing.hero.live_sync": "Sinkronisasi langsung",
    "landing.hero.updates_reach": "pembaruan sampai ke tim",
    // Landing - Problem
    "landing.problem.title": "Inventaris sulit dijaga konsisten",
    "landing.problem.subtitle":
      "Gudang tradisional berjuang dengan spreadsheet dan jejak kertas. Chainventory menjamin kebenaran tak terbantahkan antara lantai gudang, meja keuangan, dan inspektur kepatuhan.",
    "landing.problem.without_title": "Tanpa Chainventory",
    "landing.problem.with_title": "Dengan Chainventory",
    "landing.problem.verified_cockpit": "Kokpit Terverifikasi",
    "landing.problem.without_outcome":
      "Hasil: 4,8 jam habis tiap minggu mengejar hitungan hilang",
    "landing.problem.with_outcome":
      "Hasil: Audit instan & nol overhead rekonsiliasi",
    "landing.problem.p1_title": "Spreadsheet usang",
    "landing.problem.p1_desc":
      "Banyak edit manual berujung hitungan bertentangan, kehilangan tak terlacak, dan darurat stok kosong.",
    "landing.problem.p2_title": "Sengketa soal siapa yang ubah apa",
    "landing.problem.p2_desc":
      "Tanpa log anti-rusak tentang siapa yang menyesuaikan, mengapa angka turun, atau siapa yang merilis.",
    "landing.problem.p3_title": "Tim lambat dan tidak sinkron",
    "landing.problem.p3_desc":
      "Staf lantai, manajer, dan auditor eksternal melihat angka tak cocok, menuntut rekonsiliasi mingguan.",
    "landing.proof.w1_title": "Satu sumber kebenaran, real-time",
    "landing.proof.w1_desc":
      "Tersinkron atomik ke semua perangkat terhubung begitu barcode atau palet dipindai.",
    "landing.proof.w2_title": "Setiap perubahan punya catatan terverifikasi",
    "landing.proof.w2_desc":
      "Bukti ledger anti-rusak kriptografis memverifikasi persis siapa yang memulai dan mencatat event stok.",
    "landing.proof.w3_title": "Semua melihat angka yang sama",
    "landing.proof.w3_desc":
      "Tampilan berbasis peran memastikan staf lantai, lead logistik, dan auditor kepatuhan tanpa selisih.",
    // Landing - Features
    "landing.features.title": "Semua yang gudang modern butuhkan",
    "landing.features.subtitle":
      "Direkayasa untuk operasi gudang cepat, transparansi total tim, dan stempel bukti tanpa usaha.",
    "landing.features.ledger_anchored": "Ditambatkan Ledger",
    "landing.features.sample_proof": "Lihat contoh catatan bukti",
    "landing.features.f1_title": "Inventaris terpusat",
    "landing.features.f1_desc":
      "Lacak lokasi multi-lorong, batch SKU, dan ambang kedaluwarsa dari dasbor operasional real-time yang terkonsolidasi.",
    "landing.features.f1_foot": "Pelacakan Lorong & Rak",
    "landing.features.f2_title": "Stok masuk / stok keluar",
    "landing.features.f2_desc":
      "Lakukan penerimaan dan pengiriman keluar dalam dua langkah cepat. Pindai barcode atau cari manifes purchase order langsung.",
    "landing.features.f2_foot": "Cari Barcode Instan",
    "landing.features.f3_title": "Sinkronisasi real-time",
    "landing.features.f3_desc":
      "Perubahan state terdistribusi latensi rendah langsung tercermin di pemindai genggam, tablet lantai, dan terminal kantor jauh.",
    "landing.features.f3_foot": "Dorongan Sub-detik",
    "landing.features.f4_title": "Akses berbasis peran",
    "landing.features.f4_desc":
      "Izin ketat untuk Owner, Manager, Staff, Auditor, dan Viewer memastikan pengguna hanya mengakses kontrol yang mereka butuhkan.",
    "landing.features.f4_foot": "5 Peran Berbeda",
    "landing.features.f5_title": "Catatan terverifikasi",
    "landing.features.f5_desc":
      "Setiap pergerakan pengiriman, penyesuaian, dan penerimaan mendapat sidik jari kriptografis tak berubah yang ditambatkan di Base Sepolia. Bukti tanpa membocorkan harga sensitif atau detail mitra.",
    "landing.features.f6_title": "Keamanan bawaan",
    "landing.features.f6_desc":
      "Otorisasi server-side, riwayat diaudit, dan jejak siapa melakukan apa yang hanya bisa ditambah.",
    "landing.features.verified": "Terverifikasi",
    // Landing - How it works
    "landing.how.eyebrow": "Pipa Eksekusi",
    "landing.how.title": "Cara Kerja",
    "landing.how.subtitle":
      "Setup empat langkah sederhana yang dirancang untuk adopsi langsung oleh kru lantai non-teknis.",
    "landing.how.s1_title": "Buat gudang Anda",
    "landing.how.s1_desc":
      "Otomatis terdaftar sebagai owner gudang dan hasilkan kode identitas depot yang terisolasi dan aman.",
    "landing.how.s1_foot": "Butuh 60 detik",
    "landing.how.s2_title": "Undang tim Anda",
    "landing.how.s2_desc":
      "Bagikan kode atau tautan undangan untuk menetapkan peran: Owner, Manager, Staff, Auditor, atau Viewer.",
    "landing.how.s2_foot": "Akses berbasis peran",
    "landing.how.s3_title": "Kelola stok secara real-time",
    "landing.how.s3_desc":
      "Catat batch Stok Masuk / Stok Keluar dan amati hitungan stok tersinkron langsung di seluruh pemindai lantai.",
    "landing.how.s3_foot": "Sinkronisasi soket real-time",
    "landing.how.s4_title": "Verifikasi saat Anda butuh",
    "landing.how.s4_desc":
      "Setiap pergerakan mendapat catatan bukti. Buka riwayat untuk melihat persis siapa yang lakukan apa, kapan saja.",
    "landing.how.s4_foot": "Bukti kriptografis",
    // Landing - Strip / Band / Trust / Pilot (referensi public_2 + public_1)
    "landing.strip.s1_title": "Pertahanan berlapis",
    "landing.strip.s1_desc":
      "Validasi server terisolasi menjaga dari input klien yang tak sah.",
    "landing.strip.s2_title": "Akses yang Anda kendalikan",
    "landing.strip.s2_desc":
      "RBAC sisi server menjaga aksi sensitif per tingkatan tim.",
    "landing.strip.s3_title": "Riwayat audit hanya-tambah",
    "landing.strip.s3_desc":
      "Catatan lama tak bisa dihapus; koreksi butuh entri penyeimbang.",
    "landing.strip.s4_title": "Verifikasi transparan",
    "landing.strip.s4_desc":
      "Status root kriptografis dikonfirmasi publik di testnet Base Sepolia.",
    "landing.band.badge": "Base Sepolia Layer 2",
    "landing.band.title": "Verifikasi, tanpa kerumitan",
    "landing.band.subtitle":
      "Anda tak butuh token gas, dompet kripto, atau manajemen private key. Chainventory menangani penambatan state langsung di balik layar.",
    "landing.band.b1_title": "Nol Overhead Gas",
    "landing.band.b1_desc":
      "Transaksi di-batch dan disponsori lewat infrastruktur relayer terkelola kami.",
    "landing.band.b2_title": "Bukti Merkle Anti-Rusak",
    "landing.band.b2_desc":
      "Bila baris database lama diubah, ketidakcocokan root kriptografis langsung mengingatkan manajer.",
    "landing.band.b3_title": "Transparansi Audit Publik",
    "landing.band.b3_desc":
      "Auditor eksternal memverifikasi pergerakan inventaris on-chain tanpa membocorkan rahasia dagang.",
    "landing.band.inspector_title": "Inspektur Bukti Ledger",
    "landing.band.tx_hash": "Hash Transaksi",
    "landing.band.dispatched_by": "Dikirim Oleh",
    "landing.band.role_auth": "Otorisasi Peran",
    "landing.band.proof_status": "Terverifikasi Kriptografis",
    "landing.band.view_basescan": "Lihat di BaseScan Sepolia Explorer",
    "landing.trust.title": "Catatan tepercaya, akuntabilitas jelas",
    "landing.trust.subtitle":
      "Arsitektur defense-in-depth yang memadukan standar keamanan web dengan audit ledger kriptografis tak berubah.",
    "landing.trust.t1_title": "RBAC Ditegakkan Server",
    "landing.trust.t1_desc":
      "Setiap izin diverifikasi di server sebelum sampai ke ledger. UI tak pernah memutuskan siapa boleh apa.",
    "landing.trust.t2_title": "Log Pergerakan Hanya-Tambah",
    "landing.trust.t2_desc":
      "Catatan tak pernah bisa diedit atau dihapus. Koreksi lewat transaksi offset Stok Masuk / Keluar yang beralasan.",
    "landing.trust.t3_title": "Hash Penjaga Privasi",
    "landing.trust.t3_desc":
      "Alamat dan harga tetap terenkripsi di database. Hanya bukti Merkle yang naik on-chain.",
    "landing.pilot.text": "Sedang piloting bersama tim-tim gudang awal.",
    "landing.pilot.cta": "Gabung daftar tunggu pilot",
    // Landing - Blockchain
    "landing.blockchain.badge": "Mengapa blockchain?",
    "landing.blockchain.title": "Verifikasi, tanpa kerumitan",
    "landing.blockchain.subtitle":
      "Kami menggunakan blockchain sebagai lapisan verifikasi tambahan untuk catatan penting. Memberi bukti integritas dan riwayat anti-rusak, sambil benar-benar tak mengganggu.",
    "landing.blockchain.point1":
      "Inventaris Anda dikelola seperti biasa. Tak ada yang berubah dalam kerja harian.",
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
    "landing.blockchain.block": "Base Sepolia, blok 12.845.201",
    // Landing - Security
    "landing.security.title": "Catatan terpercaya, akuntabilitas jelas",
    "landing.security.subtitle":
      "Keamanan bukan pikiran belakangan. Menyatu ke dalam produk sejak hari pertama agar data Anda tetap akurat dan bisa dipertanggungjawabkan.",
    "landing.security.s1_title": "Pertahanan berlapis",
    "landing.security.s1_desc":
      "Keamanan level database menopang cek level aplikasi sehingga tak ada bug tunggal yang membocorkan data Anda.",
    "landing.security.s2_title": "Akses yang Anda kendalikan",
    "landing.security.s2_desc":
      "Peran terperinci menentukan siapa yang bisa lihat, edit, atau setuju, ditegakkan di sisi server, bukan hanya di UI.",
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
      "Bukti blockchain adalah bagian yang ditanya pelanggan. Mereka tak peduli kripto. Mereka peduli pergerakan terverifikasi setelahnya.",
    "landing.testimonials.a3": "Founder, Startup Hardware",
    // Landing - TrustedBy
    "landing.trustedby.label":
      "Dipercaya tim operasi yang tak boleh punya titik buta",
    // Landing - PeakProof (audit v0.3.7 §7.1#4)
    "landing.peak_proof.eyebrow": "Mengapa tim bertahan",
    "landing.peak_proof.title":
      "Catatan yang tetap bertahan lama setelah hari berakhir",
    "landing.peak_proof.subtitle":
      "Peak-end penting: saat pengunjung menutup halaman ini harus jadi momen yang mereka ingat. Berikut buktinya, dalam angka.",
    "landing.peak_proof.stat1_value": "100%",
    "landing.peak_proof.stat1_label":
      "Setiap pergerakan stok meninggalkan jangkar on-chain terverifikasi yang bisa Anda periksa kembali.",
    "landing.peak_proof.stat2_value": "5 peran",
    "landing.peak_proof.stat2_label":
      "Owner, Manager, Staff, Auditor, Viewer, ditegakkan di sisi server, bukan hanya di UI.",
    "landing.peak_proof.stat3_value": "< 1 hari",
    "landing.peak_proof.stat3_label":
      "Rata-rata waktu bagi tim baru untuk onboard dan mulai mencatat stok dengan percaya diri.",
    // Landing - CTA
    "landing.cta.title": "Mulai kelola inventaris dengan catatan terverifikasi",
    "landing.cta.subtitle":
      "Hilangkan sengketa, percepat audit, dan beri tim logistik Anda satu sumber kebenaran yang tak terbantahkan.",
    "landing.cta.primary": "Buat Gudang",
    "landing.cta.secondary": "Masuk",
    "landing.cta.footnote":
      "Tanpa perlu tahu kripto. Gratis di jaringan uji Base Sepolia.",
    "landing.faq.title": "Pertanyaan yang sering diajukan",
    "landing.faq.subtitle": "Jawaban cepat. Tanpa kosakata blockchain.",
    "landing.faq.q1":
      "Apakah saya perlu paham blockchain untuk memakai Chainventory?",
    "landing.faq.a1":
      "Tidak. Anda mengelola inventaris seperti tool modern biasa. Blockchain bekerja diam-diam di latar sebagai lapisan verifikasi.",
    "landing.faq.q2": "Bagaimana verifikasi blockchain membantu saya?",
    "landing.faq.a2":
      "Setiap pergerakan stok mendapat bukti terverifikasi bahwa catatan autentik dan belum diubah. Jika ada sengketa, Anda punya jawaban anti-rusak.",
    "landing.faq.q3":
      "Bisakah seluruh tim bekerja di gudang yang sama bersamaan?",
    "landing.faq.a3":
      "Ya. Banyak pengguna bisa beroperasi di satu gudang secara bersamaan. Pembaruan stok atomik dan sinkron real-time.",
    "landing.faq.q4": "Peran apa yang tersedia?",
    "landing.faq.a4":
      "Ada lima peran: Owner, Manager, Staff, Auditor, dan Viewer. Masing-masing mengontrol apa yang bisa dilihat dan dilakukan.",
    "landing.faq.q5": "Jaringan apa yang dipakai untuk verifikasi?",
    "landing.faq.a5":
      "Chainventory berjalan di Base Sepolia, jaringan uji. Ini membuat gratis dan aman selama produk dimatangkan.",
    "landing.faq.q6": "Apakah data inventaris disimpan di blockchain?",
    "landing.faq.a6":
      "Tidak. Data operasional hidup di database aman. Hanya catatan bukti (bukan seluruh inventaris) yang ditambatkan untuk verifikasi.",
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
    "dashboard.active_products": "Produk aktif",
    "dashboard.unit_skus_active": "SKU Aktif",
    "dashboard.unit_units_on_hand": "Unit tersedia",
    "dashboard.units_all": "Total unit",
    "dashboard.at_below_threshold": "Produk di ambang atau di bawahnya",
    "dashboard.join_awaiting": "Permintaan gabung menunggu tinjauan",
    "dashboard.stock_in_out": "Stok Masuk / Keluar",
    "dashboard.stock_velocity": "Velocitas Pergerakan Stok",
    "dashboard.stock_velocity_desc":
      "Perbandingan volume masuk dan keluar harian.",
    "dashboard.top_products": "Produk Teratas",
    "dashboard.top_products_desc": "Peringkat velocitas {n} hari.",
    "dashboard.stock_movements": "Pergerakan Stok",
    "dashboard.products": "Produk",
    "dashboard.analytics": "Analitik",
    "dashboard.deployed_on_chain": "dideploy on-chain",
    "dashboard.not_deployed": "belum dideploy",
    "dashboard.vs_previous": "vs {n} hari terakhir",
    "dashboard.needs_attention_one": "Perlu perhatian: 1 hal",
    "dashboard.needs_attention_other": "Perlu perhatian: {n} hal",
    "dashboard.below_minimum_one": "1 produk di bawah stok minimum",
    "dashboard.below_minimum_other": "{n} produk di bawah stok minimum",
    "dashboard.join_requests_one": "1 permintaan gabung menunggu persetujuan",
    "dashboard.join_requests_other":
      "{n} permintaan gabung menunggu persetujuan",
    "dashboard.review": "Tinjau",
    "dashboard.review_products": "Tinjau Produk",
    "dashboard.review_members": "Tinjau Anggota",
    "dashboard.below_threshold_suffix": "di bawah ambang stok minimum",
    "dashboard.pending_approval_suffix":
      "permintaan gabung menunggu persetujuan gudang",
    "dashboard.setup_title": "Siapkan gudang Anda",
    "dashboard.setup_progress": "{done}/4 selesai",
    "dashboard.step_create": "Buat gudang",
    "dashboard.step_ready": "{name} siap",
    "dashboard.step_products_add": "Tambah produk pertama",
    "dashboard.step_products_manage": "Kelola produk",
    "dashboard.step_products_empty": "Belum ada produk",
    "dashboard.step_products_count": "{n} produk",
    "dashboard.step_invite": "Undang tim",
    "dashboard.step_invite_desc": "Bagikan kode gudang",
    "dashboard.step_team_count": "{n} anggota",
    "dashboard.step_movement": "Catat pergerakan stok",
    "dashboard.step_movement_desc": "Stok Masuk / Keluar",
    "dashboard.step_movement_done": "Pergerakan pertama tercatat",
    "dashboard.setup_hint":
      "Gudang Anda siap. Tambah produk pertama untuk memulai checklist.",
    "dashboard.health_title": "Kesehatan Operasional Gudang",
    "dashboard.health_inventory": "Inventaris",
    "dashboard.health_members": "Anggota",
    "dashboard.health_stable": "Stabil",
    "dashboard.health_pending": "{n} menunggu",
    "dashboard.live_hub": "Hub Live",
    "dashboard.last_range": "{n} hari terakhir",
    "dashboard.ledger_synced": "Ledger Tersinkron",
    "dashboard.urgent_action": "Aksi Mendesak",
    "dashboard.action_needed": "Perlu Tindakan",
    "dashboard.manage_invites": "Kelola Undangan",
    "dashboard.health_realtime": "Sinkron Realtime",
    "dashboard.node_code": "Kode Node",
    "activity.tab_all": "Semua",
    "activity.tab_inventory": "Inventaris",
    "activity.tab_members": "Anggota",
    "activity.tab_audit": "Audit",
    "activity.filter_label": "Filter aktivitas",
    "activity.view_all": "Lihat Semua",
    "activity.empty": "Belum ada yang perlu ditinjau.",
    "activity.open_notifications": "Buka Notifikasi",
    "activity.empty_suffix":
      "untuk melihat permintaan gabung dan event blockchain.",
    "activity.no_match": "Tidak ada aktivitas {tab}.",
    "activity.show_all": "Tampilkan Semua",
    "settings.title": "Pengaturan",
    "settings.description": "Profil, dompet, dan detail gudang aktif Anda.",
    "settings.profile": "Profil",
    "settings.profile_desc": "Identitas akun di ruang kerja ini.",
    "settings.wallet": "Dompet",
    "settings.wallet_desc": "Dompet utama di Base Sepolia.",
    "settings.role": "Peran",
    "settings.balance": "Saldo",
    "settings.no_wallet": "Belum ada dompet utama yang terhubung.",
    "settings.wallet_address": "Alamat dompet",
    "settings.copy_wallet": "Salin alamat dompet",
    "settings.wallet_verified": "Terverifikasi",
    "settings.wallet_unverified": "Belum verifikasi",
    "settings.verify_wallet": "Verifikasi dompet",
    "settings.verify_wallet_hint":
      "Pergerakan stok butuh dompet terverifikasi. Tandatangani pesan gratis untuk membuktikan kamu pemilik alamat ini — tanpa gas fee.",
    "settings.verify_wallet_signing": "Menunggu tanda tangan wallet…",
    "settings.verify_wallet_success": "Dompet terverifikasi. Kamu kini bisa mencatat pergerakan stok.",
    "settings.verify_wallet_failed": "Verifikasi gagal. Silakan coba lagi.",
    "settings.verify_wallet_unavailable":
      "Dompet tidak tersedia di sesi browser ini. Sambungkan ulang dan coba lagi.",
    "settings.contract_address": "Alamat kontrak",
    "settings.copy_contract": "Salin alamat kontrak",
    "settings.warehouse": "Gudang",
    "settings.warehouse_desc": "Gudang aktif dan kontrak on-chain.",
    "settings.no_contract": "Belum ada kontrak yang dideploy.",
    "settings.account": "Akun",
    "settings.signed_in": "Masuk sebagai {email}",
    "settings.no_warehouse": "Belum ada gudang",
    "settings.no_warehouse_desc":
      "Buat atau gabung gudang untuk melihat detailnya di sini.",
    // Inactivity banner
    "inactivity.suspended_title": "{name} ditangguhkan karena tidak aktif",
    "inactivity.suspended_desc":
      "Gudang ini ditangguhkan setelah {days} hari tanpa aktivitas. Mutasi stok dan keanggotaan dijeda. Hubungi dukungan Chainventory untuk mengaktifkannya kembali.",
    "inactivity.support_cta": "Email dukungan",
    "inactivity.warning_title_critical":
      "{name} akan ditangguhkan dalam {days} hari",
    "inactivity.warning_title": "{name} akan ditangguhkan",
    "inactivity.warning_desc_one":
      "Gudang ini belum ada aktivitas selama {inactive} hari. Lakukan pergerakan stok dalam 1 hari ke depan untuk menjaganya tetap aktif.",
    "inactivity.warning_desc_other":
      "Gudang ini belum ada aktivitas selama {inactive} hari. Lakukan pergerakan stok dalam {days} hari ke depan untuk menjaganya tetap aktif.",
    "inactivity.cta": "Buat Pergerakan Stok",
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
      // Audit v0.3.3 §5.2: pakai function form String.replace agar
      // value tidak di-interpret sebagai replacement pattern ($&, $1, dll).
      // Beberapa translation (seperti `signed_in` di `en`) menerima email
      // sebagai param — karakter `$` di email akan di-replace siluman
      // dengan string match kalau pakai string-form replace.
      result = result.replace(new RegExp(`\\{${k}\\}`, "g"), () => v);
    }
  }
  return result;
}
