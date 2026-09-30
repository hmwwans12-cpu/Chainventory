# Desain: Onboarding, Supabase Session, dan Privy Wallet Recovery

Tanggal: 2026-09-25 · Status: disetujui user (chat)

## Masalah yang harus diselesaikan

Setelah register/login, user Chainventory tidak melihat alamat wallet embedded. Create/join onboarding juga dapat memantulkan user ke halaman sign-in, dan Privy menghasilkan error linking custom-JWT, timeout autentikasi, session destruction, serta `User limit reached`.

Penyebab utama yang teridentifikasi:

- Shell auth onboarding menggunakan `max-w-sm`, tetapi grid menjadi dua kolom pada breakpoint `sm`; card hanya sekitar 152px pada desktop.
- `proxy.ts`, onboarding guard, dan API guard mengabaikan jenis error Supabase sehingga error transient diperlakukan sebagai session invalid.
- `config.customAuth` Privy sudah deprecated; sinkronisasi session tidak membedakan user Supabase yang berganti.
- `createWallet()` dipanggil ulang setiap kali effect gagal, sehingga quota error berubah menjadi retry storm.
- Form create/join memakai status Privy sebagai pengganti status login Supabase.

## Tujuan

1. Setelah session Supabase valid, user mendapatkan embedded wallet Base Sepolia secara otomatis dan dapat melihat address-nya.
2. User tidak dipentalkan ke `/login` karena Privy timeout, error jaringan, atau error sementara Supabase.
3. Session Supabase dan Privy selalu merepresentasikan user yang sama tanpa automatic account linking.
4. Halaman onboarding tetap menjadi satu langkah setelah login; user tidak harus memilih login kedua.
5. Error quota, autentikasi, dan wallet failure menampilkan aksi yang jelas tanpa loop request.
6. Layout onboarding dua kolom tetap nyaman di desktop dan satu kolom di mobile.

## Batas scope

- Tidak mengubah Supabase schema atau memindahkan database.
- Tidak membuat Privy app kedua untuk melewati quota.
- Tidak mengubah alur external-wallet menjadi login primer.
- Tidak melakukan deploy ke Vercel sebelum seluruh gate release hijau.
- Tidak redesign halaman login, signup, atau dashboard selain state wallet/error yang diperlukan.

## Keputusan arsitektur

### 1. Onboarding shell

- Pecah shell auth umum agar route `/onboarding`, `/onboarding/create`, dan `/onboarding/join` memakai shell khusus dengan lebar `max-w-[720px]`.
- Shell khusus mempertahankan logo, background, Privy provider, skip link, footer, dan token visual yang sama.
- Grid pilihan tetap `sm:grid-cols-2`; pada lebar 720px content area cukup untuk card yang dapat dibaca. Di bawah breakpoint, grid menjadi satu kolom.
- Card dan Button global tidak diubah.
- Tombol create/join diberi lebar penuh dalam card agar hierarchy tetap konsisten.
- Copy dan icon tetap sama; tidak menambah fakta atau jalur baru.

### 2. Klasifikasi session Supabase

Gunakan hasil auth terstruktur di tiga boundary:

- `lib/supabase/middleware.ts` untuk refresh cookie dan optimistic route check.
- `lib/onboarding/guard.ts` untuk server-side onboarding guard.
- `lib/api-handler.ts` untuk Route Handler authorization.

Status yang dibedakan:

- `authenticated`: session/JWT valid.
- `missing`: tidak ada session atau session definitively invalid.
- `unavailable`: Auth/JWKS/network timeout, 429, atau 5xx.

Perilaku:

- `authenticated`: lanjutkan request.
- `missing`: redirect ke login dengan `next` yang aman, atau kembalikan 401 pada API.
- `unavailable`: jangan redirect ke login; return retryable 503/504 dari API, dan render retry state pada server page.
- `setAll` Supabase harus mempertahankan cookies dan cache/security headers pada response.
- Redirect dari proxy harus membawa cookies hasil refresh; jangan membuat response login yang membuang session update.
- API form hanya pindah ke login untuk 401 definitive. 503/504 menampilkan retry di halaman saat ini.

### 3. Sinkronisasi Privy

Ganti `config.customAuth` yang deprecated dengan hook JWT state sinkronisasi yang sesuai SDK terpasang, menggunakan state Supabase browser yang stabil.

- `getExternalJwt` membaca session Supabase terbaru.
- Callback tidak melempar exception dan mengembalikan `undefined` bila session belum tersedia.
- `isAuthenticated` dan `isLoading` berasal dari Supabase auth state, bukan state lokal yang hanya berubah setelah request pertama.
- Perubahan user Supabase yang berbeda akan clearing session Privy lama, lalu melakukan sinkronisasi JWT baru.
- Tidak menggunakan `useLinkJwtAccount`, `linkWithCustomJwt`, atau API linking lain untuk initial login.
- Privy callback hanya menerima token; token, cookie, dan JWT tidak masuk log.
- Privy auth error disimpan sebagai state UI yang bisa di-retry tanpa destroy-session loop.

### 4. Embedded wallet bootstrap

Wallet bootstrap adalah satu efek terpisah dari auth sync:

