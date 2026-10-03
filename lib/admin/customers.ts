/**
 * Admin müşterileri: liste ve müşteri sayfası. Yalnız okuma.
 *
 * Müşteri kimliği: sipariş üye girişiyle verildiyse o üye hesabı; değilse siparişteki e-posta. E-postası bir üye
 * hesabınınkiyle aynı olan misafir siparişi o üyeye sayılır, diğer misafir siparişleri e-posta adresine göre
 * toplanır (büyük/küçük harf fark etmez). Sipariş vermemiş üyeler de listededir.
 * Tutar: alınan ödemeler (kart, havale onayı, kapıda tahsilat) eksi iadeler. Demo/test ödemeleri gerçek para
 * olmadığı için sayılmaz (panel ana sayfasındaki ciroyla aynı kural).
 * Liste bellekte birleştirilip sayfalanır: küçük mağaza ölçeği (birkaç bin müşteri) için yeterli; çok büyürse
 * veritabanında sayfalanmalı.
 */

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { USE_DB } from "@/lib/data/source";
import { isTestProvider } from "@/lib/payment/provider";

const OPEN_STATUSES = new Set(["PENDING", "PAID", "PROCESSING", "SHIPPED"]);

/** Aramadaki telefon rakamları: telefon +905XXXXXXXXX biçiminde saklanır, baştaki 0 / 90 atılır */
const phoneDigits = (q: string) => q.replace(/\D/g, "").replace(/^(?:90|0)(?=5)/, "");

// ── Müşteri kimliği ─────────────────────────────────────────────

type Identity = { kind: "member"; userId: string } | { kind: "guest"; email: string };

const identityKey = (i: Identity) => (i.kind === "member" ? `u:${i.userId}` : `e:${i.email}`);

interface MemberRef {
  id: string;
  email: string;
  createdAt: Date;
}

/** Siparişin sahibi: önce bağlı üye hesabı, sonra e-postası bir üyeninkiyle aynıysa o üye, değilse e-posta */
function identityResolver(members: MemberRef[]) {
  const byId = new Map(members.map((m) => [m.id, m]));
  const byEmail = new Map(members.map((m) => [m.email.toLowerCase(), m]));
  return (email: string | null, userId: string | null): Identity | null => {
    if (userId && byId.has(userId)) return { kind: "member", userId };
    const e = email?.trim().toLowerCase();
    if (!e) return null;
    const m = byEmail.get(e);
    return m ? { kind: "member", userId: m.id } : { kind: "guest", email: e };
  };
}

// ── Tutarlar ────────────────────────────────────────────────────

interface AttemptRow {
  orderId: string;
  provider: string;
  amountKurus: number;
  paidAmountKurus: number | null;
  chargedAmountKurus: number | null;
}

interface OrderMoney {
  receivedKurus: number;
  refundedKurus: number;
  /** Demo/test ödemesiyle ödendi: gerçek para alınmadı */
  test: boolean;
}

const ATTEMPT_SELECT = { orderId: true, provider: true, amountKurus: true, paidAmountKurus: true, chargedAmountKurus: true } as const;

function moneyByOrder(attempts: AttemptRow[], refunds: Array<{ orderId: string; amountKurus: number }>) {
  const map = new Map<string, OrderMoney>();
  const get = (id: string) => {
    let m = map.get(id);
    if (!m) map.set(id, (m = { receivedKurus: 0, refundedKurus: 0, test: false }));
    return m;
  };
  for (const a of attempts) {
    const m = get(a.orderId);
    m.receivedKurus += a.chargedAmountKurus ?? a.paidAmountKurus ?? a.amountKurus;
    if (isTestProvider(a.provider)) m.test = true;
  }
  for (const r of refunds) get(r.orderId).refundedKurus += r.amountKurus;
  return map;
}

export interface MoneySummary {
  receivedKurus: number;
  refundedKurus: number;
  /** Alınan − iade */
  netKurus: number;
  /** Demo/test ödemeleri (tutarlara dahil değil) */
  testKurus: number;
}

