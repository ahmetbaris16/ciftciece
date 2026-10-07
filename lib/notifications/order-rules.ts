/**
 * Sipariş olayları → e-postalar.
 *
 * | Olay                      | Müşteriye                                   | İşletmeye                  |
 * |---------------------------|---------------------------------------------|----------------------------|
 * | order.placed (havale)     | Sipariş alındı + IBAN + sözleşmeler          | Yeni sipariş (havale bekl.) |
 * | order.placed (kapıda)     | Sipariş alındı + sözleşmeler                 | Yeni sipariş               |
 * | order.placed (kart)       | — (ödeme bekleniyor; teyit ödemeyle gider)   | —                          |
 * | order.paid (kart)         | Sipariş alındı/ödeme alındı + sözleşmeler    | Yeni sipariş (ödendi)      |
 * | order.paid (havale)       | Ödemeniz alındı                              | —                          |
 * | order.paid (kapıda tahsil)| — (teslim e-postası yeterli)                 | —                          |
 * | order.status_changed      | Teslim edildi / İptal edildi                 | Müşteri iptal ettiyse bilgi |
 * | order.shipped             | Kargoya verildi (takip no)                   | —                          |
 * | order.refunded            | İadeniz yapıldı                              | —                          |
 * | order.payment_reminder    | Havale hatırlatma (son ödeme sonrası gitmez) | —                          |
 * | order.customer_request    | Talebiniz alındı                             | Müşteri talebi             |
 * | contact.received          | —                                            | İletişim mesajı (yanıtla → müşteri) |
 * | review.submitted          | —                                            | Yeni değerlendirme yayınlandı |
 */

import type { OutboxEvent } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { PAYMENT_METHOD_LABELS } from "@/lib/payment/methods";
import { formatPrice } from "@/types";
import { replyToFor } from "@/lib/email/brand";
import {
  customMessageEmail,
  orderCancelledEmail,
  orderDeliveredEmail,
  orderReceivedEmail,
  orderShippedEmail,
  paymentReceivedEmail,
  refundEmail,
  requestReceivedEmail,
  transferReminderEmail,
} from "@/lib/email/templates/order";
import {
  contactMessageStoreEmail,
  customerRequestStoreEmail,
  newOrderStoreEmail,
  reviewPublishedStoreEmail,
} from "@/lib/email/templates/store";
import type { RenderedEmail } from "@/lib/email/templates/account";
import { addressText, loadOrderEmailData, type OrderEmailData } from "./order-data";
import { ensureReviewCode } from "@/lib/reviews/review-code";
import type { EmailDraft } from "./queue";
import type { RuleContext } from "./rules";

type Handler = (event: OutboxEvent, ctx: RuleContext) => Promise<EmailDraft[]>;

const payloadOf = (event: OutboxEvent) => (event.payload ?? {}) as Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : null);

function toCustomer(d: OrderEmailData, kind: string, mail: RenderedEmail, opts: { expiresAt?: Date | null } = {}): EmailDraft[] {
  if (!d.customerEmail) return [];
  return [
    {
      kind,
      dedupeKey: kind,
      orderId: d.id,
      audience: "customer",
      to: d.customerEmail,
      replyTo: replyToFor(d.business),
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      expiresAt: opts.expiresAt ?? null,
    },
  ];
}

function toStore(ctx: RuleContext, kind: string, mail: RenderedEmail, opts: { orderId?: string | null; replyTo?: string | null } = {}): EmailDraft[] {
  if (!ctx.storeAddress) return [];
  return [
    {
      kind,
      dedupeKey: kind,
      orderId: opts.orderId ?? null,
      audience: "store",
      to: ctx.storeAddress,
      replyTo: opts.replyTo ?? null,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    },
  ];
}

