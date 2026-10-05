/**
 * Admin sipariş listesi: arama (sipariş no, ad, e-posta, telefon), iş odaklı filtreler, sayfalama.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { USE_DB } from "@/lib/data/source";

export const ORDER_FILTERS = {
  tum: "Tümü",
  kargolanacak: "Kargolanacak",
  havale: "Havale bekleyen",
  talep: "Müşteri talebi",
  kargoda: "Kargoda",
  teslim: "Teslim edildi",
  iptal: "İptal / iade",
  // Listede yalnız böyle sipariş varken görünür (panelden de bağlantı verilir)
  dikkat: "Dikkat",
} as const;

export type OrderFilter = keyof typeof ORDER_FILTERS;

export function parseFilter(v: string | undefined): OrderFilter {
  return v && v in ORDER_FILTERS ? (v as OrderFilter) : "tum";
}

function whereFor(filter: OrderFilter): Prisma.OrderWhereInput {
  switch (filter) {
    case "kargolanacak":
      // Müşterinin iptal isteği karar bekleyen sipariş kargolanmaz: "Müşteri talebi"nde görünür
      return { status: { in: ["PAID", "PROCESSING"] }, needsAttention: false, requests: { none: { type: "CANCEL", status: "OPEN" } } };
    case "havale":
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
        _count: { select: { requests: { where: { status: "OPEN" } } } },
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
      createdAt: o.createdAt,
    })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / perPage)),
  };
}