function summarize(orderIds: string[], money: Map<string, OrderMoney>): MoneySummary {
  let received = 0;
  let refunded = 0;
  let test = 0;
  for (const id of orderIds) {
    const m = money.get(id);
    if (!m) continue;
    // Test ödemesi ve onun "iadesi" gerçek para değildir
    if (m.test) {
      test += m.receivedKurus;
      continue;
    }
    received += m.receivedKurus;
    refunded += m.refundedKurus;
  }
  return { receivedKurus: received, refundedKurus: refunded, netKurus: Math.max(0, received - refunded), testKurus: test };
}

// ── Liste ───────────────────────────────────────────────────────

export const CUSTOMER_FILTERS = { tum: "Tümü", uye: "Üyeler", misafir: "Misafirler" } as const;
export type CustomerFilter = keyof typeof CUSTOMER_FILTERS;

export function parseCustomerFilter(v: string | undefined): CustomerFilter {
  return v && v in CUSTOMER_FILTERS ? (v as CustomerFilter) : "tum";
}

export interface AdminCustomerRow {
  /** Müşteri sayfası: /admin/musteriler/<key> — üyede hesap kimliği, misafirde ilk siparişin kimliği */
  key: string;
  email: string;
  name: string | null;
  phone: string | null;
  orders: number;
  /** Alınan ödeme − iade (kuruş); demo/test ödemeleri hariç */
  netKurus: number;
  refundedKurus: number;
  lastOrderAt: Date | null;
  /** Üyelik tarihi; üye değilse boş */
  memberSince: Date | null;
  /** Mağaza üyeliği (müşteri hesabı) var */
  member: boolean;
  /** Bu e-posta yönetici/personel hesabına ait: aynı e-postayla mağazaya üye girişi yapılamaz */
  staff: boolean;
}

export async function listCustomers(opts: { q?: string; filter?: CustomerFilter; page?: number; perPage?: number }) {
  const perPage = Math.min(Math.max(opts.perPage ?? 50, 10), 100);
  const page = Math.max(1, opts.page ?? 1);
  const filter = opts.filter ?? "tum";
  if (!USE_DB) return { rows: [] as AdminCustomerRow[], total: 0, page, pages: 1, members: 0 };

  const q = opts.q?.trim().slice(0, 100) ?? "";
  const digits = phoneDigits(q);
  const orderSearch: Prisma.OrderWhereInput = q
    ? {
        OR: [
          { guestEmail: { contains: q } },
          { guestName: { contains: q } },
          ...(digits.length >= 4 ? [{ guestPhone: { contains: digits } }] : []),
        ],
      }
    : {};

  const [groups, members, matched] = await Promise.all([
    prisma.order.groupBy({ by: ["guestEmail", "userId"], where: orderSearch, _max: { createdAt: true } }),
    prisma.user.findMany({ where: { role: "CUSTOMER" }, select: { id: true, email: true, createdAt: true } }),
    q
      ? prisma.user.findMany({
          where: {
            role: "CUSTOMER",
            OR: [
              { email: { contains: q } },
              { name: { contains: q } },
              ...(digits.length >= 4 ? [{ phone: { contains: digits } }] : []),
            ],
          },
          select: { id: true },
        })
      : Promise.resolve(null),
  ]);
  const resolve = identityResolver(members);
  const memberById = new Map(members.map((m) => [m.id, m]));

  // Adaylar: aramaya uyan siparişlerin sahipleri + aramaya uyan (arama yoksa tüm) üyeler. Sıra: son hareket
  // (son sipariş ya da üyelik tarihi).
  const candidates = new Map<string, { identity: Identity; lastAt: number }>();
  const touch = (identity: Identity, at: Date | null | undefined) => {
    const k = identityKey(identity);
    const t = at?.getTime() ?? 0;
    const cur = candidates.get(k);
    if (!cur || t > cur.lastAt) candidates.set(k, { identity, lastAt: t });
  };
  for (const g of groups) {
    const identity = resolve(g.guestEmail, g.userId);
    if (identity) touch(identity, g._max.createdAt);
  }
  for (const m of matched ?? members) touch({ kind: "member", userId: m.id }, memberById.get(m.id)?.createdAt);

  let list = [...candidates.values()];
  if (filter !== "tum") list = list.filter((c) => (c.identity.kind === "member") === (filter === "uye"));
  list.sort((a, b) => b.lastAt - a.lastAt || identityKey(a.identity).localeCompare(identityKey(b.identity)));
  const total = list.length;
  const identities = list.slice((page - 1) * perPage, page * perPage).map((c) => c.identity);

  return {
    rows: await customerRows(identities, resolve),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / perPage)),
    members: members.length,
  };
}

