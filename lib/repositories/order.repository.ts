/**
 * Order Repository
 *
 * Sipariş oluşturma (transaction ile stok düşürme),
 * sipariş sorgulama, durum güncelleme.
 */

import { prisma } from "@/lib/db/prisma";
import type { BillingInfo, Order, OrderStatus, PaymentMethod, ShippingAddress } from "@/types";
import type { Prisma } from "@prisma/client";
import { recordPaymentEvent } from "@/lib/payment/events";
import { recordCashOnDeliveryCollected } from "@/lib/payment/offline";
import { CARD_RESERVATION_MINUTES } from "@/lib/payment/reservation";
import { customerStatusMessage, recordOrderEvent, type OrderActorType } from "@/lib/orders/events";
import { writeOutbox } from "@/lib/outbox";

const USE_DB = !!process.env.DATABASE_URL;

type DbOrderWithItems = Prisma.OrderGetPayload<{ include: { items: true } }>;

/** DB kaydı → uygulama tipi (tek yerde) */
function toOrder(o: DbOrderWithItems): Order {
  return {
    id: o.id,
    reference: o.reference,
    guestEmail: o.guestEmail,
    guestName: o.guestName,
    status: o.status as OrderStatus,
    items: o.items.map((i) => ({
      id: i.id,
      variantId: i.variantId,
      snapshotName: i.snapshotName,
      snapshotVariant: i.snapshotVariant,
      snapshotPrice: i.snapshotPrice,
      quantity: i.quantity,
      vatRateBps: i.vatRateBps,
      discountKurus: i.discountKurus,
    })),
    shippingAddress: o.shippingAddress as unknown as ShippingAddress,
    subtotalKurus: o.subtotalKurus,
    shippingKurus: o.shippingKurus,
    discountKurus: o.discountKurus,
    totalKurus: o.totalKurus,
    paymentMethod: o.paymentMethod as PaymentMethod,
    paymentFeeKurus: o.paymentFeeKurus,
    paymentDueAt: o.paymentDueAt,
    notes: o.notes,
    needsAttention: o.needsAttention,
    billingInfo: (o.billingInfo as unknown as BillingInfo | null) ?? null,
    customerNote: o.customerNote,
    invoiceNumber: o.invoiceNumber,
    invoiceIssuedAt: o.invoiceIssuedAt,
    createdAt: o.createdAt,
  };
}

/** Stok yetersizliği — mesajı müşteriye gösterilebilir. */
export class OutOfStockError extends Error {
  constructor(public readonly userMessage: string) {
    super(userMessage);
    this.name = "OutOfStockError";
  }
}

interface CreateOrderInput {
  /** Üye girişliyken verilen sipariş (Hesabım → Siparişlerim'de görünür); misafirde yok */
  userId?: string | null;
  guestEmail: string;
  guestName: string;
  guestPhone: string;
  shippingAddress: ShippingAddress;
  items: Array<{
    variantId: string;
    snapshotName: string;
    snapshotVariant: string;
    /** Birim fiyat (kuruş), DB'den */
    snapshotPrice: number;
    quantity: number;
    /** Ürünün KDV oranı (baz puan); bilinmiyorsa null — uydurulmaz */
    vatRateBps?: number | null;
    /** Kalem indirimi (kuruş) */
    discountKurus?: number;
  }>;
  /** Kalemlerin (birim × adet − kalem indirimi) toplamı */
  subtotalKurus: number;
  shippingKurus: number;
  discountKurus?: number;
  paymentMethod: PaymentMethod;
  /** Ödeme yöntemi ücreti (kapıda ödeme hizmet bedeli); toplama eklenir */
  paymentFeeKurus?: number;
  /** Ödenmezse otomatik iptal zamanı; null = süre yok (kapıda ödeme) */
  paymentDueAt: Date | null;
  /**
   * Kart/havale: PENDING (ödeme bekleniyor). Kapıda ödeme: PROCESSING (sipariş kesinleşti, hazırlanıyor;
   * para teslimatta alınır).
   */
  initialStatus: "PENDING" | "PROCESSING";
  /** Havale/kapıda ödemede sağlayıcısız ödeme denemesi ("havale" / "kapida") — kartta deneme ödeme başlatılınca açılır */
  offlinePaymentProvider?: "havale" | "kapida";
  /** Checkout idempotency anahtarı ve istek özeti (orders.idempotencyKey UNIQUE) */
  idempotencyKey?: string | null;
  idempotencyHash?: string | null;
  /** Fatura bilgisi (bireysel/kurumsal) */
  billingInfo?: BillingInfo | null;
  /** Müşterinin sipariş notu */
  customerNote?: string | null;
  /** Müşterinin onayladığı yasal metinler (sürüm) — siparişle aynı transaction'da yazılır */
  consents?: {
    documents: Array<{ document: string; version: string }>;
    acceptedAt: Date;
    ipAddress: string | null;
  };
}

