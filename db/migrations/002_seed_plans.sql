-- Seed the FREE plan (idempotent-safe via unique Code if re-run accidentally).

INSERT INTO TblPlan (Code, DisplayName, Status, CreatedAtUtc, UpdatedAtUtc)
VALUES (N'FREE', N'Free', N'ACTIVE', SYSUTCDATETIME(), SYSUTCDATETIME());
