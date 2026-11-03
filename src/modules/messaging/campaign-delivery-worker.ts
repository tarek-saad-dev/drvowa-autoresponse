import { randomUUID } from "node:crypto";
import { query, sql, withTransaction } from "@/lib/db";
import { sendAccountMessage, type RuntimeSendResult } from "@/modules/channels/runtime-client";

/** Bound all campaign delivery separately from normal conversational AI traffic. */
export const CAMPAIGN_MIN_SPACING_SECONDS = 60;
export const CAMPAIGN_MAX_ATTEMPTS_PER_24H = 60;

export function insideCampaignHours(date = new Date()): boolean {
  const hour = Number(new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Cairo", hour: "2-digit", hourCycle: "h23",
  }).format(date));
  return hour >= 9 && hour < 21;
}
type Claimed = {
  RunID: string; BusinessID: string; PhoneNormalized: string;
  ClaimToken: string; AccountKey: string; MessageText: string;
};
type Candidate = {
  RunID: string; BusinessID: string; PhoneNormalized: string; ContactID: string;
  AccountKey: string; MessageText: string;
};
const b = (businessId: string) => ({ name:"businessId",type:sql.UniqueIdentifier,value:businessId });
const c = (channelConnectionId: string) => ({
  name:"channelConnectionId",type:sql.UniqueIdentifier,value:channelConnectionId,
});

async function discardNotAllowed(): Promise<number> {
  const r = await query(
    `UPDATE TOP (100) item
       SET Status=N'SKIPPED',CompletedAtUtc=SYSUTCDATETIME(),
         ErrorCode=CASE
           WHEN EXISTS (SELECT 1 FROM dbo.TblWhatsAppCampaignOptOut o
             WHERE o.BusinessID=item.BusinessID AND o.ChannelConnectionID=run.ChannelConnectionID
               AND o.PhoneNormalized=item.PhoneNormalized) THEN N'CUSTOMER_OPTOUT'
           WHEN NOT EXISTS (SELECT 1 FROM dbo.TblWhatsAppCampaignPermission perm
             WHERE perm.BusinessID=item.BusinessID
               AND perm.ChannelConnectionID=run.ChannelConnectionID
               AND perm.PhoneNormalized=item.PhoneNormalized
               AND perm.Source=N'EXPLICIT_INBOUND') THEN N'NO_PERMISSION'
           WHEN EXISTS (SELECT 1
             FROM dbo.TblWhatsAppCampaignRunItem oldItem
             JOIN dbo.TblWhatsAppCampaignRun oldRun ON oldRun.RunID=oldItem.RunID
             WHERE oldRun.BusinessID=item.BusinessID
               AND oldRun.ChannelConnectionID=run.ChannelConnectionID
               AND oldItem.PhoneNormalized=item.PhoneNormalized
               AND oldItem.Status=N'SENT'
               AND oldItem.CompletedAtUtc>DATEADD(HOUR,-24,SYSUTCDATETIME()))
             THEN N'RECENT_CAMPAIGN'
           ELSE N'CHANGED_AUDIENCE' END
     FROM dbo.TblWhatsAppCampaignRunItem item
     JOIN dbo.TblWhatsAppCampaignRun run ON run.RunID=item.RunID
       AND run.BusinessID=item.BusinessID
     WHERE item.Status=N'PENDING' AND run.Status IN (N'QUEUED',N'RUNNING')
       AND (
         EXISTS (SELECT 1 FROM dbo.TblWhatsAppCampaignOptOut o
           WHERE o.BusinessID=item.BusinessID AND o.ChannelConnectionID=run.ChannelConnectionID
             AND o.PhoneNormalized=item.PhoneNormalized)
         OR NOT EXISTS (SELECT 1 FROM dbo.TblWhatsAppCampaignPermission perm
           WHERE perm.BusinessID=item.BusinessID
             AND perm.ChannelConnectionID=run.ChannelConnectionID
             AND perm.PhoneNormalized=item.PhoneNormalized
             AND perm.Source=N'EXPLICIT_INBOUND')
         OR NOT EXISTS (SELECT 1 FROM dbo.TblWhatsAppContactLabel cl
           WHERE cl.BusinessID=item.BusinessID AND cl.ChannelConnectionID=run.ChannelConnectionID
             AND cl.ProviderLabelID=run.ProviderLabelID AND cl.ContactID=item.ContactID
             AND cl.IsActive=1)
         OR NOT EXISTS (SELECT 1 FROM dbo.TblWhatsAppLabel l
           WHERE l.BusinessID=item.BusinessID AND l.ChannelConnectionID=run.ChannelConnectionID
             AND l.ProviderLabelID=run.ProviderLabelID AND l.IsDeleted=0)
         OR NOT EXISTS (SELECT 1 FROM dbo.TblWhatsAppLabelCampaignDraft d
           WHERE d.BusinessID=item.BusinessID AND d.CampaignDraftID=run.CampaignDraftID
             AND d.Status=N'COPY_APPROVED' AND d.MessageText=run.MessageText)
         OR EXISTS (SELECT 1 FROM dbo.TblWhatsAppCampaignRunItem oldItem
           JOIN dbo.TblWhatsAppCampaignRun oldRun ON oldRun.RunID=oldItem.RunID
           WHERE oldRun.BusinessID=item.BusinessID
             AND oldRun.ChannelConnectionID=run.ChannelConnectionID
             AND oldItem.PhoneNormalized=item.PhoneNormalized
             AND oldItem.Status=N'SENT'
             AND oldItem.CompletedAtUtc>DATEADD(HOUR,-24,SYSUTCDATETIME()))
       )`,
  );
  return r.rowsAffected.reduce((x,y)=>x+y,0);
}