function newOrderForStore(ctx: RuleContext, d: OrderEmailData, statusNote: string): EmailDraft[] {
  const mail = newOrderStoreEmail({
    business: ctx.business,
    orderId: d.id,
    reference: d.reference,
    customerName: d.customerName,
    totalText: formatPrice(d.totalKurus),
    methodLabel: PAYMENT_METHOD_LABELS[d.paymentMethod],
    statusNote,
    itemLines: d.items.map((i) => `• ${i.name} (${i.variant}) × ${i.quantity} — ${formatPrice(i.lineTotalKurus)}`),
    rows: [
      { label: "Telefon", value: d.phone },
      { label: "Teslimat", value: addressText(d.address) },
      { label: "Kargo", value: d.recipientPaysShipping ? "ALICI ÖDEMELİ" : d.shippingKurus > 0 ? formatPrice(d.shippingKurus) : "Ücretsiz" },
      { label: "Müşteri notu", value: d.customerNote ?? "" },
    ],
  });
  return toStore(ctx, "STORE_NEW_ORDER", mail, { orderId: d.id, replyTo: d.customerEmail });
}

async function orderData(event: OutboxEvent): Promise<OrderEmailData | null> {
  const orderId = str(payloadOf(event).orderId) ?? event.aggregateId;
  return loadOrderEmailData(orderId);
}

const orderPlaced: Handler = async (event, ctx) => {
  const d = await orderData(event);
  if (!d) return [];
  if (d.paymentMethod === "CARD") return []; // kartta teyit ödeme doğrulanınca (order.paid)
  const drafts = toCustomer(d, "ORDER_RECEIVED", orderReceivedEmail(d));
  drafts.push(
    ...newOrderForStore(
      ctx,
      d,
      d.paymentMethod === "BANK_TRANSFER"
        ? "Havale/EFT bekleniyor. Para hesabınıza geçince panelde “Havale ödemesi alındı” deyin."
        : "Kapıda ödeme: sipariş kesinleşti, hazırlayıp tahsilatlı gönderin."
    )
  );
  return drafts;
};

const orderPaid: Handler = async (event, ctx) => {
  const p = payloadOf(event);
  const d = await orderData(event);
  if (!d) return [];
  const method = str(p.paymentMethod) ?? d.paymentMethod;
  if (method === "CARD") {
    return [
      ...toCustomer(d, "ORDER_RECEIVED", orderReceivedEmail(d)),
      ...newOrderForStore(ctx, d, "Kartla ödendi. Hazırlayıp kargolayın."),
    ];
  }
  if (method === "BANK_TRANSFER") return toCustomer(d, "PAYMENT_RECEIVED", paymentReceivedEmail(d));
  return []; // kapıda ödeme tahsilatı: teslim e-postası yeterli
};

const statusChanged: Handler = async (event, ctx) => {
  const p = payloadOf(event);
  const to = str(p.to);
  const d = await orderData(event);
  if (!d) return [];
  if (to === "DELIVERED") {
    // Üye olmadan verilmiş siparişte değerlendirme kodu e-postada da yazar (paket fişindekiyle aynı kod)
    const code = d.memberOrder || !d.customerEmail ? null : await ensureReviewCode(d.id);
    return toCustomer(d, "ORDER_DELIVERED", orderDeliveredEmail(d, code?.code ?? null));
  }
  if (to === "CANCELLED") {
    // İade kaydıyla birlikte kapanan sipariş: iade e-postası iptali de söyler (tek e-posta)
    if (str(p.refundId)) return [];
    const byCustomer = str(p.actorType) === "CUSTOMER";
    const drafts = toCustomer(
      d,
      "ORDER_CANCELLED",
      orderCancelledEmail(d, { expired: p.expired === true, byCustomer, reason: str(p.reason) })
    );
    if (byCustomer) {
      drafts.push(
        ...toStore(
          ctx,
          "STORE_ORDER_CANCELLED_BY_CUSTOMER",
          customerRequestStoreEmail({
            business: ctx.business,
            orderId: d.id,
            reference: d.reference,
            kindLabel: "Müşteri siparişi iptal etti",
            customerName: d.customerName,
            message: "Ödenmemiş sipariş müşteri tarafından iptal edildi; stok geri eklendi. İşlem gerekmez.",
          }),
          { orderId: d.id }
        )
      );
    }
    return drafts;
  }
  return []; // PROCESSING: e-posta yok (sipariş sayfasında görünür); REFUNDED: iade e-postası gider
};

