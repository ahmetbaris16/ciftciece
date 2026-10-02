/**
 * POST /api/admin/products/[id]/images — ürün fotoğrafı yükler (multipart/form-data: file, altText?, width?,
 * height?). Fotoğraf tarayıcıda küçültülmüş gelir; sunucu türü dosya imzasından doğrular, en fazla 2 MB.
 */

import { NextRequest, NextResponse } from "next/server";
import { requireAdminApi } from "@/lib/auth/session";
import { isSameOrigin } from "@/lib/security/same-origin";
import { USE_DB } from "@/lib/data/source";
import { addProductImage, ImageUploadError, MAX_IMAGE_BYTES } from "@/lib/images/product-images";
import { createAuditLog } from "@/lib/security/audit";
import { revalidateStorefront } from "@/lib/cache/revalidate";

const intField = (v: FormDataEntryValue | null) => (typeof v === "string" && /^\d{1,5}$/.test(v) ? Number(v) : null);

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Geçersiz istek kaynağı." }, { status: 403 });
  const user = await requireAdminApi();
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  if (!USE_DB) return NextResponse.json({ error: "Veritabanı bağlı değil." }, { status: 503 });
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_IMAGE_BYTES + 64 * 1024) {
    return NextResponse.json({ error: "Görsel 2 MB'tan büyük; daha küçük bir fotoğraf seçin." }, { status: 413 });
  }

  const { id } = await context.params;
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!form || !(file instanceof Blob)) return NextResponse.json({ error: "Fotoğraf seçin." }, { status: 400 });
  if (file.size > MAX_IMAGE_BYTES) {
    return NextResponse.json({ error: "Görsel 2 MB'tan büyük; daha küçük bir fotoğraf seçin." }, { status: 413 });
  }

  try {
    const altText = form.get("altText");
    const image = await addProductImage(id, new Uint8Array(await file.arrayBuffer()), {
      altText: typeof altText === "string" ? altText : null,
      width: intField(form.get("width")),
      height: intField(form.get("height")),
      actorId: user.id,
    });
    await createAuditLog({ userId: user.id, action: "product.image_added", entity: "product", entityId: id, details: { imageId: image.id, bytes: file.size } });
    revalidateStorefront();
    return NextResponse.json({ ok: true, image: { id: image.id, url: image.url, altText: image.altText, sortOrder: image.sortOrder } }, { status: 201 });
  } catch (err) {
    if (err instanceof ImageUploadError) return NextResponse.json({ error: err.message }, { status: err.status });
    console.error("[admin/products/images POST]", err);
    return NextResponse.json({ error: "Fotoğraf kaydedilemedi. Tekrar deneyin." }, { status: 500 });
  }
}