async function customerRows(
  identities: Identity[],
  resolve: ReturnType<typeof identityResolver>
): Promise<AdminCustomerRow[]> {
  if (identities.length === 0) return [];
  const memberIds = identities.flatMap((i) => (i.kind === "member" ? [i.userId] : []));
  const guestEmails = identities.flatMap((i) => (i.kind === "guest" ? [i.email] : []));
  const users = memberIds.length
    ? await prisma.user.findMany({
        where: { id: { in: memberIds } },
        select: { id: true, email: true, name: true, phone: true, createdAt: true },
      })
    : [];

  const orders = await prisma.order.findMany({
    where: {
      OR: [
        ...(memberIds.length ? [{ userId: { in: memberIds } }] : []),
        { guestEmail: { in: [...guestEmails, ...users.map((u) => u.email)] } },
      ],
    },
    orderBy: { createdAt: "desc" },
    select: { id: true, userId: true, guestEmail: true, guestName: true, guestPhone: true, createdAt: true },
  });
  const wanted = new Set(identities.map(identityKey));
  const ordersOf = new Map<string, typeof orders>();
  for (const o of orders) {
    const owner = resolve(o.guestEmail, o.userId);
    if (!owner || !wanted.has(identityKey(owner))) continue;
    const k = identityKey(owner);
    const list = ordersOf.get(k);
    if (list) list.push(o);
    else ordersOf.set(k, [o]);
  }

  const orderIds = orders.map((o) => o.id);
  const [attempts, refunds, staff] = await Promise.all([
    orderIds.length
      ? prisma.paymentAttempt.findMany({ where: { orderId: { in: orderIds }, status: "SUCCEEDED" }, select: ATTEMPT_SELECT })
      : [],
    orderIds.length ? prisma.refund.findMany({ where: { orderId: { in: orderIds } }, select: { orderId: true, amountKurus: true } }) : [],
    guestEmails.length
      ? prisma.user.findMany({ where: { email: { in: guestEmails }, role: { in: ["ADMIN", "STAFF"] } }, select: { email: true } })
      : [],
  ]);
  const money = moneyByOrder(attempts, refunds);
  const staffEmails = new Set(staff.map((u) => u.email.toLowerCase()));

  return identities.flatMap((identity): AdminCustomerRow[] => {
    const list = ordersOf.get(identityKey(identity)) ?? [];
    const latest = list[0];
    const sum = summarize(
      list.map((o) => o.id),
      money
    );
    const base = {
      orders: list.length,
      netKurus: sum.netKurus,
      refundedKurus: sum.refundedKurus,
      lastOrderAt: latest?.createdAt ?? null,
    };
    if (identity.kind === "member") {
      const u = users.find((x) => x.id === identity.userId);
      if (!u) return [];
      return [
        {
          ...base,
          key: u.id,
          email: u.email,
          name: u.name ?? latest?.guestName ?? null,
          phone: u.phone ?? latest?.guestPhone ?? null,
          memberSince: u.createdAt,
          member: true,
          staff: false,
        },
      ];
    }
    if (!latest) return [];
    return [
      {
        ...base,
        key: list[list.length - 1].id,
        email: latest.guestEmail ?? identity.email,
        name: latest.guestName,
        phone: latest.guestPhone,
        memberSince: null,
        member: false,
        staff: staffEmails.has(identity.email),
      },
    ];
  });
}

// ── Müşteri sayfası ─────────────────────────────────────────────

