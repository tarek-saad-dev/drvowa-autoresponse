import { createHash, randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { query, sql } from "@/lib/db";
import { requireRuntimeBearer } from "@/lib/api/runtime-auth";
import { handleApiError, jsonError, jsonOk } from "@/lib/api/http";
import { resolveChannelByExternalAccountKey } from "@/modules/messaging/repository";

const MAX_MEDIA_BYTES = 24 * 1024 * 1024;
const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/gif",
  "audio/ogg", "audio/mpeg", "audio/mp4", "audio/aac", "video/mp4", "video/webm",
  "application/pdf", "application/octet-stream"];

export async function POST(request: Request) {
  try {
    requireRuntimeBearer(request.headers.get("authorization"));
    const accountKey = request.headers.get("x-drvo-account-key") || "";
    const providerId = request.headers.get("x-drvo-provider-message-id") || "";
    const mime = (request.headers.get("x-drvo-media-mime") || "").toLowerCase();
    const fileName = (request.headers.get("x-drvo-media-name") || "").slice(0, 256);
    const length = Number(request.headers.get("content-length"));
    if (!accountKey || accountKey.length>64 || !providerId || providerId.length>256 || !ALLOWED.includes(mime))
      return jsonError("Invalid media metadata", 400);
    if (!Number.isFinite(length) || length<1 || length>MAX_MEDIA_BYTES)
      return jsonError("Invalid media size", 413);
    const channel = await resolveChannelByExternalAccountKey(accountKey);
    if (!channel) return jsonError("Unknown account", 404);
    const params = [
      { name: "businessId", type: sql.UniqueIdentifier, value: channel.businessId },
      { name: "channelId", type: sql.UniqueIdentifier, value: channel.channelConnectionId },
      { name: "providerId", type: sql.NVarChar(256), value: providerId },
    ];
    const existing = await query<{ MessageID: string; MediaStorageKey: string | null }>(
      "SELECT TOP 1 MessageID, MediaStorageKey FROM dbo.TblMessage WHERE BusinessID=@businessId AND ChannelConnectionID=@channelId AND ProviderMessageID=@providerId",
      params,
    );
    if (!existing.recordset.length) return jsonError("Message not synced yet", 409);
    if (existing.recordset[0].MediaStorageKey) return jsonOk({ stored: true, duplicate: true });
    const reader = request.body?.getReader();
    if (!reader) return jsonError("Empty media", 400);
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size>MAX_MEDIA_BYTES) { await reader.cancel(); return jsonError("Media too large", 413); }
      chunks.push(value);
    }
    if (size !== length) return jsonError("Incomplete media", 400);
    const bytes = Buffer.concat(chunks.map(chunk=>Buffer.from(chunk)));
    const key = createHash("sha256").update(channel.channelConnectionId + ":" + providerId).digest("hex");
    const folder = process.env.DRVO_MEDIA_STORAGE_DIR || join(process.cwd(), "data", "whatsapp-media");
    await mkdir(folder, { recursive: true, mode: 0o700 });
    const temp = join(folder, "." + randomUUID());
    try {
      await writeFile(temp, bytes, { mode: 0o600 });
      await rename(temp, join(folder, key));
    } finally { await rm(temp, { force: true }).catch(() => {}); }
    await query(
      "UPDATE dbo.TblMessage SET MediaStorageKey=@key, MediaMimeType=@mime, MediaFileName=COALESCE(MediaFileName,@name), MediaSizeBytes=@size WHERE BusinessID=@businessId AND ChannelConnectionID=@channelId AND ProviderMessageID=@providerId",
      [...params,
        { name: "key", type: sql.NVarChar(128), value: key },
        { name: "mime", type: sql.NVarChar(128), value: mime },
        { name: "name", type: sql.NVarChar(256), value: fileName || null },
        { name: "size", type: sql.BigInt, value: size },
      ],
    );
    return jsonOk({ stored: true, size });
  } catch (error) { return handleApiError(error); }
}
