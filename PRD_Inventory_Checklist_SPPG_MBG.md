# PRD — Aplikasi Lokal Inventory & Checklist Perlengkapan Dapur (SPPG/MBG)
**Versi:** 1.0  
**Target:** Koordinator Perlengkapan Dapur (alat, consumable, gas)  
**Deploy:** Lokal (LAN) via **Docker + Coolify**  
**Mode:** Web App (Mobile-first) + Admin Dashboard  
**Bahasa UI:** Indonesia

---

## 1) Ringkasan Masalah
Koordinator perlengkapan dapur perlu cara cepat untuk:
- Mengecek **stok & kondisi** alat dapur (aset) dan barang habis pakai (consumable).
- Menjalankan **checklist rutin** (harian/mingguan/bulanan) seperti: gas, sabun, tissue, sendok, dll.
- Menghindari kehabisan stok lewat **alert minimum stok** dan proses **permintaan pembelian**.
- Punya **rekap & audit trail** (siapa input, kapan, berapa, lokasi) untuk laporan.

---

## 2) Tujuan Produk
### Tujuan Utama
1. Mengurangi waktu cek stok & checklist harian.
2. Meminimalkan kejadian “stok habis” dengan peringatan otomatis.
3. Menyediakan rekaman data yang rapi untuk pertanggungjawaban.

### Non-Tujuan (Out of Scope v1)
- Akuntansi lengkap, integrasi e-procurement, integrasi POS.
- Multi-tenant (banyak organisasi) — v1 single site/instansi.

---

## 3) Persona & Hak Akses
### Persona
1. **Koordinator Perlengkapan (Admin Operasional)**
   - Kelola master item, lokasi, supplier, minimum stock, template checklist.
   - Approve permintaan pembelian.
2. **Petugas Dapur / PIC Shift**
   - Isi checklist, input stok keluar/masuk terbatas, lapor kerusakan.
3. **Gudang/Logistik**
   - Terima barang, input stok masuk, mutasi antar lokasi.
4. **Viewer (Pimpinan/Manajemen)**
   - Lihat dashboard & laporan, tanpa edit.

### Role-Based Access Control (RBAC)
- Admin: full access.
- PIC: checklist + issue/return + create maintenance ticket.
- Gudang: stock in/out + transfer.
- Viewer: read-only.

---

## 4) Ruang Lingkup Fitur (MVP v1)
### A. Master Data
- Item (alat/consumable/gas)
- Kategori
- Lokasi (Gudang, Dapur A, Dapur B, dsb)
- Supplier (opsional v1)
- User & Role

### B. Inventory
- Stok per lokasi (untuk consumable)
- Asset tracking (untuk alat yang “unik” / punya nomor)
- Transaksi stok: **IN, OUT, TRANSFER, ADJUST**
- Minimum stock & alert “Reorder Needed”
- Upload foto item (opsional)

### C. Checklist Operasional
- Template checklist (misal: Checklist Gas Harian)
- Jadwal: harian/mingguan/bulanan
- Checklist run (hasil pelaksanaan) dengan status:
  - OK / Menipis / Habis / Rusak
- Catatan + lampiran foto (opsional)
- Tanda tangan digital sederhana (nama user + timestamp)

### D. Permintaan Pembelian (Purchase Request)
- PR dibuat otomatis dari alert minimum stok (opsional) atau manual.
- PR status: Draft → Submitted → Approved/Rejected → Ordered → Received → Closed
- Saat Received: otomatis menambah stok (atau menambah asset unit).

### E. Maintenance / Kerusakan (Opsional tapi direkomendasikan)
- Ticket kerusakan alat
- Status: Open → In Progress → Done → Archived
- Riwayat tindakan

### F. Laporan
- Stok saat ini per lokasi
- Barang menipis
- Transaksi stok per periode
- Rekap checklist per periode
- Export CSV (v1), PDF (v2)

---

## 5) Kebutuhan Non-Fungsional
- **Local-first:** berjalan di server lokal/mini PC, akses via WiFi/LAN.
- **Multi-device:** responsive (HP lebih dominan).
- **Audit trail:** semua perubahan penting tercatat.
- **Backup:** dump database otomatis harian (cron container) + volume.
- **Keamanan:** auth JWT + refresh token; password hashed (Argon2/bcrypt).
- **Kinerja:** 50–200 item inventory, 10–30 user; query ringan.
- **Offline:** opsional v2 (PWA).

---

## 6) Data Model (Database Schema)
Disarankan: **PostgreSQL**.

