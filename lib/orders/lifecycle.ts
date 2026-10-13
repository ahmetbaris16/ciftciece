/**
 * Sipariş sonrası işlemler: kargolama (takip numarasıyla), iade kaydı, müşteri talepleri (iptal/cayma),
 * müşterinin ödenmemiş siparişi iptali, teslimat bilgisi değişikliği, admin notu, fatura numarası.
 *
 * Her işlem tek veritabanı işlemidir: sipariş satırı kilitlenir (SELECT … FOR UPDATE), iş kaydı + sipariş
 * geçmişi + bildirim olayı birlikte yazılır. Para hareketi yapılmaz: iade bankadan/havaleyle yapılır, burada
 * kaydı tutulur (karar 9 — muhafazakâr seçenek).
 */

import { Prisma, type CustomerRequestType, type OrderStatus, type RefundMethod } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { writeOutbox } from "@/lib/outbox";
import { formatPrice } from "@/types";
import type { BillingInfo, PaymentMethod, ShippingAddress } from "@/types";
import { addressText } from "@/lib/notifications/order-data";
import type { DeliveryChangeInput } from "@/lib/validation/checkout";
import { recordOrderEvent } from "./events";
import {
  changeStatusInTx,
  FULLY_REFUNDED_MESSAGE,
  hasOpenCancelRequest,
  isFullyRefunded,
  OPEN_CANCEL_REQUEST_MESSAGE,
  OrderTransitionError,
  paidAmountKurus,
  refundedAmountKurus,
  type OrderRow,
} from "@/lib/repositories/order.repository";
import {
  TRACKING_RULE_TEXT,
  isValidTrackingNumber,
  normalizeTrackingNumber,
  trackingFormatIssue,
  trackingLinkFor,
} from "@/lib/shipping/carriers";

type Tx = Prisma.TransactionClient;

const dateTimeTr = (d: Date) =>
  new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Istanbul" }).format(d);

async function lockOrder(tx: Tx, orderId: string): Promise<OrderRow & { needsAttention: boolean }> {
  const rows = await tx.$queryRaw<
    Array<{ id: string; reference: string; status: OrderStatus; paymentMethod: PaymentMethod; totalKurus: number; needsAttention: number | boolean }>
  >`SELECT \`id\`, \`reference\`, \`status\`, \`paymentMethod\`, \`totalKurus\`, \`needsAttention\`
    FROM \`orders\` WHERE \`id\` = ${orderId} FOR UPDATE`;
  const row = rows[0];
  if (!row) throw new OrderTransitionError("Sipariş bulunamadı.", 404);
  return { ...row, totalKurus: Number(row.totalKurus), needsAttention: Boolean(row.needsAttention) };
}

const REFUND_METHOD_TR: Record<RefundMethod, string> = {
  CARD_PROVIDER: "karta iade",
  BANK_TRANSFER: "banka hesabına iade",
  CASH: "elden iade",
  OTHER: "iade",
};

// ── Kargolama ────────────────────────────────────────────────────────────

export interface ShipInput {
  carrier: string;
  trackingNumber: string;
  trackingUrl?: string | null;
  /** Numara firmanın olağan biçimine uymuyor ama yönetici fişle karşılaştırıp doğruladı */
  confirmUnusual?: boolean;
  /**
   * Yöneticinin ekranda gördüğü son teslimat bilgisi değişikliğinin zamanı (ms; değişiklik yoksa 0). Verilirse ve
   * o andan sonra adres değiştiyse kargolama reddedilir (eski adresle paket çıkmasın). Verilmezse denetlenmez.
   */
  addressSeenAt?: number | null;
}

/** Takip numarası firmanın olağan biçimine uymuyor ve yönetici onaylamadı (panel "yine de kaydet" sorar) */
export class UnusualTrackingNumberError extends OrderTransitionError {
  constructor(message: string) {
    super(message, 400);
    this.name = "UnusualTrackingNumberError";
  }
}

/**
 * Siparişi kargoya verir (R-22: takip numarası zorunlu). Ödenmiş ya da hazırlanan sipariş SHIPPED olur;
 * zaten kargodaysa ek gönderi (ek koli) kaydedilir. Ödeme incelemesindeki (R-12), parası tamamen iade edilmiş ya
 * da müşterinin iptal isteği karar bekleyen sipariş kargolanamaz.
 * Numara firmanın olağan biçimine (Yurtiçi: yalnız rakam, çoğunlukla 12 hane) uymuyorsa yönetici onayı gerekir.
 */
