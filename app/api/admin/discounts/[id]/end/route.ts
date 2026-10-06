/**
 * Admin — indirimi şimdi bitirir (kayıt silinmez; sonraki indirimin eski fiyat hesabında kullanılır).
 *
 * POST /api/admin/discounts/[id]/end — gövde: {}
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import { adminAction, AdminActionError } from "@/lib/admin/api";
import { createAuditLog } from "@/lib/security/audit";
import { revalidateStorefront } from "@/lib/cache/revalidate";
import { endDiscount } from "@/lib/repositories/discount.repository";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return adminAction(request, z.object({}), async (_input, user) => {
    const ended = await endDiscount(id, user.id);
    if (!ended) throw new AdminActionError("Bu indirim zaten bitmiş ya da bulunamadı. Sayfayı yenileyin.", 409);
    revalidateStorefront();
    await createAuditLog({ userId: user.id, action: "discount.end", entity: "product_discount", entityId: id, details: { productId: ended.productId } });
    return { ended: true };
  });
}
