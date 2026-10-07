/**
 * POST /api/admin/orders/[id]/review-code — üye olmadan verilmiş siparişe yeni değerlendirme kodu (eski kod ve
 * verilmiş değerlendirme izni geçersiz olur). Kod denetim kaydına yazılmaz (gizli).
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import { adminAction, AdminActionError } from "@/lib/admin/api";
import { regenerateReviewCode } from "@/lib/reviews/review-code";
import { createAuditLog } from "@/lib/security/audit";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return adminAction(request, z.object({}).passthrough(), async (_input, user) => {
    const next = await regenerateReviewCode(id);
    if (!next) throw new AdminActionError("Bu sipariş üyelikle verildi; değerlendirme kodu yok (müşteri giriş yaparak yazar).", 400);
    await createAuditLog({
      userId: user.id,
      action: "order.review_code_regenerated",
      entity: "order",
      entityId: id,
      details: { version: next.version },
    });
    return { version: next.version };
  });
}
