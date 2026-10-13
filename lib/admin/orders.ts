/**
 * Admin sipariş listesi: arama (sipariş no, ad, e-posta, telefon), iş odaklı filtreler, sayfalama.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { USE_DB } from "@/lib/data/source";

/**
 * Sipariş sekmeleri (kullanıcı isteği 2026-10-14: "Siparişler" açılınca yeni siparişler; teslim edilen kendi
 * sekmesinde; hepsi "Tümü"nde). Sıra ekrandaki sıradır.
 * - Dikkat (ödeme uyarısı), Müşteri talebi (açık iptal/iade isteği), Havale bekleyen: yalnız içinde sipariş varken
 *   (ya da seçiliyken) görünür — karar/iş bekleyen siparişler önde.
 * - Yeni siparişler (varsayılan): ödemesi alınmış, kargoya verilecek (kart ödemesi tamamlanınca doğrudan buraya düşer;
 *   kapıda ödeme de). İptali istenmiş ya da ödeme uyarılı sipariş burada değil, kendi sekmesinde (önce karar verilir).
 * - Kargoda → Teslim edildi → İptal / iade → Tümü.
 * Kart ödemesi yarım kalmış sipariş (müşteri banka sayfasında vazgeçti) yalnız "Tümü"nde görünür: işletmenin yapacağı
 * bir şey yoktur, süre dolunca kendiliğinden iptal olur (ödeme uyarısı varsa "Dikkat"te).
 */
export const ORDER_FILTERS = {
  dikkat: "Dikkat",
  talep: "Müşteri talebi",
  odeme: "Havale bekleyen",
  kargolanacak: "Yeni siparişler",
  kargoda: "Kargoda",
  teslim: "Teslim edildi",
  iptal: "İptal / iade",
  tum: "Tümü",
} as const;

export type OrderFilter = keyof typeof ORDER_FILTERS;

/** "Siparişler" açılınca gösterilen sekme */
export const DEFAULT_ORDER_FILTER: OrderFilter = "kargolanacak";

/** Yalnız içinde sipariş varken (ya da seçiliyken) görünen sekmeler */
export const OPTIONAL_ORDER_FILTERS: readonly OrderFilter[] = ["dikkat", "talep", "odeme"];

/** Sekmenin altında: bu sekmede ne var, ne yapılır (sade dil) */
export const ORDER_FILTER_HELP: Record<OrderFilter, string> = {
  dikkat: "Ödemesinde tutarsızlık görülen siparişler. Siparişi açıp kontrol edin ve karar verin.",
  talep: "Müşterinin iptal ya da iade istediği siparişler. Siparişi açıp isteği kabul edin ya da reddedin.",
  odeme:
    "Havale/EFT ile verilen, parası henüz hesabınıza geçmemiş siparişler. Para gelince siparişi açıp “Havale ödemesi alındı” deyin; süresinde ödenmezse sipariş kendiliğinden iptal olur.",
  kargolanacak: "Ödemesi alınmış siparişler. Hazırlayıp kargoya verin; takip numarasını girince “Kargoda”ya geçer.",
  kargoda: "Kargoya verilmiş siparişler. Müşteriye ulaşınca siparişi açıp “Teslim edildi” deyin.",
  teslim: "Müşteriye ulaşmış siparişler.",
  iptal: "İptal edilen ya da parası iade edilen siparişler (ödemesi süresinde yapılmadığı için kendiliğinden iptal olanlar dahil).",
  tum: "Bütün siparişler, kart ödemesi yarım kalanlar dahil.",
};

/** Sekme boşken */
export const ORDER_FILTER_EMPTY: Record<OrderFilter, string> = {
  dikkat: "Ödeme uyarılı sipariş yok.",
  talep: "Karar bekleyen müşteri talebi yok.",
  odeme: "Havale bekleyen sipariş yok.",
  kargolanacak: "Şu an kargolanacak yeni sipariş yok.",
  kargoda: "Kargoda sipariş yok.",
  teslim: "Teslim edilmiş sipariş yok.",
  iptal: "İptal ya da iade edilmiş sipariş yok.",
  tum: "Henüz sipariş yok.",
};

/** Eski bağlantılar: "havale" → "Havale bekleyen" */
const LEGACY_FILTERS: Record<string, OrderFilter> = { havale: "odeme" };

export function parseFilter(v: string | undefined): OrderFilter {
  if (v && v in LEGACY_FILTERS) return LEGACY_FILTERS[v];
  return v && v in ORDER_FILTERS ? (v as OrderFilter) : DEFAULT_ORDER_FILTER;
}

