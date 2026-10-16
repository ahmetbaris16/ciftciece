/**
 * Admin — süren bütün indirimleri şimdi bitirir (acil durum). Kayıtlar silinmez; ürünler eski fiyatına döner.
 *
 * POST /api/admin/discounts/end-all — gövde: {}
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import { adminAction, AdminActionError } from "@/lib/admin/api";
import { createAuditLog } from "@/lib/security/audit";
import { revalidateStorefront } from "@/lib/cache/revalidate";
import { endAllDiscounts } from "@/lib/repositories/discount.repository";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  return adminAction(request, z.object({}), async (_input, user) => {
    const count = await endAllDiscounts(user.id);
    if (count === 0) throw new AdminActionError("Süren indirim yok (zaten bitmiş olabilir). Sayfayı yenileyin.", 409);
    revalidateStorefront();
    await createAuditLog({ userId: user.id, action: "discount.end_all", entity: "product_discount", entityId: "*", details: { count } });
    return { ended: count };
  });
}