async function claimNext(): Promise<Claimed | null> {
  const claimToken = randomUUID();
  return withTransaction(async trx => {
    // Every account has one locked throttle row, even across worker replicas.
    const throttle = await trx.query<{ChannelConnectionID:string;BusinessID:string}>(
      `SELECT TOP(1) t.ChannelConnectionID,t.BusinessID
       FROM dbo.TblWhatsAppCampaignThrottle t WITH(UPDLOCK,READPAST,ROWLOCK)
       WHERE t.NextAttemptAtUtc<=SYSUTCDATETIME()
         AND EXISTS (
           SELECT 1 FROM dbo.TblWhatsAppCampaignRun r
           JOIN dbo.TblWhatsAppCampaignRunItem i ON i.RunID=r.RunID
           WHERE r.ChannelConnectionID=t.ChannelConnectionID
             AND r.BusinessID=t.BusinessID AND r.Status IN(N'QUEUED',N'RUNNING')
             AND i.Status=N'PENDING')
       ORDER BY t.NextAttemptAtUtc,t.ChannelConnectionID`,
    );
    const t = throttle.recordset[0];
    if (!t) return null;
    const args = [b(t.BusinessID), c(t.ChannelConnectionID)];
    const daily = await trx.query<{AttemptCount:number}>(
      `SELECT COUNT_BIG(1) AS AttemptCount
       FROM dbo.TblWhatsAppCampaignRunItem item
       JOIN dbo.TblWhatsAppCampaignRun run ON run.RunID=item.RunID
       WHERE run.BusinessID=@businessId
         AND run.ChannelConnectionID=@channelConnectionId
         AND item.ClaimedAtUtc>DATEADD(HOUR,-24,SYSUTCDATETIME())`,
      args,
    );
    if (Number(daily.recordset[0]?.AttemptCount ?? 0) >= CAMPAIGN_MAX_ATTEMPTS_PER_24H) {
      await trx.execute(
        `UPDATE dbo.TblWhatsAppCampaignThrottle
         SET NextAttemptAtUtc=DATEADD(MINUTE,60,SYSUTCDATETIME())
         WHERE BusinessID=@businessId AND ChannelConnectionID=@channelConnectionId`,
        args,
      );
      return null;
    }

    const picked = await trx.query<Candidate>(
      `SELECT TOP(1) item.RunID,item.BusinessID,item.PhoneNormalized,item.ContactID,
              ch.ExternalAccountKey AS AccountKey,run.MessageText
       FROM dbo.TblWhatsAppCampaignRunItem item WITH(UPDLOCK,READPAST,ROWLOCK)
       JOIN dbo.TblWhatsAppCampaignRun run ON run.RunID=item.RunID
         AND run.BusinessID=item.BusinessID
       JOIN dbo.TblChannelConnection ch ON ch.ChannelConnectionID=run.ChannelConnectionID
         AND ch.BusinessID=run.BusinessID AND ch.IsActive=1 AND ch.Status=N'ACTIVE'
         AND ch.Channel=N'WHATSAPP' AND ch.ExternalAccountKey IS NOT NULL
       JOIN dbo.TblWhatsAppLabel label ON label.BusinessID=run.BusinessID
         AND label.ChannelConnectionID=run.ChannelConnectionID
         AND label.ProviderLabelID=run.ProviderLabelID AND label.IsDeleted=0
       JOIN dbo.TblWhatsAppContactLabel cl ON cl.BusinessID=item.BusinessID
         AND cl.ChannelConnectionID=run.ChannelConnectionID
         AND cl.ProviderLabelID=run.ProviderLabelID AND cl.ContactID=item.ContactID
         AND cl.IsActive=1
       JOIN dbo.TblWhatsAppCampaignPermission perm ON perm.BusinessID=item.BusinessID
         AND perm.ChannelConnectionID=run.ChannelConnectionID
         AND perm.PhoneNormalized=item.PhoneNormalized AND perm.Source=N'EXPLICIT_INBOUND'
       JOIN dbo.TblWhatsAppLabelCampaignDraft d ON d.BusinessID=run.BusinessID
         AND d.CampaignDraftID=run.CampaignDraftID AND d.Status=N'COPY_APPROVED'
         AND d.MessageText=run.MessageText
       WHERE run.BusinessID=@businessId AND run.ChannelConnectionID=@channelConnectionId
         AND run.Status IN(N'QUEUED',N'RUNNING') AND item.Status=N'PENDING'
         AND NOT EXISTS (SELECT 1 FROM dbo.TblWhatsAppCampaignOptOut stopped
           WHERE stopped.BusinessID=item.BusinessID
             AND stopped.ChannelConnectionID=run.ChannelConnectionID
             AND stopped.PhoneNormalized=item.PhoneNormalized)
         AND NOT EXISTS (SELECT 1 FROM dbo.TblWhatsAppCampaignRunItem oldItem
           JOIN dbo.TblWhatsAppCampaignRun oldRun ON oldRun.RunID=oldItem.RunID
           WHERE oldRun.BusinessID=item.BusinessID
             AND oldRun.ChannelConnectionID=run.ChannelConnectionID
             AND oldItem.PhoneNormalized=item.PhoneNormalized AND oldItem.Status=N'SENT'
             AND oldItem.CompletedAtUtc>DATEADD(HOUR,-24,SYSUTCDATETIME()))
       ORDER BY run.CreatedAtUtc,item.PhoneNormalized`,
      args,
    );
    const row = picked.recordset[0];
    if (!row) return null;
    const claimed = await trx.execute(
      `UPDATE dbo.TblWhatsAppCampaignRunItem
         SET Status=N'IN_FLIGHT',ClaimToken=@token,ClaimedAtUtc=SYSUTCDATETIME()
       WHERE RunID=@runId AND BusinessID=@businessId AND PhoneNormalized=@phone
         AND Status=N'PENDING'`,
      [
        b(t.BusinessID),
        {name:"runId",type:sql.UniqueIdentifier,value:row.RunID},
        {name:"phone",type:sql.NVarChar(32),value:row.PhoneNormalized},
        {name:"token",type:sql.UniqueIdentifier,value:claimToken},
      ],
    );
    if (claimed !== 1) return null;
    await trx.execute(
      `UPDATE dbo.TblWhatsAppCampaignRun SET Status=N'RUNNING',
          LastAttemptAtUtc=SYSUTCDATETIME(),UpdatedAtUtc=SYSUTCDATETIME()
       WHERE RunID=@runId AND BusinessID=@businessId AND Status IN(N'QUEUED',N'RUNNING')`,
      [
        b(t.BusinessID),
        {name:"runId",type:sql.UniqueIdentifier,value:row.RunID},
      ],
    );
    await trx.execute(
      `UPDATE dbo.TblWhatsAppCampaignThrottle
       SET NextAttemptAtUtc=DATEADD(SECOND,60,SYSUTCDATETIME())
       WHERE BusinessID=@businessId AND ChannelConnectionID=@channelConnectionId`,
      args,
    );
    return {
      RunID:row.RunID,BusinessID:row.BusinessID,
      PhoneNormalized:row.PhoneNormalized,ClaimToken:claimToken,
      AccountKey:row.AccountKey,MessageText:row.MessageText,
    };
  });
}
