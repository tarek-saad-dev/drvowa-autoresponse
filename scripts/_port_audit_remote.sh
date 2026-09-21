#!/bin/bash
set -euo pipefail
echo "=== LISTEN ==="
ss -tuln
echo "=== OWNERS ==="
ss -tlnp 2>/dev/null | head -100 || true
echo "=== UFW ==="
sudo -n ufw status verbose 2>&1 | head -60 || true
echo "=== IPTABLES INPUT ==="
sudo -n iptables -S INPUT 2>&1 | head -50 || true
echo "=== FIREWALLD ==="
sudo -n firewall-cmd --state 2>&1 || true
echo "=== MSSQL CONF ==="
ls -la /var/opt/mssql/mssql.conf 2>&1 || true
sudo -n cat /var/opt/mssql/mssql.conf 2>&1 | head -60 || true
echo "=== SYSTEMD ==="
for u in nginx.service mssql-server.service postfix.service vsftpd.service pure-ftpd.service; do
  echo -n "$u: "
  systemctl is-active "$u" 2>/dev/null || echo inactive
done
echo "=== PUBLIC IP ==="
curl -4 -sS -m 5 ifconfig.me || true
echo
