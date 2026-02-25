# Backend API - Inventory Checklist SPPG/MBG

Backend ini fokus pada fondasi API terstruktur:
- Express + TypeScript
- Prisma + PostgreSQL
- Auth JWT access/refresh + httpOnly cookie
- Endpoint awal: `/api/v1/auth/*`

## Menjalankan Backend

### Opsi cepat PostgreSQL lokal (Docker)

Jalankan dari folder `backend-api`:
- `docker compose up -d`

Database default:
- Host: `localhost`
- Port: `5432`
- DB: `sppg_inventory`
- User: `postgres`
- Password: `postgres`

### Opsi tanpa Docker (PostgreSQL CLI)

Jika `docker` tidak tersedia, bisa pakai PostgreSQL lokal:

1. Inisialisasi data dir (sekali saja):
   - `initdb -D .pgdata -U postgres -A trust`
2. Jalankan server:
   - `pg_ctl -D .pgdata -l .pgdata/server.log -o "-p 5432" start`
3. Buat database:
   - `createdb -h localhost -p 5432 -U postgres sppg_inventory`

1. Salin env:
   - `copy .env.example .env`
2. Sesuaikan `DATABASE_URL`, `JWT_SECRET`, `JWT_REFRESH_SECRET`.
   - `CORS_ORIGIN` untuk whitelist origin frontend (pisahkan dengan koma)
   - `TRUST_PROXY=true` bila backend ada di balik reverse proxy
   - `COOKIE_SECURE=true` bila akses via HTTPS
3. Generate Prisma Client:
   - `npm run prisma:generate`
4. Jalankan migrasi:
   - `npm run prisma:migrate`
5. Jalankan server:
   - `npm run dev`

Server default: `http://localhost:4000`

## Endpoint Auth

- `POST /api/v1/auth/login`
  - body: `{ "username": "admin", "password": "admin12345" }`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/logout`
- `GET /api/v1/auth/me` (Bearer access token)

## Endpoint Master Data (Admin)

- `GET /api/v1/users`
- `POST /api/v1/users`
- `PATCH /api/v1/users/:id/status`
- `GET /api/v1/locations`
- `POST /api/v1/locations`
- `GET /api/v1/categories`
- `POST /api/v1/categories`

## Endpoint Inventory

- `GET /api/v1/items`
- `POST /api/v1/items` (ADMIN, WAREHOUSE)
- `GET /api/v1/stocks`
- `GET /api/v1/transactions`
- `POST /api/v1/transactions`

## Endpoint Checklist

- `GET /api/v1/checklists/today`
- `POST /api/v1/checklists/today/submit`

## Endpoint Purchase Request

- `GET /api/v1/purchase-requests`
- `POST /api/v1/purchase-requests`
- `GET /api/v1/purchase-requests/:id`
- `POST /api/v1/purchase-requests/:id/status`

Catatan:
- Saat pertama login, sistem auto-seed user admin bila belum ada.
- Gunakan password admin default hanya untuk local dev, lalu ganti.
- Untuk LAN HTTP gunakan `COOKIE_SECURE=false`, untuk HTTPS wajib `COOKIE_SECURE=true`.