const shipped: Handler = async (event) => {
  const p = payloadOf(event);
  const d = await orderData(event);
  if (!d) return [];
  const shipmentId = str(p.shipmentId) ?? "";
  return toCustomer(d, "ORDER_SHIPPED", orderShippedEmail(d, shipmentId, p.additional === true));
};

const refunded: Handler = async (event) => {
  const p = payloadOf(event);
  const d = await orderData(event);
  if (!d) return [];
  return toCustomer(d, "REFUND_RECORDED", refundEmail(d, str(p.refundId) ?? ""));
};

const reminder: Handler = async (event) => {
  const d = await orderData(event);
  if (!d || d.status !== "PENDING" || d.paymentMethod !== "BANK_TRANSFER") return [];
  return toCustomer(d, "TRANSFER_REMINDER", transferReminderEmail(d), { expiresAt: d.paymentDueAt });
};

const customerRequest: Handler = async (event, ctx) => {
  const p = payloadOf(event);
  const d = await orderData(event);
  if (!d) return [];
  const type = str(p.type) === "RETURN" ? "RETURN" : "CANCEL";
  const request = str(p.requestId)
    ? await prisma.customerRequest.findUnique({ where: { id: str(p.requestId)! }, select: { message: true } })
    : null;
  return [
    ...toCustomer(d, "REQUEST_RECEIVED", requestReceivedEmail(d, type)),
    ...toStore(
      ctx,
      "STORE_CUSTOMER_REQUEST",
      customerRequestStoreEmail({
        business: ctx.business,
        orderId: d.id,
        reference: d.reference,
        kindLabel: type === "RETURN" ? "İade (cayma) bildirimi" : "İptal isteği",
        customerName: d.customerName,
        message: request?.message ?? "",
      }),
      { orderId: d.id, replyTo: d.customerEmail }
    ),
  ];
};

const contactReceived: Handler = async (event, ctx) => {
  const id = str(payloadOf(event).messageId) ?? event.aggregateId;
  const m = await prisma.contactMessage.findUnique({ where: { id } });
  if (!m) return [];
  return toStore(
    ctx,
    "STORE_CONTACT_MESSAGE",
    contactMessageStoreEmail({
      business: ctx.business,
      name: m.name,
      email: m.email,
      phone: m.phone ?? "",
      subjectLine: m.subject,
      message: m.message,
      orderReference: m.orderReference,
    }),
    { replyTo: m.email }
  );
};

const reviewSubmitted: Handler = async (event, ctx) => {
  const id = str(payloadOf(event).reviewId) ?? event.aggregateId;
  const r = await prisma.productReview.findUnique({ where: { id }, include: { product: { select: { name: true, slug: true } } } });
  // Bu arada yayından kaldırıldıysa bildirilmez
  if (!r || r.status !== "APPROVED") return [];
  return toStore(
    ctx,
    "STORE_REVIEW_PUBLISHED",
    reviewPublishedStoreEmail({
      business: ctx.business,
      productName: r.product.name,
      productSlug: r.product.slug,
      rating: r.rating,
      excerpt: r.text.slice(0, 400),
    })
  );
};

export const ORDER_HANDLERS: Record<string, Handler> = {
  "order.placed": orderPlaced,
  "order.paid": orderPaid,
  "order.status_changed": statusChanged,
  "order.shipped": shipped,
  "order.refunded": refunded,
  "order.payment_reminder": reminder,
  "order.customer_request": customerRequest,
  "contact.received": contactReceived,
  "review.submitted": reviewSubmitted,
};

/** Admin'in siparişten müşteriye yazdığı e-posta (olaysız, doğrudan kuyruğa) */
export async function customMessageDraft(orderId: string, subject: string, message: string, nonce: string): Promise<EmailDraft | null> {
  const d = await loadOrderEmailData(orderId);
  if (!d?.customerEmail) return null;
  const mail = customMessageEmail(d, subject, message);
  return {
    kind: "CUSTOM_MESSAGE",
    dedupeKey: `custom:${orderId}:${nonce}`,
    orderId,
    audience: "customer",
    to: d.customerEmail,
    replyTo: replyToFor(d.business),
    subject: mail.subject,
    html: mail.html,
    text: mail.text,
  };
}
