-- Customer refund requests are NOT financial refunds. Existing TblBillingRefund
-- remains admin-only and records manually processed transfers.
IF OBJECT_ID(N'dbo.TblBillingCustomerRefundRequest', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TblBillingCustomerRefundRequest (
    RequestID UNIQUEIDENTIFIER NOT NULL CONSTRAINT PK_TblBillingCustomerRefundRequest PRIMARY KEY,
    BusinessID UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.TblBusiness(BusinessID),
    PaymentRequestID UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT UQ_TblBillingCustomerRefundRequest_Payment UNIQUE
      REFERENCES dbo.TblManualPaymentRequest(PaymentRequestID),
    Status NVARCHAR(16) NOT NULL CONSTRAINT DF_TblBillingCustomerRefundRequest_Status DEFAULT N'REQUESTED',
    Reason NVARCHAR(1000) NOT NULL,
    RequestedByUserID UNIQUEIDENTIFIER NOT NULL REFERENCES dbo.TblUser(UserID),
    RequestedAtUtc DATETIME2(3) NOT NULL CONSTRAINT DF_TblBillingCustomerRefundRequest_Requested DEFAULT SYSUTCDATETIME(),
    ReviewedByUserID UNIQUEIDENTIFIER NULL REFERENCES dbo.TblUser(UserID),
    ReviewedAtUtc DATETIME2(3) NULL,
    ReviewNote NVARCHAR(1000) NULL,
    CONSTRAINT CK_TblBillingCustomerRefundRequest_Status CHECK (Status IN (N'REQUESTED', N'REJECTED')),
    CONSTRAINT CK_TblBillingCustomerRefundRequest_Reason CHECK (LEN(LTRIM(RTRIM(Reason))) >= 8),
    CONSTRAINT CK_TblBillingCustomerRefundRequest_Review CHECK (
      (Status = N'REQUESTED' AND ReviewedAtUtc IS NULL AND ReviewedByUserID IS NULL)
      OR (Status = N'REJECTED' AND ReviewedAtUtc IS NOT NULL AND ReviewedByUserID IS NOT NULL
        AND LEN(LTRIM(RTRIM(ReviewNote))) > 0))
  );
  CREATE INDEX IX_TblBillingCustomerRefundRequest_Business
    ON dbo.TblBillingCustomerRefundRequest(BusinessID, RequestedAtUtc DESC);
  CREATE INDEX IX_TblBillingCustomerRefundRequest_Status
    ON dbo.TblBillingCustomerRefundRequest(Status, RequestedAtUtc DESC);
END;