export interface CustomerOrderRow {
  id: string;
  reference: string;
  status: string;
  paymentMethod: string;
  totalKurus: number;
  createdAt: Date;
  needsAttention: boolean;
  /** "Zeytin (1 kg) × 2, …" */
  items: string;
  openRequests: number;
  /** Üye girişiyle verildi (müşterinin Hesabım sayfasında görünür) */
  viaAccount: boolean;
  /** Üyenin siparişi hesabındakinden farklı e-postayla verilmiş */
  otherEmail: string | null;
  receivedKurus: number;
  refundedKurus: number;
  testPayment: boolean;
}

export interface CustomerRequestRow {
  id: string;
  orderId: string;
  orderReference: string;
  type: "CANCEL" | "RETURN";
  status: "OPEN" | "RESOLVED" | "REJECTED";
  message: string;
  resolutionNote: string | null;
  createdAt: Date;
  resolvedAt: Date | null;
}

export interface AdminCustomerDetail {
  key: string;
  kind: "member" | "guest";
  email: string;
  name: string | null;
  /** Kullanılan telefonlar (en son kullanılan önce) */
  phones: string[];
  /** E-posta yönetici/personel hesabına ait */
  staff: boolean;
  account: null | {
    id: string;
    createdAt: Date;
    /** "Şifremi unuttum" bağlantısıyla son şifre yenileme */
    passwordResetAt: Date | null;
    lastResetLink: null | { createdAt: Date; state: "used" | "expired" | "valid" };
  };
  stats: MoneySummary & {
    orders: number;
    openOrders: number;
    firstOrderAt: Date | null;
    lastOrderAt: Date | null;
    /** Üye girişiyle verilen (Hesabım'da görünen) */
    accountOrders: number;
    /** Üye girişi yapılmadan verilen */
    guestOrders: number;
  };
  orders: CustomerOrderRow[];
  requests: CustomerRequestRow[];
  addresses: Array<{
    name: string;
    address: string;
    district: string;
    city: string;
    postalCode: string | null;
    uses: number;
    lastUsedAt: Date;
  }>;
  companies: Array<{ companyName: string; taxOffice: string | null; taxNumber: string | null; lastUsedAt: Date }>;
  reviews: Array<{
    id: string;
    productName: string;
    productSlug: string;
    rating: number;
    title: string | null;
    text: string;
    status: string;
    createdAt: Date;
  }>;
  messages: Array<{ id: string; subject: string; status: string; orderReference: string | null; createdAt: Date }>;
  emails: Array<{
    id: string;
    kind: string;
    subject: string;
    status: string;
    orderId: string | null;
    sentAt: Date | null;
    createdAt: Date;
  }>;
  /** Bu e-postayla başka üye hesaplarından verilmiş siparişler (o üyelerin sayfasında) */
  otherAccounts: Array<{ userId: string; name: string | null; email: string; orders: number }>;
}

export type CustomerLookup = { kind: "redirect"; key: string } | { kind: "found"; customer: AdminCustomerDetail } | null;

type ShippingSnapshot = { firstName?: string; lastName?: string; address?: string; district?: string; city?: string; postalCode?: string };
type BillingSnapshot = { type?: string; companyName?: string; taxOffice?: string; taxNumber?: string };

const norm = (s: string) => s.toLocaleLowerCase("tr").replace(/\s+/g, " ").trim();

/**
 * Müşteri sayfası verisi. key: üye hesabının kimliği ya da müşterinin herhangi bir siparişinin kimliği. Sipariş bir
 * üyeye aitse (üye girişiyle verilmiş ya da e-postası üyeninki) üyenin sayfasına yönlendirilir.
 */
