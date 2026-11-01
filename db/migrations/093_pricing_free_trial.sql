-- One-time free trial identity per business, additive and intentionally unpopulated.
-- First activation is immutable; a fresh subscription must not restart trial.
IF OBJECT_ID(N'dbo.TblPricingFreeTrial', N'U') IS NULL
BEGIN
 CREATE TABLE dbo.TblPricingFreeTrial (
   BusinessID UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_TblPricingFreeTrial PRIMARY KEY
     REFERENCES dbo.TblBusiness(BusinessID),
   FirstActivatedAtUtc DATETIME2(3) NOT NULL,
   LifetimeCommittedAiReplies BIGINT NOT NULL
     CONSTRAINT DF_TblPricingFreeTrial_Used DEFAULT (0),
   UpdatedAtUtc DATETIME2(3) NOT NULL
     CONSTRAINT DF_TblPricingFreeTrial_Updated DEFAULT SYSUTCDATETIME(),
   CONSTRAINT CK_TblPricingFreeTrial_Used CHECK
     (LifetimeCommittedAiReplies BETWEEN 0 AND 30)
 );
END;
GO
-- No automatic grant: activation must be explicitly initiated by verified new-tenant enrollment.
CREATE OR ALTER PROCEDURE dbo.PricingV1StartFreeTrial
 @BusinessID UNIQUEIDENTIFIER
AS
BEGIN
 SET NOCOUNT ON;
 SET XACT_ABORT ON;
 BEGIN TRANSACTION;
 IF NOT EXISTS (SELECT 1 FROM dbo.TblBusiness WITH (UPDLOCK,HOLDLOCK)
                WHERE BusinessID=@BusinessID)
   THROW 51020, 'Business not found', 1;
 IF NOT EXISTS (SELECT 1 FROM dbo.TblPricingFreeTrial WHERE BusinessID=@BusinessID)
   INSERT dbo.TblPricingFreeTrial(BusinessID, FirstActivatedAtUtc)
     VALUES (@BusinessID,SYSUTCDATETIME());
 SELECT FirstActivatedAtUtc,LifetimeCommittedAiReplies
 FROM dbo.TblPricingFreeTrial WHERE BusinessID=@BusinessID;
 COMMIT TRANSACTION;
END;
GO
-- Atomic one-time usage on successfully produced reply identifiers.
-- IMPORTANT: enable only after the existing AI worker path has been reconciled.
CREATE OR ALTER PROCEDURE dbo.PricingV1ConsumeFreeReply
 @BusinessID UNIQUEIDENTIFIER,
 @ReplyKey NVARCHAR(160),
 @EventID UNIQUEIDENTIFIER
AS
BEGIN
 SET NOCOUNT ON;
 SET XACT_ABORT ON;
 IF @ReplyKey IS NULL OR LEN(LTRIM(RTRIM(@ReplyKey)))=0
   THROW 51021,'Reply key required',1;
 BEGIN TRANSACTION;
 DECLARE @Started DATETIME2(3), @Used BIGINT;
 SELECT @Started=FirstActivatedAtUtc,@Used=LifetimeCommittedAiReplies
 FROM dbo.TblPricingFreeTrial WITH (UPDLOCK,HOLDLOCK)
 WHERE BusinessID=@BusinessID;
 IF @Started IS NULL
 BEGIN
   COMMIT TRANSACTION; SELECT N'NOT_ENROLLED' AS Outcome; RETURN;
 END;
 IF EXISTS(SELECT 1 FROM dbo.TblPricingCreditEvent
     WHERE BusinessID=@BusinessID AND IdempotencyKey=@ReplyKey)
 BEGIN
   COMMIT TRANSACTION; SELECT N'DUPLICATE' AS Outcome; RETURN;
 END;
 IF @Used >= 30 OR SYSUTCDATETIME() >= DATEADD(DAY,7,@Started)
 BEGIN
   COMMIT TRANSACTION; SELECT N'EXHAUSTED' AS Outcome; RETURN;
 END;
 UPDATE dbo.TblPricingFreeTrial
 SET LifetimeCommittedAiReplies=LifetimeCommittedAiReplies+1,
     UpdatedAtUtc=SYSUTCDATETIME() WHERE BusinessID=@BusinessID;
 INSERT dbo.TblPricingCreditEvent
 (EventID,BusinessID,IdempotencyKey,EventKind,ReplyDelta,Reference)
 VALUES(@EventID,@BusinessID,@ReplyKey,N'CONSUME',-1,N'FREE_TRIAL');
 COMMIT TRANSACTION; SELECT N'APPLIED' AS Outcome;
END;
GO
