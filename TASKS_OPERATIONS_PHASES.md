# Tasks Operasional SPPG (Deployment + Stability)

Terakhir diperbarui: 2026-02-26 (malam)

## Gambaran Phase

| Phase | Fokus | Estimasi | Status |
|---|---|---:|---|
| 1 | Single app Coolify (frontend+backend+postgres) | 0.5 hari | DONE |
| 2 | Baseline limit resource container per project | 0.5 hari | DONE |
| 3 | Mode headless server + rollback mudah | 0.5 hari | DONE |
| 4 | Maintenance otomatis build cache Docker | 0.25 hari | DONE |
| 5 | Hardening network port exposure | 0.5 hari | DONE |
| 6 | Backup/restore drill database berkala | 0.5 hari | TODO |
| 7 | Monitoring + alert ringan | 0.5 hari | TODO |
| 8 | Incident handling hipam-id unavailable | 0.25 hari | DONE |
| 9 | Rollout multi-tenant tanpa downtime | 1 hari | TODO |

## Checklist

### Phase 1 (DONE)
- [x] Deploy stack SPPG jadi satu app di Coolify
- [x] Verifikasi endpoint lokal berjalan

### Phase 2 (DONE)
- [x] Terapkan limit CPU/RAM/PID per project via host policy
- [x] Aktifkan timer re-apply limit (`coolify-resource-limits.timer`)

### Phase 3 (DONE)
- [x] Uji stop/start GUI tanpa putus WiFi
- [x] Set default boot ke `multi-user.target`
- [x] Buat script toggle `gui-on.sh` dan `gui-off.sh`

### Phase 4 (DONE)
- [x] Buat timer cleanup build cache docker setiap 14 hari

### Phase 5 (DONE)
- [x] Batasi port direct host (`3000`, `3001`, `5432`, `3307`, `8082`, `8088`) hanya untuk LAN `192.168.1.0/24` + localhost
- [x] Pasang timer `docker-port-guard.timer` agar rule tetap konsisten
- [x] Tambah script export/restore rule (`docker-port-guard-export.sh` / `docker-port-guard-restore.sh`) + backup harian via timer

### Phase 6 (TODO)
- [ ] Tambah backup harian DB (minimal dump PostgreSQL app)
- [ ] Dokumentasi restore step-by-step dan uji restore

### Phase 7 (TODO)
- [ ] Tambah healthcheck script periodik endpoint kritikal
- [ ] Tambah notifikasi gagal deploy/health (Telegram/WhatsApp/webhook)

### Phase 8 (DONE)
- [x] Cek insiden `hipam-id.com` menampilkan `no available server`
- [x] Temukan akar masalah: `hipam-db` container sempat stop (status exited), aplikasi jadi HTTP 500 dan health turun
- [x] Perbaikan: start ulang `hipam-db`, verifikasi app kembali 200 internal/public, status Coolify kembali `running:healthy`
- [x] Catat bahwa limit memory bukan pemicu OOM langsung (OOMKilled=false), tetap monitor restart/exit code DB

### Phase 9 (TODO)
- [ ] Siapkan checklist pre-migration (backup DB, snapshot env, status app)
- [ ] Jalankan migrasi tenant secara additive (tanpa memutus layanan)
- [ ] Verifikasi matrix akses role antar tenant di production-like data
- [ ] Siapkan rollback playbook jika ada kegagalan pasca migrasi