export async function loadAdminCustomer(key: string): Promise<CustomerLookup> {
  if (!USE_DB || !/^[A-Za-z0-9_-]{1,64}$/.test(key)) return null;

  const user = await prisma.user.findUnique({
    where: { id: key },
    select: { id: true, email: true, name: true, phone: true, role: true, createdAt: true, passwordResetAt: true },
  });
  const member = user?.role === "CUSTOMER" ? user : null;
  let guestEmail: string | null = null;
  if (!member) {
    const order = await prisma.order.findUnique({ where: { id: key }, select: { guestEmail: true, userId: true } });
    if (!order) return null;
    if (order.userId) {
      const owner = await prisma.user.findUnique({ where: { id: order.userId }, select: { id: true, role: true } });
      if (owner?.role === "CUSTOMER") return { kind: "redirect", key: owner.id };
    }
    guestEmail = order.guestEmail?.trim() || null;
    if (!guestEmail) return null;
    // Karşılaştırma büyük/küçük harf duyarsız (veritabanı harmanlaması)
    const owner = await prisma.user.findFirst({ where: { email: guestEmail, role: "CUSTOMER" }, select: { id: true } });
    if (owner) return { kind: "redirect", key: owner.id };
  }

  const email = member?.email ?? guestEmail!;
  const where: Prisma.OrderWhereInput = member
    ? { OR: [{ userId: member.id }, { guestEmail: member.email, userId: null }] }
    : { guestEmail: email, userId: null };
  const orders = await prisma.order.findMany({
    where,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      reference: true,
      status: true,
      paymentMethod: true,
      totalKurus: true,
      createdAt: true,
      needsAttention: true,
      userId: true,
      guestEmail: true,
      guestName: true,
      guestPhone: true,
      shippingAddress: true,
      billingInfo: true,
      items: { select: { snapshotName: true, snapshotVariant: true, quantity: true } },
      requests: {
        orderBy: { createdAt: "desc" },
        select: { id: true, type: true, status: true, message: true, resolutionNote: true, createdAt: true, resolvedAt: true },
      },
    },
  });
  // Misafir sayfası en az bir siparişle açılır; olmayan kimlik bulunamadı sayılır
  if (!member && orders.length === 0) return null;
  const orderIds = orders.map((o) => o.id);

  const [attempts, refunds, emails, messages, reviews, lastToken, staffAccount, elsewhere] = await Promise.all([
    orderIds.length
      ? prisma.paymentAttempt.findMany({ where: { orderId: { in: orderIds }, status: "SUCCEEDED" }, select: ATTEMPT_SELECT })
      : [],
    orderIds.length ? prisma.refund.findMany({ where: { orderId: { in: orderIds } }, select: { orderId: true, amountKurus: true } }) : [],
    orderIds.length
      ? prisma.emailMessage.findMany({
          where: { orderId: { in: orderIds }, audience: "customer" },
          orderBy: { createdAt: "desc" },
          take: 30,
          select: { id: true, kind: true, subject: true, status: true, orderId: true, sentAt: true, createdAt: true },
        })
      : [],
    prisma.contactMessage.findMany({
      where: { email },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: { id: true, subject: true, status: true, orderReference: true, createdAt: true },
    }),
    member
      ? prisma.productReview.findMany({
          where: { userId: member.id },
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            rating: true,
            title: true,
            text: true,
            status: true,
            createdAt: true,
            product: { select: { name: true, slug: true } },
          },
        })
      : [],
    member
      ? prisma.passwordResetToken.findFirst({
          where: { userId: member.id },
          orderBy: { createdAt: "desc" },
          select: { createdAt: true, expiresAt: true, usedAt: true },
        })
      : null,
    member ? null : prisma.user.findFirst({ where: { email, role: { in: ["ADMIN", "STAFF"] } }, select: { id: true } }),
    prisma.order.groupBy({
      by: ["userId"],
      where: { guestEmail: email, userId: { not: null }, ...(member ? { NOT: { userId: member.id } } : {}) },
      _count: { _all: true },
    }),
  ]);

  const money = moneyByOrder(attempts, refunds);
  const sum = summarize(orderIds, money);
  const otherUserIds = elsewhere.flatMap((g) => (g.userId ? [g.userId] : []));
  const otherUsers = otherUserIds.length
    ? await prisma.user.findMany({
        where: { id: { in: otherUserIds }, role: "CUSTOMER" },
        select: { id: true, name: true, email: true },
      })
    : [];

  // Teslimat adresleri: aynı adres (büyük/küçük harf, boşluk farkı yok sayılır) bir kez, en son kullanılan önce
  const addresses: AdminCustomerDetail["addresses"] = [];
  const companies: AdminCustomerDetail["companies"] = [];
  for (const o of orders) {
    const a = (o.shippingAddress ?? {}) as ShippingSnapshot;
    if (a.address && a.city) {
      const k = norm(`${a.address}|${a.district ?? ""}|${a.city}`);
      const found = addresses.find((x) => norm(`${x.address}|${x.district}|${x.city}`) === k);
      if (found) found.uses += 1;
      else
        addresses.push({
          name: `${a.firstName ?? ""} ${a.lastName ?? ""}`.trim(),
          address: a.address,
          district: a.district ?? "",
          city: a.city,
          postalCode: a.postalCode || null,
          uses: 1,
          lastUsedAt: o.createdAt,
        });
    }
    const b = (o.billingInfo ?? null) as BillingSnapshot | null;
    if (b?.type === "CORPORATE" && b.companyName) {
      const k = norm(`${b.taxNumber ?? ""}|${b.companyName}`);
      if (!companies.some((x) => norm(`${x.taxNumber ?? ""}|${x.companyName}`) === k)) {
        companies.push({ companyName: b.companyName, taxOffice: b.taxOffice ?? null, taxNumber: b.taxNumber ?? null, lastUsedAt: o.createdAt });
      }
    }
  }

  const phones: string[] = [];
  for (const p of [member?.phone, ...orders.map((o) => o.guestPhone)]) {
    if (p && !phones.includes(p)) phones.push(p);
  }

  const now = Date.now();
  const customer: AdminCustomerDetail = {
    key: member ? member.id : orders[orders.length - 1].id,
    kind: member ? "member" : "guest",
    email: member ? member.email : (orders[0].guestEmail ?? email),
    name: member?.name ?? orders[0]?.guestName ?? null,
    phones,
    staff: !!staffAccount,
    account: member
      ? {
          id: member.id,
          createdAt: member.createdAt,
          passwordResetAt: member.passwordResetAt,
          lastResetLink: lastToken
            ? {
                createdAt: lastToken.createdAt,
                state: lastToken.usedAt ? "used" : lastToken.expiresAt.getTime() <= now ? "expired" : "valid",
              }
            : null,
        }
      : null,
    stats: {
      ...sum,
      orders: orders.length,
      openOrders: orders.filter((o) => OPEN_STATUSES.has(o.status)).length,
      firstOrderAt: orders.at(-1)?.createdAt ?? null,
      lastOrderAt: orders[0]?.createdAt ?? null,
      accountOrders: member ? orders.filter((o) => o.userId === member.id).length : 0,
      guestOrders: orders.filter((o) => !o.userId).length,
    },
    orders: orders.map((o) => {
      const m = money.get(o.id);
      return {
        id: o.id,
        reference: o.reference,
        status: o.status,
        paymentMethod: o.paymentMethod,
        totalKurus: o.totalKurus,
        createdAt: o.createdAt,
        needsAttention: o.needsAttention,
        items: o.items.map((i) => `${i.snapshotName} (${i.snapshotVariant}) × ${i.quantity}`).join(", "),
        openRequests: o.requests.filter((r) => r.status === "OPEN").length,
        viaAccount: !!o.userId,
        otherEmail:
          member && o.guestEmail && o.guestEmail.trim().toLowerCase() !== member.email.toLowerCase() ? o.guestEmail : null,
        receivedKurus: m?.receivedKurus ?? 0,
        refundedKurus: m?.refundedKurus ?? 0,
        testPayment: m?.test ?? false,
      };
    }),
    requests: orders
      .flatMap((o) => o.requests.map((r) => ({ ...r, orderId: o.id, orderReference: o.reference })))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    addresses,
    companies,
    reviews: reviews.map((r) => ({
      id: r.id,
      productName: r.product.name,
      productSlug: r.product.slug,
      rating: r.rating,
      title: r.title,
      text: r.text,
      status: r.status,
      createdAt: r.createdAt,
    })),
    messages,
    emails,
    otherAccounts: otherUsers.map((u) => ({
      userId: u.id,
      name: u.name,
      email: u.email,
      orders: elsewhere.find((g) => g.userId === u.id)?._count._all ?? 0,
    })),
  };
  return { kind: "found", customer };
}
