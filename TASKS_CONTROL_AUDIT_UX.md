# TASKS CONTROL - AUDIT, TENANT, RESPONSIVE

Last update: 2026-02-26

## Objective
- Menstabilkan seluruh auth/API/route/link agar tidak ada error saat klik/tambah/edit.
- Finalisasi model pusat-cabang: role hanya `SUPER_ADMIN`, `ADMIN`, `STAFF`.
- Detail tenant jadi pusat kontrol user/lokasi tenant (termasuk jabatan + mode visibility).
- UI mobile/tablet responsif, termasuk navbar burger dan tabel.

## Task Board
| ID | Task | Status |
|---|---|---|
| T-01 | Audit auth/API/route/link dan perbaikan validasi request gagal | DONE |
| T-02 | Tenant user model: `jabatan` + `canView` + `canEdit` | DONE |
| T-03 | Detail tenant: tambah + edit user/lokasi tenant | DONE |
| T-04 | Pemisahan pengguna pusat vs tenant di UI dan query backend | DONE |
| T-05 | Checklist export CSV/PDF A4 dengan header tenant + penanggung jawab | DONE |
| T-06 | Mobile/tablet responsive + navbar burger + table usability | DONE |
| T-07 | Rapikan istilah UI `tipe` -> `kategori` | DONE |
| T-08 | Repo hygiene: daftar file non-git untuk dipindah ke `docs/` | TODO |
| T-09 | Permintaan pembelian: filter harian/mingguan/bulanan + export CSV/PDF | DONE |
| T-10 | Audit route add/edit/delete/export agar terhubung service + database | DONE |
| T-11 | Transaksi: filter harian/mingguan/bulanan + filter jenis + export CSV/PDF | DONE |
| T-12 | Regression pass add/edit/delete/export + hardening validasi form | DONE |
| T-13 | Final hardening error field-level untuk flow transaksi/PR/checklist | DONE |
| T-14 | Sweep copy text minor agar tidak ada istilah teknis lama di UI utama | DONE |
| T-15 | Integrasi Telegram per tenant untuk export checklist (print + kirim PDF) | DONE |
| T-16 | Stabilisasi API simpan item dan keselarasan akses frontend-backend | DONE |
| T-17 | Tambah aksi hapus tenant dari panel SUPER_ADMIN | DONE |

## Acceptance Checklist
- [x] Checklist submit tidak gagal validasi.
- [x] Create PR tidak gagal validasi.
- [x] Create/edit/delete kategori tidak gagal validasi.
- [x] Create tenant berhasil dengan normalisasi kode.
- [x] Detail tenant bisa add+edit user (nama, username, email, role, jabatan, password, visibility mode).
- [x] Detail tenant bisa add+edit lokasi.
- [x] User tenant terisolasi by tenant; tab Pengguna pusat tidak bercampur user tenant.
- [x] Export CSV/PDF checklist menampilkan:
  - Nama tenant
  - Penanggung jawab (`Nama - Jabatan`)
- [x] Setelah export PDF, UI kembali fokus ke halaman sebelumnya.
- [x] Layout mobile/tablet aman di halaman utama, settings, checklist, PR, stok, transaksi.
- [x] Permintaan pembelian mendukung filter periode harian/mingguan/bulanan.
- [x] Export PR (CSV/PDF A4) tersedia dari data terfilter periode.
- [x] Export mingguan menandai hari Minggu dengan blok merah untuk identifikasi libur.
- [x] Setelah print export, jendela print otomatis ditutup dan fokus kembali ke halaman aplikasi.
- [x] Audit route utama add/edit/delete/export memastikan endpoint terhubung ke service backend dan query database.
- [x] Transaksi mendukung filter periode harian/mingguan/bulanan.
- [x] Transaksi mendukung filter jenis transaksi (Semua/Masuk/Keluar/Transfer/Penyesuaian).
- [x] Export transaksi (CSV/PDF A4) tersedia dari data terfilter periode + jenis transaksi.
- [x] Export transaksi mingguan menandai hari Minggu dengan blok merah untuk identifikasi libur.
- [x] Settings dan kategori punya tampilan kartu mobile agar tabel panjang tetap terbaca di layar kecil.
- [x] Label model kategori operasional diseragamkan: barang habis beli lagi / habis tapi isi ulang / tidak habis tapi bisa rusak.
- [x] Form add/edit utama diperketat di frontend (trim, validasi angka/email/password) untuk menekan error validasi generik.
- [x] Error API validasi menampilkan detail field pertama (bukan hanya pesan umum) di popup.
- [x] Form transaksi memvalidasi item/lokasi/qty sebelum request sehingga error backend berkurang.
- [x] Form PR memvalidasi item (nama, qty, harga) sebelum request untuk mencegah submit setengah valid.
- [x] Schema backend transaksi/PR menormalisasi field string kosong opsional agar tidak gagal validasi generik.
- [x] Template default checklist ikut memakai istilah kategori operasional terbaru agar konsisten dengan UI.
- [x] Sweep ulang kata kunci lama (Consumable/Gas/Asset/Jenis Kategori/Tipe) di frontend utama sudah bersih.
- [x] Endpoint tambah item pakai actor user aktual untuk audit log dan validasi error DB lebih jelas.
- [x] Hak akses tambah item di frontend diselaraskan dengan backend (SUPER_ADMIN/ADMIN).
- [x] Startup backend distabilkan dengan alur migrasi `prisma migrate deploy` tanpa langkah resolve manual yang memicu noise error.
- [x] Integrasi Telegram per tenant (SUPER_ADMIN setting) + auto kirim PDF saat export checklist.
- [x] SUPER_ADMIN bisa hapus tenant (soft delete/nonaktif) dari daftar tenant dan detail tenant.

## Notes
- Untuk repo hygiene, file operasional yang tidak perlu di root akan didaftarkan agar bisa dipindah manual ke folder `docs/` oleh owner.
