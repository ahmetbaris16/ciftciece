/**
 * Admin — sipariş durumu
 *
 * PUT /api/admin/orders/[id] { status, restock?, reason? }
 * - PENDING → PAID: yalnız havale/EFT onayı (confirmBankTransferPayment): ödeme denemesi "başarılı" olur, olay
 *   payment_events'e (kim/ne zaman) yazılır. Kartla ödenmemiş sipariş elle "ödendi" yapılamaz.
 * - Diğer geçişler updateOrderStatus kurallarıyla (ödenmiş sipariş iade kaydı olmadan kapanmaz; kargolama
 *   takip numarasıyla: /ship). Müşteriye e-posta bildirim kuyruğundan gider.
 */

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAdminApi } from "@/lib/auth/session";
import { getOrderByReference, updateOrderStatus } from "@/lib/repositories";
import { OrderTransitionError } from "@/lib/repositories/order.repository";
import { prisma } from "@/lib/db/prisma";
import { createAuditLog } from "@/lib/security/audit";
import { isSameOrigin } from "@/lib/security/same-origin";
import { confirmBankTransferPayment, PaymentConfirmError } from "@/lib/payment/offline";
import { scheduleNotifications } from "@/lib/notifications/run";
import type { OrderStatus } from "@/types";

const Schema = z.object({
  status: z.enum(["PENDING", "PAID", "PROCESSING", "SHIPPED", "DELIVERED", "CANCELLED", "REFUNDED"]),
  restock: z.boolean().optional(),
  reason: z.string().trim().max(200).optional(),
});

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PUT(request: NextRequest, context: RouteContext) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Geçersiz istek kaynağı." }, { status: 403 });
  const user = await requireAdminApi();
  if (!user) return NextResponse.json({ error: "Yetkisiz" }, { status: 401 });

  const { id } = await context.params;
  const parsed = Schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Geçersiz istek." }, { status: 400 });

  try {
    if (parsed.data.status === "PAID") {
      const current = await prisma.order.findUnique({ where: { id }, select: { status: true, paymentMethod: true } });
      if (!current) return NextResponse.json({ error: "Sipariş bulunamadı" }, { status: 404 });
      const { reference } = await confirmBankTransferPayment(id, user.id);
      await createAuditLog({
        userId: user.id,
        action: "order.payment_confirmed",
        entity: "order",
        entityId: id,
        details: { method: current.paymentMethod, previousStatus: current.status },
      });
      scheduleNotifications();
      return NextResponse.json({ order: await getOrderByReference(reference) });
    }

    const order = await updateOrderStatus(id, parsed.data.status as OrderStatus, user.id, {
      actorType: "ADMIN",
      restock: parsed.data.restock,
      reason: parsed.data.reason || null,
    });
    if (!order) return NextResponse.json({ error: "Sipariş bulunamadı" }, { status: 404 });

    await createAuditLog({
      userId: user.id,
      action: "order.status_update",
      entity: "order",
      entityId: id,
      details: { newStatus: parsed.data.status, restock: parsed.data.restock ?? null },
    });
    scheduleNotifications();
    return NextResponse.json({ order });
  } catch (err) {
    if (err instanceof PaymentConfirmError || err instanceof OrderTransitionError) {
      return NextResponse.json({ error: err.message }, { status: err.status });
    }
    console.error("[admin/orders PUT]", err);
    return NextResponse.json({ error: "Güncellenemedi. Lütfen tekrar deneyin." }, { status: 500 });
  }
}
