IF OBJECT_ID(N'dbo.TblWhatsAppRemovedContact', N'U') IS NULL
BEGIN
 CREATE TABLE dbo.TblWhatsAppRemovedContact (
  BusinessID uniqueidentifier NOT NULL REFERENCES dbo.TblBusiness(BusinessID),
  PhoneNormalized varchar(15) NOT NULL,
  RemovedAtUtc datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
  PRIMARY KEY (BusinessID, PhoneNormalized),
  CHECK (LEN(PhoneNormalized) BETWEEN 8 AND 15 AND PhoneNormalized NOT LIKE '%[^0-9]%')
 );
END;
GO
CREATE OR ALTER VIEW dbo.VwWhatsAppBlockedContact AS
 SELECT BusinessID,PhoneNormalized FROM dbo.TblWhatsAppPrivateContact
 UNION
 SELECT BusinessID,PhoneNormalized FROM dbo.TblWhatsAppRemovedContact;
GO
CREATE OR ALTER VIEW dbo.VwPrivacyVisibleConversation AS
 SELECT c.BusinessID,c.ConversationID
 FROM dbo.TblConversation c
 JOIN dbo.TblContact ct ON ct.BusinessID=c.BusinessID AND ct.ContactID=c.ContactID
 JOIN dbo.TblChannelConnection ch ON ch.BusinessID=c.BusinessID AND ch.ChannelConnectionID=c.ChannelConnectionID
 WHERE ch.Channel<>N'WHATSAPP' OR (
  NOT EXISTS (SELECT 1 FROM dbo.VwWhatsAppBlockedContact b WHERE b.BusinessID=c.BusinessID
    AND (ct.PhoneNormalized IS NULL OR b.PhoneNormalized=ct.PhoneNormalized))
  AND (NOT EXISTS (SELECT 1 FROM dbo.TblWhatsAppPrivacyMode p WHERE p.BusinessID=c.BusinessID AND p.Mode='BUSINESS_ONLY')
    OR EXISTS (SELECT 1 FROM dbo.TblWhatsAppApprovedContact a WHERE a.BusinessID=c.BusinessID AND a.PhoneNormalized=ct.PhoneNormalized))
 );
GO
