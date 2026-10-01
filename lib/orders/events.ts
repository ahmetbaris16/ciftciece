/**
 * Sipariş geçmişi (order_events) — yalnız eklenir. Durum değişikliği, ödeme, kargo, iade, müşteri talebi ve
 * admin notu, işin kendisiyle AYNI işlemde yazılır: geçmişte görünen her şey gerçekten olmuştur.
 *
 * visibleToCustomer: müşterinin sipariş sayfasındaki zaman çizelgesinde gösterilir. Müşteriye görünen
 * mesajlara iç not, admin adı ya da başka kişisel veri yazılmaz.
 */

import type { OrderStatus, Prisma } from "@prisma/client";

export type OrderEventType = "CREATED" | "PAYMENT" | "STATUS" | "SHIPMENT" | "REFUND" | "NOTE" | "REQUEST" | "INVOICE";
export type OrderActorType = "SYSTEM" | "ADMIN" | "CUSTOMER" | "PROVIDER";

export interface OrderEventInput {
  orderId: string;
  type: OrderEventType;
  actorType: OrderActorType;
  actorId?: string | null;
  message: string;
  visibleToCustomer?: boolean;
  fromStatus?: OrderStatus | null;
  toStatus?: OrderStatus | null;
}

export async function recordOrderEvent(tx: Prisma.TransactionClient, e: OrderEventInput): Promise<void> {
  await tx.orderEvent.create({
    data: {
      orderId: e.orderId,
      type: e.type,
      actorType: e.actorType,
      actorId: e.actorId ?? null,
      message: e.message.slice(0, 2000),
      visibleToCustomer: e.visibleToCustomer ?? false,
      fromStatus: e.fromStatus ?? null,
      toStatus: e.toStatus ?? null,
    },
  });
}

export const ORDER_STATUS_TR: Record<OrderStatus, string> = {
  PENDING: "Ödeme bekleniyor",
  PAID: "Ödendi",
  PROCESSING: "Hazırlanıyor",
  SHIPPED: "Kargoya verildi",
  DELIVERED: "Teslim edildi",
  CANCELLED: "İptal edildi",
  REFUNDED: "İade edildi",
};

/** Durum değişikliğinin müşteriye görünen cümlesi */
export function customerStatusMessage(to: OrderStatus, reason?: string | null): string {
  switch (to) {
    case "PROCESSING":
      return "Siparişiniz hazırlanıyor.";
    case "DELIVERED":
      return "Siparişiniz teslim edildi.";
    case "CANCELLED":
      return reason ? `Sipariş iptal edildi: ${reason}` : "Sipariş iptal edildi.";
    case "REFUNDED":
      return "Sipariş iade edildi.";
    case "SHIPPED":
      return "Siparişiniz kargoya verildi.";
    case "PAID":
      return "Ödemeniz alındı.";
    default:
      return ORDER_STATUS_TR[to];
  }
}
