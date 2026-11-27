CREATE OR ALTER VIEW dbo.VwPrivacyAiEligibleMessage AS
 SELECT m.BusinessID,m.ConversationID,m.MessageID
 FROM dbo.TblMessage m
 JOIN dbo.VwPrivacyVisibleConversation pv ON pv.BusinessID=m.BusinessID AND pv.ConversationID=m.ConversationID
 JOIN dbo.TblContact ct ON ct.BusinessID=m.BusinessID AND ct.ContactID=m.ContactID
 JOIN dbo.TblChannelConnection ch ON ch.BusinessID=m.BusinessID AND ch.ChannelConnectionID=m.ChannelConnectionID
 LEFT JOIN dbo.TblWhatsAppPrivacyMode pm ON pm.BusinessID=m.BusinessID
 WHERE m.PrivacyPurgedAtUtc IS NULL AND m.IsHistorical=0
 AND (ch.Channel<>N'WHATSAPP' OR (
  (pm.UpdatedAtUtc IS NULL OR m.ReceivedAtUtc>=pm.UpdatedAtUtc)
  AND (pm.Mode IS NULL OR pm.Mode='ALL' OR EXISTS(
   SELECT 1 FROM dbo.TblWhatsAppApprovedContact pa
    WHERE pa.BusinessID=m.BusinessID AND pa.PhoneNormalized=ct.PhoneNormalized AND m.ReceivedAtUtc>=pa.ApprovedAtUtc
  ))
 ));
GO
