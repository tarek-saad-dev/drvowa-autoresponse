# Brand V2 — SQL production backup operator checklist

**Scope:** `drvowa-autoresponse` production SQL Server. This checklist is for an authorized SQL Server/VPS operator. **Do not run it using the application database login.** A new full backup plus proof of restore usability is required **before** merging Brand V2 release PR #121.

## Mandatory environment checks

1. Identify the **production SQL Server host and database** from the authorized operator's private configuration (not from GitHub issue comments).
2. Inspect available backup storage **on the SQL Server host**. The app VPS may be a different machine; do not assume its filesystem is the SQL host's filesystem.
3. Use a **dedicated privileged operator account** with SQL backup/restore permissions. Do not elevate `DB_USER` from the app's `.env.production.local`.
4. Confirm the target storage is restricted, excluded from web-serving directories, and the proposed filename does **not** already exist. Confirm adequate headroom, retention and off-host encrypted copy destination.
5. Preserve existing DB recovery strategy; use `COPY_ONLY` to avoid disturbing a differential backup chain.

## One-time full backup + proof

Run in SSMS / sqlcmd connected **as the authorized operator** to the production SQL instance. Substitute the two placeholders with the exact database name and a **unique, fully qualified backup filename on the SQL Server host**, never a public/web directory. Do not paste the substituted script or output containing paths or credentials in GitHub.

```sql
SET NOCOUNT ON;
DECLARE @DatabaseName sysname = N'<PRODUCTION_DATABASE_NAME>';
DECLARE @BackupFile nvarchar(4000) = N'<PRIVATE_SQL_HOST_BACKUP_DIRECTORY>\drvo-full-YYYYMMDD-HHMMSS.bak';

IF @DatabaseName LIKE N'%<%' OR @BackupFile LIKE N'%<%'
  THROW 51000, 'Operator must replace all placeholders before execution.', 1;
IF DB_ID(@DatabaseName) IS NULL
  THROW 51001, 'Specified database does not exist on this SQL instance.', 1;

DECLARE @BackupCommand nvarchar(max) =
  N'BACKUP DATABASE ' + QUOTENAME(@DatabaseName) +
  N' TO DISK = @file WITH COPY_ONLY, CHECKSUM, COMPRESSION, NOINIT, STATS = 10;';
EXEC sys.sp_executesql
  @BackupCommand,
  N'@file nvarchar(4000)',
  @file = @BackupFile;

RESTORE VERIFYONLY FROM DISK = @BackupFile WITH CHECKSUM;
```

**Important:** `VERIFYONLY` checks backup readability/structure, but is **not** a substitute for an isolated **full restore drill**. Perform a test restore under a separate temporary database name when authorized and validate that the restored database can be opened. Do not restore over production. A standalone `.bak` file must also be copied to an approved **encrypted off-server** location, with its retention and accessibility verified. The actual SQL recovery strategy (including transaction log backups if applicable) should be chosen by the DBA.

## Make backups recurring

On the **SQL Server host** (not automatically the app VPS), configure a daily full backup with the operator-approved scheduler (SQL Server Agent when available, otherwise an OS task with a dedicated least-privilege service identity). Use unique filenames, `CHECKSUM`, retention, error alerts, offsite encrypted replication, and periodic restore drills. Choose the cadence/retention with the data recovery objective owner; the release preflight requires the latest full backup age to be **24 hours or less**.

Never commit `.bak` files, SQL credentials, session keys or recovery locations to the repository. Preserve a safe recovery procedure for the WhatsApp runtime session and application secrets separately.

## Evidence and release sequence

An operator should mark these facts on Issue #146 **without** sensitive values:

- [ ] Full backup completed, with UTC timestamp and target database confirmed privately
- [ ] `RESTORE VERIFYONLY ... WITH CHECKSUM` succeeded; isolated restore drill completed or specifically documented as a remaining blocker
- [ ] Encrypted offsite copy and retention confirmed
- [ ] Daily schedule, alerting and periodic restore owner confirmed
- [ ] Preflight run [Brand V2 production preflight](https://github.com/tarek-saad-dev/drvowa-autoresponse/actions/workflows/brand-v2-production-preflight.yml) passes at final release SHA
- [ ] Current known-good app SHA, rollback procedure and WhatsApp session recovery plan recorded privately
- [ ] Live WhatsApp re-pair, inbox handover, payment/receipt/refund and admin logo upload checks completed on a controlled account

When a new backup has been taken, **re-run the previously failed preflight job** from PR #121's latest release SHA. This read-only check inspects `msdb.dbo.backupset` and services; it does not perform restore verification. Confirm the release's pricing/campaign deployment environment toggles before a merge to `main`.

## Added defense-in-depth

The production deployment workflow also checks that a recent full backup record is visible **before** checkout, environment flag writes, any database migrations or service restarts. This is a fail-closed metadata gate only. It must never be represented as proof of an actual restore, or a substitute for the operator checklist above.

**NO GO until all release gates are satisfied.**
