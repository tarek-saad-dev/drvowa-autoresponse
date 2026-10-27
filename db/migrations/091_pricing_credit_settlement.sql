-- Draft pricing V1 grant / settlement building blocks.
-- Requires 090_pricing_credit_wallet.sql. No live caller, automatic trial grant, or payment activation.
-- Authorisation must be done by server-side verified billing / entitlement code, never exposed as a public grant endpoint.
CREATE OR ALTER PROCEDURE dbo.PricingV1GrantReplies
  @BusinessID UNIQUEIDENTIFIER,
  @IdempotencyKey NVARCHAR(160),
  @EventID UNIQUEIDENTIFIER,
  @Replies BIGINT,
  @Reference NVARCHAR(200)
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  IF @IdempotencyKey IS NULL OR LEN(LTRIM(RTRIM(@IdempotencyKey))) = 0
     OR @Replies IS NULL OR @Replies < 1 OR @Replies > 10000000
     OR @Reference IS NULL OR LEN(LTRIM(RTRIM(@Reference))) = 0
    THROW 51011, 'Invalid pricing grant input', 1;

  BEGIN TRANSACTION;
  -- Lock the parent tenant first: safe creation for a previously absent wallet.
  IF NOT EXISTS (SELECT 1 FROM dbo.TblBusiness WITH (UPDLOCK, HOLDLOCK) WHERE BusinessID=@BusinessID)
    THROW 51012, 'Business does not exist', 1;

  IF NOT EXISTS (SELECT 1 FROM dbo.TblPricingCreditWallet WHERE BusinessID=@BusinessID)
    INSERT dbo.TblPricingCreditWallet (BusinessID, AvailableReplies) VALUES (@BusinessID, 0);

  DECLARE @Balance BIGINT;
  SELECT @Balance=AvailableReplies FROM dbo.TblPricingCreditWallet WITH (UPDLOCK, HOLDLOCK)
    WHERE BusinessID=@BusinessID;

  IF EXISTS (SELECT 1 FROM dbo.TblPricingCreditEvent
      WHERE BusinessID=@BusinessID AND IdempotencyKey=@IdempotencyKey)
  BEGIN
    -- A repeated key with different grant terms is an error, not success.
    IF NOT EXISTS (SELECT 1 FROM dbo.TblPricingCreditEvent
        WHERE BusinessID=@BusinessID AND IdempotencyKey=@IdempotencyKey
          AND EventKind=N'GRANT' AND ReplyDelta=@Replies AND Reference=@Reference)
      THROW 51013, 'Conflicting pricing grant key', 1;
    COMMIT TRANSACTION;
    SELECT N'DUPLICATE' AS Outcome;
    RETURN;
  END;

  IF @Balance > 9223372036854775807 - @Replies
    THROW 51014, 'Wallet amount overflow', 1;

  UPDATE dbo.TblPricingCreditWallet SET AvailableReplies=AvailableReplies+@Replies,
    UpdatedAtUtc=SYSUTCDATETIME() WHERE BusinessID=@BusinessID;
  INSERT dbo.TblPricingCreditEvent(EventID,BusinessID,IdempotencyKey,EventKind,ReplyDelta,Reference)
    VALUES(@EventID,@BusinessID,@IdempotencyKey,N'GRANT',@Replies,@Reference);
  COMMIT TRANSACTION;
  SELECT N'APPLIED' AS Outcome;
END;
GO

-- Refund one already-debited reply if outbound delivery definitively failed.
-- Original consumption must exist; the original event id is also used as the
-- canonical reference so a different retry key cannot refund twice.
CREATE OR ALTER PROCEDURE dbo.PricingV1ReverseFailedReply
  @BusinessID UNIQUEIDENTIFIER,
  @OriginalConsumeEventID UNIQUEIDENTIFIER,
  @EventID UNIQUEIDENTIFIER
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;
  BEGIN TRANSACTION;
  DECLARE @Balance BIGINT;
  SELECT @Balance=AvailableReplies FROM dbo.TblPricingCreditWallet WITH (UPDLOCK, HOLDLOCK)
    WHERE BusinessID=@BusinessID;
  IF @Balance IS NULL
  BEGIN
    COMMIT TRANSACTION;
    SELECT N'NO_WALLET' AS Outcome;
    RETURN;
  END;
  IF NOT EXISTS (SELECT 1 FROM dbo.TblPricingCreditEvent
    WHERE BusinessID=@BusinessID AND EventID=@OriginalConsumeEventID
      AND EventKind=N'CONSUME' AND ReplyDelta=-1)
  BEGIN
    COMMIT TRANSACTION;
    SELECT N'NO_CONSUMPTION' AS Outcome;
    RETURN;
  END;
  DECLARE @RefundKey NVARCHAR(160)=CONCAT(N'reverse:',CONVERT(NVARCHAR(36),@OriginalConsumeEventID));
  IF EXISTS (SELECT 1 FROM dbo.TblPricingCreditEvent
    WHERE BusinessID=@BusinessID AND IdempotencyKey=@RefundKey)
  BEGIN
    COMMIT TRANSACTION;
    SELECT N'DUPLICATE' AS Outcome;
    RETURN;
  END;
  IF @Balance = 9223372036854775807 THROW 51015, 'Wallet amount overflow', 1;
  UPDATE dbo.TblPricingCreditWallet SET AvailableReplies=AvailableReplies+1,
    UpdatedAtUtc=SYSUTCDATETIME() WHERE BusinessID=@BusinessID;
  INSERT dbo.TblPricingCreditEvent(EventID,BusinessID,IdempotencyKey,EventKind,ReplyDelta,Reference)
    VALUES(@EventID,@BusinessID,@RefundKey,N'REVERSAL',1,
      CONVERT(NVARCHAR(36),@OriginalConsumeEventID));
  COMMIT TRANSACTION;
  SELECT N'APPLIED' AS Outcome;
END;
GO
