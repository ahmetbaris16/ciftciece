/**
 * POST /api/admin/orders/[id]/ship { carrier, trackingNumber, trackingUrl?, confirmUnusual? }
 * Siparişi kargoya verir (takip numarası zorunlu); müşteriye takip bağlantılı e-posta gider.
 * Numara firmanın olağan biçimine uymuyorsa (Yurtiçi: yalnız rakam, çoğunlukla 12 hane) confirmUnusual gerekir.
 * addressSeenAt: yöneticinin ekranda gördüğü teslimat bilgisinin zamanı; sonra değiştiyse 409.
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
  confirmUnusual: z.boolean().optional(),
  // Ekrandaki teslimat bilgisinin zamanı: sonra değiştiyse 409 (eski adresle paket çıkmasın)
  addressSeenAt: z.number().int().min(0).nullable().optional(),
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
      details: {
        carrier: shipment.carrier,
        trackingNumber: shipment.trackingNumber,
        ...(input.confirmUnusual ? { unusualFormatConfirmed: true } : {}),
      },
    });
    scheduleNotifications();
    return { shipmentId: shipment.id, trackingLink: shipment.trackingLink };
  });
}
