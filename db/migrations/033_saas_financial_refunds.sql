-- Add refund operations to the existing immutable financial outbox.
IF OBJECT_ID(N'dbo.TblSaasFinancialOutbox', N'U') IS NULL
  OR OBJECT_ID(N'dbo.TblBillingRefund', N'U') IS NULL
  THROW 51033, 'Financial outbox and billing refund migrations must precede 033', 1;

ALTER TABLE dbo.TblSaasFinancialOutbox ADD
  RefundID UNIQUEIDENTIFIER NULL,
  SourceRefundID NVARCHAR(150) COLLATE Latin1_General_100_BIN2 NULL;
GO

ALTER TABLE dbo.TblSaasFinancialOutbox ADD
  CONSTRAINT FK_SaasFinancialOutbox_Refund FOREIGN KEY (RefundID) REFERENCES dbo.TblBillingRefund(RefundID),
  CONSTRAINT CK_SaasFinancialOutbox_RefundShape CHECK (
    (EventType=N'payment.confirmed' AND RefundID IS NULL AND SourceRefundID IS NULL)
    OR (EventType=N'payment.refunded' AND RefundID IS NOT NULL AND SourceRefundID IS NOT NULL));
CREATE UNIQUE INDEX UX_SaasFinancialOutbox_Refund ON dbo.TblSaasFinancialOutbox(RefundID) WHERE RefundID IS NOT NULL;
CREATE UNIQUE INDEX UX_SaasFinancialOutbox_SourceRefund ON dbo.TblSaasFinancialOutbox(SourceKey,SourceRefundID) WHERE SourceRefundID IS NOT NULL;
ALTER TABLE dbo.TblSaasFinancialOutbox DROP CONSTRAINT CK_TblSaasFinancialOutbox_EventType;
ALTER TABLE dbo.TblSaasFinancialOutbox ADD CONSTRAINT CK_TblSaasFinancialOutbox_EventType
  CHECK (EventType IN (N'payment.confirmed',N'payment.refunded'));
GO
-- Preserve the original financial-fact immutability, including new refund identity.
CREATE OR ALTER TRIGGER dbo.TR_TblSaasFinancialOutbox_ImmutableFacts
ON dbo.TblSaasFinancialOutbox AFTER UPDATE
AS
BEGIN
  SET NOCOUNT ON;
  IF UPDATE(EventID) OR UPDATE(SourcePaymentID) OR UPDATE(PaymentRequestID)
    OR UPDATE(BusinessID) OR UPDATE(SourceKey) OR UPDATE(EventType)
    OR UPDATE(SchemaVersion) OR UPDATE(AmountMinor) OR UPDATE(CurrencyCode)
    OR UPDATE(OccurredAtUtc) OR UPDATE(Payload) OR UPDATE(CreatedAtUtc)
    OR UPDATE(RefundID) OR UPDATE(SourceRefundID)
    THROW 51029, 'SaaS financial outbox facts are immutable', 1;
END;
GO
