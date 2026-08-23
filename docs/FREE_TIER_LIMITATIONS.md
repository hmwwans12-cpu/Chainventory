# Known Limitations & Recovery Playbook

Daftar limitasi free tier yang digunakan Chainventory, dampaknya,
dan langkah recovery jika terjadi kegagalan.

---

## 1. Service Inventory

| Service | Plan | Role |
|---------|------|------|
| Supabase | Free | PostgreSQL DB, Auth, Realtime, RLS |
| Privy | Free (500 MAU) | Wallet layer (embedded + external) |
| Upstash Redis | Free (500K cmd/mo) | Rate limiting (faucet, mutations) |
| Upstash QStash | Free | Async proof job delivery |
| Vercel | Hobby | Hosting, Vercel Cron (3 jobs) |
| Base Sepolia RPC | Public/Testnet | Blockchain RPC |

---

## 2. Free Tier Limits & Dampak

### Supabase Free
| Limit | Value | Dampak |
|-------|-------|--------|
| Auth MAU | ~50,000 | Cukup untuk demo/thesis |
| Database size | 500MB | Export audit trail harus selektif |
| **Pause after inactivity** | **~7 hari** | **BLOCKER: DB pause = seluruh app down** |
| Realtime connections | Terbatas | Hanya tabel yang dipublikasikan |
| Edge Functions | N/A | Tidak dipakai |

**Mitigasi pause:** Vercel Cron daily keep-alive ke `/api/internal/keep-alive`.
Jika pause terjadi → manual resume via Supabase Dashboard.

### Privy Free
| Limit | Value | Dampak |
|-------|-------|--------|
| MAU | 500 | Cukup untuk demo/thesis |
| Embedded wallets | Included | Tidak ada limit terpisah |
| Custom auth | Included | Tidak ada limit terpisah |

### Upstash Redis Free
| Limit | Value | Dampak |
|-------|-------|--------|
| Commands/month | 500,000 | ~16,600 req/hari untuk rate limiting |
| Data storage | 256MB | Cukup untuk rate limit keys |
| Bandwidth | 10GB/bulan | Cukup untuk REST API calls |

**Rate limiting policy:**
- Mutations (Stock In/Out, deployment, faucet): **fail-closed** → jika Redis down, request DITOLAK
- Reads (list, summary): **fail-open** → jika Redis down, request diizinkan

### Upstash QStash Free
| Limit | Value | Dampak |
|-------|-------|--------|
| Messages/month | 500,000 (est.) | Cukup untuk proof pipeline |
| Message size | 6MB | Payload proof jauh di bawah ini |
| Retries | 3 per message | Gagal setelah 3x retry → manual review |

**Jika QStash down:**
- Proof pipeline terhenti (pending → tidak terkirim ke chain)
- Manual retry tersedia di Developer Console
- Developer Console → Dependencies akan menunjukkan status QStash

### Vercel Hobby
| Limit | Value | Dampak |
|-------|-------|--------|
| Cron jobs | 3 daily | Sudah terpakai penuh (keep-alive, reconcile, lifecycle) |
| Bandwidth | 100GB/bulan | Cukup untuk demo |
| Build minutes | 1,000/month | Cukup untuk development |
| **Deploys** | **Per-branch** | **Preview URL untuk setiap PR** |
| **No SLA** | — | **Downtime tanpa jaminan** |
| **No automatic backup** | — | **Data hanya di Supabase** |

### Base Sepolia RPC
| Limit | Value | Dampak |
|-------|-------|--------|
| Rate limit | Tidak di-dokumentasi | Bergantung pada provider |
| Availability | Testnet | Bisa downtime tanpa notice |
| Fallback | Public RPC | `https://sepolia.base.org` |

**Mitigasi:** Primary + fallback RPC via viem `fallback()` transport.

---

## 3. Recovery Playbook

### Scenario 1: Supabase DB Paused

**Gejala:** Semua API request timeout/gagal, Developer ConsoleDependencies merah.

**Langkah:**
1. Login ke Supabase Dashboard
2. Pilih project → Settings → General
3. Klik "Restore" / "Unpause"
4. Tunggu ~1-2 menit hingga DB aktif
5. Verifikasi via Developer Console → Dependencies
6. Jika masih gagal: cek `app/api/internal/keep-alive` logs

**Pencegahan:** Vercel Cron keep-alive berjalan daily (06:00 UTC).

### Scenario 2: Upstash Redis Down

**Gejala:** Faucet claim ditolak, Stock In/Out ditolak (fail-closed).

**Langkah:**
1. Cek Upstash Dashboard → status
2. Jika Redis down: tunggu Upstash recovery
3. Jika rate limit exhausted: tunggu reset (sliding window 12h untuk faucet)
4. Manual override: tidak tersedia (by design — fail-closed)

**Pencegahan:** Monitor usage di Upstash Dashboard.

### Scenario 3: QStash Down

**Gejala:** Proof tetap "pending" setelah Stock In/Out, tidak terkirim ke chain.

**Langkah:**
1. Cek Developer Console → Dependencies → QStash
2. Proof akan otomatis retry (exponential backoff)
3. Jika tetap gagal: Developer Console → Manual Review → Retry
4. Jika retry juga gagal: cek QStash Dashboard → Messages

**Pencegahan:** QStash retry 3x per message. Reconcile cron (04:00 UTC) mendeteksi stuck jobs.

### Scenario 4: Base Sepolia RPC Down

**Gejala:** Blockchain page error, proof confirmation terhenti.

**Langkah:**
1. Cek Developer Console → Dependencies → RPC
2. Sistem otomatis fallback ke RPC kedua
3. Jika semua RPC down: tunggu recovery
4. Manual override: tidak tersedia (blockchain harus diakses via RPC)

**Pencegahan:** Primary + fallback RPC via viem `fallback()`.

### Scenario 5: Privy Down

**Gejala:** Login/signup gagal, wallet operations gagal.

**Langkah:**
1. Cek Privy Dashboard → status
2. Jika Privy down: tidak ada fallback (auth layer wajib)
3. Manual override: tidak tersedia

**Pencegahan:** Privy SLA tinggi (production service). Untuk demo, ini risiko rendah.

---

## 4. Monitoring Checklist

Sebelum demo, pastikan:

- [ ] Developer Console → Dependencies semua hijau
- [ ] Supabase Dashboard → Database aktif (tidak paused)
- [ ] Upstash Dashboard → Redis commands usage < 80%
- [ ] Vercel Dashboard → Cron jobs berjalan (3/3)
- [ ] BaseScan → Contract address valid
- [ ] Tidak ada error di browser console

---

## 5. Escalation Path

Jika masalah free tier tidak bisa di-recovery:

1. **Supabase pause** → Manual resume (timeout 5 menit)
2. **Upstash exhausted** → Upgrade plan atau tunggu reset
3. **QStash down** → Manual retry via Developer Console
4. **RPC down** → Tunggu recovery (public testnet)
5. **Privy down** → Tunggu recovery (production service)

**Rule:** Jangan duplikasi akun untuk menambah quota (TECHSTACK.md §2.4).
Jika limits terlalu ketat → upgrade plan, bukan account duplication.