- Tunggu Privy `ready` dan JWT authenticated.
- Jika sudah ada Ethereum embedded wallet, jangan buat wallet kedua.
- Jika belum ada, buat tepat satu embedded wallet Base Sepolia.
- Setelah berhasil, address wallet menjadi state siap untuk dashboard, create signing, dan wallet sync.
- Jika create gagal, state menjadi failed dan tidak langsung mengulang efek.
- Retry hanya dilakukan melalui aksi user atau perubahan session yang sah; tidak ada retry storm.
- `User limit reached` ditampilkan sebagai kapasitas Privy eksternal, bukan sebagai session logout.
- Create warehouse tetap membutuhkan wallet owner; join tidak boleh menampilkan prompt sign-in hanya karena wallet belum selesai, tetapi UI menampilkan status wallet secara truthful.
- Dashboard/profile menampilkan address setelah wallet ready dan status error/retry ketika bootstrap tertunda.

### 5. Create/Join form states

Pisahkan tiga state yang sebelumnya tercampur:

- `supabaseLoading`: session Supabase belum diketahui.
- `supabaseUnauthenticated`: session definitive tidak ada.
- `walletLoading`: session valid tetapi embedded wallet belum tersedia.
- `walletError`: Privy/bootstrap gagal.

`!ready || !authenticated` dari Privy tidak boleh lagi sendiri merender prompt sign-in. Form memakai session Supabase untuk keputusan login dan wallet state untuk keputusan signing.

- Create: session valid + wallet ready → form dapat prepare/sign; wallet loading → progress/retry; wallet error → aksi retry, bukan `/login`.
- Join: session valid dapat membuat request membership; wallet bootstrap berjalan di background; error wallet tidak mengubah validitas login.
- 401 response tetap mengikuti `next` yang benar.
- 503/504 response tidak melakukan navigation.

## Error handling

| Kondisi                          | UI                           | HTTP/navigation            |
| -------------------------------- | ---------------------------- | -------------------------- |
| Session Supabase belum selesai   | Loading state                | Tidak redirect             |
| Session invalid/missing          | Sign-in state                | `/login?next=...` atau 401 |
| Supabase/JWKS timeout/5xx/429    | Retry state                  | 503/504, tetap di halaman  |
| Privy JWT timeout                | Retry auth state             | Tidak redirect             |
| Custom-JWT link attempt          | Dilarang                     | Tidak ada link request     |
| Embedded wallet belum ada        | Creating wallet              | Tidak ada form error       |
| Privy quota reached              | Pesan kapasitas + retry/info | Tidak destroy session      |
| Embedded wallet bootstrap failed | Retry wallet                 | Tidak membuat loop         |

## Perubahan yang diharapkan

- `app/(auth)/layout.tsx` dan route onboarding layout: shell width dipisah secara scoped.
- `app/(auth)/onboarding/page.tsx`: grid/card treatment disesuaikan ke shell baru.
- `lib/supabase/middleware.ts`: error classification, no transient redirect, cookie preservation.
- `lib/onboarding/guard.ts`: typed auth result dan retryable state.
- `lib/api-handler.ts`: transient auth failure menjadi retryable response.
- `components/providers/privy-provider.tsx`: modern JWT state sync, identity reconciliation, satu wallet bootstrap, explicit failure state.
- `components/warehouses/create-warehouse-form.tsx` dan `join-warehouse-form.tsx`: pisahkan auth state dari wallet state dan hentikan redirect pada transient errors.
- `lib/i18n/translations.ts`: copy retry, wallet bootstrap, quota, dan auth unavailable.
- Test files baru atau yang sudah ada untuk auth classification, Privy state, bootstrap, dan form navigation.

## Verifikasi

### Unit/integration

- Error `getUser()` dengan null user + error transient menghasilkan 503/retry, bukan 401.
- Missing session tanpa error menghasilkan 401/redirect.
- Proxy refresh tetap mempertahankan cookies pada response normal dan redirect.
- User Supabase berganti tidak menghasilkan custom-JWT link request.
- Wallet bootstrap tidak memanggil `createWallet()` berulang setelah failure.
- Satu embedded wallet yang sudah ada mencegah creation kedua.
- Create/join hanya redirect pada 401 definitive.
- Card onboarding memiliki dua-column layout yang tidak squeezed dan satu-column mobile layout.

### Browser E2E

Dengan browser profile bersih dan satu user Supabase baru:

1. Register lalu login.
2. Session tetap di halaman onboarding, tanpa Privy sign-in loop.
3. Embedded wallet selesai dibuat dan address tampil.
4. Create/Join cards memiliki ukuran dan CTA yang dapat dibaca.
5. Simulasi Supabase/Privy transient failure menampilkan Retry di halaman.
6. Simulasi quota menampilkan pesan kapasitas tanpa request loop.
7. Create warehouse dapat lanjut setelah wallet ready.

### Release gates

- `pnpm typecheck`
- `pnpm lint`
- `pnpm format:check`
- `pnpm test`
- `pnpm build`
- `pnpm preflight`
- `pnpm i18n:check`
- `pnpm secret:scan`
- `pnpm deps:audit`
- `pnpm e2e:test` terhadap test registry/factory yang sudah diisolasi
- mechanical UI detector pada target UI yang berubah

## Acceptance criteria

- Tidak ada redirect ke `/login` akibat Privy timeout atau Supabase transient error.
- User yang baru login memiliki embedded Base Sepolia address tanpa harus connect wallet manual.
- Pesan `Linking not allowed for custom JWT accounts` tidak muncul pada initial login atau account switch yang sudah diperbaiki.
- `User limit reached` tidak menyebabkan loop `createWallet()`.
- Onboarding cards tidak terpotong pada desktop dan tetap usable pada mobile.
- Tidak ada secret/JWT yang dicatat atau ditampilkan.
- Tidak ada deploy Vercel sebelum test dan review release selesai.
