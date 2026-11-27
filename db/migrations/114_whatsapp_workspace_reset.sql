IF OBJECT_ID(N'dbo.TblWhatsAppWorkspaceReset',N'U') IS NULL
BEGIN
 CREATE TABLE dbo.TblWhatsAppWorkspaceReset(
 BusinessID uniqueidentifier NOT NULL PRIMARY KEY REFERENCES dbo.TblBusiness(BusinessID),
 ResetAtUtc datetime2 NOT NULL,
 ResetID uniqueidentifier NOT NULL
 );
END;
GO
CREATE OR ALTER VIEW dbo.VwPrivacyCurrentMessage AS
 SELECT m.BusinessID,m.ConversationID,m.MessageID
 FROM dbo.TblMessage m
 JOIN dbo.TblChannelConnection ch ON ch.BusinessID=m.BusinessID AND ch.ChannelConnectionID=m.ChannelConnectionID
 LEFT JOIN dbo.TblWhatsAppWorkspaceReset rr ON rr.BusinessID=m.BusinessID
 WHERE m.PrivacyPurgedAtUtc IS NULL AND (ch.Channel<>N'WHATSAPP' OR rr.ResetAtUtc IS NULL OR
 (m.IsHistorical=0 AND m.CreatedAtUtc>=rr.ResetAtUtc AND COALESCE(m.ProviderTimestampUtc,m.ReceivedAtUtc)>=rr.ResetAtUtc));
GO
CREATE OR ALTER VIEW dbo.VwPrivacyVisibleConversation AS
 SELECT c.BusinessID,c.ConversationID
 FROM dbo.TblConversation c
 JOIN dbo.TblContact ct ON ct.BusinessID=c.BusinessID AND ct.ContactID=c.ContactID
 JOIN dbo.TblChannelConnection ch ON ch.BusinessID=c.BusinessID AND ch.ChannelConnectionID=c.ChannelConnectionID
 WHERE ch.Channel<>N'WHATSAPP' OR (
  (NOT EXISTS (SELECT 1 FROM dbo.TblWhatsAppWorkspaceReset rr WHERE rr.BusinessID=c.BusinessID)
   OR EXISTS (SELECT 1 FROM dbo.VwPrivacyCurrentMessage cm WHERE cm.BusinessID=c.BusinessID AND cm.ConversationID=c.ConversationID))
  AND NOT EXISTS (SELECT 1 FROM dbo.VwWhatsAppBlockedContact b WHERE b.BusinessID=c.BusinessID
    AND (ct.PhoneNormalized IS NULL OR b.PhoneNormalized=ct.PhoneNormalized))
  AND (NOT EXISTS (SELECT 1 FROM dbo.TblWhatsAppPrivacyMode p WHERE p.BusinessID=c.BusinessID AND p.Mode='BUSINESS_ONLY')
    OR EXISTS (SELECT 1 FROM dbo.TblWhatsAppApprovedContact a WHERE a.BusinessID=c.BusinessID AND a.PhoneNormalized=ct.PhoneNormalized))
 );
GO

CREATE OR ALTER VIEW dbo.VwPrivacyAiEligibleMessage AS
 SELECT m.BusinessID,m.ConversationID,m.MessageID
 FROM dbo.TblMessage m
 JOIN dbo.VwPrivacyVisibleConversation pv ON pv.BusinessID=m.BusinessID AND pv.ConversationID=m.ConversationID
 JOIN dbo.TblContact ct ON ct.BusinessID=m.BusinessID AND ct.ContactID=m.ContactID
 JOIN dbo.TblChannelConnection ch ON ch.BusinessID=m.BusinessID AND ch.ChannelConnectionID=m.ChannelConnectionID
 LEFT JOIN dbo.TblWhatsAppPrivacyMode pm ON pm.BusinessID=m.BusinessID
 WHERE m.PrivacyPurgedAtUtc IS NULL AND m.IsHistorical=0 AND EXISTS (SELECT 1 FROM dbo.VwPrivacyCurrentMessage cm WHERE cm.BusinessID=m.BusinessID AND cm.MessageID=m.MessageID)
 AND (ch.Channel<>N'WHATSAPP' OR (
  (pm.UpdatedAtUtc IS NULL OR m.ReceivedAtUtc>=pm.UpdatedAtUtc)
  AND (pm.Mode IS NULL OR pm.Mode='ALL' OR EXISTS(
   SELECT 1 FROM dbo.TblWhatsAppApprovedContact pa
    WHERE pa.BusinessID=m.BusinessID AND pa.PhoneNormalized=ct.PhoneNormalized AND m.ReceivedAtUtc>=pa.ApprovedAtUtc
  ))
 ));
GO

