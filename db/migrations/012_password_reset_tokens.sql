-- Password reset token lifecycle (hashed tokens only).
-- Idempotent: safe if table already exists.

IF OBJECT_ID(N'dbo.TblPasswordResetToken', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TblPasswordResetToken (
    PasswordResetTokenID UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT DF_TblPasswordResetToken_ID DEFAULT NEWSEQUENTIALID(),
    UserID UNIQUEIDENTIFIER NOT NULL,
    TokenHash NVARCHAR(128) NOT NULL,
    ExpiresAtUtc DATETIME2 NOT NULL,
    CreatedAtUtc DATETIME2 NOT NULL
      CONSTRAINT DF_TblPasswordResetToken_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
    UsedAtUtc DATETIME2 NULL,
    RequestIp NVARCHAR(64) NULL,
    CONSTRAINT PK_TblPasswordResetToken PRIMARY KEY (PasswordResetTokenID),
    CONSTRAINT UQ_TblPasswordResetToken_TokenHash UNIQUE (TokenHash),
    CONSTRAINT FK_TblPasswordResetToken_User FOREIGN KEY (UserID)
      REFERENCES dbo.TblUser (UserID) ON DELETE NO ACTION
  );

  CREATE INDEX IX_TblPasswordResetToken_UserID
    ON dbo.TblPasswordResetToken (UserID);

  CREATE INDEX IX_TblPasswordResetToken_ExpiresAtUtc
    ON dbo.TblPasswordResetToken (ExpiresAtUtc);
END
GO
