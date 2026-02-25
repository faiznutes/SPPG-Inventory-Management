# Tasks Operasional SPPG (Deployment + Stability)

Terakhir diperbarui: 2026-02-26 (siang)

## Gambaran Phase

| Phase | Fokus | Estimasi | Status |
|---|---|---:|---|
| 1 | Single app Coolify (frontend+backend+postgres) | 0.5 hari | DONE |
| 2 | Baseline limit resource container per project | 0.5 hari | DONE |
| 3 | Mode headless server + rollback mudah | 0.5 hari | DONE |
| 4 | Maintenance otomatis build cache Docker | 0.25 hari | DONE |
| 5 | Hardening network port exposure | 0.5 hari | TODO |
| 6 | Backup/restore drill database berkala | 0.5 hari | TODO |
| 7 | Monitoring + alert ringan | 0.5 hari | TODO |

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

### Phase 5 (TODO)
- [ ] Batasi port direct host (`3000`, `3001`, `5432`, `3307`, `8082`, `8088`) sesuai kebutuhan LAN
- [ ] Definisikan allowlist subnet dan fallback akses admin

### Phase 6 (TODO)
- [ ] Tambah backup harian DB (minimal dump PostgreSQL app)
- [ ] Dokumentasi restore step-by-step dan uji restore

### Phase 7 (TODO)
- [ ] Tambah healthcheck script periodik endpoint kritikal
- [ ] Tambah notifikasi gagal deploy/health (Telegram/WhatsApp/webhook)