### 6.1 Tabel Inti
#### `users`
- id (uuid, pk)
- name (text)
- email (text, unique, nullable jika lokal)
- username (text, unique)
- password_hash (text)
- role (enum: ADMIN, PIC, WAREHOUSE, VIEWER)
- is_active (bool)
- created_at, updated_at

#### `locations`
- id (uuid)
- name (text, unique)
- description (text, nullable)

#### `categories`
- id (uuid)
- name (text, unique)

#### `items`
- id (uuid)
- name (text)
- sku (text, unique, nullable)
- category_id (uuid, fk categories)
- type (enum: CONSUMABLE, ASSET, GAS)
- unit (text) — contoh: pcs, set, tabung, liter
- min_stock (numeric, default 0) — untuk CONSUMABLE/GAS
- reorder_qty (numeric, nullable)
- is_active (bool)
- photo_url (text, nullable)
- created_at, updated_at

#### `stocks` (untuk consumable/gas per lokasi)
- id (uuid)
- item_id (uuid, fk items)
- location_id (uuid, fk locations)
- qty (numeric)
- updated_at
**Unique index:** (item_id, location_id)

#### `assets` (untuk item type=ASSET yang unik per unit)
- id (uuid)
- item_id (uuid, fk items)
- asset_tag (text, unique) — bisa QR
- serial_number (text, nullable)
- location_id (uuid, fk locations)
- status (enum: AVAILABLE, IN_USE, LOST, DAMAGED, MAINTENANCE)
- assigned_to_user_id (uuid, fk users, nullable)
- notes (text, nullable)
- created_at, updated_at

### 6.2 Transaksi & Audit
#### `inventory_transactions`
- id (uuid)
- trx_type (enum: IN, OUT, TRANSFER, ADJUST)
- item_id (uuid)
- asset_id (uuid, nullable) — jika transaksi asset
- from_location_id (uuid, nullable)
- to_location_id (uuid, nullable)
- qty (numeric, nullable untuk asset)
- reason (text, nullable)
- created_by (uuid, fk users)
- created_at

#### `audit_logs`
- id (uuid)
- actor_user_id (uuid)
- entity_type (text) — items/stocks/checklists
- entity_id (uuid)
- action (text) — CREATE/UPDATE/DELETE
- diff_json (jsonb)
- created_at

### 6.3 Checklist
#### `checklist_templates`
- id (uuid)
- name (text)
- schedule (enum: DAILY, WEEKLY, MONTHLY, ADHOC)
- location_id (uuid, nullable) — checklist spesifik lokasi
- is_active (bool)
- created_by (uuid)
- created_at, updated_at

#### `checklist_template_items`
- id (uuid)
- template_id (uuid, fk checklist_templates)
- label (text) — "Cek Gas"
- item_id (uuid, fk items, nullable) — jika terkait stok item
- expected_unit (text, nullable)
- sort_order (int)

#### `checklist_runs`
- id (uuid)
- template_id (uuid)
- location_id (uuid, nullable) — override bila perlu
- run_date (date)
- status (enum: DRAFT, SUBMITTED, VERIFIED)
- created_by (uuid)
- created_at, updated_at
**Unique:** (template_id, run_date, location_id)

#### `checklist_run_items`
- id (uuid)
- run_id (uuid)
- template_item_id (uuid)
- result (enum: OK, LOW, OUT, DAMAGED, NA)
- qty_observed (numeric, nullable)
- notes (text, nullable)
- photo_url (text, nullable)

### 6.4 Purchase Request
#### `purchase_requests`
- id (uuid)
- pr_number (text, unique) — format: PR-YYYYMMDD-XXXX
- status (enum: DRAFT, SUBMITTED, APPROVED, REJECTED, ORDERED, RECEIVED, CLOSED)
- requested_by (uuid)
- approved_by (uuid, nullable)
- notes (text, nullable)
- created_at, updated_at

#### `purchase_request_items`
- id (uuid)
- pr_id (uuid)
- item_id (uuid)
- location_id (uuid)
- qty_requested (numeric)
- qty_received (numeric, default 0)
- unit_price (numeric, nullable)
- supplier_id (uuid, nullable)

### 6.5 Maintenance
#### `maintenance_tickets`
- id (uuid)
- asset_id (uuid)
- title (text)
- description (text)
- status (enum: OPEN, IN_PROGRESS, DONE, ARCHIVED)
- created_by (uuid)
- assigned_to (uuid, nullable)
- created_at, updated_at

---

