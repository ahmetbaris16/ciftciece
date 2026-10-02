/**
 * Admin müşteri listesi: siparişler e-posta adresine göre toplanır (misafir ve üye siparişleri birlikte).
 * Sipariş sayısı, ödenmiş siparişlerin tutarı, son sipariş, üyelik. Yalnız okuma.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { USE_DB } from "@/lib/data/source";

const PAID = ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"] as const;

export interface AdminCustomerRow {
  email: string;
  name: string | null;
  phone: string | null;
  orders: number;
  paidOrders: number;
  paidKurus: number;
  lastOrderAt: Date;
  /** Bu e-postayla mağaza üyeliği (müşteri hesabı) var */
  member: boolean;
  /** Bu e-posta yönetici/personel hesabına ait: aynı e-postayla mağazaya üye girişi yapılamaz */
  staff: boolean;
}

export async function listCustomers(opts: { q?: string; page?: number; perPage?: number }) {
  const perPage = Math.min(Math.max(opts.perPage ?? 50, 10), 100);
  const page = Math.max(1, opts.page ?? 1);
  if (!USE_DB) return { rows: [] as AdminCustomerRow[], total: 0, page, pages: 1, members: 0 };

  const q = opts.q?.trim().slice(0, 100) ?? "";
  const digits = q.replace(/\D/g, "").replace(/^(?:90|0)(?=5)/, "");
  const where: Prisma.OrderWhereInput = {
    guestEmail: { not: null },
    ...(q
      ? {
          OR: [
            { guestEmail: { contains: q } },
            { guestName: { contains: q } },
            ...(digits.length >= 4 ? [{ guestPhone: { contains: digits } }] : []),
          ],
        }
      : {}),
  };

  const [groups, totalGroups, members] = await Promise.all([
    prisma.order.groupBy({
      by: ["guestEmail"],
      where,
      _count: { _all: true },
      _max: { createdAt: true },
      orderBy: { _max: { createdAt: "desc" } },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.order.groupBy({ by: ["guestEmail"], where }),
    prisma.user.count({ where: { role: "CUSTOMER" } }),
  ]);
  const emails = groups.map((g) => g.guestEmail).filter((e): e is string => !!e);

  const [paid, latest, users] = emails.length
    ? await Promise.all([
        prisma.order.groupBy({
          by: ["guestEmail"],
          // Kapıda ödemeli sipariş teslimde tahsil edilene kadar ödenmiş sayılmaz
          where: {
            guestEmail: { in: emails },
            OR: [
              { paymentMethod: { not: "CASH_ON_DELIVERY" }, status: { in: [...PAID] } },
              { paymentMethod: "CASH_ON_DELIVERY", status: "DELIVERED" },
            ],
          },
          _count: { _all: true },
          _sum: { totalKurus: true },
        }),
        prisma.order.findMany({
          where: { guestEmail: { in: emails } },
          orderBy: { createdAt: "desc" },
          select: { guestEmail: true, guestName: true, guestPhone: true },
        }),
        prisma.user.findMany({ where: { email: { in: emails } }, select: { email: true, role: true } }),
      ])
    : [[], [], []];

  const rows: AdminCustomerRow[] = groups.map((g) => {
    const email = g.guestEmail ?? "";
    const p = paid.find((x) => x.guestEmail === email);
    const last = latest.find((x) => x.guestEmail === email);
    const account = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    return {
      email,
      name: last?.guestName ?? null,
      phone: last?.guestPhone ?? null,
      orders: g._count._all,
      paidOrders: p?._count._all ?? 0,
      paidKurus: p?._sum.totalKurus ?? 0,
      lastOrderAt: g._max.createdAt ?? new Date(0),
      member: account?.role === "CUSTOMER",
      staff: account?.role === "ADMIN" || account?.role === "STAFF",
    };
  });
  return { rows, total: totalGroups.length, page, pages: Math.max(1, Math.ceil(totalGroups.length / perPage)), members };
}
