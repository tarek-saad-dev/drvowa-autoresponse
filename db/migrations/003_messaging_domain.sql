-- Phase 3A Part 1: durable inbound messaging domain
-- Contact / Conversation / Message + WHATSAPP/BAILEYS ExternalAccountKey uniqueness

-- Unique ExternalAccountKey for managed WhatsApp Baileys connections
IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE name = N'UQ_TblChannelConnection_WhatsAppBaileys_ExternalAccountKey'
    AND object_id = OBJECT_ID(N'dbo.TblChannelConnection')
)
BEGIN
  CREATE UNIQUE INDEX UQ_TblChannelConnection_WhatsAppBaileys_ExternalAccountKey
    ON dbo.TblChannelConnection (ExternalAccountKey)
    WHERE Channel = N'WHATSAPP'
      AND Provider = N'BAILEYS'
      AND ExternalAccountKey IS NOT NULL;
END;

IF OBJECT_ID(N'dbo.TblContact', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TblContact (
    ContactID UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT DF_TblContact_ContactID DEFAULT NEWSEQUENTIALID(),
    BusinessID UNIQUEIDENTIFIER NOT NULL,
    ChannelConnectionID UNIQUEIDENTIFIER NOT NULL,
    ExternalContactKey NVARCHAR(256) NOT NULL,
    DisplayName NVARCHAR(200) NULL,
    PhoneNormalized NVARCHAR(32) NULL,
    CreatedAtUtc DATETIME2 NOT NULL
      CONSTRAINT DF_TblContact_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
    UpdatedAtUtc DATETIME2 NOT NULL
      CONSTRAINT DF_TblContact_UpdatedAtUtc DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_TblContact PRIMARY KEY (ContactID),
    CONSTRAINT UQ_TblContact_Business_Channel_ExternalKey
      UNIQUE (BusinessID, ChannelConnectionID, ExternalContactKey),
    CONSTRAINT FK_TblContact_Business FOREIGN KEY (BusinessID)
      REFERENCES dbo.TblBusiness (BusinessID) ON DELETE NO ACTION,
    CONSTRAINT FK_TblContact_ChannelConnection FOREIGN KEY (ChannelConnectionID)
      REFERENCES dbo.TblChannelConnection (ChannelConnectionID) ON DELETE NO ACTION
  );

  CREATE INDEX IX_TblContact_BusinessID ON dbo.TblContact (BusinessID);
  CREATE INDEX IX_TblContact_ChannelConnectionID ON dbo.TblContact (ChannelConnectionID);
END;

IF OBJECT_ID(N'dbo.TblConversation', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TblConversation (
    ConversationID UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT DF_TblConversation_ConversationID DEFAULT NEWSEQUENTIALID(),
    BusinessID UNIQUEIDENTIFIER NOT NULL,
    ChannelConnectionID UNIQUEIDENTIFIER NOT NULL,
    ContactID UNIQUEIDENTIFIER NOT NULL,
    Status NVARCHAR(32) NOT NULL
      CONSTRAINT DF_TblConversation_Status DEFAULT (N'OPEN'),
    LastMessageAtUtc DATETIME2 NULL,
    LastInboundAtUtc DATETIME2 NULL,
    LastOutboundAtUtc DATETIME2 NULL,
    CreatedAtUtc DATETIME2 NOT NULL
      CONSTRAINT DF_TblConversation_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
    UpdatedAtUtc DATETIME2 NOT NULL
      CONSTRAINT DF_TblConversation_UpdatedAtUtc DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_TblConversation PRIMARY KEY (ConversationID),
    CONSTRAINT CK_TblConversation_Status CHECK (Status IN (N'OPEN', N'CLOSED')),
    CONSTRAINT UQ_TblConversation_Business_Channel_Contact
      UNIQUE (BusinessID, ChannelConnectionID, ContactID),
    CONSTRAINT FK_TblConversation_Business FOREIGN KEY (BusinessID)
      REFERENCES dbo.TblBusiness (BusinessID) ON DELETE NO ACTION,
    CONSTRAINT FK_TblConversation_ChannelConnection FOREIGN KEY (ChannelConnectionID)
      REFERENCES dbo.TblChannelConnection (ChannelConnectionID) ON DELETE NO ACTION,
    CONSTRAINT FK_TblConversation_Contact FOREIGN KEY (ContactID)
      REFERENCES dbo.TblContact (ContactID) ON DELETE NO ACTION
  );

  CREATE INDEX IX_TblConversation_BusinessID ON dbo.TblConversation (BusinessID);
  CREATE INDEX IX_TblConversation_Business_LastMessage
    ON dbo.TblConversation (BusinessID, LastMessageAtUtc DESC);
END;

IF OBJECT_ID(N'dbo.TblMessage', N'U') IS NULL
BEGIN
  CREATE TABLE dbo.TblMessage (
    MessageID UNIQUEIDENTIFIER NOT NULL
      CONSTRAINT DF_TblMessage_MessageID DEFAULT NEWSEQUENTIALID(),
    BusinessID UNIQUEIDENTIFIER NOT NULL,
    ConversationID UNIQUEIDENTIFIER NOT NULL,
    ChannelConnectionID UNIQUEIDENTIFIER NOT NULL,
    ContactID UNIQUEIDENTIFIER NOT NULL,
    Direction NVARCHAR(16) NOT NULL,
    Provider NVARCHAR(32) NOT NULL,
    ProviderMessageID NVARCHAR(256) NOT NULL,
    ContentType NVARCHAR(32) NOT NULL,
    TextContent NVARCHAR(MAX) NULL,
    ProviderTimestampUtc DATETIME2 NULL,
    ReceivedAtUtc DATETIME2 NOT NULL,
    CreatedAtUtc DATETIME2 NOT NULL
      CONSTRAINT DF_TblMessage_CreatedAtUtc DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_TblMessage PRIMARY KEY (MessageID),
    CONSTRAINT CK_TblMessage_Direction CHECK (Direction IN (N'INBOUND', N'OUTBOUND')),
    CONSTRAINT CK_TblMessage_ContentType CHECK (ContentType IN (N'TEXT', N'UNKNOWN')),
    CONSTRAINT UQ_TblMessage_Channel_ProviderMessageID
      UNIQUE (ChannelConnectionID, ProviderMessageID),
    CONSTRAINT FK_TblMessage_Business FOREIGN KEY (BusinessID)
      REFERENCES dbo.TblBusiness (BusinessID) ON DELETE NO ACTION,
    CONSTRAINT FK_TblMessage_Conversation FOREIGN KEY (ConversationID)
      REFERENCES dbo.TblConversation (ConversationID) ON DELETE NO ACTION,
    CONSTRAINT FK_TblMessage_ChannelConnection FOREIGN KEY (ChannelConnectionID)
      REFERENCES dbo.TblChannelConnection (ChannelConnectionID) ON DELETE NO ACTION,
    CONSTRAINT FK_TblMessage_Contact FOREIGN KEY (ContactID)
      REFERENCES dbo.TblContact (ContactID) ON DELETE NO ACTION
  );

  CREATE INDEX IX_TblMessage_BusinessID ON dbo.TblMessage (BusinessID);
  CREATE INDEX IX_TblMessage_Conversation_Timeline
    ON dbo.TblMessage (BusinessID, ConversationID, ProviderTimestampUtc, CreatedAtUtc);
END;
