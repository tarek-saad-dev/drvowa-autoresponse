import { randomUUID } from "node:crypto";

import { query, sql, withTransaction } from "@/lib/db";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/tenancy/errors";

export const BRAND_VARIANTS = ["primary-dark", "primary-light", "compact", "stacked", "icon"] as const;
export type BrandVariant = (typeof BRAND_VARIANTS)[number];
export type BrandAssetMeta = {
  id: string;
  variant: BrandVariant;
  fileName: string;
  mimeType: string;
  size: number;
  active: boolean;
  uploadedAt: string;
  activatedAt: string | null;
};

type Row = {
  AssetID: string;
  Variant: BrandVariant;
  OriginalName: string;
  MimeType: string;
  FileSizeBytes: number;
  IsActive: boolean;
  UploadedAtUtc: Date;
  ActivatedAtUtc: Date | null;
};
type BinaryRow = { MimeType: string; ImageBytes: Buffer };
export type BrandImage = { mime: string; data: Uint8Array };

export const MAX_BRAND_FILE_BYTES = 2 * 1024 * 1024;
const types = ["image/png", "image/webp", "image/jpeg"] as const;

export function isBrandVariant(value: string): value is BrandVariant {
  return (BRAND_VARIANTS as readonly string[]).includes(value);
}

function checkedImage(data: Buffer, mime: string): void {
  const png = mime === "image/png" && data.length >= 24 &&
    data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    data.toString("ascii", 12, 16) === "IHDR";
  const jpg = mime === "image/jpeg" && data.length >= 4 &&
    data[0] === 0xff && data[1] === 0xd8 && data[data.length - 2] === 0xff && data[data.length - 1] === 0xd9;
  const webp = mime === "image/webp" && data.length >= 20 &&
    data.toString("ascii", 0, 4) === "RIFF" &&
    data.toString("ascii", 8, 12) === "WEBP" &&
    data.readUInt32LE(4) === data.length - 8 &&
    ["VP8 ", "VP8L", "VP8X"].includes(data.toString("ascii", 12, 16));
  if (!png && !jpg && !webp) {
    throw new ValidationError("محتوى الصورة غير صالح أو نوع الملف غير مدعوم.");
  }
  if (png) {
    const width = data.readUInt32BE(16);
    const height = data.readUInt32BE(20);
    if (width < 1 || height < 1 || width > 4096 || height > 4096) {
      throw new ValidationError("أبعاد PNG لازم تكون بين 1 و4096 بكسل.");
    }
  }
}

export async function validateBrandImage(file: File): Promise<{ mime: string; name: string; data: Buffer }> {
  if (!types.some((type) => type === file.type)) {
    throw new ValidationError("المتاح للرفع PNG أو JPG أو WebP فقط. SVG غير مدعوم لأسباب أمنية.");
  }
  if (file.size < 1 || file.size > MAX_BRAND_FILE_BYTES) {
    throw new ValidationError("حجم الصورة لازم يكون أقل من 2 ميجابايت.");
  }
  const data = Buffer.from(await file.arrayBuffer());
  if (data.length !== file.size) throw new ValidationError("ملف الصورة غير مكتمل.");
  checkedImage(data, file.type);
  const name = file.name.replace(/[\x00-\x1f\x7f/\\]/g, "").slice(0, 180) || "brand-image";
  return { mime: file.type, name, data };
}

function mapRow(row: Row): BrandAssetMeta {
  return {
    id: row.AssetID,
    variant: row.Variant,
    fileName: row.OriginalName,
    mimeType: row.MimeType,
    size: row.FileSizeBytes,
    active: Boolean(row.IsActive),
    uploadedAt: new Date(row.UploadedAtUtc).toISOString(),
    activatedAt: row.ActivatedAtUtc ? new Date(row.ActivatedAtUtc).toISOString() : null,
  };
}