## 7) Alur (Flow) End-to-End
### 7.1 Onboarding Awal (Admin)
1. Admin login.
2. Buat lokasi: Gudang, Dapur A, Dapur B.
3. Buat kategori: Alat Masak, Alat Makan, Bahan Habis Pakai, Gas.
4. Buat item:
   - Sendok (CONSUMABLE? biasanya ASSET jika dihitung per set; pilih sesuai kebutuhan)
   - Gas 3 kg (GAS, unit=tabung, min_stock=2)
   - Sabun cuci (CONSUMABLE, unit=botol, min_stock=3)
5. Input stok awal per lokasi.
6. Buat template checklist: “Checklist Harian Dapur A” isi list pengecekan.
7. Buat user PIC shift.

### 7.2 Cek Checklist Harian (PIC)
1. PIC buka halaman “Checklist Hari Ini”.
2. Pilih lokasi & template.
3. Isi item checklist:
   - Gas: LOW, qty_observed=1 tabung, catatan.
4. Submit checklist.
5. Sistem otomatis:
   - Jika result LOW/OUT dan terkait `item_id`, buat **alert** & saran PR.

### 7.3 Barang Keluar (Consumable OUT)
1. Gudang/PIC pilih menu “Barang Keluar”.
2. Pilih item + lokasi + qty.
3. Submit → stok berkurang, transaksi tercatat.

### 7.4 Transfer Antar Lokasi
1. Gudang pilih item + from_location + to_location + qty.
2. Submit → stok pindah lokasi.

### 7.5 Asset Dipinjamkan (Alat)
1. Admin/Gudang buka asset list.
2. Pilih asset → Assign ke PIC / status IN_USE.
3. Saat kembali → unassign & status AVAILABLE.

### 7.6 Purchase Request
1. Dari dashboard “Menipis”, Admin klik “Buat PR”.
2. Isi qty_requested per item + lokasi.
3. Submit → status SUBMITTED.
4. Approve → status APPROVED.
5. Saat barang datang → Receive:
   - Sistem menambah stok (IN) + update qty_received.
6. Close PR.

---

## 8) UI/UX: Sitemap & Screen Detail (Frontend Flow)
### 8.1 Sitemap
- /login
- /dashboard
- /inventory
  - /inventory/items
  - /inventory/stocks
  - /inventory/transactions
  - /inventory/assets (jika pakai asset)
- /checklists
  - /checklists/today
  - /checklists/templates (admin)
  - /checklists/runs/:id
- /purchase-requests
  - /purchase-requests/new
  - /purchase-requests/:id
- /maintenance (opsional)
- /reports
- /settings (users, locations, categories)

### 8.2 Dashboard
Widgets:
- Stok Menipis (top 10)
- Checklist hari ini: belum submit / sudah submit
- PR open
- Asset rusak/maintenance
Actions cepat:
- + Barang Masuk
- + Barang Keluar
- + Isi Checklist

### 8.3 Inventory UI
**Items list**
- Search, filter kategori, tipe (consumable/gas/asset).
- Item detail: min_stock, reorder_qty, stok per lokasi, riwayat transaksi.

**Stocks**
- Tabel: item x lokasi, qty, status (OK/LOW/OUT)

**Transactions**
- Filter tanggal, tipe transaksi, export CSV.

### 8.4 Checklist UI
**Today**
- Auto tampilkan template sesuai schedule (daily) per lokasi.
- 1 template = 1 form.
- Input cepat: radio OK/LOW/OUT + qty + notes.

**Templates**
- CRUD template
- Drag reorder item checklist (sort_order)

### 8.5 PR UI
- List PR status, filter tanggal
- Detail PR: item, qty requested, received
- Approve/Reject (Admin)

---

## 9) Arsitektur Teknis (Rekomendasi)
### Stack yang disarankan (modern & simple)
- **Frontend:** Next.js (React) + Tailwind + TanStack Query
- **Backend:** NestJS atau Fastify/Express (Node.js)  
- **DB:** PostgreSQL
- **Auth:** JWT (access + refresh)
- **Storage file/foto:** Local volume (v1), bisa minio (v2)
- **Deployment:** Docker Compose via Coolify

Alternatif paling cepat:
- Fullstack Next.js (API routes) + Prisma + Postgres (monorepo satu repo)

Saya tuliskan desain rute API generik (REST).

---

## 10) API Design (REST) — Routes Lengkap
Base URL: `/api/v1`

