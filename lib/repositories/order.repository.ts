/**
 * Order Repository
 *
 * Sipariş oluşturma (transaction ile stok düşürme),
 * sipariş sorgulama, durum güncelleme.
 */

import { prisma } from "@/lib/db/prisma";
import type { Order, OrderStatus, PaymentMethod, ShippingAddress } from "@/types";
import type { Prisma } from "@prisma/client";

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
    snapshotPrice: number;
    quantity: number;
  }>;
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
  /** Havale/kapıda ödemede sağlayıcısız ödeme kaydı ("havale" / "kapida") — kart için ödeme başlatılınca açılır */
  offlinePaymentProvider?: "havale" | "kapida";
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

  const totalKurus =
    input.subtotalKurus + input.shippingKurus + (input.paymentFeeKurus ?? 0) - (input.discountKurus ?? 0);

  const order = await prisma.$transaction(async (tx) => {
    // 1. Stok düş — koşullu ve atomik.
    //    "quantity >= istenen" koşulu UPDATE içinde değerlendirilir; Postgres satırı
    //    kilitleyip koşulu yeniden kontrol ettiği için eşzamanlı iki sipariş aynı
    //    son ürünü alamaz (önce-oku-sonra-yaz yaklaşımındaki overselling yarışı yok).
    for (const item of input.items) {
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
        ...(input.offlinePaymentProvider && {
          payment: {
            create: { provider: input.offlinePaymentProvider, status: "PENDING", amountKurus: totalKurus },
          },
        }),
        items: {
          create: input.items.map((item) => ({
            variantId: item.variantId,
            snapshotName: item.snapshotName,
            snapshotVariant: item.snapshotVariant,
            snapshotPrice: item.snapshotPrice,
            quantity: item.quantity,
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
  newStatus: OrderStatus
): Promise<Order | null> {
  if (!USE_DB) return null;

  // Geçerli durum geçişleri (PENDING → PAID yalnız markOrderPaid ile: ödeme kaydı da güncellenir)
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
      await tx.payment.updateMany({ where: { orderId, status: "PENDING" }, data: { status: "FAILED" } });
    }
    // Kapıda ödeme: teslim edildiğinde para kargo görevlisine ödenmiştir
    if (newStatus === "DELIVERED" && order.paymentMethod === "CASH_ON_DELIVERY") {
      await tx.payment.updateMany({ where: { orderId, status: "PENDING" }, data: { status: "SUCCESS" } });
    }
    return tx.order.findUniqueOrThrow({ where: { id: orderId }, include: { items: true } });
  });

  return toOrder(updated);
}

// ============================================================
// Stok iadesi, süresi dolan siparişler ve ödeme onayı
// ============================================================

/** Kartla ödenmemiş (PENDING) sipariş stoğu bu süre kadar ayırır; sonra iptal edilip stok iade edilir. */
export const PENDING_ORDER_TTL_MINUTES = Math.max(
  15,
  Number(process.env.PENDING_ORDER_TTL_MINUTES ?? 60) || 60
);

type Tx = Prisma.TransactionClient;

/** Siparişin kalemlerindeki adetleri stoğa geri ekler (aynı transaction içinde çağrılmalı). */
async function restoreStock(tx: Tx, orderId: string) {
  const items = await tx.orderItem.findMany({ where: { orderId } });
  for (const item of items) {
    await tx.inventory.updateMany({
      where: { variantId: item.variantId },
      data: { quantity: { increment: item.quantity } },
    });
  }
}

/**
 * Süresi dolan PENDING siparişleri iptal eder ve stoklarını iade eder.
 * Son ödeme zamanı siparişte (paymentDueAt): kart ~1 sa, havale ödeme ayarındaki süre (varsayılan 48 sa).
 * paymentDueAt'i olmayan eski siparişlerde oluşturulma + PENDING_ORDER_TTL_MINUTES kullanılır.
 * Cron gerektirmez: checkout ve admin sipariş listesi her açıldığında çağrılır.
 * Durum geçişi koşullu (PENDING → CANCELLED) yapıldığı için eşzamanlı çağrılarda
 * aynı sipariş iki kez iade edilmez.
 */
export async function releaseExpiredOrders(now = new Date()): Promise<number> {
  if (!USE_DB) return 0;
  const cutoff = new Date(now.getTime() - PENDING_ORDER_TTL_MINUTES * 60_000);
  const expired = await prisma.order.findMany({
    where: {
      status: "PENDING",
      OR: [{ paymentDueAt: { lt: now } }, { paymentDueAt: null, createdAt: { lt: cutoff } }],
    },
    select: { id: true, paymentMethod: true },
    take: 100,
  });

  let released = 0;
  for (const { id, paymentMethod } of expired) {
    const done = await prisma.$transaction(async (tx) => {
      const { count } = await tx.order.updateMany({
        where: { id, status: "PENDING" },
        data: {
          status: "CANCELLED",
          notes:
            paymentMethod === "BANK_TRANSFER"
              ? "Havale/EFT ödemesi süresinde gelmedi — otomatik iptal, stok iade edildi."
              : "Kart ödemesi süresinde tamamlanmadı — otomatik iptal, stok iade edildi.",
        },
      });
      if (count !== 1) return false; // başka bir istek zaten işledi
      await restoreStock(tx, id);
      await tx.payment.updateMany({ where: { orderId: id, status: "PENDING" }, data: { status: "FAILED" } });
      return true;
    });
    if (done) released++;
  }
  if (released > 0) console.info(`[orders] ${released} süresi dolan sipariş iptal edildi, stok iade edildi.`);
  return released;
}

export type MarkPaidResult =
  | { outcome: "paid" | "already_paid"; reference: string }
  | { outcome: "needs_review"; reference: string; reason: string }
  | { outcome: "not_found" };

/**
 * Sağlayıcının DOĞRULADIĞI ödemeyi siparişe işler (verify callback + webhook ortak).
 * - PENDING → PAID (koşullu, idempotent)
 * - Süresi dolup iptal edilmiş siparişe geç gelen ödeme: stok yeniden ayrılabiliyorsa
 *   sipariş PAID yapılır; ayrılamıyorsa CANCELLED kalır ve admin incelemesi için loglanır
 *   (para alınmış olabilir → iade gerekir).
 */
export async function markOrderPaid(orderId: string, providerRef?: string | null): Promise<MarkPaidResult> {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({ where: { id: orderId }, include: { items: true } });
    if (!order) return { outcome: "not_found" } as const;

    await tx.payment.updateMany({
      where: { orderId },
      data: { status: "SUCCESS", ...(providerRef ? { providerRef } : {}) },
    });

    if (order.status !== "PENDING" && order.status !== "CANCELLED") {
      return { outcome: "already_paid", reference: order.reference } as const;
    }

    if (order.status === "CANCELLED") {
      // Stok yeniden ayrılabiliyor mu? (hepsi ya da hiçbiri)
      for (const item of order.items) {
        const { count } = await tx.inventory.updateMany({
          where: { variantId: item.variantId, quantity: { gte: item.quantity } },
          data: { quantity: { decrement: item.quantity } },
        });
        if (count !== 1) {
          throw new PaymentAfterCancelError(order.reference);
        }
      }
    }

    await tx.order.update({
      where: { id: orderId },
      data: {
        status: "PAID",
        ...(order.status === "CANCELLED"
          ? { notes: "Süresi dolduktan sonra ödeme alındı — stok yeniden ayrıldı." }
          : {}),
      },
    });
    return { outcome: "paid", reference: order.reference } as const;
  }).catch(async (err) => {
    if (err instanceof PaymentAfterCancelError) {
      // Transaction geri alındı; ödeme kaydını ve incelemeyi ayrıca işaretle
      await prisma.payment.updateMany({ where: { orderId }, data: { status: "SUCCESS" } });
      await prisma.order.update({
        where: { id: orderId },
        data: { notes: "DİKKAT: İptal edilmiş siparişe ödeme geldi, stok yetersiz — müşteriye iade/iletişim gerekli." },
      });
      console.error(`[orders] İptal edilmiş siparişe ödeme geldi, stok yok: ${err.reference}`);
      return { outcome: "needs_review", reference: err.reference, reason: "stock" } as const;
    }
    throw err;
  });
}

class PaymentAfterCancelError extends Error {
  constructor(public readonly reference: string) {
    super("payment after cancel");
  }
}
