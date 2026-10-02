/**
 * Ürün görselleri — veritabanında saklanır (Y-18). Görsel tarayıcıda küçültülüp yüklenir; sunucu türü dosya
 * imzasından (ilk baytlar) doğrular, istemcinin bildirdiği türe güvenmez. SVG/HTML kabul edilmez.
 * Adres /gorsel/<id>.<uzantı> değişmez: içerik değişirse yeni kayıt (yeni adres) oluşur, eski adres uzun süre
 * önbellekte kalabilir.
 */

import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/prisma";

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_IMAGES_PER_PRODUCT = 12;

export type ImageType = "image/jpeg" | "image/png" | "image/webp";

const EXT: Record<ImageType, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

/** Dosya imzasından tür: JPEG (FF D8 FF), PNG (89 50 4E 47 0D 0A 1A 0A), WebP (RIFF....WEBP) */
export function detectImageType(b: Uint8Array): ImageType | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => b[i] === v)) return "image/png";
  if (
    b.length >= 12 &&
    String.fromCharCode(b[0], b[1], b[2], b[3]) === "RIFF" &&
    String.fromCharCode(b[8], b[9], b[10], b[11]) === "WEBP"
  ) {
    return "image/webp";
  }
  return null;
}

export const uploadedImageUrl = (id: string, type: ImageType) => `/gorsel/${id}.${EXT[type]}`;

/** "/gorsel/<id>.<uzantı>" → id (yalnız bizim adres biçimimiz) */
export function uploadedImageIdFromUrl(url: string): string | null {
  const m = /^\/gorsel\/([a-z0-9]{20,40})\.(?:webp|jpg|png)$/.exec(url);
  return m ? m[1] : null;
}

export function parseImageFileName(file: string): { id: string; ext: string } | null {
  const m = /^([a-z0-9]{20,40})\.(webp|jpg|png)$/.exec(file);
  return m ? { id: m[1], ext: m[2] } : null;
}

export class ImageUploadError extends Error {
  constructor(
    message: string,
    public readonly status = 400
  ) {
    super(message);
    this.name = "ImageUploadError";
  }
}

const dim = (v: number | null | undefined) => (Number.isInteger(v) && (v as number) > 0 && (v as number) <= 20_000 ? (v as number) : null);

export async function addProductImage(
  productId: string,
  bytes: Uint8Array,
  opts: { altText?: string | null; width?: number | null; height?: number | null; actorId: string | null }
) {
  if (bytes.length === 0) throw new ImageUploadError("Dosya boş.");
  if (bytes.length > MAX_IMAGE_BYTES) throw new ImageUploadError("Görsel 2 MB'tan büyük; daha küçük bir fotoğraf seçin.", 413);
  const type = detectImageType(bytes);
  if (!type) throw new ImageUploadError("Yalnız JPEG, PNG ya da WebP fotoğraf yüklenebilir.", 415);

  return prisma.$transaction(async (tx) => {
    const product = await tx.product.findUnique({ where: { id: productId }, select: { id: true, name: true } });
    if (!product) throw new ImageUploadError("Ürün bulunamadı.", 404);
    const existing = await tx.productImage.findMany({ where: { productId }, select: { sortOrder: true } });
    if (existing.length >= MAX_IMAGES_PER_PRODUCT) {
      throw new ImageUploadError(`Bir üründe en fazla ${MAX_IMAGES_PER_PRODUCT} fotoğraf olabilir.`);
    }
    const uploaded = await tx.uploadedImage.create({
      data: {
        contentType: type,
        data: Buffer.from(bytes),
        byteSize: bytes.length,
        width: dim(opts.width),
        height: dim(opts.height),
        sha256: createHash("sha256").update(bytes).digest("hex"),
        createdById: opts.actorId,
      },
      select: { id: true },
    });
    return tx.productImage.create({
      data: {
        productId,
        url: uploadedImageUrl(uploaded.id, type),
        altText: opts.altText?.trim().slice(0, 500) || product.name,
        sortOrder: existing.reduce((max, i) => Math.max(max, i.sortOrder), -1) + 1,
      },
    });
  });
}

/** Görseli üründen kaldırır; yüklenmiş görselse ve başka yerde kullanılmıyorsa verisi de silinir */
export async function removeProductImage(productId: string, imageId: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const image = await tx.productImage.findFirst({ where: { id: imageId, productId } });
    if (!image) return false;
    await tx.productImage.delete({ where: { id: image.id } });
    const uploadedId = uploadedImageIdFromUrl(image.url);
    if (uploadedId) {
      const stillUsed = await tx.productImage.count({ where: { url: image.url } });
      if (stillUsed === 0) await tx.uploadedImage.deleteMany({ where: { id: uploadedId } });
    }
    return true;
  });
}

/** Açıklama metni ve/veya kapak fotoğrafı (ilk sıra) */
export async function updateProductImage(
  productId: string,
  imageId: string,
  input: { altText?: string | null; makePrimary?: boolean }
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const images = await tx.productImage.findMany({ where: { productId }, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] });
    const target = images.find((i) => i.id === imageId);
    if (!target) return false;
    if (input.altText !== undefined) {
      await tx.productImage.update({ where: { id: imageId }, data: { altText: input.altText?.trim().slice(0, 500) || null } });
    }
    if (input.makePrimary) {
      const ordered = [target, ...images.filter((i) => i.id !== imageId)];
      for (let i = 0; i < ordered.length; i++) {
        if (ordered[i].sortOrder !== i) await tx.productImage.update({ where: { id: ordered[i].id }, data: { sortOrder: i } });
      }
    }
    return true;
  });
}
