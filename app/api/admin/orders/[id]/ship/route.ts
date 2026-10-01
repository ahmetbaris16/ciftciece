/**
 * POST /api/admin/orders/[id]/ship { carrier, trackingNumber, trackingUrl? }
 * Siparişi kargoya verir (takip numarası zorunlu); müşteriye takip bağlantılı e-posta gider.
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import { adminAction } from "@/lib/admin/api";
import { shipOrder } from "@/lib/orders/lifecycle";
import { createAuditLog } from "@/lib/security/audit";
import { scheduleNotifications } from "@/lib/notifications/run";

const Schema = z.object({
  carrier: z.string().trim().min(2, { error: "Kargo firmasını seçin." }).max(60),
  trackingNumber: z.string().trim().min(6, { error: "Takip numarasını girin." }).max(60),
  trackingUrl: z.string().trim().max(500).optional().nullable(),
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return adminAction(request, Schema, async (input, user) => {
    const shipment = await shipOrder(id, input, user.id);
    await createAuditLog({
      userId: user.id,
      action: "order.shipped",
      entity: "order",
      entityId: id,
      details: { carrier: shipment.carrier, trackingNumber: shipment.trackingNumber },
    });
    scheduleNotifications();
    return { shipmentId: shipment.id, trackingLink: shipment.trackingLink };
  });
}
