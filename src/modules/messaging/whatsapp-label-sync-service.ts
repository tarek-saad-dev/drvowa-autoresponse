import { query, sql, type TransactionClient } from "@/lib/db";
import { canonicalizeWhatsAppContactIdentity } from "./whatsapp-identity";
import { upsertContact } from "./repository";

export type LabelSyncEvent =
  | { kind: "label"; labelId: string; name?: string | null; color?: number | null; deleted?: boolean }
  | { kind: "labelAssociation"; labelId: string; contactKey: string; action: "add" | "remove" };

type ChannelScope = { businessId: string; channelConnectionId: string };

const scopeParams = (channel: ChannelScope, labelId: string) => [
  { name: "businessId", type: sql.UniqueIdentifier, value: channel.businessId },
  { name: "channelConnectionId", type: sql.UniqueIdentifier, value: channel.channelConnectionId },
  { name: "labelId", type: sql.NVarChar(128), value: labelId },
];

/** No message insertion, campaign scheduling or AI triggers on label changes. */
export async function ingestWhatsAppLabelEvent(
  event: LabelSyncEvent,
  channel: ChannelScope,
  trx: TransactionClient,
): Promise<"label" | "association"> {
  const base = scopeParams(channel, event.labelId);

  if (event.kind === "label") {
    await trx.execute(
      `MERGE dbo.TblWhatsAppLabel WITH (HOLDLOCK) AS dst
       USING (SELECT @businessId AS BusinessID, @channelConnectionId AS ChannelConnectionID,
                     @labelId AS ProviderLabelID) AS src
       ON dst.BusinessID=src.BusinessID AND dst.ChannelConnectionID=src.ChannelConnectionID
          AND dst.ProviderLabelID=src.ProviderLabelID
       WHEN MATCHED THEN UPDATE SET
         LabelName=COALESCE(@labelName, dst.LabelName),
         Color=COALESCE(@color, dst.Color),
         IsDeleted=@deleted,
         UpdatedAtUtc=SYSUTCDATETIME()
       WHEN NOT MATCHED THEN INSERT
         (BusinessID, ChannelConnectionID, ProviderLabelID, LabelName, Color, IsDeleted)
         VALUES (src.BusinessID, src.ChannelConnectionID, src.ProviderLabelID,
                 @labelName, @color, @deleted);`,
      [
        ...base,
        { name: "labelName", type: sql.NVarChar(200), value: event.name ?? null },
        { name: "color", type: sql.Int, value: event.color ?? null },
        { name: "deleted", type: sql.Bit, value: Boolean(event.deleted) },
      ],
    );
    if (event.deleted) {
      await trx.execute(
        `UPDATE dbo.TblWhatsAppContactLabel SET IsActive=0, UpdatedAtUtc=SYSUTCDATETIME()
         WHERE BusinessID=@businessId AND ChannelConnectionID=@channelConnectionId
           AND ProviderLabelID=@labelId AND IsActive=1`,
        base,
      );
    }
    return "label";
  }

  const identity = canonicalizeWhatsAppContactIdentity({ externalContactKey: event.contactKey });
  // Prevent LID-only or group identities from becoming sendable audiences.
  if (!identity.phoneNormalized || !/^\d{8,15}$/.test(identity.phoneNormalized)) {
    throw new Error("LABEL_ASSOCIATION_REQUIRES_RESOLVED_PHONE");
  }
  const contact = await upsertContact({
    businessId: channel.businessId,
    channelConnectionId: channel.channelConnectionId,
    externalContactKey: identity.canonicalExternalContactKey,
    phoneNormalized: identity.phoneNormalized,
  }, trx);

  // Unknown label IDs are placeholders, NOT selectable until name is known.
  await trx.execute(
    `MERGE dbo.TblWhatsAppLabel WITH (HOLDLOCK) AS dst
     USING (SELECT @businessId AS BusinessID, @channelConnectionId AS ChannelConnectionID,
                   @labelId AS ProviderLabelID) AS src
     ON dst.BusinessID=src.BusinessID AND dst.ChannelConnectionID=src.ChannelConnectionID
        AND dst.ProviderLabelID=src.ProviderLabelID
     WHEN NOT MATCHED THEN INSERT (BusinessID, ChannelConnectionID, ProviderLabelID)
       VALUES (src.BusinessID, src.ChannelConnectionID, src.ProviderLabelID);`,
    base,
  );
  await trx.execute(
    `MERGE dbo.TblWhatsAppContactLabel WITH (HOLDLOCK) AS dst
     USING (SELECT @businessId AS BusinessID, @channelConnectionId AS ChannelConnectionID,
                   @labelId AS ProviderLabelID, @contactId AS ContactID) AS src
     ON dst.BusinessID=src.BusinessID AND dst.ChannelConnectionID=src.ChannelConnectionID
       AND dst.ProviderLabelID=src.ProviderLabelID AND dst.ContactID=src.ContactID
     WHEN MATCHED THEN UPDATE SET IsActive=@active, UpdatedAtUtc=SYSUTCDATETIME()
     WHEN NOT MATCHED THEN INSERT (BusinessID, ChannelConnectionID, ProviderLabelID, ContactID, IsActive)
       VALUES (src.BusinessID, src.ChannelConnectionID, src.ProviderLabelID, src.ContactID, @active);`,
    [
      ...base,
      { name: "contactId", type: sql.UniqueIdentifier, value: contact.contactId },
      { name: "active", type: sql.Bit, value: event.action === "add" },
    ],
  );
  return "association";
}

type LabelListRow = {
  ChannelConnectionID: string;
  ProviderLabelID: string;
  LabelName: string | null;
  Color: number | null;
  IsDeleted: boolean;
  ContactCount: number;
};

export async function listMirroredWhatsAppLabels(businessId: string) {
  const result = await query<LabelListRow>(
    `SELECT l.ChannelConnectionID, l.ProviderLabelID, l.LabelName, l.Color, l.IsDeleted,
            COUNT(cl.ContactID) AS ContactCount
     FROM dbo.TblWhatsAppLabel l
     INNER JOIN dbo.TblChannelConnection ch
       ON ch.BusinessID=l.BusinessID AND ch.ChannelConnectionID=l.ChannelConnectionID
       AND ch.Channel=N'WHATSAPP' AND ch.IsActive=1
     LEFT JOIN dbo.TblWhatsAppContactLabel cl
       ON cl.BusinessID=l.BusinessID AND cl.ChannelConnectionID=l.ChannelConnectionID
       AND cl.ProviderLabelID=l.ProviderLabelID AND cl.IsActive=1
     WHERE l.BusinessID=@businessId
     GROUP BY l.ChannelConnectionID, l.ProviderLabelID, l.LabelName, l.Color, l.IsDeleted
     ORDER BY l.LabelName, l.ProviderLabelID`,
    [{ name: "businessId", type: sql.UniqueIdentifier, value: businessId }],
  );
  return result.recordset.map(r => ({
    channelConnectionId: r.ChannelConnectionID,
    id: r.ProviderLabelID,
    name: r.LabelName,
    color: r.Color,
    deleted: Boolean(r.IsDeleted),
    observedContacts: Number(r.ContactCount),
  }));
}
