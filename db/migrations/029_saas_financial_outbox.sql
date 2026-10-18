-- Transactional capture only. Delivery remains disabled and has no worker in this phase.
IF OBJECT_ID(N'dbo.TblSaasFinancialOutbox', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TblSaasFinancialOutbox (
    EventID NVARCHAR(150) NOT NULL,
    SourcePaymentID NVARCHAR(150) NOT NULL,
    PaymentRequestID UNIQUEIDENTIFIER NOT NULL,
    BusinessID UNIQUEIDENTIFIER NOT NULL,
    SourceKey NVARCHAR(100) NOT NULL,
    EventType NVARCHAR(64) NOT NULL,
    SchemaVersion INT NOT NULL,
    AmountMinor BIGINT NOT NULL,
    CurrencyCode NVARCHAR(3) NOT NULL,
    OccurredAtUtc DATETIME2(3) NOT NULL,
    Payload NVARCHAR(2000) NOT NULL,
    DeliveryState NVARCHAR(16) NOT NULL
      CONSTRAINT DF_TblSaasFinancialOutbox_DeliveryState DEFAULT (N'PENDING'),
    AttemptCount INT NOT NULL
      CONSTRAINT DF_TblSaasFinancialOutbox_AttemptCount DEFAULT (0),
    NextAttemptAtUtc DATETIME2(3) NOT NULL,
    LeaseOwner NVARCHAR(128) NULL,
    LeaseUntilUtc DATETIME2(3) NULL,
    LastErrorCode NVARCHAR(64) NULL,
    AcceptedAtUtc DATETIME2(3) NULL,
    CreatedAtUtc DATETIME2(3) NOT NULL
      CONSTRAINT DF_TblSaasFinancialOutbox_CreatedAtUtc DEFAULT (SYSUTCDATETIME()),
    CONSTRAINT PK_TblSaasFinancialOutbox PRIMARY KEY (EventID),
    CONSTRAINT UQ_TblSaasFinancialOutbox_PaymentEvent UNIQUE (PaymentRequestID, EventType),
    CONSTRAINT UQ_TblSaasFinancialOutbox_SourcePaymentEvent UNIQUE (SourceKey, SourcePaymentID, EventType),
    CONSTRAINT FK_TblSaasFinancialOutbox_Payment FOREIGN KEY (PaymentRequestID)
      REFERENCES dbo.TblManualPaymentRequest (PaymentRequestID),
    CONSTRAINT FK_TblSaasFinancialOutbox_Business FOREIGN KEY (BusinessID)
      REFERENCES dbo.TblBusiness (BusinessID),
    CONSTRAINT CK_TblSaasFinancialOutbox_EventType CHECK (EventType = N'payment.confirmed'),
    CONSTRAINT CK_TblSaasFinancialOutbox_SchemaVersion CHECK (SchemaVersion = 1),
    CONSTRAINT CK_TblSaasFinancialOutbox_Amount CHECK (AmountMinor BETWEEN 1 AND 1000000000000000),
    CONSTRAINT CK_TblSaasFinancialOutbox_Currency CHECK (CurrencyCode IN (N'EGP', N'USD', N'SAR')),
    CONSTRAINT CK_TblSaasFinancialOutbox_Payload CHECK (ISJSON(Payload) = 1),
    CONSTRAINT CK_TblSaasFinancialOutbox_State CHECK (DeliveryState IN (N'PENDING', N'LEASED', N'ACCEPTED', N'DEAD')),
    CONSTRAINT CK_TblSaasFinancialOutbox_Attempts CHECK (AttemptCount >= 0),
    CONSTRAINT CK_TblSaasFinancialOutbox_Lease CHECK (
      (DeliveryState = N'LEASED' AND LeaseOwner IS NOT NULL AND LeaseUntilUtc IS NOT NULL)
      OR (DeliveryState <> N'LEASED' AND LeaseOwner IS NULL AND LeaseUntilUtc IS NULL)
    ),
    CONSTRAINT CK_TblSaasFinancialOutbox_Accepted CHECK (
      (DeliveryState = N'ACCEPTED' AND AcceptedAtUtc IS NOT NULL)
      OR (DeliveryState <> N'ACCEPTED' AND AcceptedAtUtc IS NULL)
    )
  );

  CREATE INDEX IX_TblSaasFinancialOutbox_Due
    ON dbo.TblSaasFinancialOutbox (DeliveryState, NextAttemptAtUtc, LeaseUntilUtc);
  CREATE INDEX IX_TblSaasFinancialOutbox_Business
    ON dbo.TblSaasFinancialOutbox (BusinessID, OccurredAtUtc);
END;
GO

-- State/lease/attempt fields may change in a later delivery phase; financial facts may not.
CREATE OR ALTER TRIGGER dbo.TR_TblSaasFinancialOutbox_ImmutableFacts
ON dbo.TblSaasFinancialOutbox AFTER UPDATE
AS
BEGIN
  SET NOCOUNT ON;
  IF UPDATE(EventID) OR UPDATE(SourcePaymentID) OR UPDATE(PaymentRequestID)
    OR UPDATE(BusinessID) OR UPDATE(SourceKey) OR UPDATE(EventType)
    OR UPDATE(SchemaVersion) OR UPDATE(AmountMinor) OR UPDATE(CurrencyCode)
    OR UPDATE(OccurredAtUtc) OR UPDATE(Payload) OR UPDATE(CreatedAtUtc)
    THROW 51029, 'SaaS financial outbox facts are immutable', 1;
END;
GO
