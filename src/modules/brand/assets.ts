import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, rename, rm, stat, unlink, writeFile } from "node:fs/promises";
import { isAbsolute, join } from "node:path";

import { ConflictError, NotFoundError, ValidationError } from "@/lib/tenancy/errors";

/**
 * Filesystem-backed Brand Library: deliberately no SQL schema or migration.
 * Root must live outside /home/drvowa/app and be writable only by the app service.
 * A production deploy explicitly provisions /var/lib/drvowa/brand-assets at 0700.
 */
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
export type BrandImage = { mime: string; data: Uint8Array };

type StoredAsset = Omit<BrandAssetMeta, "active" | "activatedAt"> & { uploadedBy: string };
type PublishedPointer = { id: string; activatedAt: string };
export const MAX_BRAND_FILE_BYTES = 2 * 1024 * 1024;
const MAX_VERSIONS_PER_VARIANT = 40;
const TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function root(): string {
  const directory = process.env.DRVO_BRAND_ASSET_DIR || "/var/lib/drvowa/brand-assets";
  if (!isAbsolute(directory) || directory === "/" || directory.includes("\0")) {
    throw new Error("Brand assets directory must be an absolute private path");
  }
  return directory;
}

async function ensureDirectory(): Promise<string> {
  const directory = root();
  for (const part of ["", "assets", "images", "published", "locks"]) {
    await mkdir(join(directory, part), { recursive: true, mode: 0o700 });
  }
  return directory;
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

export function isBrandVariant(value: string): value is BrandVariant {
  return (BRAND_VARIANTS as readonly string[]).includes(value);
}

export async function validateBrandImage(file: File): Promise<{ mime: string; name: string; data: Buffer }> {
  if (!TYPES.some((type) => type === file.type)) {
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

async function readAsset(id: string): Promise<StoredAsset | null> {
  if (!UUID.test(id)) return null;
  try {
    const payload = await readFile(join(root(), "assets", id + ".json"), "utf8");
    const value = JSON.parse(payload) as StoredAsset;
    return value.id === id && isBrandVariant(value.variant) && TYPES.some((type) => type === value.mimeType)
      ? value : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function readPublished(variant: BrandVariant): Promise<PublishedPointer | null> {
  try {
    const value = JSON.parse(await readFile(join(root(), "published", variant + ".json"), "utf8")) as PublishedPointer;
    return typeof value.id === "string" && UUID.test(value.id) &&
      typeof value.activatedAt === "string" ? value : null;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function withVariantLock<T>(variant: BrandVariant, work: () => Promise<T>): Promise<T> {
  const path = join(root(), "locks", variant + ".lock");
  let acquired = false;
  for (let attempt = 0; attempt < 35; attempt += 1) {
    try {
      await mkdir(path, { mode: 0o700 });
      acquired = true;
      break;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
      try {
        const age = Date.now() - (await stat(path)).mtimeMs;
        if (age > 60_000) await rm(path, { recursive: true, force: true });
      } catch (cause) {
        if ((cause as NodeJS.ErrnoException).code !== "ENOENT") throw cause;
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 60));
    }
  }
  if (!acquired) throw new ConflictError("فيه تعديل تاني على نفس اللوجو، حاول مرة تانية.");
  try {
    return await work();
  } finally {
    await rm(path, { recursive: true, force: true });
  }
}

export async function listBrandAssets(): Promise<BrandAssetMeta[]> {
  await ensureDirectory();
  const names = (await readdir(join(root(), "assets"))).filter((name) => UUID.test(name.replace(/\.json$/, "")) && name.endsWith(".json"));
  const rows = (await Promise.all(names.map((name) => readAsset(name.slice(0, -5)))))
    .filter((value): value is StoredAsset => value !== null);
  const pointers = new Map(await Promise.all(BRAND_VARIANTS.map(async (variant) =>
    [variant, await readPublished(variant)] as const)));
  return rows.map((row) => {
    const pointer = pointers.get(row.variant);
    const active = pointer?.id === row.id;
    return {
      id: row.id,
      variant: row.variant,
      fileName: row.fileName,
      mimeType: row.mimeType,
      size: row.size,
      uploadedAt: row.uploadedAt,
      active,
      activatedAt: active ? (pointer?.activatedAt ?? null) : null,
    };
  }).sort((a, b) => a.variant.localeCompare(b.variant) || b.uploadedAt.localeCompare(a.uploadedAt));
}

export async function stageBrandAsset(params: {
  variant: BrandVariant;
  file: File;
  userId: string;
}): Promise<string> {
  if (!isBrandVariant(params.variant)) throw new ValidationError("نوع اللوجو غير صالح.");
  const image = await validateBrandImage(params.file);
  await ensureDirectory();
  if ((await listBrandAssets()).filter((asset) => asset.variant === params.variant).length >= MAX_VERSIONS_PER_VARIANT) {
    throw new ValidationError("وصلت للحد الأقصى من النسخ. احذف نسخة قديمة غير منشورة.");
  }
  const id = randomUUID();
  const metadata: StoredAsset = {
    id,
    variant: params.variant,
    fileName: image.name,
    mimeType: image.mime,
    size: image.data.length,
    uploadedBy: params.userId,
    uploadedAt: new Date().toISOString(),
  };
  const binaryPath = join(root(), "images", id + ".bin");
  const metadataPath = join(root(), "assets", id + ".json");
  await writeFile(binaryPath, image.data, { flag: "wx", mode: 0o600 });
  try {
    await writeFile(metadataPath, JSON.stringify(metadata), { flag: "wx", mode: 0o600 });
  } catch (error) {
    await unlink(binaryPath);
    throw error;
  }
  return id;
}

export async function activateBrandAsset(id: string): Promise<void> {
  const asset = await readAsset(id);
  if (!asset) throw new NotFoundError("نسخة اللوجو غير موجودة.");
  await ensureDirectory();
  await withVariantLock(asset.variant, async () => {
    if (!(await readAsset(id))) throw new NotFoundError("نسخة اللوجو غير موجودة.");
    const target = join(root(), "published", asset.variant + ".json");
    const tmp = join(root(), "published", "." + randomUUID() + ".tmp");
    await writeFile(tmp, JSON.stringify({ id, activatedAt: new Date().toISOString() }), { flag: "wx", mode: 0o600 });
    try {
      await rename(tmp, target);
    } catch (error) {
      await unlink(tmp).catch(() => undefined);
      throw error;
    }
  });
}

export async function deleteDraftBrandAsset(id: string): Promise<void> {
  const asset = await readAsset(id);
  if (!asset) throw new NotFoundError("نسخة اللوجو غير موجودة.");
  await ensureDirectory();
  await withVariantLock(asset.variant, async () => {
    if ((await readPublished(asset.variant))?.id === id) {
      throw new ConflictError("لا يمكن حذف اللوجو المنشور. اعتمد نسخة أخرى أولًا.");
    }
    await unlink(join(root(), "assets", id + ".json"));
    await unlink(join(root(), "images", id + ".bin"));
  });
}

export async function getBrandImageById(id: string): Promise<BrandImage | null> {
  const asset = await readAsset(id);
  if (!asset) return null;
  try {
    const data = await readFile(join(root(), "images", id + ".bin"));
    return { mime: asset.mimeType, data: new Uint8Array(data) };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

export async function getPublishedBrandImage(variant: BrandVariant): Promise<BrandImage | null> {
  const pointer = await readPublished(variant);
  if (!pointer) return null;
  const asset = await readAsset(pointer.id);
  if (!asset || asset.variant !== variant) return null;
  return getBrandImageById(pointer.id);
}
