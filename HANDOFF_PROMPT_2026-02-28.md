# Handoff Prompt (Copy-Paste)

Gunakan prompt ini untuk melanjutkan sesi implementasi SPPG:

---

Saya melanjutkan proyek `SPPG-Inventory-Management` dengan target menjaga isolasi tenant/lokasi secara ketat.

## Konteks penting yang sudah selesai

- Scope tenant/lokasi sudah diterapkan di dashboard, stocks, transactions, notifications, dan checklists.
- Nama lokasi di UI sudah bersih tanpa prefix tenant (contoh tampil `Sumatra`, bukan `tenant::Sumatra`).
- `tenantCode` disediakan terpisah untuk filter SUPER_ADMIN.
- Settings sekarang SUPER_ADMIN-only (menu + route guard).
- STAFF hanya boleh akses lokasi assigned, dengan fail-closed behavior saat mapping gagal.
- Guard transaksi menolak `locationId` lintas tenant.

## Referensi dokumen status

- `PHASE_SIGNOFF_2026-02-28.md`
- `ROLE_QA_MATRIX_2026-02-28.md`
- `RELEASE_NOTES_PHASE_CLOSURE_2026-02-28.md`

## Tugas lanjutan (eksekusi langsung)

1. Jalankan QA runtime pass/fail final di production untuk 3 role (SUPER_ADMIN/ADMIN/STAFF):
   - tenant switch (superadmin), location switch, visibility menu/settings, filter tenantCode.
   - transaksi IN/OUT/TRANSFER pastikan selector lokasi selalu sesuai context.
2. Lakukan API negative test (manual) untuk memastikan semua endpoint yang menerima `locationId` menolak lintas tenant.
3. Jika ditemukan gap, lakukan patch minimal, build (`backend-api` + `frontend-vue`), commit, push, deploy Coolify.
4. Update `ROLE_QA_MATRIX_2026-02-28.md` dengan hasil final PASS/FAIL aktual dari uji runtime.

## Aturan implementasi

- Jangan tampilkan prefix tenant di nama lokasi pada UI.
- Jika butuh pembeda tenant, gunakan `tenantCode` terpisah.
- Pertahankan strict scoping per tenant + active location + role.

---
