/**
 * POST /api/admin/orders/[id]/address { firstName, lastName, phone, city, district, address, postalCode? }
 * Yönetici teslimat bilgisini değiştirir (ör. müşteri telefonla yanlış adres bildirdi). Kural müşteriyle aynı:
 * sipariş kargoya verilene kadar. Müşteriye "teslimat bilgileriniz güncellendi" e-postası gider; eski adres sipariş
 * geçmişinde kalır.
 */

import type { NextRequest } from "next/server";
import { adminAction } from "@/lib/admin/api";
import { changeShippingAddress } from "@/lib/orders/lifecycle";
import { DeliveryChangeSchema } from "@/lib/validation/checkout";
import { createAuditLog } from "@/lib/security/audit";
import { scheduleNotifications } from "@/lib/notifications/run";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return adminAction(request, DeliveryChangeSchema, async (input, user) => {
    const { changed } = await changeShippingAddress(id, input, { type: "ADMIN", id: user.id });
    if (changed) {
      // Adres denetim kaydına yazılmaz (sipariş geçmişinde); yalnız işlem
      await createAuditLog({ userId: user.id, action: "order.delivery_changed", entity: "order", entityId: id, details: {} });
      scheduleNotifications();
    }
    return { changed };
  });
}
