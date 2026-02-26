# Tasks Frontend SPPG/MBG (Vue + Vite + Tailwind)

Terakhir diperbarui: 2026-02-26 (malam)

## Legenda Status
- `TODO` = belum dikerjakan
- `IN_PROGRESS` = sedang dikerjakan
- `DONE` = selesai
- `BLOCKED` = terhambat (butuh keputusan/data)

## Gambaran Phase

| Phase | Fokus | Estimasi | Status |
|---|---|---:|---|
| 1 | Audit desain saat ini + standar UI global | 0.5 hari | DONE |
| 2 | Setup project Vue + Vite + Tailwind + Router + Pinia | 1 hari | DONE |
| 3 | Layout konsisten (sidebar/topbar/page header) + burger mobile/tablet | 1 hari | DONE |
| 4 | Migrasi halaman inti (Login, Dashboard, Stok) | 1.5 hari | DONE |
| 5 | Migrasi halaman operasional (Transaksi, Checklist Harian) | 1.5 hari | DONE |
| 6 | Migrasi PR (List + Detail) dan Pengaturan | 1.5 hari | DONE |
| 7 | Lokalisasi penuh Bahasa Indonesia + format Rupiah + konsistensi tab/header | 1 hari | DONE |
| 8 | Polishing responsive HP/tablet + QA frontend | 1 hari | DONE |
| 9 | Session handling anti-401 spam | 0.5 hari | TODO |
| 10 | De-hardcode dashboard + notifikasi API | 1 hari | TODO |
| 11 | Notifikasi ter-route + role-aware menu | 0.5 hari | TODO |
| 12 | UI multi-tenant (context tenant + role-based access) | 1 hari | TODO |

> Total estimasi frontend: sekitar 8-9 hari kerja.

---

## Rincian Task per Phase

### Phase 1 - Audit & Standar UI (DONE)
- [x] Cek seluruh halaman desain yang sudah ada.
- [x] Catat inkonsistensi header/tab/sidebar antar halaman.
- [x] Tetapkan arah: full Bahasa Indonesia, Rupiah, dan UI konsisten.

### Phase 2 - Inisialisasi Project (DONE)
- [x] Buat project Vue 3 + Vite.
- [x] Integrasi TailwindCSS.
- [x] Setup Vue Router (route per halaman utama).
- [x] Setup Pinia (state UI global: sidebar open/close, user mock).
- [x] Struktur folder awal:
  - [x] `src/layouts`
  - [x] `src/components/common`
  - [x] `src/pages`
  - [x] `src/utils`

### Phase 3 - Layout Konsisten + Burger (DONE)
- [x] Buat `AppShell.vue` (sidebar + topbar + area konten).
- [x] Buat `PageHeader.vue` (judul, deskripsi, tombol aksi).
- [x] Sidebar desktop konsisten untuk semua halaman aplikasi.
- [x] Drawer sidebar untuk tablet/mobile (tombol burger).
- [x] Pastikan flex layout rapi untuk HP/tablet.

### Phase 4 - Migrasi Halaman Inti (DONE)
- [x] `LoginPage.vue`
- [x] `DashboardPage.vue`
- [x] `StocksPage.vue`
- [x] Sesuaikan label domain dapur/inventori SPPG.

### Phase 5 - Migrasi Halaman Operasional (DONE)
- [x] `TransactionsPage.vue`
- [x] `ChecklistTodayPage.vue`
- [x] Pastikan quick actions (IN/OUT/TRANSFER) rapi dan mobile-friendly.

### Phase 6 - Migrasi PR + Pengaturan (DONE)
- [x] `PurchaseRequestListPage.vue`
- [x] `PurchaseRequestDetailPage.vue`
- [x] `SettingsPage.vue`
- [x] Konsisten tab header di halaman pengaturan.

### Phase 7 - Lokalisasi & Konsistensi (DONE)
- [x] Ganti semua copy Inggris ke Bahasa Indonesia.
- [x] Buat util `formatRupiah` untuk seluruh nominal.
- [x] Samakan istilah status sesuai PRD (Draf, Diajukan, Disetujui, dll).
- [x] Samakan menu navigasi dan urutan tab di semua halaman.

### Phase 8 - QA Frontend (DONE)
- [x] Uji viewport HP kecil, HP besar, tablet, desktop.
- [x] Uji sticky header/footer action yang diperlukan.
- [x] Cek overflow tabel dan fallback tampilan mobile.
- [x] Final pass konsistensi spacing, font, dan tombol.