### 10.1 Auth
- `POST /auth/login`
  - body: { username, password }
  - res: { accessToken, refreshToken, user }
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /auth/me`

### 10.2 Users (Admin)
- `GET /users`
- `POST /users`
- `GET /users/:id`
- `PATCH /users/:id`
- `PATCH /users/:id/disable`

### 10.3 Master Data
**Locations**
- `GET /locations`
- `POST /locations`
- `PATCH /locations/:id`
- `DELETE /locations/:id`

**Categories**
- `GET /categories`
- `POST /categories`
- `PATCH /categories/:id`
- `DELETE /categories/:id`

### 10.4 Items
- `GET /items?search=&categoryId=&type=&isActive=`
- `POST /items`
- `GET /items/:id`
- `PATCH /items/:id`
- `POST /items/:id/photo` (multipart)

### 10.5 Stocks (Consumable/Gas)
- `GET /stocks?locationId=&itemId=&lowOnly=`
- `POST /stocks/adjust`
  - body: { itemId, locationId, qtyDelta, reason }
  - creates transaction ADJUST
- `POST /stocks/in`
  - body: { itemId, locationId, qty, reason }
- `POST /stocks/out`
  - body: { itemId, locationId, qty, reason }
- `POST /stocks/transfer`
  - body: { itemId, fromLocationId, toLocationId, qty, reason }

### 10.6 Assets
- `GET /assets?itemId=&locationId=&status=&search=`
- `POST /assets`
  - body: { itemId, assetTag, serialNumber?, locationId, notes? }
- `PATCH /assets/:id`
- `POST /assets/:id/assign`
  - body: { userId }
- `POST /assets/:id/unassign`
- `POST /assets/:id/status`
  - body: { status, notes? }

### 10.7 Inventory Transactions
- `GET /transactions?type=&dateFrom=&dateTo=&itemId=&locationId=`
- `GET /transactions/:id`

### 10.8 Checklist Templates & Runs
**Templates**
- `GET /checklist-templates?locationId=&schedule=&isActive=`
- `POST /checklist-templates`
- `GET /checklist-templates/:id`
- `PATCH /checklist-templates/:id`
- `DELETE /checklist-templates/:id`

**Template Items**
- `POST /checklist-templates/:id/items`
- `PATCH /checklist-template-items/:id`
- `DELETE /checklist-template-items/:id`
- `POST /checklist-templates/:id/reorder`
  - body: [{templateItemId, sortOrder}, ...]

**Runs**
- `GET /checklist-runs?date=&locationId=&templateId=&status=`
- `POST /checklist-runs`
  - body: { templateId, locationId?, runDate }
- `GET /checklist-runs/:id`
- `PATCH /checklist-runs/:id`
- `POST /checklist-runs/:id/submit`
- `POST /checklist-runs/:id/items`
  - body: [{templateItemId, result, qtyObserved?, notes?}, ...]

### 10.9 Alerts (Low Stock)
- `GET /alerts/low-stock?locationId=`
- `POST /alerts/ack`
  - body: { alertId }

Implementasi:
- Alert bisa view dari query stocks where qty < min_stock.
- Tidak wajib tabel khusus v1.

### 10.10 Purchase Requests
- `GET /purchase-requests?status=&dateFrom=&dateTo=`
- `POST /purchase-requests`
- `GET /purchase-requests/:id`
- `PATCH /purchase-requests/:id`
- `POST /purchase-requests/:id/submit`
- `POST /purchase-requests/:id/approve`
- `POST /purchase-requests/:id/reject`
- `POST /purchase-requests/:id/receive`
  - body: { items: [{prItemId, qtyReceived}], locationId? }
  - system create stocks IN transactions

### 10.11 Maintenance
- `GET /maintenance?status=&assetId=`
- `POST /maintenance`
- `GET /maintenance/:id`
- `PATCH /maintenance/:id`
- `POST /maintenance/:id/assign`
- `POST /maintenance/:id/close`

### 10.12 Reports
- `GET /reports/stock-snapshot?date=`
- `GET /reports/low-stock`
- `GET /reports/checklists?dateFrom=&dateTo=&locationId=`
- `GET /reports/transactions?dateFrom=&dateTo=&type=`
> v1 output JSON + opsi `?format=csv`.

---

## 11) Backend: Modul & Struktur Project
### 11.1 Modul
- AuthModule
- UsersModule
- MasterDataModule (locations, categories)
- ItemsModule
- StocksModule
- AssetsModule
- TransactionsModule
- ChecklistsModule
- PurchaseRequestsModule
- MaintenanceModule
- ReportsModule

### 11.2 Validasi & Rules
- Tidak boleh OUT stok melebihi qty tersedia (kecuali role ADMIN dengan flag override).
- TRANSFER harus from != to.
- Checklist run per template per tanggal per lokasi hanya satu.
- Jika checklist item terkait `itemId` dan result LOW/OUT → rekomendasi PR.

### 11.3 Error Model
JSON:
- { code, message, details? }
Contoh code: AUTH_INVALID, STOCK_INSUFFICIENT, VALIDATION_ERROR

---

## 12) Frontend: Komponen & State
### 12.1 Pages (Next.js)
- LoginPage
- DashboardPage
- ItemsPage + ItemDetailPage
- StocksPage
- TransactionsPage
- AssetsPage
- ChecklistTodayPage
- ChecklistTemplatesPage (admin)
- ChecklistRunDetailPage
- PRListPage + PRDetailPage + PRCreatePage
- ReportsPage
- SettingsPage (admin)

### 12.2 UI Components
- DataTable (search, filter)
- StatusBadge (OK/LOW/OUT)
- QuickActionModal (IN/OUT/TRANSFER)
- ChecklistForm (dynamic by template)
- PRWizard

### 12.3 Data Fetching
- TanStack Query:
  - cache per endpoint
  - optimistic update untuk IN/OUT/TRANSFER
- Auth: store token in httpOnly cookie (recommended) atau memory + refresh.

---

## 13) Integrasi QR/Barcode (Opsional v1.1)
- Print QR untuk assetTag / item sku.
- Scan via kamera HP:
  - Frontend: use `zxing`/`html5-qrcode`
  - Route: `/inventory/scan` → redirect ke item/asset detail

---

## 14) Docker & Coolify Deployment
### 14.1 Docker Compose (konsep)
Services:
- `app` (frontend+backend)
- `db` (postgres)
- `adminer`/`pgadmin` (opsional)
- `backup` (pg_dump cron, opsional)

Volumes:
- db_data
- uploads (foto)

Env minimal:
- DATABASE_URL
- JWT_SECRET
- JWT_REFRESH_SECRET
- APP_URL
- UPLOAD_DIR=/data/uploads

### 14.2 Coolify Notes
- Set domain lokal atau IP:port.
- Set persistent volume untuk Postgres & uploads.
- Tambahkan healthcheck untuk app & db.
- Backup: schedule (cron) untuk dump.

---

## 15) Acceptance Criteria (MVP)
1. Admin bisa membuat item, lokasi, stok awal.
2. PIC bisa menjalankan checklist harian dan submit.
3. Gudang bisa IN/OUT/TRANSFER stok.
4. Dashboard menampilkan barang menipis otomatis.
5. Admin bisa membuat PR dan menandai Received sehingga stok bertambah.
6. Semua transaksi tercatat dan bisa difilter per tanggal.
7. RBAC berjalan (PIC tidak bisa hapus item).

---

## 16) Roadmap (Opsional)
### v1.1
- QR scan
- Export PDF
- Notifikasi Telegram/WhatsApp lokal (webhook)

### v1.2
- PWA offline checklist
- Minio storage
- Multi lokasi lebih kompleks

---

## 17) Contoh Template Checklist (Siap Pakai)
**Checklist Harian Dapur**
1. Cek Gas (LOW jika < 2 tabung)
2. Cek Sabun Cuci
3. Cek Tissue
4. Cek Sendok (set)
5. Cek Kompor (status: OK/DAMAGED)
6. Cek Regulator & Selang

---

## 18) Contoh Payload API
### Login
Request:
```json
{ "username": "pic1", "password": "********" }
```
Response:
```json
{
  "accessToken": "jwt...",
  "refreshToken": "jwt...",
  "user": { "id": "...", "name": "PIC Shift 1", "role": "PIC" }
}
```

### Stock OUT
```json
{ "itemId": "uuid", "locationId": "uuid", "qty": 2, "reason": "Pemakaian shift pagi" }
```

### Checklist Run Submit (items)
```json
[
  { "templateItemId": "uuid", "result": "OK" },
  { "templateItemId": "uuid", "result": "LOW", "qtyObserved": 1, "notes": "Sisa 1 tabung" }
]
```

---

## 19) Catatan Implementasi Cepat
Kalau kamu ingin cepat selesai:
- Gunakan **Next.js + Prisma + Postgres** (1 repo).
- API sesuai route di atas.
- Checklist: fokus harian dulu, weekly/monthly belakangan.
- Alert: cukup query `stocks.qty < items.min_stock` tanpa tabel khusus.

---

**Owner:** Faiz nute  
**Doc generated:** 2026-02-25 (Asia/Jakarta)
