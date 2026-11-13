# DRVO AutoRespond — Super Admin Brand Assets (No SQL migration)

## Owner workflow

Visit `https://app.drvotech.com/admin/brand-assets` while logged in as an active `SUPER_ADMIN` account, then open **الهوية واللوجوهات** in the Admin navigation.

1. Upload one of the five slots: `primary-dark`, `primary-light`, `compact`, `stacked`, `icon`.
2. Allowed formats: PNG, JPG or WebP, maximum 2 MiB per file; SVG is disabled. Preview the uploaded image as a **draft**.
3. Choose **اعتماد ونشر** and confirm to make it public. The previous published image becomes available in history.
4. To roll back, publish a prior version. An active image cannot be deleted; inactive versions can be removed.
5. Existing bundled DRVO logo images remain the fallback when no version is published. The icon slot falls back to `/favicon.ico`. Refresh open tabs after a publish.

Only `SUPER_ADMIN` can list/upload/publish/delete or preview drafts. Other admin roles do not see the nav tab. Unauthenticated/unauthorized API requests are rejected.

## Deployment and persistence

This split version **does not write or migrate the production SQL database**. It deliberately does not include `db/migrations/104_brand_asset_gallery.sql` or the original SQL-backed Brand Asset module. It uses private, local persistent server storage:

```
/var/lib/drvowa/brand-assets/
  assets/       # private upload metadata
  images/       # private binary images
  published/    # atomic per-variant active pointers
  locks/        # short-lived cross-process publish locks
```

The production workflow provisions this directory with `0700` permissions and assigns it to the systemd `drvowa.service` identity, **outside the checked-out repo**, before starting the updated application. The application uses `DRVO_BRAND_ASSET_DIR` only if a trusted operator explicitly sets an absolute private path; default is the path above.

PNG/JPG/WebP signatures are validated, uploads are capped at 2 MiB, filenames sanitized, active pointers swapped atomically, and each variant is bounded to 40 versions. Public GET serves **only the current approved** image with `nosniff` and `Cache-Control: no-store`; staged images are viewable only by `SUPER_ADMIN`. Mutation endpoints check the same-origin request header and server-side role.

A backup of the SQL database is **not performed or claimed** by this release. Since this adds a new filesystem data store, the production operator should arrange periodic encrypted off-VPS backups of this directory. Until that is configured, a total VPS loss could require uploading the logos again. Existing records in SQL are unaffected, and fallback logos stay intact.

## Separate guarded release path

When this feature is merged, the squash commit title must start `release(brand-assets-no-db):`. The production deploy checks that the current running SHA equals GitHub's previous `main`, the release is exactly one reviewed commit, the diff contains **only** the allowlisted Brand Asset files/tests/workflow, and the storage module imports filesystem APIs instead of SQL. If any check fails, deployment stops before touching the VPS app. For this verified no-DB release only:

- SQL migration, Pricing/Campaign env mutations, AI Worker restart and billing timer rewrite are skipped.
- The updated app is built, billing and WhatsApp read-only smokes run, and the app is restarted.
- Anonymous public asset fallback and protected upload API are checked post-restart.
- On failure after checkout, the app rollback script restores the previous deployed SHA.
- The fresh SQL backup gate stays enabled for all **other** releases.

Do not merge full Brand V2 PR #121 on top of this branch: its SQL Brand Asset implementation is mutually exclusive and requires migration 104 plus proper backup and restore evidence. Reconcile or close that PR separately.

## Verification

CI runs TypeScript, production build, full unit suite, payment/financial SQL tests and WhatsApp source isolation. A temporary-directory filesystem test covers draft, publication, deletion guard and rollback; static contract tests check server admin authorization and fallback. After deploy, validate on a controlled Super Admin account by uploading a real PNG, confirming draft-only visibility, publishing it, observing the logo on public/auth/dashboard, and rolling back. No logo is automatically published by the deployment.
