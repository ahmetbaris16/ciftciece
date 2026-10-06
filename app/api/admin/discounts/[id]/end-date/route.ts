/**
 * Admin — süren indirimin bitiş gününü değiştirir (uzatma ya da kısaltma; en uzun süre sınırı yok).
 * Fiyatlar değişmez; sitede kampanya tarihleri yeni bitişle yazar.
 *
 * POST /api/admin/discounts/[id]/end-date — { endsOn: "YYYY-MM-DD" } → o günün sonunda (İstanbul saatiyle 23:59) biter
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import { adminAction, AdminActionError } from "@/lib/admin/api";
import { createAuditLog } from "@/lib/security/audit";
import { revalidateStorefront } from "@/lib/cache/revalidate";
import { changeDiscountEnd } from "@/lib/repositories/discount.repository";
import { istanbulEndOfDay } from "@/lib/pricing/discount";

export const dynamic = "force-dynamic";

const Schema = z.object({
  endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Bitiş tarihini seçin." }),
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return adminAction(request, Schema, async (input, user) => {
    const endsAt = istanbulEndOfDay(input.endsOn);
    if (!endsAt) throw new AdminActionError("Bitiş tarihini seçin.");
    const changed = await changeDiscountEnd(id, endsAt);
    if (!changed) throw new AdminActionError("Bu indirim bitmiş ya da bulunamadı. Sayfayı yenileyin.", 409);
    revalidateStorefront();
    await createAuditLog({
      userId: user.id,
      action: "discount.change_end",
      entity: "product_discount",
      entityId: id,
      details: { productId: changed.productId, from: changed.previousEndsAt.toISOString(), to: endsAt.toISOString() },
    });
    return { endsAt: endsAt.toISOString() };
  });
}