/**
 * Sipariş oluşturur ve stok düşer — atomik transaction.
 *
 * 1. Stok düş (koşullu UPDATE — yetersizse OutOfStockError, transaction geri alınır)
 * 2. Order + OrderItem oluştur
 * 3. Return order
 */
export async function createOrder(input: CreateOrderInput): Promise<Order> {
  if (!USE_DB) {
    // Mock mode — gerçek DB olmadan sipariş oluşturulamaz
    throw new Error("DB bağlantısı olmadan sipariş oluşturulamaz");
  }

  // Ara toplam kalemlerden yeniden hesaplanır: çağıranın hesabı kalemlerle uyuşmuyorsa sipariş açılmaz
  const itemsTotal = input.items.reduce(
    (sum, item) => sum + item.snapshotPrice * item.quantity - (item.discountKurus ?? 0),
    0
  );
  if (itemsTotal !== input.subtotalKurus) {
    throw new Error(`Ara toplam (${input.subtotalKurus}) kalemlerle (${itemsTotal}) uyuşmuyor`);
  }
  const totalKurus =
    input.subtotalKurus + input.shippingKurus + (input.paymentFeeKurus ?? 0) - (input.discountKurus ?? 0);

  const order = await prisma.$transaction(async (tx) => {
    // 1. Stok düş — koşullu ve atomik.
    //    "quantity >= istenen" koşulu UPDATE içinde değerlendirilir; Postgres satırı
    //    kilitleyip koşulu yeniden kontrol ettiği için eşzamanlı iki sipariş aynı
    //    son ürünü alamaz (önce-oku-sonra-yaz yaklaşımındaki overselling yarışı yok).
    //    Satırlar variantId sırasıyla kilitlenir: kalemleri farklı sırada gelen eşzamanlı
    //    iki siparişte deadlock oluşmaz (R-26).
    const lockOrder = [...input.items].sort((a, b) => (a.variantId < b.variantId ? -1 : a.variantId > b.variantId ? 1 : 0));
    for (const item of lockOrder) {
      const { count } = await tx.inventory.updateMany({
        where: { variantId: item.variantId, quantity: { gte: item.quantity } },
        data: { quantity: { decrement: item.quantity } },
      });

      if (count !== 1) {
        throw new OutOfStockError(
          `${item.snapshotName} (${item.snapshotVariant}) için yeterli stok kalmadı. Lütfen adedi azaltın.`
        );
      }
    }

    // 2. Order oluştur
    const newOrder = await tx.order.create({
      data: {
        userId: input.userId ?? null,
        guestEmail: input.guestEmail,
        guestName: input.guestName,
        guestPhone: input.guestPhone,
        status: input.initialStatus,
        shippingAddress: input.shippingAddress as unknown as Prisma.InputJsonValue,
        subtotalKurus: input.subtotalKurus,
        shippingKurus: input.shippingKurus,
        discountKurus: input.discountKurus ?? 0,
        totalKurus,
        paymentMethod: input.paymentMethod,
        paymentFeeKurus: input.paymentFeeKurus ?? 0,
        paymentDueAt: input.paymentDueAt,
        idempotencyKey: input.idempotencyKey ?? null,
        idempotencyHash: input.idempotencyHash ?? null,
        billingInfo: (input.billingInfo ?? undefined) as Prisma.InputJsonValue | undefined,
        customerNote: input.customerNote?.trim() || null,
        ...(input.offlinePaymentProvider && {
          paymentAttempts: {
            create: {
              provider: input.offlinePaymentProvider,
              method: input.paymentMethod,
              amountKurus: totalKurus,
              currency: "TRY",
            },
          },
        }),
        ...(input.consents && {
          consents: {
            create: input.consents.documents.map((d) => ({
              document: d.document,
              version: d.version,
              acceptedAt: input.consents!.acceptedAt,
              ipAddress: input.consents!.ipAddress,
            })),
          },
        }),
        items: {
          create: input.items.map((item) => ({
            variantId: item.variantId,
            snapshotName: item.snapshotName,
            snapshotVariant: item.snapshotVariant,
            snapshotPrice: item.snapshotPrice,
            quantity: item.quantity,
            vatRateBps: item.vatRateBps ?? null,
            discountKurus: item.discountKurus ?? 0,
          })),
        },
      },
      include: { items: true },
    });

    // Geçmiş ve bildirim olayı siparişle aynı işlemde: sipariş varsa kaydı ve e-postası da vardır
    await recordOrderEvent(tx, {
      orderId: newOrder.id,
      type: "CREATED",
      actorType: "CUSTOMER",
      actorId: input.userId ?? null,
      visibleToCustomer: true,
      toStatus: newOrder.status,
      message:
        input.paymentMethod === "CARD"
          ? "Sipariş oluşturuldu, kart ödemesi bekleniyor."
          : input.paymentMethod === "BANK_TRANSFER"
            ? "Siparişiniz alındı, havale/EFT ödemesi bekleniyor."
            : "Siparişiniz alındı (kapıda ödeme).",
    });
    await writeOutbox(tx, {
      topic: "order.placed",
      aggregateType: "order",
      aggregateId: newOrder.id,
      dedupeKey: `order.placed:${newOrder.id}`,
      payload: { orderId: newOrder.id, reference: newOrder.reference, paymentMethod: newOrder.paymentMethod },
    });

    return newOrder;
  });

  return toOrder(order);
}

