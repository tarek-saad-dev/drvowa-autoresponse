# Host security — port audit

**Scope:** documentation and remediation plan only.  
**Do not** apply firewall/iptables/ufw changes from an agent without explicit
sudo authorization. On the current host (`casher`), firewall management often
**lacks passwordless sudo** — treat firewall changes as a human ops task.

## Ports of interest

| Port | Typical service | Risk if public |
|------|-----------------|----------------|
| 22 | SSH | Brute force / exposure |
| 80 | HTTP | Expected for redirect → TLS |
| 443 | HTTPS | Expected for app |
| 1433 | SQL Server | **Critical** if bound on `0.0.0.0` |
| 25 | SMTP | Open relay / abuse |
| 21 | FTP | Cleartext credentials |
| 8080 | Alt HTTP | Accidental admin UIs |
| 8443 | Alt HTTPS | Accidental admin UIs |
| 3306 | MySQL/MariaDB | DB exposure |

## SQL Server (1433) public bind

If `ss`/`netstat` shows `0.0.0.0:1433` or `*:1433`, SQL is reachable from the
internet. Prefer:

1. Bind SQL to `127.0.0.1` only (or private VPC IP), **or**
2. Host firewall allowlist (office/VPN IPs only)

App and migrations should use localhost/private connectivity.

## Remediation plan (ops)

1. Run `scripts/_port_audit_remote.sh` (or equivalent) and capture listeners.
2. Confirm owners: nginx, mssql, sshd, mail, ftp.
3. For 1433: change `mssql.conf` network bind **or** firewall DROP except allowlist.
4. Disable unused 21/25/8080/8443/3306 listeners.
5. Keep 22 behind key auth + optional allowlist; keep 80/443 for the app.

## Explicit non-actions for agents

- Do **not** run `ufw` / `iptables` / `firewall-cmd` without sudo approval.
- Do **not** change DNS, nginx TLS, or production secrets from this checklist alone.
- Note: `casher` may reject `sudo -n` for firewall — escalate to a human with sudo.
