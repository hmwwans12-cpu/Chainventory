# Aturan Pembuatan WEB

## 1. Hukum & Prinsip UI/UX

### Jakob's Law

Pengguna menghabiskan sebagian besar waktunya di website _lain_, jadi mereka lebih suka web yang bekerja dengan cara yang sama seperti web-web yang sudah mereka kenal. Jangan terlalu "kreatif" untuk pola-pola dasar (navbar di atas, logo bisa diklik ke home, cart di kanan atas, dll), karena itu bikin user harus belajar ulang.

### Hick's Law

Semakin banyak pilihan yang diberikan, semakin lama waktu yang dibutuhkan user untuk mengambil keputusan. Solusi: pecah pilihan yang banyak jadi kategori/langkah bertahap (progressive disclosure), jangan tampilkan semua opsi sekaligus.

### Fitts's Law

Waktu yang dibutuhkan untuk mencapai target (misal tombol) tergantung dari jarak ke target dan ukuran target itu sendiri. Semakin dekat & semakin besar, semakin cepat & mudah diklik. Implikasi: tombol CTA penting harus cukup besar dan gampang dijangkau (terutama di mobile — perhatikan _touch target size_).

### Miller's Law

Rata-rata orang hanya bisa menyimpan sekitar 7 (±2) item di memori jangka pendek. Jangan bebani user dengan terlalu banyak informasi/menu sekaligus — kelompokkan jadi chunk-chunk kecil (chunking).

### Law of Proximity (Gestalt)

Elemen yang berdekatan secara visual dianggap user sebagai satu kelompok/berhubungan. Gunakan spacing untuk menunjukkan mana elemen yang related dan mana yang terpisah (misal: label dan input harus lebih dekat dibanding input dan tombol submit).

### Von Restorff Effect (Isolation Effect)

Item yang tampil "beda sendiri" dari sekelilingnya (warna, ukuran, bentuk) lebih mudah diingat user. Cocok dipakai untuk highlight CTA utama atau promo penting — tapi jangan kebanyakan, karena kalau semua di-highlight, efeknya hilang.

### Serial Position Effect

User cenderung paling ingat item yang ada di **awal** (primacy) dan **akhir** (recency) dari sebuah list, sementara item di tengah paling gampang dilupakan. Taruh informasi/opsi paling penting di awal atau akhir daftar/menu.

### Tesler's Law (Law of Conservation of Complexity)

Setiap sistem punya kompleksitas yang gak bisa dihilangkan — hanya bisa dipindah, entah ke sisi developer (di-handle di backend/desain) atau ke sisi user (user yang harus mikir). Idealnya, developer/desainer yang menanggung kompleksitas itu, bukan user.

### Doherty Threshold

Produktivitas user meningkat drastis kalau response time sistem di bawah ~400ms, karena user tetap merasa "terhubung" dengan interaksinya. Kalau loading lebih lama, kasih feedback visual (spinner, skeleton, progress bar) supaya user gak merasa sistem hang.

### Peak-End Rule

User mengingat sebuah pengalaman terutama dari titik **paling intens (peak)** dan **bagian akhirnya (end)**, bukan dari keseluruhan interaksi. Pastikan momen krusial (misal: proses checkout, onboarding selesai) punya kesan yang baik, karena itu yang paling nempel di ingatan user.

### Tambahan yang perlu masuk juga:

**Aesthetic-Usability Effect**
Desain yang terlihat estetik/indah cenderung dianggap user lebih mudah digunakan, meskipun usability-nya sebenarnya sama saja. Tampilan yang rapi bisa "menutupi" minor usability issue.

**Zeigarnik Effect**
Orang lebih ingat tugas yang belum selesai dibanding yang sudah selesai. Bisa dimanfaatkan lewat progress bar ("Profil kamu 80% lengkap") untuk mendorong user menyelesaikan suatu alur.

