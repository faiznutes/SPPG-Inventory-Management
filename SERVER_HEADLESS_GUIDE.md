# Panduan Mode Headless Server Debian

Dokumen ini untuk server `192.168.1.105` agar GUI bisa dimatikan (hemat resource) dan dinyalakan kembali dengan cepat.

## Kondisi Saat Ini

- Default boot target: `multi-user.target` (headless, tanpa GUI)
- WiFi tetap aktif melalui NetworkManager
- Script toggle GUI sudah dibuat di server:
  - `/usr/local/sbin/gui-on.sh`
  - `/usr/local/sbin/gui-off.sh`

## Perintah Cepat

Jalankan via SSH sebagai root.

### Matikan GUI (headless)

```bash
/usr/local/sbin/gui-off.sh
```

Efek:
- set default ke `multi-user.target`
- stop `display-manager` (GDM)

### Nyalakan GUI kembali

```bash
/usr/local/sbin/gui-on.sh
```

Efek:
- set default ke `graphical.target`
- start `display-manager` (GDM)

## Verifikasi

```bash
systemctl get-default
systemctl is-active gdm
nmcli -t -f DEVICE,TYPE,STATE,CONNECTION device status | head -n 5
```

## Otomatisasi Cleanup Build Cache Docker

Sudah dibuat timer 2 minggu sekali:

- Script: `/usr/local/sbin/docker-buildcache-cleanup.sh`
- Service: `/etc/systemd/system/docker-buildcache-cleanup.service`
- Timer: `/etc/systemd/system/docker-buildcache-cleanup.timer`

Jadwal:
- `OnUnitActiveSec=14d`

Perintah cek:

```bash
systemctl status docker-buildcache-cleanup.timer
systemctl list-timers --all | grep docker-buildcache-cleanup
```

Jalankan manual kapan saja:

```bash
systemctl start docker-buildcache-cleanup.service
```

## Limit Resource Docker per Project (Coolify)

Sudah dipasang policy limit otomatis supaya tiap container hasil redeploy tetap dibatasi:

- Script: `/usr/local/sbin/apply-coolify-limits.sh`
- Service: `/etc/systemd/system/coolify-resource-limits.service`
- Timer: `/etc/systemd/system/coolify-resource-limits.timer`

Jadwal re-apply:
- `OnUnitActiveSec=10min`

Perintah cek:

```bash
systemctl status coolify-resource-limits.timer
systemctl list-timers --all | grep coolify-resource-limits
```

Jalankan manual kapan saja:

```bash
systemctl start coolify-resource-limits.service
```

## Catatan Cloudflared Systemd

Service `cloudflared.service` native systemd sudah dinonaktifkan karena crash-loop (invalid cert/token) dan membuat log spam.
Tunnel yang aktif tetap berjalan dari container Docker (`tumbas-cf-tunnel`, `warungin-tunnel`, `coolify-quicktunnel`).

Verifikasi:

```bash
systemctl is-enabled cloudflared.service
systemctl is-active cloudflared.service
docker ps --format '{{.Names}}' | grep -E 'tunnel|quicktunnel'
```

## Guard Port Docker (LAN Only)

Untuk mengurangi risiko overexposure, port direct container berikut dibatasi hanya untuk LAN `192.168.1.0/24` dan localhost:

- `3000`, `3001`, `5432`, `3307`, `8082`, `8088`

Implementasi:

- Script: `/usr/local/sbin/apply-docker-port-guard.sh`
- Service: `/etc/systemd/system/docker-port-guard.service`
- Timer: `/etc/systemd/system/docker-port-guard.timer`
- Export backup: `/usr/local/sbin/docker-port-guard-export.sh`
- Restore backup: `/usr/local/sbin/docker-port-guard-restore.sh`
- Timer export backup: `/etc/systemd/system/docker-port-guard-export.timer`

Cek status:

```bash
systemctl status docker-port-guard.timer
iptables -S DOCKER-USER
```

Cek file backup rules:

```bash
sed -n '1,80p' /etc/docker-port-guard/docker-user.rules
```

Jalankan manual:

```bash
systemctl start docker-port-guard.service
systemctl start docker-port-guard-export.service
/usr/local/sbin/docker-port-guard-restore.sh
```
