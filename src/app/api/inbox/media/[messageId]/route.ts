import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { query, sql } from "@/lib/db";
import { requireApiBusiness } from "@/lib/api/auth-context";
import { handleApiError, jsonError } from "@/lib/api/http";

export async function GET(_: Request, context: { params: Promise<{ messageId: string }> }) {
  try {
    const { businessId } = await requireApiBusiness();
    const { messageId } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(messageId)) return jsonError("Invalid message ID", 400);
    const result = await query<{ MediaStorageKey: string | null; MediaMimeType: string | null; MediaFileName: string | null }>(
      "SELECT MediaStorageKey, MediaMimeType, MediaFileName FROM dbo.TblMessage WHERE BusinessID=@businessId AND MessageID=@messageId",
      [
        { name: "businessId", type: sql.UniqueIdentifier, value: businessId },
        { name: "messageId", type: sql.UniqueIdentifier, value: messageId },
      ],
    );
    const media = result.recordset[0];
    if (!media?.MediaStorageKey || !/^[0-9a-f]{64}$/.test(media.MediaStorageKey)) return jsonError("Media unavailable", 404);
    const root = process.env.DRVO_MEDIA_STORAGE_DIR || join(process.cwd(), "data", "whatsapp-media");
    let buffer;
    try { buffer = await readFile(join(root, media.MediaStorageKey)); }
    catch { return jsonError("Media unavailable", 404); }
    const allowed = ["image/jpeg", "image/png", "image/webp", "image/gif", "audio/ogg", "audio/mpeg", "audio/mp4", "video/mp4", "video/webm", "application/pdf"];
    const mime = allowed.includes(media.MediaMimeType || "") ? media.MediaMimeType! : "application/octet-stream";
    const name = (media.MediaFileName || "attachment").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 90);
    return new Response(new Uint8Array(buffer), { headers: {
      "Content-Type": mime,
      "Content-Length": String(buffer.length),
      "Content-Disposition": "attachment; filename=" + name,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    } });
  } catch (error) { return handleApiError(error); }
}
