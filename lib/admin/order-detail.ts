/**
 * Admin sipariş detayı için veri: sipariş + ödeme denemeleri/olayları/uyarıları + kargo, iade, talepler, tam
 * sipariş geçmişi (iç notlar dahil), siparişin e-postaları, alınan / iade edilen tutar. Yalnız okuma.
 */

import { prisma } from "@/lib/db/prisma";
import { USE_DB } from "@/lib/data/source";
import { getOrderByReference } from "@/lib/repositories";
import { paidAmountKurus, refundedAmountKurus } from "@/lib/repositories/order.repository";
import { trackingLinkFor } from "@/lib/shipping/carriers";

export async function loadAdminOrder(idOrReference: string) {
  if (!USE_DB) return null;
  // id olarak sipariş ID'si ya da sipariş no kabul edilir
  const row = await prisma.order.findFirst({
    where: { OR: [{ id: idOrReference }, { reference: idOrReference }] },
    select: { id: true, reference: true, guestPhone: true },
  });
  if (!row) return null;
  const order = await getOrderByReference(row.reference);
  if (!order) return null;

  const [attempts, paymentEvents, alerts, legacyPayment, consents, shipments, refunds, requests, events, emails, paid, refunded] =
    await Promise.all([
      prisma.paymentAttempt.findMany({ where: { orderId: row.id }, orderBy: { createdAt: "asc" } }),
      prisma.paymentEvent.findMany({ where: { orderId: row.id }, orderBy: { processedAt: "desc" }, take: 40 }),
      prisma.paymentAlert.findMany({ where: { orderId: row.id }, orderBy: { createdAt: "desc" } }),
      prisma.payment.findUnique({ where: { orderId: row.id }, select: { status: true, provider: true } }),
      prisma.orderConsent.findMany({ where: { orderId: row.id }, orderBy: { document: "asc" } }),
      prisma.shipment.findMany({ where: { orderId: row.id }, orderBy: { shippedAt: "asc" } }),
      prisma.refund.findMany({ where: { orderId: row.id }, orderBy: { createdAt: "asc" } }),
      prisma.customerRequest.findMany({ where: { orderId: row.id }, orderBy: { createdAt: "desc" } }),
      prisma.orderEvent.findMany({ where: { orderId: row.id }, orderBy: { createdAt: "desc" } }),
      prisma.emailMessage.findMany({
        where: { orderId: row.id },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          kind: true,
          audience: true,
          toAddress: true,
          subject: true,
          status: true,
          attempts: true,
          sentAt: true,
          lastError: true,
          createdAt: true,
        },
      }),
      paidAmountKurus(prisma, row.id),
      refundedAmountKurus(prisma, row.id),
    ]);

  return {
    order,
    phone: row.guestPhone ?? order.shippingAddress?.phone ?? null,
    attempts,
    paymentEvents,
    alerts,
    openAlerts: alerts.filter((a) => !a.resolvedAt),
    legacyPayment,
    consents,
    shipments: shipments.map((s) => ({ ...s, link: trackingLinkFor(s.carrier, s.trackingNumber, s.trackingUrl) })),
    refunds,
    requests,
    events,
    emails,
    paidKurus: paid,
    refundedKurus: refunded,
  };
}

export type AdminOrderDetail = NonNullable<Awaited<ReturnType<typeof loadAdminOrder>>>;