### Phase 9 - Session Handling Anti-401 (TODO)
- [ ] Tambah interceptor request response untuk auto-refresh saat 401.
- [ ] Tambah mekanisme single refresh lock (hindari refresh paralel).
- [ ] Retry 1x request setelah refresh berhasil.
- [ ] Jika refresh gagal, clear session + redirect ke `/login`.

### Phase 10 - De-hardcode Dashboard + Notifikasi (TODO)
- [x] Hapus data statis di dashboard (`stats`, low-stock list, aksi contoh).
- [x] Hapus notifikasi seed statis pada store notifikasi.
- [x] Integrasikan dashboard dan notifikasi ke endpoint backend.

### Phase 11 - Notifikasi Ter-route + Role-aware Menu (TODO)
- [x] Tambah halaman `NotificationsPage.vue`.
- [x] Tambah route `/notifications` dan navigasi dari tombol lonceng.
- [ ] Tampilkan badge unread dari API.
- [ ] Pastikan menu sensitif hanya tampil sesuai role.

### Phase 12 - UI Multi-tenant (TODO)
- [ ] Tambah konteks tenant aktif di store auth/session.
- [ ] Tambah selector tenant (untuk super admin).
- [ ] Batasi fitur create user hanya untuk super admin di UI.
- [ ] Uji 1 tenant dengan banyak staff dan role berbeda.

---

## Pemetaan Desain Lama ke Halaman Vue

| Sumber Desain Lama | Target Vue |
|---|---|
| `inventory_login_page/code.html` | `src/pages/LoginPage.vue` |
| `inventory_dashboard_overview/code.html` | `src/pages/DashboardPage.vue` |
| `inventory_stocks_management/code.html` | `src/pages/StocksPage.vue` |
| `inventory_transactions_quick_actions/code.html` | `src/pages/TransactionsPage.vue` |
| `daily_checklist_form/code.html` | `src/pages/ChecklistTodayPage.vue` |
| `purchase_requests_list/code.html` | `src/pages/PurchaseRequestListPage.vue` |
| `purchase_request_details_flow/code.html` | `src/pages/PurchaseRequestDetailPage.vue` |
| `inventory_settings_configuration/code.html` | `src/pages/SettingsPage.vue` |

---

## Catatan Update Berkala

Format update yang akan dipakai setiap phase selesai:
- Tanggal
- Phase selesai
- File/komponen yang berubah
- Kendala (jika ada)

Contoh:
- `2026-02-26 - Phase 2 DONE - setup Vue/Tailwind/Router/Pinia selesai - tanpa kendala`

Update aktual:
- `2026-02-25 - Phase 2 DONE - project frontend-vue + Tailwind + Router + Pinia selesai - tanpa kendala`
- `2026-02-25 - Phase 3 DONE - AppShell, PageHeader, sidebar desktop, burger tablet/mobile selesai - tanpa kendala`
- `2026-02-25 - Phase 4 DONE - Login, Dashboard, Stok migrasi ke Vue selesai - tanpa kendala`
- `2026-02-25 - Phase 5 DONE - Transaksi dan Checklist Harian migrasi selesai - tanpa kendala`
- `2026-02-25 - Phase 6 DONE - PR List, PR Detail, dan Pengaturan migrasi selesai - tanpa kendala`
- `2026-02-25 - Phase 7 DONE - Bahasa Indonesia + format Rupiah + menu konsisten selesai - tanpa kendala`
- `2026-02-25 - Phase 8 DONE - popup notifikasi, popup input flow, tab interaktif, dan build final selesai`
- `2026-02-25 - Integrasi Auth FE-BE DONE - login/logout/guard route dan session refresh terhubung ke backend`
- `2026-02-25 - Integrasi Pengaturan FE-BE DONE - tab Pengguna/Lokasi/Kategori terhubung ke API master data`
- `2026-02-25 - Integrasi Stok/Transaksi FE-BE DONE - halaman Stok dan Transaksi terhubung ke API inventory`
- `2026-02-26 - Integrasi Checklist/PR FE-BE DONE - Checklist Hari Ini dan PR List/Detail terhubung ke API backend`
- `2026-02-26 - Phase lanjutan 9-12 ditambahkan untuk anti-401, de-hardcode, notifikasi route, dan multi-tenant UI`
- `2026-02-26 - Progress Phase 10/11 - dashboard & notifikasi tidak hardcode, route /notifications aktif, data notifikasi sudah dari API`
- `2026-02-26 - Dashboard kini pakai endpoint /dashboard/summary dan /dashboard/low-stock (tanpa kalkulasi hardcode di frontend)`
