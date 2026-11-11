-- CRM Phase 1 foundation: unified customers, notes, follow-ups, segments,
-- ERP mirror read-models, and audience query audit. Idempotent / additive.

IF OBJECT_ID(N'dbo.TblCrmCustomer', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TblCrmCustomer (
    CustomerID UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT DF_TblCrmCustomer_CustomerID DEFAULT NEWSEQUENTIALID(),
    BusinessID UNIQUEIDENTIFIER NOT NULL,
    FullName NVARCHAR(200) NOT NULL,
    PrimaryPhoneNormalized NVARCHAR(32) NULL,
    Email NVARCHAR(320) NULL,
    Source NVARCHAR(64) NOT NULL
      CONSTRAINT DF_TblCrmCustomer_Source DEFAULT (N'MANUAL'),
    Status NVARCHAR(32) NOT NULL
      CONSTRAINT DF_TblCrmCustomer_Status DEFAULT (N'ACTIVE'),
    AssignedUserID UNIQUEIDENTIFIER NULL,
    LastInteractionAtUtc DATETIME2 NULL,
    ExternalErpClientId NVARCHAR(64) NULL,
    MergedIntoCustomerID UNIQUEIDENTIFIER NULL,
    CreatedAtUtc DATETIME2 NOT NULL
      CONSTRAINT DF_TblCrmCustomer_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
    UpdatedAtUtc DATETIME2 NOT NULL
      CONSTRAINT DF_TblCrmCustomer_UpdatedAtUtc DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_TblCrmCustomer PRIMARY KEY (CustomerID),
    CONSTRAINT CK_TblCrmCustomer_Source CHECK (
      Source IN (N'MANUAL', N'WHATSAPP', N'ERP', N'IMPORT', N'MERGE')
    ),
    CONSTRAINT CK_TblCrmCustomer_Status CHECK (
      Status IN (N'ACTIVE', N'INACTIVE', N'LEAD', N'BLOCKED', N'MERGED')
    ),
    CONSTRAINT FK_TblCrmCustomer_Business FOREIGN KEY (BusinessID)
      REFERENCES dbo.TblBusiness (BusinessID) ON DELETE NO ACTION,
    CONSTRAINT FK_TblCrmCustomer_AssignedUser FOREIGN KEY (AssignedUserID)
      REFERENCES dbo.TblUser (UserID) ON DELETE NO ACTION,
    CONSTRAINT FK_TblCrmCustomer_MergedInto FOREIGN KEY (MergedIntoCustomerID)
      REFERENCES dbo.TblCrmCustomer (CustomerID) ON DELETE NO ACTION
  );

  CREATE INDEX IX_TblCrmCustomer_Business_Name
    ON dbo.TblCrmCustomer (BusinessID, FullName);
  CREATE INDEX IX_TblCrmCustomer_Business_LastInteraction
    ON dbo.TblCrmCustomer (BusinessID, LastInteractionAtUtc DESC);
  CREATE INDEX IX_TblCrmCustomer_Business_Status
    ON dbo.TblCrmCustomer (BusinessID, Status);
  CREATE INDEX IX_TblCrmCustomer_Business_Assigned
    ON dbo.TblCrmCustomer (BusinessID, AssignedUserID)
    WHERE AssignedUserID IS NOT NULL;
  CREATE UNIQUE INDEX UQ_TblCrmCustomer_Business_PrimaryPhone
    ON dbo.TblCrmCustomer (BusinessID, PrimaryPhoneNormalized)
    WHERE PrimaryPhoneNormalized IS NOT NULL AND Status <> N'MERGED';
  CREATE UNIQUE INDEX UQ_TblCrmCustomer_Business_ErpClient
    ON dbo.TblCrmCustomer (BusinessID, ExternalErpClientId)
    WHERE ExternalErpClientId IS NOT NULL AND Status <> N'MERGED';
END;
GO

IF OBJECT_ID(N'dbo.TblCrmCustomerPhone', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TblCrmCustomerPhone (
    CustomerPhoneID UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT DF_TblCrmCustomerPhone_ID DEFAULT NEWSEQUENTIALID(),
    BusinessID UNIQUEIDENTIFIER NOT NULL,
    CustomerID UNIQUEIDENTIFIER NOT NULL,
    PhoneNormalized NVARCHAR(32) NOT NULL,
    Label NVARCHAR(64) NULL,
    IsPrimary BIT NOT NULL
      CONSTRAINT DF_TblCrmCustomerPhone_IsPrimary DEFAULT (0),
    CreatedAtUtc DATETIME2 NOT NULL
      CONSTRAINT DF_TblCrmCustomerPhone_Created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_TblCrmCustomerPhone PRIMARY KEY (CustomerPhoneID),
    CONSTRAINT UQ_TblCrmCustomerPhone_Business_Phone
      UNIQUE (BusinessID, PhoneNormalized),
    CONSTRAINT FK_TblCrmCustomerPhone_Business FOREIGN KEY (BusinessID)
      REFERENCES dbo.TblBusiness (BusinessID) ON DELETE NO ACTION,
    CONSTRAINT FK_TblCrmCustomerPhone_Customer FOREIGN KEY (CustomerID)
      REFERENCES dbo.TblCrmCustomer (CustomerID) ON DELETE NO ACTION
  );
  CREATE INDEX IX_TblCrmCustomerPhone_Customer
    ON dbo.TblCrmCustomerPhone (BusinessID, CustomerID);
END;
GO

IF OBJECT_ID(N'dbo.TblCrmTag', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TblCrmTag (
    TagID UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT DF_TblCrmTag_TagID DEFAULT NEWSEQUENTIALID(),
    BusinessID UNIQUEIDENTIFIER NOT NULL,
    Name NVARCHAR(80) NOT NULL,
    Color NVARCHAR(32) NULL,
    CreatedAtUtc DATETIME2 NOT NULL
      CONSTRAINT DF_TblCrmTag_Created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_TblCrmTag PRIMARY KEY (TagID),
    CONSTRAINT UQ_TblCrmTag_Business_Name UNIQUE (BusinessID, Name),
    CONSTRAINT FK_TblCrmTag_Business FOREIGN KEY (BusinessID)
      REFERENCES dbo.TblBusiness (BusinessID) ON DELETE NO ACTION
  );
END;
GO

IF OBJECT_ID(N'dbo.TblCrmCustomerTag', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TblCrmCustomerTag (
    CustomerID UNIQUEIDENTIFIER NOT NULL,
    TagID UNIQUEIDENTIFIER NOT NULL,
    BusinessID UNIQUEIDENTIFIER NOT NULL,
    CreatedAtUtc DATETIME2 NOT NULL
      CONSTRAINT DF_TblCrmCustomerTag_Created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_TblCrmCustomerTag PRIMARY KEY (CustomerID, TagID),
    CONSTRAINT FK_TblCrmCustomerTag_Customer FOREIGN KEY (CustomerID)
      REFERENCES dbo.TblCrmCustomer (CustomerID) ON DELETE NO ACTION,
    CONSTRAINT FK_TblCrmCustomerTag_Tag FOREIGN KEY (TagID)
      REFERENCES dbo.TblCrmTag (TagID) ON DELETE NO ACTION,
    CONSTRAINT FK_TblCrmCustomerTag_Business FOREIGN KEY (BusinessID)
      REFERENCES dbo.TblBusiness (BusinessID) ON DELETE NO ACTION
  );
  CREATE INDEX IX_TblCrmCustomerTag_Business_Tag
    ON dbo.TblCrmCustomerTag (BusinessID, TagID);
END;
GO

IF OBJECT_ID(N'dbo.TblCrmContactLink', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TblCrmContactLink (
    ContactLinkID UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT DF_TblCrmContactLink_ID DEFAULT NEWSEQUENTIALID(),
    BusinessID UNIQUEIDENTIFIER NOT NULL,
    CustomerID UNIQUEIDENTIFIER NOT NULL,
    ContactID UNIQUEIDENTIFIER NOT NULL,
    LinkSource NVARCHAR(32) NOT NULL
      CONSTRAINT DF_TblCrmContactLink_Source DEFAULT (N'PHONE_MATCH'),
    CreatedAtUtc DATETIME2 NOT NULL
      CONSTRAINT DF_TblCrmContactLink_Created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_TblCrmContactLink PRIMARY KEY (ContactLinkID),
    CONSTRAINT UQ_TblCrmContactLink_Contact UNIQUE (BusinessID, ContactID),
    CONSTRAINT CK_TblCrmContactLink_Source CHECK (
      LinkSource IN (N'PHONE_MATCH', N'MANUAL', N'IMPORT', N'MERGE')
    ),
    CONSTRAINT FK_TblCrmContactLink_Business FOREIGN KEY (BusinessID)
      REFERENCES dbo.TblBusiness (BusinessID) ON DELETE NO ACTION,
    CONSTRAINT FK_TblCrmContactLink_Customer FOREIGN KEY (CustomerID)
      REFERENCES dbo.TblCrmCustomer (CustomerID) ON DELETE NO ACTION,
    CONSTRAINT FK_TblCrmContactLink_Contact FOREIGN KEY (ContactID)
      REFERENCES dbo.TblContact (ContactID) ON DELETE NO ACTION
  );
  CREATE INDEX IX_TblCrmContactLink_Customer
    ON dbo.TblCrmContactLink (BusinessID, CustomerID);
END;
GO

IF OBJECT_ID(N'dbo.TblCrmNote', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TblCrmNote (
    NoteID UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT DF_TblCrmNote_NoteID DEFAULT NEWSEQUENTIALID(),
    BusinessID UNIQUEIDENTIFIER NOT NULL,
    CustomerID UNIQUEIDENTIFIER NOT NULL,
    Body NVARCHAR(4000) NOT NULL,
    CreatedByUserID UNIQUEIDENTIFIER NOT NULL,
    UpdatedByUserID UNIQUEIDENTIFIER NULL,
    CreatedAtUtc DATETIME2 NOT NULL
      CONSTRAINT DF_TblCrmNote_Created DEFAULT SYSUTCDATETIME(),
    UpdatedAtUtc DATETIME2 NOT NULL
      CONSTRAINT DF_TblCrmNote_Updated DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_TblCrmNote PRIMARY KEY (NoteID),
    CONSTRAINT FK_TblCrmNote_Business FOREIGN KEY (BusinessID)
      REFERENCES dbo.TblBusiness (BusinessID) ON DELETE NO ACTION,
    CONSTRAINT FK_TblCrmNote_Customer FOREIGN KEY (CustomerID)
      REFERENCES dbo.TblCrmCustomer (CustomerID) ON DELETE NO ACTION,
    CONSTRAINT FK_TblCrmNote_CreatedBy FOREIGN KEY (CreatedByUserID)
      REFERENCES dbo.TblUser (UserID) ON DELETE NO ACTION,
    CONSTRAINT FK_TblCrmNote_UpdatedBy FOREIGN KEY (UpdatedByUserID)
      REFERENCES dbo.TblUser (UserID) ON DELETE NO ACTION
  );
  CREATE INDEX IX_TblCrmNote_Customer
    ON dbo.TblCrmNote (BusinessID, CustomerID, CreatedAtUtc DESC);
END;
GO

IF OBJECT_ID(N'dbo.TblCrmActivity', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TblCrmActivity (
    ActivityID UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT DF_TblCrmActivity_ActivityID DEFAULT NEWSEQUENTIALID(),
    BusinessID UNIQUEIDENTIFIER NOT NULL,
    CustomerID UNIQUEIDENTIFIER NOT NULL,
    ActivityType NVARCHAR(64) NOT NULL,
    Title NVARCHAR(300) NOT NULL,
    Body NVARCHAR(2000) NULL,
    ActorUserID UNIQUEIDENTIFIER NULL,
    RelatedEntityType NVARCHAR(64) NULL,
    RelatedEntityID NVARCHAR(128) NULL,
    OccurredAtUtc DATETIME2 NOT NULL
      CONSTRAINT DF_TblCrmActivity_Occurred DEFAULT SYSUTCDATETIME(),
    CreatedAtUtc DATETIME2 NOT NULL
      CONSTRAINT DF_TblCrmActivity_Created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_TblCrmActivity PRIMARY KEY (ActivityID),
    CONSTRAINT CK_TblCrmActivity_Type CHECK (
      ActivityType IN (
        N'CUSTOMER_CREATED', N'CUSTOMER_UPDATED', N'STATUS_CHANGED',
        N'NOTE_ADDED', N'NOTE_UPDATED', N'TAG_ADDED', N'TAG_REMOVED',
        N'FOLLOWUP_CREATED', N'FOLLOWUP_COMPLETED', N'MESSAGE_INBOUND',
        N'MESSAGE_OUTBOUND', N'ERP_SYNCED', N'ERP_INVOICE', N'ERP_BOOKING',
        N'ASSIGNED', N'MERGED', N'SEGMENT_INCLUDED', N'CAMPAIGN_INCLUDED'
      )
    ),
    CONSTRAINT FK_TblCrmActivity_Business FOREIGN KEY (BusinessID)
      REFERENCES dbo.TblBusiness (BusinessID) ON DELETE NO ACTION,
    CONSTRAINT FK_TblCrmActivity_Customer FOREIGN KEY (CustomerID)
      REFERENCES dbo.TblCrmCustomer (CustomerID) ON DELETE NO ACTION,
    CONSTRAINT FK_TblCrmActivity_Actor FOREIGN KEY (ActorUserID)
      REFERENCES dbo.TblUser (UserID) ON DELETE NO ACTION
  );
  CREATE INDEX IX_TblCrmActivity_Customer_Occurred
    ON dbo.TblCrmActivity (BusinessID, CustomerID, OccurredAtUtc DESC);
END;
GO

IF OBJECT_ID(N'dbo.TblCrmFollowUp', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TblCrmFollowUp (
    FollowUpID UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT DF_TblCrmFollowUp_FollowUpID DEFAULT NEWSEQUENTIALID(),
    BusinessID UNIQUEIDENTIFIER NOT NULL,
    CustomerID UNIQUEIDENTIFIER NOT NULL,
    AssignedUserID UNIQUEIDENTIFIER NULL,
    ConversationID UNIQUEIDENTIFIER NULL,
    Title NVARCHAR(200) NOT NULL,
    Description NVARCHAR(2000) NULL,
    DueAtUtc DATETIME2 NULL,
    Priority NVARCHAR(16) NOT NULL
      CONSTRAINT DF_TblCrmFollowUp_Priority DEFAULT (N'MEDIUM'),
    Status NVARCHAR(32) NOT NULL
      CONSTRAINT DF_TblCrmFollowUp_Status DEFAULT (N'OPEN'),
    CompletedAtUtc DATETIME2 NULL,
    CreatedByUserID UNIQUEIDENTIFIER NOT NULL,
    CreatedAtUtc DATETIME2 NOT NULL
      CONSTRAINT DF_TblCrmFollowUp_Created DEFAULT SYSUTCDATETIME(),
    UpdatedAtUtc DATETIME2 NOT NULL
      CONSTRAINT DF_TblCrmFollowUp_Updated DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_TblCrmFollowUp PRIMARY KEY (FollowUpID),
    CONSTRAINT CK_TblCrmFollowUp_Priority CHECK (
      Priority IN (N'LOW', N'MEDIUM', N'HIGH', N'URGENT')
    ),
    CONSTRAINT CK_TblCrmFollowUp_Status CHECK (
      Status IN (N'OPEN', N'IN_PROGRESS', N'COMPLETED', N'CANCELLED')
    ),
    CONSTRAINT FK_TblCrmFollowUp_Business FOREIGN KEY (BusinessID)
      REFERENCES dbo.TblBusiness (BusinessID) ON DELETE NO ACTION,
    CONSTRAINT FK_TblCrmFollowUp_Customer FOREIGN KEY (CustomerID)
      REFERENCES dbo.TblCrmCustomer (CustomerID) ON DELETE NO ACTION,
    CONSTRAINT FK_TblCrmFollowUp_Assigned FOREIGN KEY (AssignedUserID)
      REFERENCES dbo.TblUser (UserID) ON DELETE NO ACTION,
    CONSTRAINT FK_TblCrmFollowUp_CreatedBy FOREIGN KEY (CreatedByUserID)
      REFERENCES dbo.TblUser (UserID) ON DELETE NO ACTION,
    CONSTRAINT FK_TblCrmFollowUp_Conversation FOREIGN KEY (ConversationID)
      REFERENCES dbo.TblConversation (ConversationID) ON DELETE NO ACTION
  );
  CREATE INDEX IX_TblCrmFollowUp_Business_Status_Due
    ON dbo.TblCrmFollowUp (BusinessID, Status, DueAtUtc);
  CREATE INDEX IX_TblCrmFollowUp_Customer
    ON dbo.TblCrmFollowUp (BusinessID, CustomerID, Status);
END;
GO

IF OBJECT_ID(N'dbo.TblCrmSegment', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TblCrmSegment (
    SegmentID UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT DF_TblCrmSegment_SegmentID DEFAULT NEWSEQUENTIALID(),
    BusinessID UNIQUEIDENTIFIER NOT NULL,
    Name NVARCHAR(160) NOT NULL,
    Description NVARCHAR(1000) NULL,
    FilterJson NVARCHAR(MAX) NOT NULL,
    ExplanationAr NVARCHAR(2000) NULL,
    CreatedByUserID UNIQUEIDENTIFIER NOT NULL,
    CreatedAtUtc DATETIME2 NOT NULL
      CONSTRAINT DF_TblCrmSegment_Created DEFAULT SYSUTCDATETIME(),
    UpdatedAtUtc DATETIME2 NOT NULL
      CONSTRAINT DF_TblCrmSegment_Updated DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_TblCrmSegment PRIMARY KEY (SegmentID),
    CONSTRAINT UQ_TblCrmSegment_Business_Name UNIQUE (BusinessID, Name),
    CONSTRAINT FK_TblCrmSegment_Business FOREIGN KEY (BusinessID)
      REFERENCES dbo.TblBusiness (BusinessID) ON DELETE NO ACTION,
    CONSTRAINT FK_TblCrmSegment_CreatedBy FOREIGN KEY (CreatedByUserID)
      REFERENCES dbo.TblUser (UserID) ON DELETE NO ACTION
  );
END;
GO

IF OBJECT_ID(N'dbo.TblCrmAudienceSnapshot', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TblCrmAudienceSnapshot (
    SnapshotID UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT DF_TblCrmAudienceSnapshot_ID DEFAULT NEWSEQUENTIALID(),
    BusinessID UNIQUEIDENTIFIER NOT NULL,
    SegmentID UNIQUEIDENTIFIER NULL,
    Name NVARCHAR(160) NOT NULL,
    FilterJson NVARCHAR(MAX) NOT NULL,
    TotalMatched INT NOT NULL
      CONSTRAINT DF_TblCrmAudienceSnapshot_Total DEFAULT (0),
    WithPhone INT NOT NULL
      CONSTRAINT DF_TblCrmAudienceSnapshot_WithPhone DEFAULT (0),
    EligibleMarketing INT NOT NULL
      CONSTRAINT DF_TblCrmAudienceSnapshot_Eligible DEFAULT (0),
    WithoutPermission INT NOT NULL
      CONSTRAINT DF_TblCrmAudienceSnapshot_WithoutPerm DEFAULT (0),
    CreatedByUserID UNIQUEIDENTIFIER NOT NULL,
    FrozenAtUtc DATETIME2 NOT NULL
      CONSTRAINT DF_TblCrmAudienceSnapshot_Frozen DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_TblCrmAudienceSnapshot PRIMARY KEY (SnapshotID),
    CONSTRAINT FK_TblCrmAudienceSnapshot_Business FOREIGN KEY (BusinessID)
      REFERENCES dbo.TblBusiness (BusinessID) ON DELETE NO ACTION,
    CONSTRAINT FK_TblCrmAudienceSnapshot_Segment FOREIGN KEY (SegmentID)
      REFERENCES dbo.TblCrmSegment (SegmentID) ON DELETE NO ACTION,
    CONSTRAINT FK_TblCrmAudienceSnapshot_CreatedBy FOREIGN KEY (CreatedByUserID)
      REFERENCES dbo.TblUser (UserID) ON DELETE NO ACTION
  );
  CREATE INDEX IX_TblCrmAudienceSnapshot_Business
    ON dbo.TblCrmAudienceSnapshot (BusinessID, FrozenAtUtc DESC);
END;
GO

IF OBJECT_ID(N'dbo.TblCrmAudienceSnapshotMember', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TblCrmAudienceSnapshotMember (
    SnapshotID UNIQUEIDENTIFIER NOT NULL,
    CustomerID UNIQUEIDENTIFIER NOT NULL,
    BusinessID UNIQUEIDENTIFIER NOT NULL,
    PhoneNormalized NVARCHAR(32) NULL,
    MarketingEligible BIT NOT NULL
      CONSTRAINT DF_TblCrmAudienceSnapshotMember_Eligible DEFAULT (0),
    ExclusionReason NVARCHAR(64) NULL,
    CONSTRAINT PK_TblCrmAudienceSnapshotMember PRIMARY KEY (SnapshotID, CustomerID),
    CONSTRAINT FK_TblCrmAudienceSnapshotMember_Snapshot FOREIGN KEY (SnapshotID)
      REFERENCES dbo.TblCrmAudienceSnapshot (SnapshotID) ON DELETE NO ACTION,
    CONSTRAINT FK_TblCrmAudienceSnapshotMember_Customer FOREIGN KEY (CustomerID)
      REFERENCES dbo.TblCrmCustomer (CustomerID) ON DELETE NO ACTION,
    CONSTRAINT FK_TblCrmAudienceSnapshotMember_Business FOREIGN KEY (BusinessID)
      REFERENCES dbo.TblBusiness (BusinessID) ON DELETE NO ACTION
  );
  CREATE INDEX IX_TblCrmAudienceSnapshotMember_Business
    ON dbo.TblCrmAudienceSnapshotMember (BusinessID, SnapshotID);
END;
GO

IF OBJECT_ID(N'dbo.TblErpSyncState', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TblErpSyncState (
    SyncStateID UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT DF_TblErpSyncState_ID DEFAULT NEWSEQUENTIALID(),
    BusinessID UNIQUEIDENTIFIER NOT NULL,
    IntegrationID UNIQUEIDENTIFIER NOT NULL,
    Resource NVARCHAR(64) NOT NULL,
    CursorJson NVARCHAR(MAX) NULL,
    Status NVARCHAR(32) NOT NULL
      CONSTRAINT DF_TblErpSyncState_Status DEFAULT (N'IDLE'),
    LastSuccessAtUtc DATETIME2 NULL,
    LastAttemptAtUtc DATETIME2 NULL,
    LastErrorCode NVARCHAR(128) NULL,
    LastErrorMessage NVARCHAR(1000) NULL,
    RetryCount INT NOT NULL
      CONSTRAINT DF_TblErpSyncState_Retry DEFAULT (0),
    UpdatedAtUtc DATETIME2 NOT NULL
      CONSTRAINT DF_TblErpSyncState_Updated DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_TblErpSyncState PRIMARY KEY (SyncStateID),
    CONSTRAINT UQ_TblErpSyncState_Business_Resource UNIQUE (BusinessID, Resource),
    CONSTRAINT CK_TblErpSyncState_Status CHECK (
      Status IN (N'IDLE', N'RUNNING', N'SUCCESS', N'ERROR')
    ),
    CONSTRAINT FK_TblErpSyncState_Business FOREIGN KEY (BusinessID)
      REFERENCES dbo.TblBusiness (BusinessID) ON DELETE NO ACTION,
    CONSTRAINT FK_TblErpSyncState_Integration FOREIGN KEY (IntegrationID)
      REFERENCES dbo.TblIntegration (IntegrationID) ON DELETE NO ACTION
  );
END;
GO

IF OBJECT_ID(N'dbo.TblErpInvoiceMirror', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TblErpInvoiceMirror (
    InvoiceMirrorID UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT DF_TblErpInvoiceMirror_ID DEFAULT NEWSEQUENTIALID(),
    BusinessID UNIQUEIDENTIFIER NOT NULL,
    ExternalInvId NVARCHAR(64) NOT NULL,
    ExternalClientId NVARCHAR(64) NULL,
    CustomerID UNIQUEIDENTIFIER NULL,
    InvType NVARCHAR(64) NULL,
    InvDate DATE NULL,
    InvTime NVARCHAR(32) NULL,
    BranchId INT NULL,
    BranchName NVARCHAR(200) NULL,
    GrandTotal DECIMAL(18, 2) NOT NULL
      CONSTRAINT DF_TblErpInvoiceMirror_GrandTotal DEFAULT (0),
    SubTotal DECIMAL(18, 2) NOT NULL
      CONSTRAINT DF_TblErpInvoiceMirror_SubTotal DEFAULT (0),
    DiscountValue DECIMAL(18, 2) NOT NULL
      CONSTRAINT DF_TblErpInvoiceMirror_Discount DEFAULT (0),
    IsValidSale BIT NOT NULL
      CONSTRAINT DF_TblErpInvoiceMirror_IsValid DEFAULT (1),
    IsDeleted BIT NOT NULL
      CONSTRAINT DF_TblErpInvoiceMirror_IsDeleted DEFAULT (0),
    RawStatus NVARCHAR(64) NULL,
    SyncedAtUtc DATETIME2 NOT NULL
      CONSTRAINT DF_TblErpInvoiceMirror_Synced DEFAULT SYSUTCDATETIME(),
    UpdatedAtUtc DATETIME2 NOT NULL
      CONSTRAINT DF_TblErpInvoiceMirror_Updated DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_TblErpInvoiceMirror PRIMARY KEY (InvoiceMirrorID),
    CONSTRAINT UQ_TblErpInvoiceMirror_Business_Inv UNIQUE (BusinessID, ExternalInvId),
    CONSTRAINT FK_TblErpInvoiceMirror_Business FOREIGN KEY (BusinessID)
      REFERENCES dbo.TblBusiness (BusinessID) ON DELETE NO ACTION,
    CONSTRAINT FK_TblErpInvoiceMirror_Customer FOREIGN KEY (CustomerID)
      REFERENCES dbo.TblCrmCustomer (CustomerID) ON DELETE NO ACTION
  );
  CREATE INDEX IX_TblErpInvoiceMirror_Customer_Date
    ON dbo.TblErpInvoiceMirror (BusinessID, CustomerID, InvDate DESC)
    WHERE IsValidSale = 1 AND IsDeleted = 0;
  CREATE INDEX IX_TblErpInvoiceMirror_Date
    ON dbo.TblErpInvoiceMirror (BusinessID, InvDate DESC)
    WHERE IsValidSale = 1 AND IsDeleted = 0;
END;
GO

IF OBJECT_ID(N'dbo.TblErpInvoiceLineMirror', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TblErpInvoiceLineMirror (
    InvoiceLineMirrorID UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT DF_TblErpInvoiceLineMirror_ID DEFAULT NEWSEQUENTIALID(),
    BusinessID UNIQUEIDENTIFIER NOT NULL,
    InvoiceMirrorID UNIQUEIDENTIFIER NOT NULL,
    ExternalInvId NVARCHAR(64) NOT NULL,
    ExternalProId NVARCHAR(64) NULL,
    ExternalEmpId NVARCHAR(64) NULL,
    ProType NVARCHAR(32) NULL,
    ProName NVARCHAR(300) NULL,
    EmpName NVARCHAR(200) NULL,
    Qty DECIMAL(18, 2) NOT NULL
      CONSTRAINT DF_TblErpInvoiceLineMirror_Qty DEFAULT (1),
    UnitPrice DECIMAL(18, 2) NOT NULL
      CONSTRAINT DF_TblErpInvoiceLineMirror_UnitPrice DEFAULT (0),
    LineTotal DECIMAL(18, 2) NOT NULL
      CONSTRAINT DF_TblErpInvoiceLineMirror_LineTotal DEFAULT (0),
    CONSTRAINT PK_TblErpInvoiceLineMirror PRIMARY KEY (InvoiceLineMirrorID),
    CONSTRAINT FK_TblErpInvoiceLineMirror_Business FOREIGN KEY (BusinessID)
      REFERENCES dbo.TblBusiness (BusinessID) ON DELETE NO ACTION,
    CONSTRAINT FK_TblErpInvoiceLineMirror_Invoice FOREIGN KEY (InvoiceMirrorID)
      REFERENCES dbo.TblErpInvoiceMirror (InvoiceMirrorID) ON DELETE NO ACTION
  );
  CREATE INDEX IX_TblErpInvoiceLineMirror_Invoice
    ON dbo.TblErpInvoiceLineMirror (BusinessID, InvoiceMirrorID);
  CREATE INDEX IX_TblErpInvoiceLineMirror_ProName
    ON dbo.TblErpInvoiceLineMirror (BusinessID, ProName)
    WHERE ProName IS NOT NULL;
  CREATE INDEX IX_TblErpInvoiceLineMirror_ProId
    ON dbo.TblErpInvoiceLineMirror (BusinessID, ExternalProId)
    WHERE ExternalProId IS NOT NULL;
END;
GO

IF OBJECT_ID(N'dbo.TblErpServiceCatalog', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TblErpServiceCatalog (
    ServiceCatalogID UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT DF_TblErpServiceCatalog_ID DEFAULT NEWSEQUENTIALID(),
    BusinessID UNIQUEIDENTIFIER NOT NULL,
    ExternalProId NVARCHAR(64) NOT NULL,
    ProType NVARCHAR(32) NULL,
    ProName NVARCHAR(300) NOT NULL,
    ProNameAr NVARCHAR(300) NULL,
    CategoryName NVARCHAR(200) NULL,
    IsDeleted BIT NOT NULL
      CONSTRAINT DF_TblErpServiceCatalog_IsDeleted DEFAULT (0),
    SyncedAtUtc DATETIME2 NOT NULL
      CONSTRAINT DF_TblErpServiceCatalog_Synced DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_TblErpServiceCatalog PRIMARY KEY (ServiceCatalogID),
    CONSTRAINT UQ_TblErpServiceCatalog_Business_Pro UNIQUE (BusinessID, ExternalProId),
    CONSTRAINT FK_TblErpServiceCatalog_Business FOREIGN KEY (BusinessID)
      REFERENCES dbo.TblBusiness (BusinessID) ON DELETE NO ACTION
  );
  CREATE INDEX IX_TblErpServiceCatalog_Name
    ON dbo.TblErpServiceCatalog (BusinessID, ProName);
END;
GO

IF OBJECT_ID(N'dbo.TblCrmAudienceQueryAudit', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TblCrmAudienceQueryAudit (
    AuditID UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT DF_TblCrmAudienceQueryAudit_ID DEFAULT NEWSEQUENTIALID(),
    BusinessID UNIQUEIDENTIFIER NOT NULL,
    UserID UNIQUEIDENTIFIER NOT NULL,
    NaturalLanguage NVARCHAR(2000) NULL,
    FilterJson NVARCHAR(MAX) NOT NULL,
    CompiledSqlHash NVARCHAR(128) NULL,
    RowCount INT NULL,
    DurationMs INT NULL,
    Status NVARCHAR(32) NOT NULL,
    ErrorCode NVARCHAR(128) NULL,
    CreatedAtUtc DATETIME2 NOT NULL
      CONSTRAINT DF_TblCrmAudienceQueryAudit_Created DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_TblCrmAudienceQueryAudit PRIMARY KEY (AuditID),
    CONSTRAINT CK_TblCrmAudienceQueryAudit_Status CHECK (
      Status IN (N'OK', N'REJECTED', N'ERROR', N'TIMEOUT')
    ),
    CONSTRAINT FK_TblCrmAudienceQueryAudit_Business FOREIGN KEY (BusinessID)
      REFERENCES dbo.TblBusiness (BusinessID) ON DELETE NO ACTION,
    CONSTRAINT FK_TblCrmAudienceQueryAudit_User FOREIGN KEY (UserID)
      REFERENCES dbo.TblUser (UserID) ON DELETE NO ACTION
  );
  CREATE INDEX IX_TblCrmAudienceQueryAudit_Business
    ON dbo.TblCrmAudienceQueryAudit (BusinessID, CreatedAtUtc DESC);
END;
GO

IF OBJECT_ID(N'dbo.TblCrmCampaignBuilderSession', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TblCrmCampaignBuilderSession (
    SessionID UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT DF_TblCrmCampaignBuilderSession_ID DEFAULT NEWSEQUENTIALID(),
    BusinessID UNIQUEIDENTIFIER NOT NULL,
    UserID UNIQUEIDENTIFIER NOT NULL,
    Status NVARCHAR(32) NOT NULL
      CONSTRAINT DF_TblCrmCampaignBuilderSession_Status DEFAULT (N'ACTIVE'),
    FilterJson NVARCHAR(MAX) NULL,
    SegmentID UNIQUEIDENTIFIER NULL,
    SnapshotID UNIQUEIDENTIFIER NULL,
    MessageDraft NVARCHAR(2000) NULL,
    TranscriptJson NVARCHAR(MAX) NULL,
    CreatedAtUtc DATETIME2 NOT NULL
      CONSTRAINT DF_TblCrmCampaignBuilderSession_Created DEFAULT SYSUTCDATETIME(),
    UpdatedAtUtc DATETIME2 NOT NULL
      CONSTRAINT DF_TblCrmCampaignBuilderSession_Updated DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_TblCrmCampaignBuilderSession PRIMARY KEY (SessionID),
    CONSTRAINT CK_TblCrmCampaignBuilderSession_Status CHECK (
      Status IN (N'ACTIVE', N'READY', N'LAUNCHED', N'CANCELLED')
    ),
    CONSTRAINT FK_TblCrmCampaignBuilderSession_Business FOREIGN KEY (BusinessID)
      REFERENCES dbo.TblBusiness (BusinessID) ON DELETE NO ACTION,
    CONSTRAINT FK_TblCrmCampaignBuilderSession_User FOREIGN KEY (UserID)
      REFERENCES dbo.TblUser (UserID) ON DELETE NO ACTION,
    CONSTRAINT FK_TblCrmCampaignBuilderSession_Segment FOREIGN KEY (SegmentID)
      REFERENCES dbo.TblCrmSegment (SegmentID) ON DELETE NO ACTION,
    CONSTRAINT FK_TblCrmCampaignBuilderSession_Snapshot FOREIGN KEY (SnapshotID)
      REFERENCES dbo.TblCrmAudienceSnapshot (SnapshotID) ON DELETE NO ACTION
  );
  CREATE INDEX IX_TblCrmCampaignBuilderSession_Business
    ON dbo.TblCrmCampaignBuilderSession (BusinessID, UpdatedAtUtc DESC);
END;
GO
