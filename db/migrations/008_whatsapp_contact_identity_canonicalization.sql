-- Phase 3B Part 2B.1: Canonical WhatsApp phone identity + duplicate merge.
-- PhoneNormalized is the durable identity within BusinessID + ChannelConnectionID
-- when available. Bare digits and @s.whatsapp.net JIDs must resolve to one Contact.

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
-- Stored procedure: merge duplicate contacts sharing PhoneNormalized.
-- Idempotent — safe to re-run from tests after seeding pre-fix duplicates.
-- ---------------------------------------------------------------------------
CREATE OR ALTER PROCEDURE dbo.usp_MergeWhatsAppContactDuplicates
AS
BEGIN
  SET NOCOUNT ON;
  SET XACT_ABORT ON;

  BEGIN TRAN;

  -- Working set of duplicate contact groups
  IF OBJECT_ID(N'tempdb..#DupGroups') IS NOT NULL DROP TABLE #DupGroups;
  CREATE TABLE #DupGroups (
    BusinessID UNIQUEIDENTIFIER NOT NULL,
    ChannelConnectionID UNIQUEIDENTIFIER NOT NULL,
    PhoneNormalized NVARCHAR(32) NOT NULL,
    CanonicalContactID UNIQUEIDENTIFIER NULL,
    CanonicalConversationID UNIQUEIDENTIFIER NULL
  );

  INSERT INTO #DupGroups (BusinessID, ChannelConnectionID, PhoneNormalized)
  SELECT BusinessID, ChannelConnectionID, PhoneNormalized
  FROM dbo.TblContact
  WHERE PhoneNormalized IS NOT NULL
  GROUP BY BusinessID, ChannelConnectionID, PhoneNormalized
  HAVING COUNT(1) > 1;

  -- Pick canonical contact/conversation per group:
  -- 1) conversation with message history
  -- 2) greater message count
  -- 3) older contact/conversation
  -- 4) deterministic ContactID
  ;WITH ranked AS (
    SELECT
      g.BusinessID,
      g.ChannelConnectionID,
      g.PhoneNormalized,
      c.ContactID,
      conv.ConversationID,
      ISNULL((
        SELECT COUNT(1) FROM dbo.TblMessage m
        WHERE m.BusinessID = c.BusinessID AND m.ContactID = c.ContactID
      ), 0) AS MessageCount,
      CASE WHEN EXISTS (
        SELECT 1 FROM dbo.TblMessage m
        WHERE m.BusinessID = c.BusinessID AND m.ContactID = c.ContactID
      ) THEN 1 ELSE 0 END AS HasMessages,
      c.CreatedAtUtc AS ContactCreatedAtUtc,
      conv.CreatedAtUtc AS ConversationCreatedAtUtc,
      ROW_NUMBER() OVER (
        PARTITION BY g.BusinessID, g.ChannelConnectionID, g.PhoneNormalized
        ORDER BY
          CASE WHEN EXISTS (
            SELECT 1 FROM dbo.TblMessage m
            WHERE m.BusinessID = c.BusinessID AND m.ContactID = c.ContactID
          ) THEN 0 ELSE 1 END,
          (
            SELECT COUNT(1) FROM dbo.TblMessage m
            WHERE m.BusinessID = c.BusinessID AND m.ContactID = c.ContactID
          ) DESC,
          c.CreatedAtUtc ASC,
          ISNULL(conv.CreatedAtUtc, '9999-12-31') ASC,
          c.ContactID ASC
      ) AS rn
    FROM #DupGroups g
    INNER JOIN dbo.TblContact c
      ON c.BusinessID = g.BusinessID
     AND c.ChannelConnectionID = g.ChannelConnectionID
     AND c.PhoneNormalized = g.PhoneNormalized
    LEFT JOIN dbo.TblConversation conv
      ON conv.BusinessID = c.BusinessID
     AND conv.ChannelConnectionID = c.ChannelConnectionID
     AND conv.ContactID = c.ContactID
  )
  UPDATE g
  SET CanonicalContactID = r.ContactID,
      CanonicalConversationID = r.ConversationID
  FROM #DupGroups g
  INNER JOIN ranked r
    ON r.BusinessID = g.BusinessID
   AND r.ChannelConnectionID = g.ChannelConnectionID
   AND r.PhoneNormalized = g.PhoneNormalized
   AND r.rn = 1;

  -- Ensure canonical conversation exists when missing
  INSERT INTO dbo.TblConversation (
    ConversationID, BusinessID, ChannelConnectionID, ContactID, Status,
    LastMessageAtUtc, LastInboundAtUtc, LastOutboundAtUtc,
    CreatedAtUtc, UpdatedAtUtc
  )
  SELECT
    NEWID(),
    g.BusinessID,
    g.ChannelConnectionID,
    g.CanonicalContactID,
    N'OPEN',
    NULL, NULL, NULL,
    SYSUTCDATETIME(), SYSUTCDATETIME()
  FROM #DupGroups g
  WHERE g.CanonicalContactID IS NOT NULL
    AND g.CanonicalConversationID IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM dbo.TblConversation c
      WHERE c.BusinessID = g.BusinessID
        AND c.ChannelConnectionID = g.ChannelConnectionID
        AND c.ContactID = g.CanonicalContactID
    );

  UPDATE g
  SET CanonicalConversationID = c.ConversationID
  FROM #DupGroups g
  INNER JOIN dbo.TblConversation c
    ON c.BusinessID = g.BusinessID
   AND c.ChannelConnectionID = g.ChannelConnectionID
   AND c.ContactID = g.CanonicalContactID
  WHERE g.CanonicalConversationID IS NULL;

  IF OBJECT_ID(N'tempdb..#DupContacts') IS NOT NULL DROP TABLE #DupContacts;
  CREATE TABLE #DupContacts (
    BusinessID UNIQUEIDENTIFIER NOT NULL,
    ChannelConnectionID UNIQUEIDENTIFIER NOT NULL,
    PhoneNormalized NVARCHAR(32) NOT NULL,
    CanonicalContactID UNIQUEIDENTIFIER NOT NULL,
    CanonicalConversationID UNIQUEIDENTIFIER NOT NULL,
    DuplicateContactID UNIQUEIDENTIFIER NOT NULL,
    DuplicateConversationID UNIQUEIDENTIFIER NULL
  );

  INSERT INTO #DupContacts (
    BusinessID, ChannelConnectionID, PhoneNormalized,
    CanonicalContactID, CanonicalConversationID,
    DuplicateContactID, DuplicateConversationID
  )
  SELECT
    g.BusinessID,
    g.ChannelConnectionID,
    g.PhoneNormalized,
    g.CanonicalContactID,
    g.CanonicalConversationID,
    c.ContactID,
    conv.ConversationID
  FROM #DupGroups g
  INNER JOIN dbo.TblContact c
    ON c.BusinessID = g.BusinessID
   AND c.ChannelConnectionID = g.ChannelConnectionID
   AND c.PhoneNormalized = g.PhoneNormalized
   AND c.ContactID <> g.CanonicalContactID
  LEFT JOIN dbo.TblConversation conv
    ON conv.BusinessID = c.BusinessID
   AND conv.ChannelConnectionID = c.ChannelConnectionID
   AND conv.ContactID = c.ContactID
  WHERE g.CanonicalContactID IS NOT NULL
    AND g.CanonicalConversationID IS NOT NULL;

  -- Messages → canonical
  UPDATE m
  SET ConversationID = d.CanonicalConversationID,
      ContactID = d.CanonicalContactID
  FROM dbo.TblMessage m
  INNER JOIN #DupContacts d
    ON m.BusinessID = d.BusinessID
   AND (
     m.ContactID = d.DuplicateContactID
     OR m.ConversationID = d.DuplicateConversationID
   );

  -- Conversation timestamps: take max across duplicates
  UPDATE canon
  SET
    LastMessageAtUtc = (
      SELECT MAX(v) FROM (VALUES
        (canon.LastMessageAtUtc),
        (dup.LastMessageAtUtc)
      ) AS t(v)
    ),
    LastInboundAtUtc = (
      SELECT MAX(v) FROM (VALUES
        (canon.LastInboundAtUtc),
        (dup.LastInboundAtUtc)
      ) AS t(v)
    ),
    LastOutboundAtUtc = (
      SELECT MAX(v) FROM (VALUES
        (canon.LastOutboundAtUtc),
        (dup.LastOutboundAtUtc)
      ) AS t(v)
    ),
    UpdatedAtUtc = SYSUTCDATETIME()
  FROM dbo.TblConversation canon
  INNER JOIN #DupContacts d ON d.CanonicalConversationID = canon.ConversationID
  INNER JOIN dbo.TblConversation dup ON dup.ConversationID = d.DuplicateConversationID
  WHERE d.DuplicateConversationID IS NOT NULL;

  -- AI jobs → canonical; normalize PENDING/PROCESSING uniqueness
  UPDATE j
  SET ConversationID = d.CanonicalConversationID,
      ContactID = d.CanonicalContactID,
      UpdatedAtUtc = SYSUTCDATETIME()
  FROM dbo.TblAiReplyJob j
  INNER JOIN #DupContacts d
    ON j.BusinessID = d.BusinessID
   AND (
     j.ContactID = d.DuplicateContactID
     OR j.ConversationID = d.DuplicateConversationID
   );

  ;WITH pendingDup AS (
    SELECT
      AiReplyJobID,
      ROW_NUMBER() OVER (
        PARTITION BY BusinessID, ConversationID
        ORDER BY UpdatedAtUtc DESC, CreatedAtUtc DESC, AiReplyJobID DESC
      ) AS rn
    FROM dbo.TblAiReplyJob
    WHERE Status = N'PENDING'
      AND ConversationID IN (SELECT CanonicalConversationID FROM #DupContacts)
  )
  UPDATE j
  SET Status = N'COALESCED',
      LastErrorCode = N'DEDUP_CONTACT_MERGE_PENDING',
      CompletedAtUtc = SYSUTCDATETIME(),
      LeaseUntilUtc = NULL,
      UpdatedAtUtc = SYSUTCDATETIME()
  FROM dbo.TblAiReplyJob j
  INNER JOIN pendingDup p ON p.AiReplyJobID = j.AiReplyJobID
  WHERE p.rn > 1 AND j.Status = N'PENDING';

  ;WITH processingDup AS (
    SELECT
      AiReplyJobID,
      ROW_NUMBER() OVER (
        PARTITION BY BusinessID, ConversationID
        ORDER BY
          CASE WHEN LeaseUntilUtc IS NOT NULL AND LeaseUntilUtc >= SYSUTCDATETIME() THEN 0 ELSE 1 END,
          StartedAtUtc DESC,
          UpdatedAtUtc DESC,
          AiReplyJobID DESC
      ) AS rn
    FROM dbo.TblAiReplyJob
    WHERE Status = N'PROCESSING'
      AND ConversationID IN (SELECT CanonicalConversationID FROM #DupContacts)
  )
  UPDATE j
  SET Status = N'FAILED',
      LastErrorCode = N'DEDUP_CONTACT_MERGE_PROCESSING',
      CompletedAtUtc = SYSUTCDATETIME(),
      LeaseUntilUtc = NULL,
      UpdatedAtUtc = SYSUTCDATETIME()
  FROM dbo.TblAiReplyJob j
  INNER JOIN processingDup p ON p.AiReplyJobID = j.AiReplyJobID
  WHERE p.rn > 1 AND j.Status = N'PROCESSING';

  -- Loop guard: preserve safest (latest) pause
  MERGE dbo.TblAiConversationGuard AS target
  USING (
    SELECT
      d.BusinessID,
      d.CanonicalConversationID AS ConversationID,
      MAX(g.PausedUntilUtc) AS PausedUntilUtc,
      MAX(g.TriggeredAtUtc) AS TriggeredAtUtc,
      MAX(g.PauseReason) AS PauseReason
    FROM #DupContacts d
    INNER JOIN dbo.TblAiConversationGuard g
      ON g.BusinessID = d.BusinessID
     AND g.ConversationID IN (d.CanonicalConversationID, d.DuplicateConversationID)
    WHERE d.DuplicateConversationID IS NOT NULL
    GROUP BY d.BusinessID, d.CanonicalConversationID
  ) AS src
  ON target.BusinessID = src.BusinessID
 AND target.ConversationID = src.ConversationID
  WHEN MATCHED THEN
    UPDATE SET
      PausedUntilUtc = CASE
        WHEN src.PausedUntilUtc IS NULL THEN target.PausedUntilUtc
        WHEN target.PausedUntilUtc IS NULL THEN src.PausedUntilUtc
        WHEN src.PausedUntilUtc > target.PausedUntilUtc THEN src.PausedUntilUtc
        ELSE target.PausedUntilUtc
      END,
      TriggeredAtUtc = CASE
        WHEN src.TriggeredAtUtc IS NULL THEN target.TriggeredAtUtc
        WHEN target.TriggeredAtUtc IS NULL THEN src.TriggeredAtUtc
        WHEN src.TriggeredAtUtc > target.TriggeredAtUtc THEN src.TriggeredAtUtc
        ELSE target.TriggeredAtUtc
      END,
      PauseReason = COALESCE(target.PauseReason, src.PauseReason),
      UpdatedAtUtc = SYSUTCDATETIME()
  WHEN NOT MATCHED THEN
    INSERT (BusinessID, ConversationID, PausedUntilUtc, PauseReason, TriggeredAtUtc, CreatedAtUtc, UpdatedAtUtc)
    VALUES (src.BusinessID, src.ConversationID, src.PausedUntilUtc, src.PauseReason, src.TriggeredAtUtc, SYSUTCDATETIME(), SYSUTCDATETIME());

  DELETE g
  FROM dbo.TblAiConversationGuard g
  INNER JOIN #DupContacts d
    ON g.BusinessID = d.BusinessID
   AND g.ConversationID = d.DuplicateConversationID
  WHERE d.DuplicateConversationID IS NOT NULL
    AND d.DuplicateConversationID <> d.CanonicalConversationID;

  -- Conversation AI state: SAFETY_PAUSED > HUMAN_PAUSED > AUTO
  ;WITH states AS (
    SELECT
      d.BusinessID,
      d.CanonicalConversationID,
      s.Mode,
      s.PausedAtUtc,
      s.PauseReason,
      s.ResumedAtUtc,
      s.LastHumanOutboundProviderMessageID,
      CASE s.Mode
        WHEN N'SAFETY_PAUSED' THEN 3
        WHEN N'HUMAN_PAUSED' THEN 2
        WHEN N'AUTO' THEN 1
        ELSE 0
      END AS ModeRank
    FROM #DupContacts d
    INNER JOIN dbo.TblConversationAiState s
      ON s.BusinessID = d.BusinessID
     AND s.ConversationID IN (d.CanonicalConversationID, d.DuplicateConversationID)
  ),
  winner AS (
    SELECT
      BusinessID,
      CanonicalConversationID,
      Mode,
      PausedAtUtc,
      PauseReason,
      ResumedAtUtc,
      LastHumanOutboundProviderMessageID,
      ROW_NUMBER() OVER (
        PARTITION BY BusinessID, CanonicalConversationID
        ORDER BY ModeRank DESC, PausedAtUtc DESC, LastHumanOutboundProviderMessageID DESC
      ) AS rn
    FROM states
  )
  MERGE dbo.TblConversationAiState AS target
  USING (
    SELECT * FROM winner WHERE rn = 1
  ) AS src
  ON target.BusinessID = src.BusinessID
 AND target.ConversationID = src.CanonicalConversationID
  WHEN MATCHED THEN
    UPDATE SET
      Mode = src.Mode,
      PausedAtUtc = CASE WHEN src.Mode IN (N'HUMAN_PAUSED', N'SAFETY_PAUSED') THEN src.PausedAtUtc ELSE NULL END,
      PauseReason = CASE WHEN src.Mode IN (N'HUMAN_PAUSED', N'SAFETY_PAUSED') THEN src.PauseReason ELSE NULL END,
      ResumedAtUtc = CASE WHEN src.Mode = N'AUTO' THEN COALESCE(src.ResumedAtUtc, target.ResumedAtUtc) ELSE NULL END,
      LastHumanOutboundProviderMessageID = COALESCE(
        src.LastHumanOutboundProviderMessageID,
        target.LastHumanOutboundProviderMessageID
      ),
      UpdatedAtUtc = SYSUTCDATETIME()
  WHEN NOT MATCHED THEN
    INSERT (
      BusinessID, ConversationID, Mode, PausedAtUtc, PauseReason,
      ResumedAtUtc, LastHumanOutboundProviderMessageID, CreatedAtUtc, UpdatedAtUtc
    )
    VALUES (
      src.BusinessID, src.CanonicalConversationID, src.Mode,
      CASE WHEN src.Mode IN (N'HUMAN_PAUSED', N'SAFETY_PAUSED') THEN src.PausedAtUtc ELSE NULL END,
      CASE WHEN src.Mode IN (N'HUMAN_PAUSED', N'SAFETY_PAUSED') THEN src.PauseReason ELSE NULL END,
      CASE WHEN src.Mode = N'AUTO' THEN src.ResumedAtUtc ELSE NULL END,
      src.LastHumanOutboundProviderMessageID,
      SYSUTCDATETIME(), SYSUTCDATETIME()
    );

  DELETE s
  FROM dbo.TblConversationAiState s
  INNER JOIN #DupContacts d
    ON s.BusinessID = d.BusinessID
   AND s.ConversationID = d.DuplicateConversationID
  WHERE d.DuplicateConversationID IS NOT NULL
    AND d.DuplicateConversationID <> d.CanonicalConversationID;

  -- Outbound observations → canonical
  UPDATE o
  SET ContactID = COALESCE(d.CanonicalContactID, o.ContactID),
      ConversationID = COALESCE(d.CanonicalConversationID, o.ConversationID)
  FROM dbo.TblWhatsappOutboundObservation o
  INNER JOIN #DupContacts d
    ON o.BusinessID = d.BusinessID
   AND (
     o.ContactID = d.DuplicateContactID
     OR o.ConversationID = d.DuplicateConversationID
   );

  -- Normalize canonical ExternalContactKey to digits
  UPDATE c
  SET ExternalContactKey = g.PhoneNormalized,
      UpdatedAtUtc = SYSUTCDATETIME()
  FROM dbo.TblContact c
  INNER JOIN #DupGroups g ON g.CanonicalContactID = c.ContactID
  WHERE c.ExternalContactKey <> g.PhoneNormalized
    AND NOT EXISTS (
      SELECT 1 FROM dbo.TblContact other
      WHERE other.BusinessID = c.BusinessID
        AND other.ChannelConnectionID = c.ChannelConnectionID
        AND other.ExternalContactKey = g.PhoneNormalized
        AND other.ContactID <> c.ContactID
    );

  -- Delete duplicate conversations then contacts
  DELETE conv
  FROM dbo.TblConversation conv
  INNER JOIN #DupContacts d
    ON conv.ConversationID = d.DuplicateConversationID
  WHERE d.DuplicateConversationID IS NOT NULL
    AND d.DuplicateConversationID <> d.CanonicalConversationID;

  DELETE c
  FROM dbo.TblContact c
  INNER JOIN #DupContacts d ON d.DuplicateContactID = c.ContactID;

  COMMIT TRAN;
END;
GO

EXEC dbo.usp_MergeWhatsAppContactDuplicates;
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
