# Desain: Google OAuth, Realtime UI, CSV Export/Import, Uji Ketahanan

Tanggal: 2026-08-23 · Status: disetujui user (chat)
Mandat sumber: DESIGN §25/§28 (Google), §36 (Bulk CSV), §63 (Realtime states),
P2 API Security (fail-open/closed), TODO.md "Sisa Pekerjaan Terbuka".

## A. Google OAuth (kecil)

- `signInWithGoogleAction` di app/actions/auth.ts → `signInWithOAuth({provider:"google",
options:{redirectTo:<origin>/auth/callback}})`; origin dari `headers()`.
- Route `app/auth/callback/route.ts`: `exchangeCodeForSession` → redirect `/dashboard`;
  gagal → `/login?error=oauth`. Login page membaca searchParams → banner error via prop
  `initialError` pada LoginForm.
- Tombol "Continue with Google" (variant outline, ikon G inline SVG, divider "or")
  di login-form dan signup-form. Alur email/password tidak berubah.
- Langkah manual user: aktifkan provider Google di Supabase Auth.

## B. Realtime + status Live/Reconnecting/Outdated (sedang)

- `lib/realtime/status.ts`: mesin status murni (`live | reconnecting | outdated`)
  - transisi (subscribed / lost / refresh-ok / elapsed>15s saat reconnecting).
- `components/realtime/use-warehouse-realtime.ts` (client hook):
  - Channel `wh:{warehouseId}` postgres_changes untuk `products`, `stock_movements`,
    `inventory_balances`, `join_requests` (filter warehouse_id) + `notifications`
    (filter user_id) — payload otomatis dibatasi RLS.
  - Setiap event → `router.refresh()` (data tetap server-rendered; tanpa optimistic UI,
    sesuai catatan batas DESIGN §989-990).
  - Status dari subscribe callback; watchdog 5s menandai outdated saat
    reconnecting >15s; refresh saat tab kembali fokus.
  - Cleanup `removeChannel` saat unmount / ganti warehouse.
- `components/realtime/realtime-indicator.tsx`: pill status (token warna terkunci;
  Live=primary, Reconnecting=muted pulse, Outdated=destructive).
- Unit test transisi status murni.

## C. CSV Export (kecil-sedang)

- `GET /api/warehouses/export?type=products|movements&warehouseId=` dengan guard order
  standar (`requireUser` → `requirePermission(PRODUCT_EXPORT|MOVEMENT_READ)`).
- Generator `toCsv()` murni di lib/inventory/csv.ts (escaping RFC: kutip ganda, CRLF).
- Kolom products identik dengan template import (round-trip).
- Tombol "Export CSV" di toolbar Products/Movements — dirender server-side hanya bila
  `hasPermission(role, …)`.

## D. CSV Import (terbesar)

- Parser murni `parseProductsCsv(text)`: BOM, quoted field, validasi header
  `sku,name,category,unit,description,initial_qty`, batas **1000 baris / 1MB**.
- Preview ala DESIGN §36: "Valid rows N / Invalid rows M" + daftar error per baris +
  tombol [Review Errors] [Import].
- Commit dua fase dari klien (keputusan final): (1) POST `products/bulk`
  yang sudah ada per-chunk <=500 -> dapat productId per baris; (2) baris
  dengan initial_qty>0 -> POST movements `action=apply` stock_in per baris
  memakai API yang sudah teruji (nol perubahan pada jalur movement kritis);
  audit + proof individual mengalir otomatis. Parser batasi total 1.000
  baris sesuai mandat.
- Template statis `public/templates/products-import.csv`.
- Unit test parser (BOM, quoting, baris rusak, limit).

## E. Uji ketahanan (kecil)

- Faucet rate limit: Redis tak terkonfigurasi / throw → **fail-closed** (denied).
- Kontrak RLS bypass (live-env, auto-skip tanpa env): anon client insert `products`
  ditolak; baca lintas tenant kosong.

## Validasi tiap tahap

prettier → tsc → eslint → vitest → build → contrast; update kotak TODO.md sesuai bukti.
