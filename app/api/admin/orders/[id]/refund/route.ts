/**
 * POST /api/admin/orders/[id]/refund { amountKurus, method, reference?, reason, close?, restock? }
 * İade KAYDI (R-07): para bankadan/havaleyle iade edildikten sonra girilir; sitede para hareketi yapılmaz.
 * close: tam iadeyle sipariş kapanır (kargolanmamış → iptal, kargolanmış → iade edildi).
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import { adminAction } from "@/lib/admin/api";
import { recordRefund } from "@/lib/orders/lifecycle";
import { createAuditLog } from "@/lib/security/audit";
import { scheduleNotifications } from "@/lib/notifications/run";

const Schema = z.object({
  amountKurus: z.number().int().positive({ error: "İade tutarı geçersiz." }).max(10_000_000_00),
  method: z.enum(["CARD_PROVIDER", "BANK_TRANSFER", "CASH", "OTHER"]),
  reference: z.string().trim().max(120).optional().nullable(),
  reason: z.string().trim().min(3, { error: "İade sebebini yazın." }).max(2000),
  close: z.boolean().optional(),
  restock: z.boolean().optional(),
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return adminAction(request, Schema, async (input, user) => {
    const refund = await recordRefund(id, input, user.id);
    await createAuditLog({
      userId: user.id,
      action: "order.refund_recorded",
      entity: "order",
      entityId: id,
      details: { refundId: refund.id, amountKurus: refund.amountKurus, method: refund.method, close: !!input.close },
    });
    scheduleNotifications();
    return { refundId: refund.id };
  });
}