export async function shipOrder(orderId: string, input: ShipInput, actorId: string | null) {
  const carrier = input.carrier.trim().slice(0, 60) || "Yurtiçi Kargo";
  const trackingNumber = normalizeTrackingNumber(input.trackingNumber, carrier);
  if (!isValidTrackingNumber(trackingNumber)) {
    throw new OrderTransitionError(`Takip numarası geçersiz. ${TRACKING_RULE_TEXT}`, 400);
  }
  const unusual = trackingFormatIssue(carrier, trackingNumber);
  if (unusual && !input.confirmUnusual) {
    throw new UnusualTrackingNumberError(`${unusual} Fişteki numarayı kontrol edin; doğruysa “Numara doğru” kutusunu işaretleyin.`);
  }
  const explicitUrl = input.trackingUrl?.trim() || null;
  if (explicitUrl && !/^https:\/\//.test(explicitUrl)) {
    throw new OrderTransitionError("Takip bağlantısı https:// ile başlamalı.", 400);
  }

  try {
    return await prisma.$transaction(async (tx) => {
      const order = await lockOrder(tx, orderId);
      if (order.needsAttention) {
        throw new OrderTransitionError(
          "Bu siparişin ödemesi kontrol ediliyor (Dikkat). Ödeme durumu netleşmeden kargolamayın."
        );
      }
      const shippable: OrderStatus[] = ["PAID", "PROCESSING", "SHIPPED"];
      if (!shippable.includes(order.status)) {
        throw new OrderTransitionError(
          order.status === "PENDING"
            ? "Ödemesi alınmamış sipariş kargolanamaz."
            : order.status === "CANCELLED" || order.status === "REFUNDED"
              ? "Bu sipariş kapandı (iptal/iade); kargolanamaz. Sayfayı yenileyin."
              : "Bu durumdaki sipariş kargolanamaz."
        );
      }
      if (await isFullyRefunded(tx, orderId)) throw new OrderTransitionError(FULLY_REFUNDED_MESSAGE);
      if (order.status !== "SHIPPED" && (await hasOpenCancelRequest(tx, orderId))) {
        throw new OrderTransitionError(OPEN_CANCEL_REQUEST_MESSAGE);
      }
      if (input.addressSeenAt !== undefined && order.status !== "SHIPPED") {
        const last = await lastDeliveryChange(orderId, tx);
        if (last && last.createdAt.getTime() > (input.addressSeenAt ?? 0)) {
          throw new OrderTransitionError(
            `Teslimat bilgileri bu sayfa açıldıktan sonra değişti (${last.actorType === "CUSTOMER" ? "müşteri" : "yönetici"}, ${dateTimeTr(last.createdAt)}). Sayfa yenilendi: yeni adresi kontrol edin, paket fişini yazdırdıysanız yeniden yazdırıp tekrar kargoya verin.`,
            409
          );
        }
      }

      const shipment = await tx.shipment.create({
        data: {
          orderId,
          carrier,
          trackingNumber,
          trackingUrl: explicitUrl,
          createdById: actorId,
        },
      });

      if (order.status !== "SHIPPED") {
        const { count } = await tx.order.updateMany({
          where: { id: orderId, status: order.status },
          data: { status: "SHIPPED" },
        });
        if (count !== 1) throw new OrderTransitionError("Sipariş durumu bu sırada değişti, sayfayı yenileyin.");
        await recordOrderEvent(tx, {
          orderId,
          type: "STATUS",
          actorType: "ADMIN",
          actorId,
          fromStatus: order.status,
          toStatus: "SHIPPED",
          visibleToCustomer: false,
          message: "Kargoya verildi.",
        });
      }
      await recordOrderEvent(tx, {
        orderId,
        type: "SHIPMENT",
        actorType: "ADMIN",
        actorId,
        visibleToCustomer: true,
        message: `${carrier} ile kargoya verildi. Takip no: ${trackingNumber}`,
      });
      await writeOutbox(tx, {
        topic: "order.shipped",
        aggregateType: "order",
        aggregateId: orderId,
        dedupeKey: `order.shipped:${shipment.id}`,
        payload: { orderId, shipmentId: shipment.id, additional: order.status === "SHIPPED" },
      });
      return { ...shipment, trackingLink: trackingLinkFor(carrier, trackingNumber, explicitUrl) };
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new OrderTransitionError("Bu takip numarası başka bir gönderide kayıtlı.", 409);
    }
    throw err;
  }
}

// ── İade kaydı ───────────────────────────────────────────────────────────

export interface RefundInput {
  amountKurus: number;
  method: RefundMethod;
  reference?: string | null;
  reason: string;
  /** Kargolanmış siparişin tam iadesinde geri gelen ürünler stoğa eklensin mi */
  restock?: boolean;
}

/**
 * İade kaydı. Alınan ödemenin tamamı iade edilince açık sipariş kendiliğinden kapanır: kargolanmamış → İptal
 * edildi (stok geri eklenir), kargolanmış/teslim edilmiş → İade edildi. Parası iade edilmiş sipariş açık kalıp
 * hazırlanamaz/kargolanamaz. Kısmi iadede sipariş sürer. İade kaydı açık iade (cayma) bildirimini kapatır.
 */
export async function recordRefund(orderId: string, input: RefundInput, actorId: string | null) {
  if (!Number.isInteger(input.amountKurus) || input.amountKurus <= 0) {
    throw new OrderTransitionError("İade tutarı geçersiz.", 400);
  }
  const reason = input.reason.trim();
  if (reason.length < 3) throw new OrderTransitionError("İade sebebini yazın.", 400);

  return prisma.$transaction(async (tx) => {
    const order = await lockOrder(tx, orderId);
    const paid = await paidAmountKurus(tx, orderId);
    if (paid <= 0) {
      throw new OrderTransitionError("Bu siparişin alınmış bir ödemesi yok; iade kaydı girilmez (gerekirse iptal edin).");
    }
    const refunded = await refundedAmountKurus(tx, orderId);
    const remaining = paid - refunded;
    if (input.amountKurus > remaining) {
      throw new OrderTransitionError(
        `İade tutarı iade edilebilir tutarı aşıyor (alınan ${formatPrice(paid)}, daha önce iade ${formatPrice(refunded)}).`,
        400
      );
    }

    const closes = refunded + input.amountKurus >= paid && order.status !== "CANCELLED" && order.status !== "REFUNDED";
    const refund = await tx.refund.create({
      data: {
        orderId,
        amountKurus: input.amountKurus,
        method: input.method,
        reference: input.reference?.trim().slice(0, 120) || null,
        reason: reason.slice(0, 2000),
        createdById: actorId,
      },
    });
    await recordOrderEvent(tx, {
      orderId,
      type: "REFUND",
      actorType: "ADMIN",
      actorId,
      visibleToCustomer: true,
      message: `${formatPrice(input.amountKurus)} ${REFUND_METHOD_TR[input.method]} yapıldı.`,
    });
    await writeOutbox(tx, {
      topic: "order.refunded",
      aggregateType: "order",
      aggregateId: orderId,
      dedupeKey: `order.refunded:${refund.id}`,
      payload: { orderId, refundId: refund.id, closes },
    });

    await tx.customerRequest.updateMany({
      where: { orderId, type: "RETURN", status: "OPEN" },
      data: { status: "RESOLVED", resolvedAt: new Date(), resolvedById: actorId, resolutionNote: "İade kaydı girildi." },
    });

    if (closes) {
      const shipped = order.status === "SHIPPED" || order.status === "DELIVERED";
      await changeStatusInTx(tx, order, shipped ? "REFUNDED" : "CANCELLED", actorId, {
        actorType: "ADMIN",
        reason: shipped ? null : "ödemeniz iade edildi",
        restock: input.restock,
        refundId: refund.id,
      });
    }
    return refund;
  });
}

// ── Müşteri talepleri ────────────────────────────────────────────────────

/** Müşterinin bu siparişte yapabileceği işlemler (sipariş sayfasında düğmeler) */
export function customerOptions(status: OrderStatus) {
  return {
    /** Ödenmemiş sipariş müşteri tarafından hemen iptal edilir (stok geri döner) */
    canCancelNow: status === "PENDING",
    /** Ödenmiş/hazırlanan siparişte iptal isteği (işletme karar verir, iade yapar) */
    canRequestCancel: status === "PAID" || status === "PROCESSING",
    /** Kargolanmış/teslim edilmiş siparişte cayma (iade) bildirimi */
    canRequestReturn: status === "SHIPPED" || status === "DELIVERED",
  };
}

export async function cancelByCustomer(reference: string): Promise<{ orderId: string }> {
  const found = await prisma.order.findUnique({ where: { reference }, select: { id: true } });
  if (!found) throw new OrderTransitionError("Sipariş bulunamadı.", 404);
  await prisma.$transaction(async (tx) => {
    const order = await lockOrder(tx, found.id);
    if (order.status !== "PENDING") {
      throw new OrderTransitionError("Bu sipariş artık doğrudan iptal edilemez; iptal isteği gönderin.");
    }
    if (order.needsAttention) {
      throw new OrderTransitionError("Bu siparişin ödemesi kontrol ediliyor; lütfen bizi arayın.");
    }
    await changeStatusInTx(tx, order, "CANCELLED", null, { actorType: "CUSTOMER", reason: "isteğiniz üzerine" });
  });
  return { orderId: found.id };
}

export interface CustomerRequestInput {
  type: CustomerRequestType;
  message: string;
  ipAddress?: string | null;
}

/** Aynı türde açık talep varsa yenisi açılmaz (o döner) */
export async function createCustomerRequest(reference: string, input: CustomerRequestInput) {
  const found = await prisma.order.findUnique({ where: { reference }, select: { id: true } });
  if (!found) throw new OrderTransitionError("Sipariş bulunamadı.", 404);
  const message = input.message.trim().slice(0, 2000);

  return prisma.$transaction(async (tx) => {
    const order = await lockOrder(tx, found.id);
    const opts = customerOptions(order.status);
    if (input.type === "CANCEL" && !opts.canRequestCancel) {
      throw new OrderTransitionError(
        order.status === "PENDING" ? "Ödenmemiş siparişi doğrudan iptal edebilirsiniz." : "Bu sipariş için iptal isteği gönderilemez."
      );
    }
    if (input.type === "RETURN" && !opts.canRequestReturn) {
      throw new OrderTransitionError("İade (cayma) bildirimi kargolanmış ya da teslim edilmiş siparişte yapılır.");
    }
    const open = await tx.customerRequest.findFirst({ where: { orderId: order.id, type: input.type, status: "OPEN" } });
    if (open) return { request: open, created: false };

    const request = await tx.customerRequest.create({
      data: { orderId: order.id, type: input.type, message, ipAddress: input.ipAddress ?? null },
    });
    await recordOrderEvent(tx, {
      orderId: order.id,
      type: "REQUEST",
      actorType: "CUSTOMER",
      visibleToCustomer: true,
      message: input.type === "CANCEL" ? "İptal isteğiniz bize ulaştı." : "İade (cayma) bildiriminiz bize ulaştı.",
    });
    await writeOutbox(tx, {
      topic: "order.customer_request",
      aggregateType: "order",
      aggregateId: order.id,
      dedupeKey: `order.request:${request.id}`,
      payload: { orderId: order.id, requestId: request.id, type: input.type },
    });
    return { request, created: true };
  });
}

/**
 * Müşterinin talebini reddeder; sipariş sürer. Müşteriye e-posta gider; yöneticinin yazdığı sebep e-postada ve sipariş
 * sayfasında görünür. Kabul edilen talep elle kapatılmaz: iptal isteği sipariş iptal edilince, iade bildirimi iade
 * kaydı girilince kendiliğinden kapanır (talep "sonuçlandı" görünüp sipariş devam etmesin).
 */
export async function rejectCustomerRequest(requestId: string, note: string | null | undefined, actorId: string) {
  return prisma.$transaction(async (tx) => {
    const req = await tx.customerRequest.findUnique({ where: { id: requestId } });
    if (!req) throw new OrderTransitionError("Talep bulunamadı.", 404);
    const text = note?.trim() || null;
    const { count } = await tx.customerRequest.updateMany({
      where: { id: requestId, status: "OPEN" },
      data: { status: "REJECTED", resolutionNote: text, resolvedAt: new Date(), resolvedById: actorId },
    });
    if (count !== 1) throw new OrderTransitionError("Talep zaten kapanmış.");
    await recordOrderEvent(tx, {
      orderId: req.orderId,
      type: "REQUEST",
      actorType: "ADMIN",
      actorId,
      visibleToCustomer: false,
      message: `${req.type === "CANCEL" ? "İptal isteği" : "İade bildirimi"} reddedildi${text ? `: ${text}` : ""}`,
    });
    await recordOrderEvent(tx, {
      orderId: req.orderId,
      type: "REQUEST",
      actorType: "ADMIN",
      actorId,
      visibleToCustomer: true,
      message:
        (req.type === "CANCEL"
          ? "İptal isteğiniz kabul edilemedi; siparişiniz işleme devam ediyor."
          : "İade (cayma) bildiriminiz kabul edilemedi.") + (text ? ` Açıklama: ${text}` : " Sorunuz için bize ulaşabilirsiniz."),
    });
    // Müşteriye e-posta ("İptal isteğiniz alındı" e-postası sonucu e-postayla bildireceğimizi söylüyor)
    await writeOutbox(tx, {
      topic: "order.request_rejected",
      aggregateType: "order",
      aggregateId: req.orderId,
      dedupeKey: `order.request_rejected:${req.id}`,
      payload: { orderId: req.orderId, requestId: req.id, type: req.type, note: text },
    });
    return { ...req, status: "REJECTED" as const };
  });
}

// ── Teslimat bilgisi ─────────────────────────────────────────────────────

/** Teslimat bilgisi (alıcı adı, telefon, adres) sipariş kargoya verilene kadar değiştirilebilir */
export const DELIVERY_EDITABLE_STATUSES: readonly OrderStatus[] = ["PENDING", "PAID", "PROCESSING"];
export const canChangeDelivery = (status: string) => (DELIVERY_EDITABLE_STATUSES as readonly string[]).includes(status);

export type DeliveryActor = { type: "CUSTOMER" } | { type: "ADMIN"; id: string };

const DELIVERY_FIELDS = ["firstName", "lastName", "phone", "city", "district", "address", "postalCode"] as const;

/**
 * Teslimat bilgisini değiştirir: müşteri sipariş sayfasından (izni lib/orders/access.ts denetler), yönetici panelden.
 * Sipariş satırı kilitlenir; kargoya verilmiş ya da kapanmış siparişte reddedilir (aynı anda "kargoya ver" ile
 * yarışta önce kilitleyen geçerli olur; kargolama da ekrandaki adresin güncel olduğunu denetler — shipOrder).
 * Eski ve yeni adres yalnız yöneticiye görünen geçmiş kaydına, müşteriye "güncellendi" kaydı ve bildirim olayı
 * (müşteriye bilgi e-postası; müşteri değiştirdiyse işletmeye de) aynı işlemde yazılır. Bildirim olayında kişisel
 * veri yok: adresler geçmiş kaydından okunur.
 * Fatura düzenlenmiş ve fatura adresi "teslimatla aynı" ise eski adres faturaya sabitlenir (kesilmiş fatura değişmez).
 * Ad soyad / telefon alıcınındır; siparişi veren kişinin bilgisi (e-posta dahil) değişmez.
 */
export async function changeShippingAddress(
  orderId: string,
  input: DeliveryChangeInput,
  actor: DeliveryActor
): Promise<{ changed: boolean }> {
  return prisma.$transaction(async (tx) => {
    const locked = await lockOrder(tx, orderId);
    if (!canChangeDelivery(locked.status)) {
      throw new OrderTransitionError(
        locked.status === "SHIPPED" || locked.status === "DELIVERED"
          ? "Sipariş kargoya verildi; teslimat adresi artık buradan değiştirilemez. Kargo firmasıyla ya da bizimle iletişime geçin."
          : "Bu sipariş kapandı (iptal ya da iade); teslimat bilgisi değiştirilemez."
      );
    }
    const row = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { shippingAddress: true, billingInfo: true, invoiceNumber: true, guestName: true },
    });
    const old = (row.shippingAddress ?? {}) as unknown as ShippingAddress;
    const next: ShippingAddress = {
      ...old,
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      city: input.city,
      district: input.district,
      address: input.address,
    };
    if (input.postalCode) next.postalCode = input.postalCode;
    else delete next.postalCode;
    if (DELIVERY_FIELDS.every((f) => (old[f] ?? "") === (next[f] ?? ""))) return { changed: false };

    // Kesilmiş faturanın adresi değişmesin: "teslimatla aynı" ise önceki adres faturaya yazılır
    const billing = row.billingInfo as unknown as BillingInfo | null;
    const freezeBilling = !!row.invoiceNumber && (billing === null || billing.sameAsShipping);
    const frozenBilling: BillingInfo | null = freezeBilling
      ? {
          ...(billing ?? { type: "INDIVIDUAL" as const, name: row.guestName?.trim() || `${old.firstName ?? ""} ${old.lastName ?? ""}`.trim() }),
          sameAsShipping: false,
          address: old.address,
          district: old.district,
          city: old.city,
        }
      : null;

    await tx.order.update({
      where: { id: orderId },
      data: {
        shippingAddress: next as unknown as Prisma.InputJsonValue,
        ...(frozenBilling ? { billingInfo: frozenBilling as unknown as Prisma.InputJsonValue } : {}),
      },
    });

    const actorId = actor.type === "ADMIN" ? actor.id : null;
    const by = actor.type === "CUSTOMER" ? "müşteri, sipariş sayfasından" : "yönetici, panelden";
    const eventId = await recordOrderEvent(tx, {
      orderId,
      type: "ADDRESS",
      actorType: actor.type,
      actorId,
      visibleToCustomer: false,
      message: [
        `Teslimat bilgileri değiştirildi (${by}).`,
        `Önceki: ${addressText(old)}`,
        `Yeni: ${addressText(next)}`,
        ...(frozenBilling ? ["Fatura düzenlenmiş olduğu için fatura adresi önceki adreste bırakıldı."] : []),
      ].join("\n"),
    });
    await recordOrderEvent(tx, {
      orderId,
      type: "ADDRESS",
      actorType: actor.type,
      actorId,
      visibleToCustomer: true,
      message: "Teslimat bilgileriniz güncellendi.",
    });
    await writeOutbox(tx, {
      topic: "order.address_changed",
      aggregateType: "order",
      aggregateId: orderId,
      dedupeKey: `order.address_changed:${eventId}`,
      payload: { orderId, eventId, by: actor.type },
    });
    return { changed: true };
  });
}

