/**
 * POST /api/admin/orders/[id]/email { subject, message, nonce } — siparişten müşteriye e-posta (ürün bilgisi,
 * gecikme, soru…). İşletmenin e-posta adresinden, siparişe bağlı ve markalı gider; yanıtlar işletmeye döner.
 * nonce formu her açılışta yenilenir: çift tıklama ya da yeniden deneme ikinci e-posta oluşturmaz.
 * Gönderim kuyruktan yapılır (hata olursa yeniden denenir); sipariş geçmişine iç not düşülür.
 */

import type { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { adminAction } from "@/lib/admin/api";
import { customMessageDraft } from "@/lib/notifications/order-rules";
import { enqueueEmail } from "@/lib/notifications/queue";
import { recordOrderEvent } from "@/lib/orders/events";
import { OrderTransitionError } from "@/lib/repositories/order.repository";
import { createAuditLog } from "@/lib/security/audit";
import { scheduleNotifications } from "@/lib/notifications/run";

const Schema = z.object({
  subject: z.string().trim().min(3, { error: "Konu yazın." }).max(150, { error: "Konu en fazla 150 karakter." }),
  message: z.string().trim().min(10, { error: "Mesaj çok kısa." }).max(5000, { error: "Mesaj en fazla 5000 karakter." }),
  nonce: z.string().regex(/^[A-Za-z0-9-]{8,64}$/),
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return adminAction(request, Schema, async (input, user) => {
    const draft = await customMessageDraft(id, input.subject, input.message, input.nonce);
    if (!draft) throw new OrderTransitionError("Siparişte müşteri e-posta adresi yok.", 400);
    const created = await prisma.$transaction(async (tx) => {
      const isNew = await enqueueEmail(tx, draft);
      if (isNew) {
        await recordOrderEvent(tx, {
          orderId: id,
          type: "NOTE",
          actorType: "ADMIN",
          actorId: user.id,
          visibleToCustomer: false,
          message: `Müşteriye e-posta yazıldı: “${input.subject}”`,
        });
      }
      return isNew;
    });
    if (created) {
      await createAuditLog({
        userId: user.id,
        action: "order.customer_email",
        entity: "order",
        entityId: id,
        details: { subject: input.subject },
      });
      scheduleNotifications();
    }
    return { queued: created };
  });
}
