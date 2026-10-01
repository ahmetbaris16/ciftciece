/**
 * Admin — Ürün değerlendirmeleri (müşteri yorumları) moderasyonu
 *
 * GET    /api/admin/product-reviews          — tümü (en son güncellenen önce)
 * PATCH  /api/admin/product-reviews          — { id, status: "APPROVED" | "REJECTED", adminNote? }
 * DELETE /api/admin/product-reviews?id=…     — kalıcı sil
 *
 * Onay/ret/silme ürün sayfasının önbelleğini hemen tazeler.
 */

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/session";
import { createAuditLog } from "@/lib/security/audit";
import {
  deleteReview,
  getReviewsForAdmin,
  moderateReview,
} from "@/lib/repositories/product-review.repository";

export const dynamic = "force-dynamic";

function revalidateProduct(slug: string) {
  if (slug) revalidatePath(`/urun/${slug}`);
}

export async function GET() {
  const user = await requireAdminApi();
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });
  try {
    return NextResponse.json({ reviews: await getReviewsForAdmin() });
  } catch (err) {
    console.error("[admin/product-reviews GET]", err);
    return NextResponse.json({ error: "Değerlendirmeler yüklenemedi." }, { status: 503 });
  }
}

const ModerateSchema = z.object({
  id: z.string().min(1),
  status: z.enum(["APPROVED", "REJECTED"]),
  adminNote: z
    .string()
    .trim()
    .max(300)
    .optional()
    .transform((v) => (v ? v : null)),
});

export async function PATCH(request: NextRequest) {
  const user = await requireAdminApi();
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

  const parsed = ModerateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });

  try {
    const result = await moderateReview(parsed.data.id, parsed.data.status, parsed.data.adminNote);
    if (!result) return NextResponse.json({ error: "Değerlendirme bulunamadı." }, { status: 404 });
    revalidateProduct(result.productSlug);
    await createAuditLog({
      userId: user.id,
      action: parsed.data.status === "APPROVED" ? "product_review.approve" : "product_review.reject",
      entity: "ProductReview",
      entityId: parsed.data.id,
      details: parsed.data.adminNote ? { adminNote: parsed.data.adminNote } : null,
    });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[admin/product-reviews PATCH]", err);
    return NextResponse.json({ error: "İşlem yapılamadı." }, { status: 503 });
  }
}

export async function DELETE(request: NextRequest) {
  const user = await requireAdminApi();
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Değerlendirme seçilmedi." }, { status: 400 });

  try {
    const result = await deleteReview(id);
    if (!result) return NextResponse.json({ error: "Değerlendirme bulunamadı." }, { status: 404 });
    revalidateProduct(result.productSlug);
    await createAuditLog({ userId: user.id, action: "product_review.delete", entity: "ProductReview", entityId: id });
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[admin/product-reviews DELETE]", err);
    return NextResponse.json({ error: "Silinemedi." }, { status: 503 });
  }
}