export async function listBrandAssets(): Promise<BrandAssetMeta[]> {
  const { recordset } = await query<Row>(`SELECT AssetID, Variant, OriginalName, MimeType,
      FileSizeBytes, IsActive, UploadedAtUtc, ActivatedAtUtc
      FROM dbo.TblBrandAsset ORDER BY Variant, UploadedAtUtc DESC`);
  return recordset.map(mapRow);
}

export async function stageBrandAsset(params: {
  variant: BrandVariant; file: File; userId: string;
}): Promise<string> {
  const image = await validateBrandImage(params.file);
  const id = randomUUID();
  await query(`INSERT INTO dbo.TblBrandAsset
    (AssetID, Variant, OriginalName, MimeType, FileSizeBytes, ImageBytes, UploadedByUserID)
    VALUES (@id, @variant, @fileName, @mime, @size, @bytes, @userId)`, [
    { name: "id", type: sql.UniqueIdentifier, value: id },
    { name: "variant", type: sql.NVarChar(32), value: params.variant },
    { name: "fileName", type: sql.NVarChar(180), value: image.name },
    { name: "mime", type: sql.NVarChar(32), value: image.mime },
    { name: "size", type: sql.Int, value: image.data.length },
    { name: "bytes", type: sql.VarBinary(sql.MAX), value: image.data },
    { name: "userId", type: sql.UniqueIdentifier, value: params.userId },
  ]);
  return id;
}

export async function activateBrandAsset(id: string): Promise<void> {
  await withTransaction(async (trx) => {
    const { recordset } = await trx.query<{ Variant: BrandVariant }>(
      `SELECT Variant FROM dbo.TblBrandAsset WITH (UPDLOCK, HOLDLOCK) WHERE AssetID=@id`,
      [{ name: "id", type: sql.UniqueIdentifier, value: id }],
    );
    const variant = recordset[0]?.Variant;
    if (!variant) throw new NotFoundError("نسخة اللوجو غير موجودة.");
    await trx.execute(`UPDATE dbo.TblBrandAsset SET IsActive=0
      WHERE Variant=@variant AND IsActive=1`, [
      { name: "variant", type: sql.NVarChar(32), value: variant },
    ]);
    const n = await trx.execute(`UPDATE dbo.TblBrandAsset
      SET IsActive=1, ActivatedAtUtc=SYSUTCDATETIME() WHERE AssetID=@id`, [
      { name: "id", type: sql.UniqueIdentifier, value: id },
    ]);
    if (n !== 1) throw new ConflictError("تعذر اعتماد اللوجو.");
  });
}

export async function deleteDraftBrandAsset(id: string): Promise<void> {
  const n = await query(`DELETE FROM dbo.TblBrandAsset
    WHERE AssetID=@id AND IsActive=0`, [
    { name: "id", type: sql.UniqueIdentifier, value: id },
  ]);
  if (!n.rowsAffected.some((count) => count === 1)) {
    throw new ConflictError("لا يمكن حذف اللوجو المنشور. اعتمد نسخة أخرى أولًا.");
  }
}

export async function getPublishedBrandImage(variant: BrandVariant): Promise<BrandImage | null> {
  const { recordset } = await query<BinaryRow>(
    `SELECT TOP (1) MimeType, ImageBytes FROM dbo.TblBrandAsset
     WHERE Variant=@variant AND IsActive=1`, [
      { name: "variant", type: sql.NVarChar(32), value: variant },
    ],
  );
  const row = recordset[0];
  return row ? { mime: row.MimeType, data: new Uint8Array(row.ImageBytes) } : null;
}

export async function getBrandImageById(id: string): Promise<BrandImage | null> {
  const { recordset } = await query<BinaryRow>(
    `SELECT TOP (1) MimeType, ImageBytes FROM dbo.TblBrandAsset WHERE AssetID=@id`, [
      { name: "id", type: sql.UniqueIdentifier, value: id },
    ],
  );
  const row = recordset[0];
  return row ? { mime: row.MimeType, data: new Uint8Array(row.ImageBytes) } : null;
}
