/**
 * Admin — uygunsuz ürün değerlendirmesini yayından kaldırma (onay/ret yok: değerlendirmeler yazılınca yayında).
 *
 * POST /api/admin/product-reviews — { id } → yayından kaldırılır (kayıt silinmez), ürün sayfası tazelenir.
 * Düğme ürün sayfasında yalnız yönetici oturumuna görünür. Yalnız hakaret, kişisel veri ya da ürünle ilgisi
 * olmayan içerik için kullanılır.
 */

import type { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { adminAction, AdminActionError } from "@/lib/admin/api";
import { createAuditLog } from "@/lib/security/audit";
import { hideReview } from "@/lib/repositories/product-review.repository";

export const dynamic = "force-dynamic";

const Schema = z.object({ id: z.string().min(1).max(60) });

export async function POST(request: NextRequest) {
  return adminAction(request, Schema, async ({ id }, user) => {
    const result = await hideReview(id);
    if (!result) throw new AdminActionError("Değerlendirme bulunamadı.", 404);
    revalidatePath(`/urun/${result.productSlug}`);
    await createAuditLog({ userId: user.id, action: "review.hide", entity: "product_review", entityId: id, details: {} });
    return { hidden: true };
  });
}