/**
 * Checkout idempotency anahtarıyla açılmış sipariş (yoksa null) ve isteğin özeti.
 */
export async function findOrderByIdempotencyKey(
  key: string
): Promise<{ order: Order; idempotencyHash: string | null } | null> {
  if (!USE_DB) return null;
  const order = await prisma.order.findUnique({ where: { idempotencyKey: key }, include: { items: true } });
  return order ? { order: toOrder(order), idempotencyHash: order.idempotencyHash } : null;
}

/**
 * Sipariş referansı ile sorgu
 */
export async function getOrderByReference(reference: string): Promise<Order | null> {
  if (!USE_DB) return null;

  const order = await prisma.order.findUnique({
    where: { reference },
    include: { items: true },
  });

  if (!order) return null;

  return toOrder(order);
}

/**
 * Admin — tüm siparişler (filtreleme/pagination)
 */
export async function getOrdersForAdmin(options?: {
  status?: OrderStatus;
  page?: number;
  perPage?: number;
}): Promise<{ orders: Order[]; total: number }> {
  if (!USE_DB) return { orders: [], total: 0 };

  const page = options?.page ?? 1;
  const perPage = options?.perPage ?? 20;
  const where: Prisma.OrderWhereInput = {};
  if (options?.status) {
    where.status = options.status;
  }

  const [orders, total] = await Promise.all([
    prisma.order.findMany({
      where,
      include: { items: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.order.count({ where }),
  ]);

  return {
    orders: orders.map(toOrder),
    total,
  };
}

/** Durum geçişi kurallara uymuyor — mesaj admin/müşteriye gösterilebilir */
export class OrderTransitionError extends Error {
  constructor(message: string, public readonly status = 409) {
    super(message);
    this.name = "OrderTransitionError";
  }
}

/**
 * Elle yapılan durum geçişleri. Ödeme ("ödendi") yalnız ödeme kaydıyla (kart: banka doğrulaması, havale:
 * confirmBankTransferPayment), kargolama yalnız takip numarasıyla (lib/orders/lifecycle.ts shipOrder) yapılır.
 * SHIPPED → CANCELLED: teslim edilemeyen/geri dönen kapıda ödemeli paket (ödeme alınmamış).
 */
const STATUS_TR: Record<OrderStatus, string> = {
  PENDING: "ödeme bekleniyor",
  PAID: "ödendi",
  PROCESSING: "hazırlanıyor",
  SHIPPED: "kargoda",
  DELIVERED: "teslim edildi",
  CANCELLED: "iptal edildi",
  REFUNDED: "iade edildi",
};

const MANUAL_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["CANCELLED"],
  PAID: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["CANCELLED"],
  SHIPPED: ["DELIVERED", "CANCELLED", "REFUNDED"],
  DELIVERED: ["REFUNDED"],
  CANCELLED: [],
  REFUNDED: [],
};

export interface StatusChangeOptions {
  actorType?: Exclude<OrderActorType, "PROVIDER">;
  /** Müşteriye görünen kısa sebep (iptal) */
  reason?: string | null;
  /**
   * Kargolanmış siparişte (iptal/iade) ürünler stoğa geri eklensin mi. Kargolanmamış siparişin iptalinde
   * stok her zaman geri eklenir. Varsayılan: geri dönen kapıda ödemeli paket evet, iade (REFUNDED) hayır.
   */
  restock?: boolean;
  /** Geçiş bir iade kaydıyla birlikte yapılıyorsa (tek e-posta gitsin) */
  refundId?: string | null;
}

export type OrderRow = {
  id: string;
  reference: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  totalKurus: number;
};

/** Siparişin alınmış ödemesi (kuruş): başarılı denemenin karttan çekilen/bildirilen tutarı; ödeme yoksa 0 */
export async function paidAmountKurus(tx: Tx, orderId: string): Promise<number> {
  const a = await tx.paymentAttempt.findFirst({
    where: { orderId, status: "SUCCEEDED" },
    select: { chargedAmountKurus: true, paidAmountKurus: true, amountKurus: true },
  });
  return a ? (a.chargedAmountKurus ?? a.paidAmountKurus ?? a.amountKurus) : 0;
}

export async function refundedAmountKurus(tx: Tx, orderId: string): Promise<number> {
  const r = await tx.refund.aggregate({ where: { orderId }, _sum: { amountKurus: true } });
  return r._sum.amountKurus ?? 0;
}

/** Alınan ödemenin tamamı iade kaydına geçmiş mi (ödemesi olmayan sipariş için false) */
export async function isFullyRefunded(tx: Tx, orderId: string): Promise<boolean> {
  const paid = await paidAmountKurus(tx, orderId);
  return paid > 0 && (await refundedAmountKurus(tx, orderId)) >= paid;
}

export async function hasOpenCancelRequest(tx: Tx, orderId: string): Promise<boolean> {
  return (await tx.customerRequest.count({ where: { orderId, type: "CANCEL", status: "OPEN" } })) > 0;
}

export const FULLY_REFUNDED_MESSAGE =
  "Bu siparişin ödemesinin tamamı iade edilmiş; hazırlanamaz, kargolanamaz ya da teslim edildi yapılamaz. Siparişi kapatın.";
export const OPEN_CANCEL_REQUEST_MESSAGE =
  "Müşteri bu siparişin iptalini istedi. Önce talebe karar verin: kabul ediyorsanız parayı iade edip iade kaydını girin (sipariş iptal edilir); etmiyorsanız talebi reddedin.";

/**
 * Durum geçişi — çağıranın işlemi içinde. Sipariş satırı koşullu güncellenir (aynı anda iki geçiş olmaz),
 * stok kurala göre geri eklenir, geçmiş ve bildirim olayı aynı işlemde yazılır.
 */
export async function changeStatusInTx(
  tx: Tx,
  order: OrderRow,
  newStatus: OrderStatus,
  actorId: string | null,
  opts: StatusChangeOptions = {}
): Promise<void> {
  if (newStatus === "PAID") {
    throw new OrderTransitionError("“Ödendi” durumu yalnız ödeme kaydıyla verilir (havale onayı ya da banka doğrulaması).");
  }
  if (newStatus === "SHIPPED") {
    throw new OrderTransitionError("Kargoya vermek için kargo takip numarasını girin.");
  }
  const allowed = MANUAL_TRANSITIONS[order.status] ?? [];
  if (!allowed.includes(newStatus)) {
    // Çoğunlukla eski sekmede kalmış düğme: sipariş bu arada başka duruma geçmiştir
    throw new OrderTransitionError(
      order.status === "CANCELLED" || order.status === "REFUNDED"
        ? `Bu sipariş ${STATUS_TR[order.status]} ve kapandı; başka işlem yapılamaz. Sayfayı yenileyin.`
        : `Sipariş şu an “${STATUS_TR[order.status]}” durumunda; “${STATUS_TR[newStatus]}” yapılamaz. Sayfayı yenileyin.`
    );
  }

  // Parası iade edilmiş ya da müşterisi iptal istemiş sipariş ilerletilmez (hem iade hem devam görünmesin)
  if (newStatus === "PROCESSING" || newStatus === "DELIVERED") {
    if (await isFullyRefunded(tx, order.id)) throw new OrderTransitionError(FULLY_REFUNDED_MESSAGE);
    if (newStatus === "PROCESSING" && (await hasOpenCancelRequest(tx, order.id))) {
      throw new OrderTransitionError(OPEN_CANCEL_REQUEST_MESSAGE);
    }
  }

  // Ödemesi alınmış sipariş iade kaydı olmadan iptal/iade edilemez (R-07)
  if (newStatus === "CANCELLED" || newStatus === "REFUNDED") {
    const paid = await paidAmountKurus(tx, order.id);
    if (paid > 0) {
      const refunded = await refundedAmountKurus(tx, order.id);
      if (refunded < paid) {
        throw new OrderTransitionError(
          "Bu siparişin ödemesi alınmış. Önce parayı iade edip iade kaydını girin; sipariş iade kaydıyla birlikte kapanır."
        );
      }
    } else if (newStatus === "REFUNDED") {
      throw new OrderTransitionError("Ödemesi alınmamış sipariş “iade edildi” yapılamaz; iptal edin.");
    }
  }

  const { count } = await tx.order.updateMany({
    where: { id: order.id, status: order.status },
    data: { status: newStatus },
  });
  if (count !== 1) throw new OrderTransitionError("Sipariş durumu bu sırada değişti, sayfayı yenileyin.");

  const shipped = order.status === "SHIPPED" || order.status === "DELIVERED";
  if (newStatus === "CANCELLED") {
    if (!shipped || opts.restock !== false) await restoreStock(tx, order.id);
    // Ödenmemiş denemeler kapanır; başarılı ödeme kaydına dokunulmaz (iade ayrı kayıt)
    const expired = await expireOpenAttempts(tx, order.id);
    await tx.payment.updateMany({ where: { orderId: order.id, status: "PENDING" }, data: { status: "FAILED" } });
    if (expired > 0) {
      await recordPaymentEvent(tx, {
        source: opts.actorType === "CUSTOMER" ? "SYSTEM" : "ADMIN",
        eventType: "attempts.expired",
        orderId: order.id,
        actorId,
        outcome: "order_cancelled",
        payload: { previousStatus: order.status, expiredAttempts: expired },
      });
    }
  }
  if (newStatus === "REFUNDED" && opts.restock === true) await restoreStock(tx, order.id);

  // Kapanan siparişte açık talep kalmaz: iptal/iade isteği bu kapanışla karşılanmış olur
  if (newStatus === "CANCELLED" || newStatus === "REFUNDED") {
    await tx.customerRequest.updateMany({
      where: { orderId: order.id, status: "OPEN" },
      data: {
        status: "RESOLVED",
        resolvedAt: new Date(),
        resolvedById: actorId,
        resolutionNote: newStatus === "CANCELLED" ? "Sipariş iptal edildi." : "Sipariş iade edildi.",
      },
    });
  }

  // Kapıda ödeme: teslim edildiğinde para kargo görevlisine ödenmiştir
  if (newStatus === "DELIVERED" && order.paymentMethod === "CASH_ON_DELIVERY") {
    await recordCashOnDeliveryCollected(tx, order, actorId);
  }

  const actorType = opts.actorType ?? "ADMIN";
  await recordOrderEvent(tx, {
    orderId: order.id,
    type: "STATUS",
    actorType,
    actorId,
    fromStatus: order.status,
    toStatus: newStatus,
    visibleToCustomer: true,
    message: customerStatusMessage(newStatus, opts.reason),
  });
  await writeOutbox(tx, {
    topic: "order.status_changed",
    aggregateType: "order",
    aggregateId: order.id,
    dedupeKey: `order.status:${order.id}:${newStatus}`,
    payload: {
      orderId: order.id,
      from: order.status,
      to: newStatus,
      actorType,
      reason: opts.reason ?? null,
      refundId: opts.refundId ?? null,
    },
  });
}

/**
 * Sipariş durumu güncelleme (admin ya da müşteri). Kurallar changeStatusInTx'te.
 */
export async function updateOrderStatus(
  orderId: string,
  newStatus: OrderStatus,
  actorId: string | null = null,
  opts: StatusChangeOptions = {}
): Promise<Order | null> {
  if (!USE_DB) return null;

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, reference: true, status: true, paymentMethod: true, totalKurus: true },
  });
  if (!order) return null;

  const updated = await prisma.$transaction(async (tx) => {
    await changeStatusInTx(tx, order as OrderRow, newStatus, actorId, opts);
    return tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
  });

  return toOrder(updated);
}

