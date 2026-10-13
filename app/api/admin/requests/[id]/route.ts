/**
 * PATCH /api/admin/requests/[id] { status: "REJECTED", note? } — müşterinin iptal/iade talebini reddeder (sipariş sürer);
 * müşteriye sebebiyle e-posta gider.
 * Kabul elle kapatılmaz: iptal isteği sipariş iptal edilince, iade bildirimi iade kaydı girilince kendiliğinden kapanır.
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import { adminAction } from "@/lib/admin/api";
import { rejectCustomerRequest } from "@/lib/orders/lifecycle";
import { scheduleNotifications } from "@/lib/notifications/run";

const Schema = z.object({
  status: z.literal("REJECTED"),
  note: z.string().trim().max(2000).optional().nullable(),
});

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return adminAction(request, Schema, async (input, user) => {
    const r = await rejectCustomerRequest(id, input.note, user.id);
    // Müşteriye "talebiniz kabul edilemedi" e-postası hemen gitsin (zamanlanmış görevi beklemeden)
    scheduleNotifications();
    return { status: r.status };
  });
}
