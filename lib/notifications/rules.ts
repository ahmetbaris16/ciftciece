/**
 * Olay → e-posta kuralları: hangi olayda kime hangi e-posta gider. Tek yer.
 *
 * Kurallar e-posta içeriğini olay işlendiği anda veritabanındaki güncel kayıttan üretir. Döndürülen
 * taslakların dedupeKey'i olay içinde benzersiz olmalı (dağıtıcı başına olay anahtarını ekler).
 */

import type { OutboxEvent } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getBusinessInfo } from "@/lib/business/business.repository";
import { notificationAddress, type BusinessInfo } from "@/lib/business/info";
import { ALERT_TITLES, type PaymentAlertKind } from "@/lib/payment/alerts";
import { paymentAlertEmail } from "@/lib/email/templates/store";
import type { EmailDraft } from "./queue";

export interface RuleContext {
  business: BusinessInfo;
  /** İşletme bildirim adresi (yoksa işletmeye e-posta gitmez) */
  storeAddress: string | null;
}

type Handler = (event: OutboxEvent, ctx: RuleContext) => Promise<EmailDraft[]>;

const payload = (event: OutboxEvent) => (event.payload ?? {}) as Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v : null);

const paymentAlert: Handler = async (event, ctx) => {
  if (!ctx.storeAddress) return [];
  const p = payload(event);
  const kind = str(p.kind) as PaymentAlertKind | null;
  const orderId = str(p.orderId);
  const order = orderId ? await prisma.order.findUnique({ where: { id: orderId }, select: { reference: true } }) : null;
  const mail = paymentAlertEmail({
    business: ctx.business,
    title: (kind && ALERT_TITLES[kind]) || "Ödeme uyarısı",
    message: str(p.message) ?? "Ödeme kaydında kontrol gerektiren bir durum oluştu.",
    orderId,
    reference: order?.reference ?? null,
  });
  return [
    {
      kind: "STORE_PAYMENT_ALERT",
      dedupeKey: "store",
      orderId,
      audience: "store",
      to: ctx.storeAddress,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    },
  ];
};

const HANDLERS: Record<string, Handler> = {
  "payment.alert": paymentAlert,
};

/** Kayıtlı kurallar (testler ve admin paneli için) */
export const HANDLED_TOPICS = () => Object.keys(HANDLERS);

export async function draftsForEvent(event: OutboxEvent): Promise<EmailDraft[]> {
  const handler = HANDLERS[event.topic];
  if (!handler) return [];
  const business = await getBusinessInfo();
  return handler(event, { business, storeAddress: notificationAddress(business) });
}
