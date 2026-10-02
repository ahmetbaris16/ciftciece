/**
 * GET /gorsel/<id>.<uzantı> — admin'den yüklenen ürün görseli (veritabanından). Adres değişmez; tarayıcı ve
 * görsel optimizasyonu bir yıl önbellekler. Tür, kayıttaki (yüklemede dosya imzasından doğrulanmış) türdür.
 */

import { prisma } from "@/lib/db/prisma";
import { USE_DB } from "@/lib/data/source";
import { parseImageFileName } from "@/lib/images/product-images";

const EXT_TYPE: Record<string, string> = { webp: "image/webp", jpg: "image/jpeg", png: "image/png" };

export async function GET(_request: Request, context: { params: Promise<{ file: string }> }) {
  const { file } = await context.params;
  const parsed = parseImageFileName(file);
  if (!parsed || !USE_DB) return new Response("Bulunamadı", { status: 404 });
  const image = await prisma.uploadedImage.findUnique({
    where: { id: parsed.id },
    select: { contentType: true, data: true, sha256: true },
  });
  if (!image || EXT_TYPE[parsed.ext] !== image.contentType) return new Response("Bulunamadı", { status: 404 });
  return new Response(new Uint8Array(image.data), {
    headers: {
      "Content-Type": image.contentType,
      "Content-Length": String(image.data.length),
      "Cache-Control": "public, max-age=31536000, immutable",
      ETag: `"${image.sha256}"`,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
    },
  });
}
