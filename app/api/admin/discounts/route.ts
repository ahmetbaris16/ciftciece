/**
 * Admin — indirim başlatma.
 *
 * POST /api/admin/discounts — { productIds, percent, endsOn: "YYYY-MM-DD" } → seçilen ürünlerde indirim hemen başlar,
 * bitiş günü sonunda (İstanbul saatiyle 23:59) kendiliğinden biter. Süren indirim varsa yenisiyle değişir. İndirimden
 * önceki fiyat ve indirimli fiyat sunucuda hesaplanır (lib/repositories/discount.repository.ts).
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import { adminAction, AdminActionError } from "@/lib/admin/api";
import { createAuditLog } from "@/lib/security/audit";
import { revalidateStorefront } from "@/lib/cache/revalidate";
import { startDiscounts } from "@/lib/repositories/discount.repository";
import { MAX_PERCENT, MIN_PERCENT, istanbulEndOfDay } from "@/lib/pricing/discount";

export const dynamic = "force-dynamic";

const percentMessage = `İndirim oranını %${MIN_PERCENT} ile %${MAX_PERCENT} arasında bir tam sayı olarak yazın.`;

const Schema = z.object({
  productIds: z.array(z.string().min(1).max(60)).min(1, { error: "İndirim yapılacak ürünü seçin." }).max(500),
  percent: z
    .number({ error: percentMessage })
    .int({ error: percentMessage })
    .min(MIN_PERCENT, { error: percentMessage })
    .max(MAX_PERCENT, { error: percentMessage }),
  endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: "Bitiş tarihini seçin." }),
});

export async function POST(request: NextRequest) {
  return adminAction(request, Schema, async (input, user) => {
    const endsAt = istanbulEndOfDay(input.endsOn);
    if (!endsAt) throw new AdminActionError("Bitiş tarihini seçin.");
    const result = await startDiscounts({ productIds: input.productIds, percent: input.percent, endsAt, adminId: user.id });
    if (result.started.length > 0) revalidateStorefront();
    await createAuditLog({
      userId: user.id,
      action: "discount.start",
      entity: "product_discount",
      details: {
        percent: input.percent,
        endsOn: input.endsOn,
        started: result.started.map((s) => s.productId),
        skipped: result.skipped.map((s) => ({ productId: s.productId, reason: s.reason })),
      },
    });
    return result;
  });
}
