# Roadmap Eksekusi Phase (Rapi dan Bertahap)

Terakhir diperbarui: 2026-02-26 (malam)

## Urutan Eksekusi Disarankan

1. **Stabilitas sesi auth dulu**
   - Backend Phase 10
   - Frontend Phase 9
   - Target: error 401 massal berhenti, user tidak terlempar acak.

2. **Hapus hardcode dan route notifikasi**
   - Backend Phase 11
   - Frontend Phase 10-11
   - Target: dashboard/notifikasi full dari API dan notifikasi punya halaman route.

3. **Bangun fondasi multi-tenant + role governance**
   - Backend Phase 12
   - Frontend Phase 12
   - Target: 1 app multi-koordinator, hanya super admin yang bisa kelola user.

4. **Migrasi data tenant tanpa downtime**
   - Backend Phase 13
   - Operations Phase 9
   - Target: data lama masuk tenant default aman, rollback plan siap.

5. **Operasional berkelanjutan**
   - Operations Phase 6-7
   - Target: backup/restore drill aktif, monitoring+alert minimal aktif.

## Definisi Done per Gelombang

- Gelombang 1 selesai jika:
  - tidak ada spam 401 di browser untuk endpoint utama,
  - refresh token flow stabil setelah token expired.

- Gelombang 2 selesai jika:
  - dashboard dan notifikasi tidak memakai data statis,
  - halaman `/notifications` aktif dan terproteksi auth.

- Gelombang 3 selesai jika:
  - super admin bisa assign role/staff per tenant,
  - admin tenant tidak bisa create user.

- Gelombang 4 selesai jika:
  - migrasi tenant sukses dengan data lama valid,
  - smoke test lintas role/tenant lulus.