function whereFor(filter: OrderFilter): Prisma.OrderWhereInput {
  switch (filter) {
    case "kargolanacak":
      // Müşterinin iptal isteği karar bekleyen sipariş kargolanmaz: "Müşteri talebi"nde görünür
      return { status: { in: ["PAID", "PROCESSING"] }, needsAttention: false, requests: { none: { type: "CANCEL", status: "OPEN" } } };
    case "odeme":
      // Yalnız havale: kart ödemesi yarım kalan sipariş işletmenin işi değil (süre dolunca kendiliğinden iptal)
      return { status: "PENDING", paymentMethod: "BANK_TRANSFER" };
    case "dikkat":
      return { needsAttention: true };
    case "talep":
      return { requests: { some: { status: "OPEN" } } };
    case "kargoda":
      return { status: "SHIPPED" };
    case "teslim":
      return { status: "DELIVERED" };
    case "iptal":
      return { status: { in: ["CANCELLED", "REFUNDED"] } };
    default:
      return {};
  }
}

/** Her sekmedeki sipariş sayısı (sekmelerde ve paneldeki süreç şeridinde) */
export async function countOrdersByFilter(): Promise<Record<OrderFilter, number>> {
  const keys = Object.keys(ORDER_FILTERS) as OrderFilter[];
  if (!USE_DB) return Object.fromEntries(keys.map((k) => [k, 0])) as Record<OrderFilter, number>;
  const counts = await Promise.all(keys.map((k) => prisma.order.count({ where: whereFor(k) })));
  return Object.fromEntries(keys.map((k, i) => [k, counts[i]])) as Record<OrderFilter, number>;
}

/** Listede satırın altında: siparişte sıradaki iş (kapanmış siparişte yok) */
export function nextStepHint(o: {
  status: string;
  paymentMethod: string;
  needsAttention: boolean;
  openRequests: number;
  /** Müşteri teslimat bilgisini sipariş sayfasından değiştirdi */
  deliveryChanged?: boolean;
}): string | null {
  if (o.needsAttention) return "Ödeme uyarısına karar verin";
  if (o.openRequests > 0) return "Müşteri talebine karar verin";
  if (o.deliveryChanged && (o.status === "PAID" || o.status === "PROCESSING")) {
    return "Müşteri adresi değiştirdi — yeni adresle kargoya verin";
  }
  switch (o.status) {
    case "PENDING":
      return o.paymentMethod === "BANK_TRANSFER"
        ? "Havale gelince onaylayın"
        : "Ödeme tamamlanmadı; kendiliğinden iptal olur";
    case "PAID":
      return "Hazırlayıp kargoya verin";
    case "PROCESSING":
      return o.paymentMethod === "CASH_ON_DELIVERY" ? "Kargoya verin (kapıda ödeme)" : "Kargoya verin";
    case "SHIPPED":
      return "Teslim edilince işaretleyin";
    default:
      return null;
  }
}

export interface AdminOrderRow {
  id: string;
  reference: string;
  name: string;
  email: string | null;
  totalKurus: number;
  status: string;
  paymentMethod: string;
  needsAttention: boolean;
  recipientPays: boolean;
  openRequests: number;
  /** Müşteri teslimat bilgisini değiştirdi (kargoya verilmeden önce görülsün) */
  deliveryChanged: boolean;
  createdAt: Date;
}

export async function searchOrdersForAdmin(opts: { q?: string; filter?: OrderFilter; page?: number; perPage?: number }) {
  if (!USE_DB) return { rows: [] as AdminOrderRow[], total: 0, page: 1, pages: 1 };
  const perPage = Math.min(Math.max(opts.perPage ?? 25, 5), 100);
  const page = Math.max(1, opts.page ?? 1);
  const q = opts.q?.trim().slice(0, 100) ?? "";
  // Telefon +905XXXXXXXXX biçiminde saklanır; aramadaki baştaki 0 / 90 atılır
  const digits = q.replace(/\D/g, "").replace(/^(?:90|0)(?=5)/, "");
  const where: Prisma.OrderWhereInput = {
    ...whereFor(opts.filter ?? "tum"),
    ...(q
      ? {
          OR: [
            { reference: { contains: q.replace(/^#/, "") } },
            { guestName: { contains: q } },
            { guestEmail: { contains: q } },
            ...(digits.length >= 4 ? [{ guestPhone: { contains: digits } }] : []),
          ],
        }
      : {}),
  };
  const [total, orders] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
      select: {
        id: true,
        reference: true,
        guestName: true,
        guestEmail: true,
        totalKurus: true,
        status: true,
        paymentMethod: true,
        needsAttention: true,
        shippingAddress: true,
        createdAt: true,
        _count: {
          select: {
            requests: { where: { status: "OPEN" } },
            events: { where: { type: "ADDRESS", visibleToCustomer: false, actorType: "CUSTOMER" } },
          },
        },
      },
    }),
  ]);
  return {
    rows: orders.map((o) => ({
      id: o.id,
      reference: o.reference,
      name: o.guestName ?? "—",
      email: o.guestEmail,
      totalKurus: o.totalKurus,
      status: o.status,
      paymentMethod: o.paymentMethod,
      needsAttention: o.needsAttention,
      recipientPays: (o.shippingAddress as { shippingMode?: string } | null)?.shippingMode === "recipient",
      openRequests: o._count.requests,
      deliveryChanged: o._count.events > 0,
      createdAt: o.createdAt,
    })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / perPage)),
  };
}