**Law of Prägnanz (Occam's Razor versi visual)**
Otak manusia cenderung menyederhanakan bentuk kompleks jadi bentuk yang paling simpel dan mudah dikenali. Desain yang simpel & jelas lebih cepat dipahami dibanding yang rumit.

**Postel's Law (Robustness Principle)**
"Be conservative in what you send, be liberal in what you accept." Untuk form/input: sistem harus fleksibel menerima berbagai format input dari user (misal nomor telepon dengan/tanpa spasi/strip), tapi ketat & konsisten saat mengeluarkan/menyimpan data.

**Cognitive Load Theory**
Setiap elemen di layar menambah beban kognitif yang harus diproses otak user. Kurangi elemen yang gak perlu (unnecessary decoration, opsi berlebih) supaya user fokus ke tugas utama.

**Pareto Principle (80/20)**
80% penggunaan biasanya datang dari 20% fitur. Fokuskan effort desain & optimisasi ke fitur-fitur inti yang paling sering dipakai, bukan menyebar rata ke semua fitur.

**Mental Model & Affordance**
Desain harus sesuai dengan ekspektasi user tentang "bagaimana sesuatu seharusnya bekerja" (mental model), dan elemen visualnya harus memberi petunjuk jelas soal cara memakainya (affordance) — misal tombol harus terlihat "bisa diklik".

---

## 2. Referensi Block dari shadcn

### Navigasi & Struktur

| Block  | Link                                       | Command                                |
| ------ | ------------------------------------------ | -------------------------------------- |
| Navbar | https://www.shadcnblocks.com/block/navbar1 | `npx shadcn add @shadcnblocks/navbar1` |
| Logos  | https://www.shadcnblocks.com/block/logos8  | `npx shadcn add @shadcnblocks/logos8`  |

### Data & Profil

| Block            | Link                                                 | Command                                          |
| ---------------- | ---------------------------------------------------- | ------------------------------------------------ |
| Settings Profile | https://www.shadcnblocks.com/block/settings-profile1 | `npx shadcn add @shadcnblocks/settings-profile1` |
| Data Table       | https://www.shadcnblocks.com/block/data-table10      | `npx shadcn add @shadcnblocks/data-table10`      |

## 3. Referensi Components dari shadcn

| Component             | Link                                                                            | Command                                                                 |
| --------------------- | ------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Pagination (advanced) | https://www.shadcnblocks.com/component/pagination/pagination-advanced-2         | `npx shadcn add @shadcnblocks/pagination/pagination-advanced-2`         |
| Scroll Area (layout)  | https://www.shadcnblocks.com/component/scroll-area/scroll-area-layout-1         | `npx shadcn add @shadcnblocks/scroll-area/scroll-area-layout-1`         |
| Theme Switcher        | https://www.shadcnblocks.com/component/theme-switcher/theme-switcher-standard-1 | `npx shadcn add @shadcnblocks/theme-switcher/theme-switcher-standard-1` |

---

## 4. Devdocs yang Mungkin Berguna

- https://devdocs.io/nextjs/
- https://devdocs.io/dom/
- https://devdocs.io/javascript/
- https://devdocs.io/http/
- https://devdocs.io/html/
- https://devdocs.io/css/
- https://motion.zajno.com/ — referensi animasi/motion (easing curve, timing, transisi)

---

## 5. Catatan Praktis Tambahan

### Tipografi & Layout

- Gunakan typeface yang simpel dan mudah dibaca, hindari terlalu banyak jenis font (maks. 2 font: satu untuk heading, satu untuk body)
- Konsisten dalam ukuran font (buat scale yang jelas: misal 12/14/16/20/24/32px)
- Gunakan grid system (misal 8pt grid) supaya spacing antar elemen konsisten di seluruh halaman

### Microcopy & CTA

- Microcopy dipakai untuk mengklarifikasi maksud tombol primary CTA (contoh: bukan cuma "Submit", tapi "Buat Akun Gratis")
- Pastikan copy tombol jelas menyatakan konsekuensi dari klik tersebut

### Styling

- Gunakan styling yang proper dan konsisten (design token: warna, radius, shadow, spacing yang sama di seluruh komponen)
- Ikuti reading pattern user (F-pattern atau Z-pattern) untuk menentukan penempatan tombol/elemen penting

### Input & Kontrol

- **Stepper vs Slider**: gunakan _stepper_ kalau pilihan sudah predefined/diskrit (misal jumlah barang: 1, 2, 3...), gunakan _slider_ kalau user butuh rentang nilai dan fine-tuning (misal budget, radius jarak)
- **Progress bar vs Spinner**: gunakan _progress bar_ kalau durasi proses diketahui (misal upload file), gunakan _spinner_ kalau durasi tidak pasti (misal loading data dari server)

### Prinsip Umum

- **Simplicity** — hilangkan elemen yang tidak perlu
- **Consistency** — pola interaksi, warna, dan komponen harus konsisten di seluruh halaman
- **Visual Hierarchy** — atur ukuran, warna, dan posisi elemen supaya user tahu mana yang paling penting dilihat duluan

### Empty, Loading, & Error State

- Setiap halaman/komponen dengan data dinamis harus punya desain untuk 3 kondisi: **kosong** (belum ada data), **loading** (skeleton screen lebih baik dari spinner polos untuk konten panjang), dan **error** (pesan jelas + opsi retry)

### Form Design

- Label ditaruh di atas input (lebih mudah dipindai dibanding di samping)
- Validasi realtime untuk feedback cepat, tapi jangan terlalu agresif (misal jangan langsung error saat user baru mulai ngetik)
- Pesan error harus spesifik dan actionable (bukan cuma "Invalid input", tapi "Email harus mengandung @")

### Accessibility (a11y)

- Kontras warna teks vs background minimal sesuai standar WCAG AA (rasio 4.5:1 untuk teks normal)
- Touch target minimal 44x44px supaya nyaman diklik di mobile
- Semua elemen interaktif harus bisa diakses via keyboard (tab, enter, esc)
- Gunakan atribut ARIA untuk elemen custom (dropdown, modal, dll) supaya ramah screen reader

### Responsive & Dark Mode

- Tentukan breakpoint yang jelas (mobile, tablet, desktop) dan uji layout di masing-masing
- Kalau ada dark mode, pastikan kontras dan warna tetap sesuai standar accessibility, bukan cuma invert warna asal

---

## 6. Dasar Layout, Spacing & Button Placement

Ini bukan soal psikologi user, tapi aturan teknis penataan elemen di layar — wajib dipegang biar UI keliatan rapi dan "enak dipandang" secara konsisten.

### Alignment

Semua elemen harus segaris (align) ke satu garis referensi yang sama — kiri, kanan, tengah, atau grid kolom. Elemen yang "ngambang" tanpa alignment yang jelas bikin layout terasa berantakan meskipun secara individual tiap elemen rapi. Gunakan alignment guide/grid di tools desain (Figma dsb) untuk mastiin ini.

### Spacing Scale Konsisten

Jangan pakai jarak antar elemen secara acak (17px, 23px, dst). Tentukan skala tetap dan kelipatannya, misal berbasis 4px atau 8px:

- 4px — jarak micro (misal antara icon dan teks di dalam satu tombol)
- 8px — jarak antar elemen yang sangat berhubungan (label ke input)
- 16px — jarak antar elemen dalam satu grup/card
- 24px — jarak antar grup elemen berbeda
- 32px–48px — jarak antar section besar

Dengan skala ini, semua spacing di web jadi predictable dan konsisten, gak perlu nebak-nebak tiap bikin komponen baru.

### Grouping Visual (Chunking)

Elemen yang punya hubungan logis harus dikelompokkan secara visual, biasanya lewat salah satu dari: jarak yang lebih rapat, background/card yang sama, atau border pembatas. Contoh: form alamat (nama jalan, kota, kode pos) dikelompokkan dalam satu card terpisah dari form pembayaran, meskipun sama-sama ada di satu halaman checkout.

### Button Placement Convention

- **Primary action** (aksi yang paling diharapkan, misal "Simpan"/"Lanjutkan") biasanya ditaruh di **kanan** pada desktop/web (mengikuti reading pattern kiri-ke-kanan yang berakhir di kanan)
- **Secondary/Cancel action** ditaruh di kiri dari primary, dengan style yang lebih redup (outline/ghost/text button)
- Urutan ini harus **konsisten di semua modal, form, dan dialog** di seluruh web — jangan ada halaman yang Primary di kiri, halaman lain di kanan
- Di mobile, sering dibalik jadi vertikal (Primary di atas, full-width; Secondary di bawah)

### Hierarki Visual Antar Tombol

Gak semua tombol boleh punya bobot visual yang sama dalam satu layar, supaya user gak bingung mana yang harus diklik duluan:

- **Primary** — warna solid/filled, paling menonjol, cuma 1 per section/screen
- **Secondary** — outline atau warna lebih soft, untuk aksi alternatif
- **Tertiary/Text button** — tanpa border/background, untuk aksi minor (misal "Lewati")
- **Destructive** — warna merah/warning, khusus aksi yang bersifat merusak/menghapus (misal "Hapus Akun")

### Hit Area vs Ukuran Visual

Ukuran visual tombol (yang keliatan di layar) dan area yang bisa diklik (hit area/hitbox) itu dua hal berbeda. Icon button kecil (misal 24x24px) tetap harus punya hit area minimal 44x44px dengan menambah padding invisible di sekitarnya, supaya tetap nyaman diklik terutama di mobile — tanpa harus memperbesar tampilan icon-nya.

### Whitespace & Safe Margin

Jangan biarkan elemen mepet ke tepi layar atau ke elemen lain tanpa jarak (napas). Tentukan safe margin minimum dari tepi viewport (misal 16px di mobile, 24–32px di desktop), dan pastikan ada whitespace yang cukup di sekitar blok konten supaya mata gak lelah dan fokus user gak pecah.

### Balance & Symmetry

Distribusi berat visual (ukuran, warna, jumlah elemen) di layar harus terasa seimbang. Kalau satu sisi layar penuh elemen besar/berwarna sementara sisi lain kosong tanpa alasan desain yang jelas, komposisi akan terasa "berat sebelah" dan gak nyaman dilihat. Ini gak berarti harus simetris sempurna — asimetri juga bisa balance kalau bobot visualnya disusun dengan sengaja (misal 1 elemen besar vs beberapa elemen kecil yang jumlah "beratnya" setara).
