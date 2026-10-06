/**
 * Sipariş e-postaları için veri: sipariş, kalemler, kargo gönderileri, iadeler, işletme bilgisi, havale hesabı.
 * Yalnız okuma; e-postanın içeriği olay işlendiği andaki kayıttan üretilir.
 */

import { prisma } from "@/lib/db/prisma";
import { getBusinessInfo } from "@/lib/business/business.repository";
import type { BusinessInfo } from "@/lib/business/info";
import { getPaymentSettings } from "@/lib/payment/settings.repository";
import { PAYMENT_METHOD_LABELS, formatIban, hasBankDetails, type PaymentSettings } from "@/lib/payment/methods";
import { trackingLinkFor } from "@/lib/shipping/carriers";
import type { OrderContext } from "@/lib/legal/content";
import type { BillingInfo, ShippingAddress } from "@/types";

export interface OrderEmailData {
  id: string;
  reference: string;
  status: string;
  paymentMethod: "CARD" | "BANK_TRANSFER" | "CASH_ON_DELIVERY";
  createdAt: Date;
  paymentDueAt: Date | null;
  customerEmail: string | null;
  customerName: string;
  firstName: string;
  phone: string;
  address: ShippingAddress;
  billing: BillingInfo | null;
  customerNote: string | null;
  items: Array<{ name: string; variant: string; quantity: number; unitPriceKurus: number; lineTotalKurus: number }>;
  subtotalKurus: number;
  shippingKurus: number;
  recipientPaysShipping: boolean;
  paymentFeeKurus: number;
  discountKurus: number;
  totalKurus: number;
  carrierName: string;
  shipments: Array<{ id: string; carrier: string; trackingNumber: string; link: string | null; shippedAt: Date }>;
  refunds: Array<{ id: string; amountKurus: number; method: string; createdAt: Date }>;
  business: BusinessInfo;
  bank: PaymentSettings["bankTransfer"] | null;
}

export async function loadOrderEmailData(orderId: string): Promise<OrderEmailData | null> {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: {
      items: true,
      shipments: { orderBy: { shippedAt: "asc" } },
      refunds: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!order) return null;
  const [business, payment] = await Promise.all([getBusinessInfo(), getPaymentSettings()]);
  const address = order.shippingAddress as unknown as ShippingAddress;
  const name = order.guestName?.trim() || `${address?.firstName ?? ""} ${address?.lastName ?? ""}`.trim() || "Değerli müşterimiz";
  return {
    id: order.id,
    reference: order.reference,
    status: order.status,
    paymentMethod: order.paymentMethod,
    createdAt: order.createdAt,
    paymentDueAt: order.paymentDueAt,
    customerEmail: order.guestEmail?.trim().toLowerCase() || null,
    customerName: name,
    firstName: address?.firstName?.trim() || name.split(" ")[0],
    phone: order.guestPhone ?? address?.phone ?? "",
    address,
    billing: (order.billingInfo as unknown as BillingInfo | null) ?? null,
    customerNote: order.customerNote,
    items: order.items.map((i) => ({
      name: i.snapshotName,
      variant: i.snapshotVariant,
      quantity: i.quantity,
      unitPriceKurus: i.snapshotPrice,
      lineTotalKurus: i.snapshotPrice * i.quantity - i.discountKurus,
    })),
    subtotalKurus: order.subtotalKurus,
    shippingKurus: order.shippingKurus,
    recipientPaysShipping: address?.shippingMode === "recipient",
    paymentFeeKurus: order.paymentFeeKurus,
    discountKurus: order.discountKurus,
    totalKurus: order.totalKurus,
    carrierName: address?.carrier?.name ?? "Yurtiçi Kargo",
    shipments: order.shipments.map((s) => ({
      id: s.id,
      carrier: s.carrier,
      trackingNumber: s.trackingNumber,
      link: trackingLinkFor(s.carrier, s.trackingNumber, s.trackingUrl),
      shippedAt: s.shippedAt,
    })),
    refunds: order.refunds.map((r) => ({ id: r.id, amountKurus: r.amountKurus, method: r.method, createdAt: r.createdAt })),
    business,
    bank: hasBankDetails(payment.bankTransfer) ? payment.bankTransfer : null,
  };
}

export function addressText(a: ShippingAddress | null | undefined): string {
  if (!a) return "";
  return [
    `${a.firstName ?? ""} ${a.lastName ?? ""}`.trim(),
    a.address,
    `${a.district ?? ""}${a.district && a.city ? " / " : ""}${a.city ?? ""}${a.postalCode ? ` ${a.postalCode}` : ""}`,
    a.phone,
  ]
    .filter(Boolean)
    .join(", ");
}

export function billingText(billing: BillingInfo | null, fallbackName: string): string {
  if (!billing) return `Bireysel: ${fallbackName}`;
  if (billing.type === "CORPORATE") {
    return [`Kurumsal: ${billing.companyName ?? ""}`, billing.taxOffice ? `VD: ${billing.taxOffice}` : "", billing.taxNumber ? `VKN/TCKN: ${billing.taxNumber}` : ""]
      .filter(Boolean)
      .join(", ");
  }
  return `Bireysel: ${billing.name || fallbackName}`;
}

/** Yasal metinlerin siparişe özel hâli için bağlam */
/** Kalem indirimlerinin toplamı (indirim kampanyası): (birim fiyat × adet − satır tutarı) toplamı */
export function itemDiscountKurus(d: Pick<OrderEmailData, "items">): number {
  return d.items.reduce((sum, i) => sum + Math.max(0, i.unitPriceKurus * i.quantity - i.lineTotalKurus), 0);
}

export function orderLegalContext(d: OrderEmailData): OrderContext {
  return {
    reference: d.reference,
    date: d.createdAt,
    buyer: { name: d.customerName, email: d.customerEmail ?? "", phone: d.phone },
    deliveryAddress: addressText(d.address),
    billing: billingText(d.billing, d.customerName),
    items: d.items,
    subtotalKurus: d.subtotalKurus,
    shippingKurus: d.recipientPaysShipping ? null : d.shippingKurus,
    paymentFeeKurus: d.paymentFeeKurus,
    discountKurus: d.discountKurus,
    totalKurus: d.totalKurus,
    paymentMethodLabel: PAYMENT_METHOD_LABELS[d.paymentMethod],
    carrierName: d.carrierName,
  };
}

export { formatIban };