/** Siparişin son teslimat bilgisi değişikliği (yöneticinin gördüğü adres güncel mi denetimi için) */
export async function lastDeliveryChange(orderId: string, db: Tx | typeof prisma = prisma) {
  return db.orderEvent.findFirst({
    where: { orderId, type: "ADDRESS", visibleToCustomer: false },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdAt: true, actorType: true, message: true },
  });
}

// ── Not ve fatura ───────────────────────────────────────────────────────

export async function addOrderNote(orderId: string, message: string, actorId: string) {
  const text = message.trim();
  if (text.length < 2) throw new OrderTransitionError("Not boş olamaz.", 400);
  await prisma.$transaction(async (tx) => {
    await lockOrder(tx, orderId);
    await recordOrderEvent(tx, {
      orderId,
      type: "NOTE",
      actorType: "ADMIN",
      actorId,
      visibleToCustomer: false,
      message: text.slice(0, 2000),
    });
  });
}

export async function setInvoice(orderId: string, input: { invoiceNumber: string; issuedAt: Date }, actorId: string) {
  const invoiceNumber = input.invoiceNumber.trim().toUpperCase();
  if (!/^[A-Z0-9-]{3,60}$/.test(invoiceNumber)) throw new OrderTransitionError("Fatura numarası geçersiz.", 400);
  await prisma.$transaction(async (tx) => {
    await lockOrder(tx, orderId);
    await tx.order.update({ where: { id: orderId }, data: { invoiceNumber, invoiceIssuedAt: input.issuedAt } });
    await recordOrderEvent(tx, {
      orderId,
      type: "INVOICE",
      actorType: "ADMIN",
      actorId,
      visibleToCustomer: true,
      message: `Faturanız düzenlendi (no: ${invoiceNumber}).`,
    });
  });
}
