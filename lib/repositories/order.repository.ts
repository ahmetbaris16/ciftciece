/**
 * Order Repository
 *
 * Sipariş oluşturma (transaction ile stok düşürme),
 * sipariş sorgulama, durum güncelleme.
 */

import { prisma } from "@/lib/db/prisma";
import type { Order, OrderStatus, PaymentMethod, ShippingAddress } from "@/types";
import type { Prisma } from "@prisma/client";
import { recordPaymentEvent } from "@/lib/payment/events";
import { recordCashOnDeliveryCollected } from "@/lib/payment/offline";
import { CARD_RESERVATION_MINUTES } from "@/lib/payment/reservation";

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

/**
 * Sipariş durumu güncelleme
 */
export async function updateOrderStatus(
  orderId: string,
  newStatus: OrderStatus,
  actorId: string | null = null
): Promise<Order | null> {
  if (!USE_DB) return null;

  // Geçerli durum geçişleri (PENDING → PAID yalnız ödeme kaydıyla: confirmBankTransferPayment / applyProviderResult)
  const VALID_TRANSITIONS: Record<string, string[]> = {
    PENDING: ["PAID", "CANCELLED"],
    PAID: ["PROCESSING", "CANCELLED", "REFUNDED"],
    PROCESSING: ["SHIPPED", "CANCELLED"],
    SHIPPED: ["DELIVERED"],
    DELIVERED: [],
    CANCELLED: [],
    REFUNDED: [],
  };

  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order) return null;

  const allowed = VALID_TRANSITIONS[order.status] ?? [];
  if (!allowed.includes(newStatus)) {
    throw new Error(`Geçersiz durum geçişi: ${order.status} → ${newStatus}`);
  }

  // İptalde ayrılmış stok iade edilir (PENDING/PAID/PROCESSING → CANCELLED).
  // Koşullu güncelleme: aynı anda iki iptal isteği stoğu iki kez iade etmez.
  const updated = await prisma.$transaction(async (tx) => {
    const { count } = await tx.order.updateMany({
      where: { id: orderId, status: order.status },
      data: { status: newStatus },
    });
    if (count !== 1) throw new Error("Sipariş durumu bu sırada değişti, sayfayı yenileyin.");
    if (newStatus === "CANCELLED") {
      await restoreStock(tx, orderId);
      // Ödenmemiş denemeler kapanır; başarılı ödeme kaydına dokunulmaz (iade ayrı kayıt, Oturum 5)
      const expired = await expireOpenAttempts(tx, orderId);
      await tx.payment.updateMany({ where: { orderId, status: "PENDING" }, data: { status: "FAILED" } });
      if (expired > 0) {
        await recordPaymentEvent(tx, {
          source: "ADMIN",
          eventType: "attempts.expired",
          orderId,
          actorId,
          outcome: "order_cancelled",
          payload: { previousStatus: order.status, expiredAttempts: expired },
        });
      }
    }
    // Kapıda ödeme: teslim edildiğinde para kargo görevlisine ödenmiştir
    if (newStatus === "DELIVERED" && order.paymentMethod === "CASH_ON_DELIVERY") {
      await recordCashOnDeliveryCollected(tx, order, actorId);
    }
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
export async function releaseExpiredOrders(now = new Date()): Promise<number> {
  if (!USE_DB) return 0;
  const cutoff = new Date(now.getTime() - CARD_RESERVATION_MINUTES * 60_000);
  const expired = await prisma.order.findMany({
    where: {
      status: "PENDING",
      needsAttention: false,
      OR: [{ paymentDueAt: { lt: now } }, { paymentDueAt: null, createdAt: { lt: cutoff } }],
      paymentEvents: { none: { source: "WEBHOOK", status: { in: ["RECEIVED", "FAILED"] } } },
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
      return true;
    });
    if (done) released++;
  }
  if (released > 0) console.info(`[orders] ${released} süresi dolan sipariş iptal edildi, stok iade edildi.`);
  return released;
}
