# Host security — port audit

**Audit date (UTC):** 2026-09-21 (operator `casher` on `srv1921542` / `187.77.83.120`)  
**Scope:** documentation and remediation plan only.  
Firewall / `mssql.conf` changes were **not** applied (no passwordless sudo for
`ufw` / `iptables` / `firewall-cmd` / reading `/var/opt/mssql/mssql.conf`).

## Observed listeners (selected)

| Port | Bind | Active unit (where known) | Notes |
|------|------|---------------------------|--------|
| 22 | `0.0.0.0` + `[::]` | SSH | Expected for ops |
| 80 | `0.0.0.0` + `[::]` | `nginx.service` active | Expected |
| 443 | `0.0.0.0` + `[::]` | `nginx.service` active | Expected |
| **1433** | **`0.0.0.0` + `*`** | `mssql-server.service` active | **Public SQL — critical** |
| 25 | `0.0.0.0` + `[::]` | `postfix.service` active | Mail MTA |
| 21 | `0.0.0.0` | FTP daemon listening; vsftpd/pure-ftpd inactive | Investigate owner |
| 8080 | `0.0.0.0` + `[::]` | Likely panel/proxy | Confirm CloudPanel / apps |
| 8443 | `0.0.0.0` + `[::]` | Likely panel TLS | Confirm |
| 3306 / 33060 | `*` | MySQL/Percona present on host | Also public-facing bind |
| 3001 | `*` | Separate runtime (not DRVOWA `:3100`) | Confirm whatsapp/other |

DRVOWA app binds **`127.0.0.1:3100` only** (good). AI worker has no public port.

Process owners for most sockets were not visible without elevated `ss -p` / root.

## SQL Server (1433) — finding

SQL Server is listening on all interfaces. Unless an upstream firewall/security
group already drops 1433, the database is internet-reachable. There is **no**
documented operational requirement for public SQL in DRVOWA docs.

**Goal:** SQL Server must not be publicly reachable.

## Remediation plan (owner / ops — do not lock out SSH)

Preserve: SSH (`22`), existing nginx sites (`80`/`443`), localhost app/runtime
(`127.0.0.1:3100`, WhatsApp runtime on loopback where applicable).

Preferred order:

1. **Confirm cloud security group / Hostinger firewall** already blocks 1433
   from the internet. If yes, document that as the control.
2. Else **bind SQL to `127.0.0.1` only** via `mssql.conf` (`network` /
   `ipaddress` / `tcpport` per Microsoft docs) and restart `mssql-server`
   in a maintenance window after verifying app `DB_SERVER=127.0.0.1`.
3. Else **host firewall allowlist**: DROP/REJECT `1433/tcp` from WAN; allow
   only localhost (and VPN jump hosts if any).
4. Review **3306**, **21**, **25**, **8080**, **8443** for the same pattern —
   disable unused services or restrict to localhost/VPN.
5. Keep **22** key-only; optional source allowlist after confirming operator IPs.

## Explicit non-actions for agents

- Do **not** run `ufw` / `iptables` / `firewall-cmd` without sudo approval.
- Do **not** change DNS, nginx TLS, or production secrets from this checklist alone.
- `casher` currently rejects `sudo -n` for firewall and `mssql.conf` reads —
  escalate to a human with sudo.
