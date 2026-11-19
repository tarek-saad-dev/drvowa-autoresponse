-- Per-business, per-integration, one-time WhatsApp verification challenges.
-- Only a keyed hash is persisted. Raw OTPs must never enter logs/events.
IF OBJECT_ID(N'dbo.TblOtpChallenge', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TblOtpChallenge (
    ChallengeID UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_TblOtpChallenge PRIMARY KEY,
    BusinessID UNIQUEIDENTIFIER NOT NULL,
    IntegrationID UNIQUEIDENTIFIER NOT NULL,
    RequestID UNIQUEIDENTIFIER NOT NULL,
    PhoneNormalized NVARCHAR(20) NOT NULL,
    Purpose NVARCHAR(48) NOT NULL,
    CodeHash CHAR(64) NOT NULL,
    Status NVARCHAR(16) NOT NULL CONSTRAINT DF_TblOtpChallenge_Status DEFAULT N'SENDING',
    AttemptCount INT NOT NULL CONSTRAINT DF_TblOtpChallenge_Attempts DEFAULT (0),
    ExpiresAtUtc DATETIME2 NOT NULL,
    VerifiedAtUtc DATETIME2 NULL,
    ProviderMessageID NVARCHAR(128) NULL,
    CreatedAtUtc DATETIME2 NOT NULL CONSTRAINT DF_TblOtpChallenge_Created DEFAULT SYSUTCDATETIME(),
    UpdatedAtUtc DATETIME2 NOT NULL CONSTRAINT DF_TblOtpChallenge_Updated DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_TblOtpChallenge_Business FOREIGN KEY (BusinessID)
      REFERENCES dbo.TblBusiness (BusinessID),
    CONSTRAINT FK_TblOtpChallenge_Integration FOREIGN KEY (IntegrationID)
      REFERENCES dbo.TblIntegration (IntegrationID),
    CONSTRAINT UQ_TblOtpChallenge_Integration_Request UNIQUE (IntegrationID, RequestID),
    CONSTRAINT CK_TblOtpChallenge_Status CHECK (
      Status IN (N'SENDING', N'SENT', N'UNKNOWN', N'FAILED', N'VERIFIED', N'LOCKED')
    ),
    CONSTRAINT CK_TblOtpChallenge_Attempts CHECK (AttemptCount BETWEEN 0 AND 5)
  );
  CREATE INDEX IX_TblOtpChallenge_Business_Phone_Purpose_Created
    ON dbo.TblOtpChallenge (BusinessID, PhoneNormalized, Purpose, CreatedAtUtc DESC);
  CREATE INDEX IX_TblOtpChallenge_Business_Created
    ON dbo.TblOtpChallenge (BusinessID, CreatedAtUtc DESC);
END;
GO
