# Host security — port audit (V1 final launch)

**Audit date (UTC):** 2026-09-22  
**Host:** `187.77.83.120` (`app.drvotech.com`)  
**Method:** local `ss -tlnH` (casher SSH) + external `Test-NetConnection` from operator workstation.

## External reachability (authoritative for launch)

| Port | Listener bind (host) | External from internet | Launch assessment |
|------|----------------------|------------------------|-------------------|
| 22 | `0.0.0.0` / `[::]` | **OPEN** | Expected ops SSH |
| 80 | `0.0.0.0` / `[::]` | **OPEN** | Expected HTTP→HTTPS |
| 443 | `0.0.0.0` / `[::]` | **OPEN** | Expected HTTPS |
| **1433** | `0.0.0.0` / `*` | **CLOSED** | **PASS** — Hostinger/provider firewall blocks public SQL |
| **3306** | `*` | **CLOSED** | **PASS** |
| **33060** | `*` | **CLOSED** | **PASS** |
| **3001** | `*` | **CLOSED** | **PASS** — WhatsApp runtime not internet-reachable |
| 21 | `0.0.0.0` | **CLOSED** | PASS (FTP not public) |
| 25 | `0.0.0.0` / `[::]` | **CLOSED** | PASS (SMTP not public; postfix may still listen locally) |
| 8080 | `0.0.0.0` / `[::]` | **CLOSED** | PASS |
| **8443** | `0.0.0.0` / `[::]` | **OPEN** | CloudPanel / management TLS — **not** SQL/customer DB; review panel auth / IP allowlist as hardening (non-blocking if panel secured) |

**Critical public exposure (1433 / 3306 / 3001):** none observed from internet.

DRVOWA app remains on **`127.0.0.1:3100`** only.

## Process owners

`casher` has **no passwordless sudo** (`sudo -n` fails). Elevated `ss -p` / reading `/home/drvowa/app` env was **not** available in this audit. Listener ownership inferred from prior audits + systemd units (`nginx`, `mssql-server`, `drvowa.service`).

## Explicit non-actions

- No firewall commands were applied.
- No `mssql.conf` bind changes.
- Do not lock out SSH.
- Do not break CloudPanel (8443), nginx, DRVOWA, WhatsApp runtime, or local SQL for apps.

## Residual hardening (optional, owner)

1. Restrict CloudPanel `8443` to operator IPs if Hostinger firewall supports it.
2. Prefer binding SQL/MySQL to localhost when maintenance window allows (defense in depth; already blocked externally).
3. Confirm FTP daemon on 21 is unused and disabled if not required.
