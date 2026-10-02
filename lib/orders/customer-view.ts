/**
 * Müşterinin sipariş sayfası için veri (/siparis/[ref]): sipariş, müşteriye görünen geçmiş, kargo gönderileri,
 * iadeler, açık talepler, yapabileceği işlemler, siparişe özel sözleşme bağlamı. Yalnız okuma.
 * Sipariş numarası (tahmin edilemez referans) sayfanın anahtarıdır.
 */

import { prisma } from "@/lib/db/prisma";
import { USE_DB } from "@/lib/data/source";
import { loadOrderEmailData, orderLegalContext, type OrderEmailData } from "@/lib/notifications/order-data";
import type { OrderContext } from "@/lib/legal/content";
import { customerOptions } from "./lifecycle";
import type { OrderStatus } from "@/types";

export interface CustomerOrderView {
  data: OrderEmailData;
  needsAttention: boolean;
  invoiceNumber: string | null;
  invoiceIssuedAt: Date | null;
  timeline: Array<{ at: Date; message: string; type: string }>;
  openRequests: Array<{ type: "CANCEL" | "RETURN"; createdAt: Date }>;
  options: ReturnType<typeof customerOptions>;
  legal: OrderContext;
  /** Kart ödemesi açık deneme sayısı (ödemeyi tamamla düğmesi için bilgi) */
  hasOpenCardAttempt: boolean;
}

export async function loadCustomerOrderView(reference: string): Promise<CustomerOrderView | null> {
  if (!USE_DB) return null;
  const row = await prisma.order.findUnique({
    where: { reference },
    select: { id: true, needsAttention: true, invoiceNumber: true, invoiceIssuedAt: true },
  });
  if (!row) return null;
  const [data, events, requests, openCard] = await Promise.all([
    loadOrderEmailData(row.id),
    prisma.orderEvent.findMany({
      where: { orderId: row.id, visibleToCustomer: true },
      orderBy: { createdAt: "asc" },
      select: { createdAt: true, message: true, type: true },
    }),
    prisma.customerRequest.findMany({
      where: { orderId: row.id, status: "OPEN" },
      select: { type: true, createdAt: true },
    }),
    prisma.paymentAttempt.count({ where: { orderId: row.id, method: "CARD", status: "INITIATED" } }),
  ]);
  if (!data) return null;
  return {
    data,
    needsAttention: row.needsAttention,
    invoiceNumber: row.invoiceNumber,
    invoiceIssuedAt: row.invoiceIssuedAt,
    timeline: events.map((e) => ({ at: e.createdAt, message: e.message, type: e.type })),
    openRequests: requests.map((r) => ({ type: r.type, createdAt: r.createdAt })),
    options: customerOptions(data.status as OrderStatus),
    legal: orderLegalContext(data),
    hasOpenCardAttempt: openCard > 0,
  };
}

/** İlerleme adımı: Sipariş alındı → Ödeme → Hazırlanıyor → Kargoda → Teslim edildi */
export function progressIndex(status: string): number {
  switch (status) {
    case "PENDING":
      return 1;
    case "PAID":
    case "PROCESSING":
      return 2;
    case "SHIPPED":
      return 3;
    case "DELIVERED":
      return 5;
    default:
      return -1;
  }
}