// ============================================================
// Stok iadesi ve süresi dolan siparişler
// ============================================================


type Tx = Prisma.TransactionClient;

/**
 * Siparişin kalemlerindeki adetleri stoğa geri ekler (aynı transaction içinde çağrılmalı).
 * Satırlar variantId sırasıyla güncellenir: kilit sırası her yerde aynı olsun (deadlock olmasın).
 */
async function restoreStock(tx: Tx, orderId: string) {
  const items = await tx.orderItem.findMany({ where: { orderId }, orderBy: { variantId: "asc" } });
  for (const item of items) {
    await tx.inventory.updateMany({
      where: { variantId: item.variantId },
      data: { quantity: { increment: item.quantity } },
    });
  }
}

/** Ödenmemiş (INITIATED) denemeleri kapatır; sonradan ödeme gelirse geç ödeme olarak değerlendirilir. */
async function expireOpenAttempts(tx: Tx, orderId: string): Promise<number> {
  const { count } = await tx.paymentAttempt.updateMany({
    where: { orderId, status: "INITIATED" },
    data: { status: "EXPIRED" },
  });
  return count;
}

/**
 * Süresi dolan PENDING siparişleri iptal eder ve stoklarını iade eder.
 * Son ödeme zamanı siparişte (paymentDueAt): kart ve havale için checkout'ta belirlenir.
 * paymentDueAt'i olmayan eski siparişlerde oluşturulma + CARD_RESERVATION_MINUTES kullanılır.
 * Cron gerektirmez: checkout ve admin sipariş listesi her açıldığında çağrılır.
 *
 * İptal EDİLMEYENLER:
 *  - NEEDS_ATTENTION işaretli sipariş (ödeme tarafında insan kararı bekleniyor),
 *  - işlenmemiş ödeme bildirimi (webhook gelen kutusunda RECEIVED/FAILED) olan sipariş.
 * Durum geçişi koşullu (PENDING → CANCELLED) yapıldığı için eşzamanlı çağrılarda
 * aynı sipariş iki kez iade edilmez. Sipariş notuna yazılmaz; olay payment_events'e düşer.
 */
