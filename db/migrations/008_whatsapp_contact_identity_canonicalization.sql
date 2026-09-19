-- Phase 3B Part 2B.1: Canonical WhatsApp phone identity + duplicate merge.
-- PhoneNormalized is the durable identity within BusinessID + ChannelConnectionID
-- when available. Bare digits and @s.whatsapp.net JIDs must resolve to one Contact.
--
-- Production application must NOT require EXECUTE on any user-defined procedure.
-- Merge SQL runs inline under db-migrate.ts outer transaction.

-- ---------------------------------------------------------------------------
-- Fail closed if unknown FK tables reference Contact/Conversation beyond known set.
-- ---------------------------------------------------------------------------
IF EXISTS (
  SELECT 1
  FROM sys.foreign_keys fk
  INNER JOIN sys.tables parent ON parent.object_id = fk.parent_object_id
  INNER JOIN sys.tables ref ON ref.object_id = fk.referenced_object_id
  WHERE ref.name IN (N'TblContact', N'TblConversation')
    AND parent.name NOT IN (
      N'TblContact',
      N'TblConversation',
      N'TblMessage',
      N'TblAiReplyJob',
      N'TblAiConversationGuard',
      N'TblConversationAiState',
      N'TblWhatsappOutboundObservation'
    )
)
BEGIN
  DECLARE @unknownParents NVARCHAR(MAX);
  SELECT @unknownParents = STRING_AGG(parent.name, N', ')
  FROM sys.foreign_keys fk
  INNER JOIN sys.tables parent ON parent.object_id = fk.parent_object_id
  INNER JOIN sys.tables ref ON ref.object_id = fk.referenced_object_id
  WHERE ref.name IN (N'TblContact', N'TblConversation')
    AND parent.name NOT IN (
      N'TblContact',
      N'TblConversation',
      N'TblMessage',
      N'TblAiReplyJob',
      N'TblAiConversationGuard',
      N'TblConversationAiState',
      N'TblWhatsappOutboundObservation'
    );
  THROW 50001, @unknownParents, 1;
END;
GO

-- ---------------------------------------------------------------------------
-- Inline duplicate merge (no stored procedure EXEC required).
-- ---------------------------------------------------------------------------
-- @include: ../sql/merge_whatsapp_contact_duplicates.sql
GO

-- Drop any leftover repair procedure from earlier 008 drafts (no runtime use).
IF OBJECT_ID(N'dbo.usp_MergeWhatsAppContactDuplicates', N'P') IS NOT NULL
BEGIN
  DROP PROCEDURE dbo.usp_MergeWhatsAppContactDuplicates;
END;
GO

-- ---------------------------------------------------------------------------
-- Race-safe uniqueness on PhoneNormalized (when present)
-- ---------------------------------------------------------------------------
IF NOT EXISTS (
  SELECT 1
  FROM sys.indexes
  WHERE name = N'UQ_TblContact_Business_Channel_PhoneNormalized'
    AND object_id = OBJECT_ID(N'dbo.TblContact')
)
BEGIN
  CREATE UNIQUE INDEX UQ_TblContact_Business_Channel_PhoneNormalized
    ON dbo.TblContact (BusinessID, ChannelConnectionID, PhoneNormalized)
    WHERE PhoneNormalized IS NOT NULL;
END;
GO
