-- Pricing V1 wallet foundation, additive only. No existing subscription changes.
-- Wallet balances MUST be provisioned by a verified entitlement/grant service before use.
IF OBJECT_ID(N'dbo.TblPricingCreditWallet', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TblPricingCreditWallet (
    BusinessID UNIQUEIDENTIFIER NOT NULL PRIMARY KEY REFERENCES dbo.TblBusiness(BusinessID),
    AvailableReplies BIGINT NOT NULL CONSTRAINT DF_PricingWallet_Available DEFAULT 0,
    UpdatedAtUtc DATETIME2(3) NOT NULL CONSTRAINT DF_PricingWallet_Updated DEFAULT SYSUTCDATETIME(),
    CONSTRAINT CK_PricingWallet_Nonnegative CHECK (AvailableReplies >= 0)
  );
END;
GO

IF OBJECT_ID(N'dbo.TblPricingCreditEvent', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TblPricingCreditEvent (
    EventID UNIQUEIDENTIFIER NOT NULL PRIMARY KEY,
    BusinessID UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.TblBusiness(BusinessID),
    IdempotencyKey NVARCHAR(160) NOT NULL,
    EventKind NVARCHAR(16) NOT NULL,
    ReplyDelta BIGINT NOT NULL,
    Reference NVARCHAR(200) NULL,
    CreatedAtUtc DATETIME2(3) NOT NULL CONSTRAINT DF_PricingCreditEvent_Created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT UQ_PricingCreditEvent_Key UNIQUE (BusinessID, IdempotencyKey),
    CONSTRAINT CK_PricingCreditEvent_Kind CHECK (EventKind IN (N'GRANT', N'CONSUME', N'REVERSAL')),
    CONSTRAINT CK_PricingCreditEvent_Delta CHECK (
      (EventKind = N'CONSUME' AND ReplyDelta < 0)
      OR (EventKind IN (N'GRANT', N'REVERSAL') AND ReplyDelta > 0))
  );
  CREATE INDEX IX_PricingCreditEvent_Tenant ON dbo.TblPricingCreditEvent(BusinessID, CreatedAtUtc DESC);
END;
GO

-- Atomic consumption. Caller supplies a stable message/reply idempotency key.
-- Result: APPLIED / DUPLICATE / INSUFFICIENT / NO_WALLET.
CREATE OR ALTER PROCEDURE dbo.PricingV1ConsumeReply
  @BusinessID UNIQUEIDENTIFIER,
  @IdempotencyKey NVARCHAR(160),
  @EventID UNIQUEIDENTIFIER
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  IF @IdempotencyKey IS NULL OR LEN(LTRIM(RTRIM(@IdempotencyKey))) = 0
    THROW 51001, 'Idempotency key required', 1;

  BEGIN TRANSACTION;
  -- Serialize all modifications to this tenant's wallet, including duplicates.
  DECLARE @balance BIGINT;
  SELECT @balance = AvailableReplies FROM dbo.TblPricingCreditWallet WITH (UPDLOCK, HOLDLOCK)
    WHERE BusinessID = @BusinessID;

  IF @balance IS NULL
  BEGIN
    COMMIT TRANSACTION;
    SELECT N'NO_WALLET' AS Outcome;
    RETURN;
  END;

  IF EXISTS (SELECT 1 FROM dbo.TblPricingCreditEvent WHERE BusinessID = @BusinessID AND IdempotencyKey = @IdempotencyKey)
  BEGIN
    COMMIT TRANSACTION;
    SELECT N'DUPLICATE' AS Outcome;
    RETURN;
  END;

  IF @balance < 1
  BEGIN
    COMMIT TRANSACTION;
    SELECT N'INSUFFICIENT' AS Outcome;
    RETURN;
  END;

  UPDATE dbo.TblPricingCreditWallet
    SET AvailableReplies = AvailableReplies - 1, UpdatedAtUtc = SYSUTCDATETIME()
    WHERE BusinessID = @BusinessID;
  INSERT INTO dbo.TblPricingCreditEvent (EventID, BusinessID, IdempotencyKey, EventKind, ReplyDelta)
    VALUES (@EventID, @BusinessID, @IdempotencyKey, N'CONSUME', -1);

  COMMIT TRANSACTION;
  SELECT N'APPLIED' AS Outcome;
END;
GO
