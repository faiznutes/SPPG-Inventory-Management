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
| T-01 | Audit auth/API/route/link dan perbaikan validasi request gagal | IN_PROGRESS |
| T-02 | Tenant user model: `jabatan` + `canView` + `canEdit` | IN_PROGRESS |
| T-03 | Detail tenant: tambah + edit user/lokasi tenant | IN_PROGRESS |
| T-04 | Pemisahan pengguna pusat vs tenant di UI dan query backend | IN_PROGRESS |
| T-05 | Checklist export CSV/PDF A4 dengan header tenant + penanggung jawab | IN_PROGRESS |
| T-06 | Mobile/tablet responsive + navbar burger + table usability | TODO |
| T-07 | Rapikan istilah UI `tipe` -> `kategori` | TODO |
| T-08 | Repo hygiene: daftar file non-git untuk dipindah ke `docs/` | TODO |

## Acceptance Checklist
- [ ] Checklist submit tidak gagal validasi.
- [ ] Create PR tidak gagal validasi.
- [ ] Create/edit/delete kategori tidak gagal validasi.
- [ ] Create tenant berhasil dengan normalisasi kode.
- [ ] Detail tenant bisa add+edit user (nama, username, email, role, jabatan, password, visibility mode).
- [ ] Detail tenant bisa add+edit lokasi.
- [ ] User tenant terisolasi by tenant; tab Pengguna pusat tidak bercampur user tenant.
- [ ] Export CSV/PDF checklist menampilkan:
  - Nama tenant
  - Penanggung jawab (`Nama - Jabatan`)
- [ ] Setelah export PDF, UI kembali fokus ke halaman sebelumnya.
- [ ] Layout mobile/tablet aman di halaman utama, settings, checklist, PR, stok, transaksi.

## Notes
- Untuk repo hygiene, file operasional yang tidak perlu di root akan didaftarkan agar bisa dipindah manual ke folder `docs/` oleh owner.
