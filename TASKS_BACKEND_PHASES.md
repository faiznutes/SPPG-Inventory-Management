# Tasks Backend SPPG/MBG (API Auth + Database)

Terakhir diperbarui: 2026-02-26 (malam)

## Gambaran Phase

| Phase | Fokus | Estimasi | Status |
|---|---|---:|---|
| 1 | Inisialisasi backend project TypeScript | 0.5 hari | DONE |
| 2 | Setup Prisma + desain schema PostgreSQL | 1 hari | DONE |
| 3 | Implementasi auth JWT + refresh token | 1 hari | DONE |
| 4 | Middleware error/auth + struktur modul | 0.5 hari | DONE |
| 5 | Validasi endpoint & build check | 0.5 hari | DONE |
| 6 | Modul master data (users/locations/categories) | 1 hari | DONE |
| 7 | Modul inventory inti (items/stocks/transactions) | 1 hari | DONE |
| 8 | Modul checklist dan purchase request | 1.5 hari | DONE |
| 9 | Hardening baseline production (cors/cookie/proxy) | 0.5 hari | DONE |
| 10 | Session resilience (auto recover 401) | 0.5 hari | TODO |
| 11 | API dashboard + notifikasi tanpa hardcode | 0.5 hari | TODO |
| 12 | Multi-tenant schema (`tenant_id`) + role governance | 2 hari | TODO |
| 13 | Migrasi data tenant default + verifikasi akses | 1 hari | TODO |

## Checklist Implementasi

### Phase 1 (DONE)
- [x] Buat folder `backend-api`
- [x] Setup npm + TypeScript + script dev/build

### Phase 2 (DONE)
- [x] Init Prisma
- [x] Susun schema tabel inti sesuai PRD
- [x] Tambah `.env.example` untuk konfigurasi

### Phase 3 (DONE)
- [x] Endpoint `POST /auth/login`
- [x] Endpoint `POST /auth/refresh`
- [x] Endpoint `POST /auth/logout`
- [x] Endpoint `GET /auth/me`
- [x] Penyimpanan hash refresh token di database

### Phase 4 (DONE)
- [x] Middleware `requireAuth`
- [x] Middleware error handler standar `{ code, message, details }`
- [x] Struktur modul `src/modules/auth`

### Phase 5 (DONE)
- [x] Jalankan migrasi Prisma ke database lokal
- [x] Build TypeScript berhasil
- [x] Generate Prisma client berhasil
- [x] Uji endpoint auth sukses dengan DB nyata (login, me, refresh, logout)
- [x] Uji endpoint health berhasil
- [x] Uji error auth saat DB mati (respon `DATABASE_UNAVAILABLE`)

### Phase 6 (DONE)
- [x] Endpoint `GET/POST /users` + `PATCH /users/:id/status`
- [x] Endpoint `GET/POST /locations`
- [x] Endpoint `GET/POST /categories`
- [x] Role guard admin untuk aksi create/update
- [x] Uji endpoint master data dengan token admin

### Phase 7 (DONE)
- [x] Aktifkan route `/items` dan `/stocks` di app
- [x] Implement endpoint `GET/POST /items`
- [x] Implement endpoint `GET /stocks`
- [x] Implement endpoint `GET/POST /transactions`
- [x] Validasi stok untuk `OUT` dan `TRANSFER`
- [x] Audit log dasar untuk pembuatan transaksi
- [x] Smoke test endpoint inventory dengan token admin

### Phase 8 (DONE)
- [x] Implement endpoint `GET /checklists/today`
- [x] Implement endpoint `POST /checklists/today/submit`
- [x] Implement endpoint `GET/POST /purchase-requests`
- [x] Implement endpoint `GET /purchase-requests/:id`
- [x] Implement endpoint `POST /purchase-requests/:id/status`
- [x] Tambah model detail PR + history status di database
- [x] Smoke test checklist dan purchase request dengan token admin

### Phase 9 (DONE)
- [x] Tambah env `CORS_ORIGIN`, `TRUST_PROXY`, `COOKIE_SECURE`
- [x] Implement whitelist CORS berbasis env
- [x] Cookie refresh token mengikuti env `COOKIE_SECURE`
- [x] Tambah catatan konfigurasi keamanan di README dan `.env.example`

### Phase 10 (TODO)
- [ ] Standarisasi respons 401 agar frontend bisa trigger refresh otomatis
- [ ] Tambah guard di endpoint penting untuk kode error auth konsisten
- [ ] Verifikasi alur: token expired -> refresh -> retry request -> sukses

### Phase 11 (TODO)
- [x] Tambah endpoint `GET /api/v1/dashboard/summary`
- [x] Tambah endpoint `GET /api/v1/dashboard/low-stock`
- [x] Tambah endpoint `GET /api/v1/notifications`
- [x] Pastikan semua endpoint di atas tidak pakai data hardcode

### Phase 12 (TODO)
- [ ] Tambah model `Tenant` dan `TenantMembership` di schema
- [ ] Tambah role baru: `SUPER_ADMIN`, `TENANT_ADMIN`, `KOORD_DAPUR`, `KOORD_KEBERSIHAN`, `KOORD_LAPANGAN`, `STAFF`
- [ ] Middleware akses tenant-aware (`tenant_id` scope)
- [ ] Atur rule: hanya `SUPER_ADMIN` bisa create user/staff/admin

### Phase 13 (TODO)
- [ ] Migrasi data existing ke tenant default (`SPPG Pusat`)
- [ ] Backfill `tenant_id` untuk tabel operasional utama
- [ ] Validasi role matrix dan pembatasan akses antar tenant
- [ ] Smoke test multi-tenant dengan lebih dari 1 user per tenant

## Catatan Update
- `2026-02-25 - Phase 1-4 DONE - fondasi backend auth + schema database selesai`
- `2026-02-25 - Phase 5 DONE - PostgreSQL lokal diinit via pg_ctl, migrasi berhasil, dan auth e2e test berhasil`
- `2026-02-25 - Phase 6 DONE - API master data users/locations/categories aktif dan lulus smoke test`
- `2026-02-25 - Phase 7 DONE - API items/stocks/transactions aktif dengan validasi stok dan lulus smoke test`
- `2026-02-26 - Phase 8 DONE - API checklist dan purchase request aktif dengan detail item + history status`
- `2026-02-26 - Phase 9 DONE - baseline hardening CORS/cookie/proxy via environment selesai`