export async function releaseExpiredOrders(now = new Date(), opts: { cardGraceMs?: number } = {}): Promise<number> {
  if (!USE_DB) return 0;
  const cutoff = new Date(now.getTime() - CARD_RESERVATION_MINUTES * 60_000);
  // Kart siparişi: süre dolduktan sonra ilk 15 dk yalnız zamanlanmış iş iptal eder — o iş iptalden ÖNCE bankaya
  // sorar (lib/payment/auto-reconcile.ts). Sipariş/admin sayfasından tetiklenen temizlik ödenmiş olabilecek
  // siparişi sormadan iptal etmesin. Zamanlanmış iş hiç çalışmıyorsa 15 dk sonra her tetikleyici iptal eder.
  const cardGraceMs = opts.cardGraceMs ?? 15 * 60_000;
  const expired = await prisma.order.findMany({
    where: {
      status: "PENDING",
      needsAttention: false,
      OR: [{ paymentDueAt: { lt: now } }, { paymentDueAt: null, createdAt: { lt: cutoff } }],
      paymentEvents: { none: { source: "WEBHOOK", status: { in: ["RECEIVED", "FAILED"] } } },
      ...(cardGraceMs > 0
        ? { NOT: { paymentMethod: "CARD", paymentDueAt: { gt: new Date(now.getTime() - cardGraceMs) } } }
        : {}),
    },
    select: { id: true, paymentMethod: true, paymentDueAt: true },
    take: 100,
  });

  let released = 0;
  for (const { id, paymentMethod, paymentDueAt } of expired) {
    const done = await prisma.$transaction(async (tx) => {
      const { count } = await tx.order.updateMany({
        where: { id, status: "PENDING", needsAttention: false },
        data: { status: "CANCELLED" },
      });
      if (count !== 1) return false; // başka bir istek zaten işledi
      await restoreStock(tx, id);
      const expiredAttempts = await expireOpenAttempts(tx, id);
      await tx.payment.updateMany({ where: { orderId: id, status: "PENDING" }, data: { status: "FAILED" } });
      await recordPaymentEvent(tx, {
        source: "SYSTEM",
        eventType: "order.expired",
        orderId: id,
        outcome: "cancelled_stock_released",
        payload: { paymentMethod, paymentDueAt: paymentDueAt?.toISOString() ?? null, expiredAttempts },
      });
      const reason = "ödeme süresi içinde ödeme alınmadı";
      await recordOrderEvent(tx, {
        orderId: id,
        type: "STATUS",
        actorType: "SYSTEM",
        fromStatus: "PENDING",
        toStatus: "CANCELLED",
        visibleToCustomer: true,
        message: customerStatusMessage("CANCELLED", reason),
      });
      await writeOutbox(tx, {
        topic: "order.status_changed",
        aggregateType: "order",
        aggregateId: id,
        dedupeKey: `order.status:${id}:CANCELLED`,
        payload: { orderId: id, from: "PENDING", to: "CANCELLED", actorType: "SYSTEM", reason, expired: true, refundId: null },
      });
      return true;
    });
    if (done) released++;
  }
  if (released > 0) console.info(`[orders] ${released} süresi dolan sipariş iptal edildi, stok iade edildi.`);
  return released;
}
