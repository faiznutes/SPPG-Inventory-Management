# Tasks Backend SPPG/MBG (API Auth + Database)

Terakhir diperbarui: 2026-02-25 (larut malam)

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

## Catatan Update
- `2026-02-25 - Phase 1-4 DONE - fondasi backend auth + schema database selesai`
- `2026-02-25 - Phase 5 DONE - PostgreSQL lokal diinit via pg_ctl, migrasi berhasil, dan auth e2e test berhasil`
- `2026-02-25 - Phase 6 DONE - API master data users/locations/categories aktif dan lulus smoke test`
- `2026-02-25 - Phase 7 DONE - API items/stocks/transactions aktif dengan validasi stok dan lulus smoke test`
- `2026-02-26 - Phase 8 DONE - API checklist dan purchase request aktif dengan detail item + history status`
