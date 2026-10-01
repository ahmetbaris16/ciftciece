/**
 * Üye müşteri kayıtları (users tablosu, role = CUSTOMER).
 *
 * DATABASE_URL yoksa (yalnız development) .mock-data/users.json kullanılır — bkz. lib/data/mock-store.ts.
 * DB hataları yutulmaz; çağıran katman müşteriye kısa Türkçe mesaj gösterir.
 */

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { USE_DB } from "@/lib/data/source";
import { readMock, updateMock } from "@/lib/data/mock-store";
import type { OrderStatus } from "@/types";

export type UserRole = "CUSTOMER" | "STAFF" | "ADMIN";

export interface UserRecord {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  passwordHash: string | null;
  role: UserRole;
  /** "Şifremi unuttum" ile son şifre yenileme; bundan önce açılmış oturumlar geçersiz */
  passwordResetAt: Date | null;
  createdAt: Date;
}

/** Aynı e-postayla kayıt varsa */
export class EmailTakenError extends Error {
  constructor() {
    super("EMAIL_TAKEN");
    this.name = "EmailTakenError";
  }
}

// ── Geliştirme deposu ─────────────────────────────────────────

const USERS_FILE = "users.json";

interface MockUser {
  id: string;
  email: string;
  name: string | null;
  phone: string | null;
  passwordHash: string;
  role: "CUSTOMER";
  passwordResetAt?: string | null;
  createdAt: string;
}

const fromMock = (u: MockUser): UserRecord => ({
  ...u,
  passwordResetAt: u.passwordResetAt ? new Date(u.passwordResetAt) : null,
  createdAt: new Date(u.createdAt),
});

// ── Sorgular ──────────────────────────────────────────────────

/** email önceden normalizeEmail() ile küçük harfe çevrilmiş olmalı */
export async function findUserByEmail(email: string): Promise<UserRecord | null> {
  if (!USE_DB) {
    const users = await readMock<MockUser[]>(USERS_FILE, []);
    const u = users.find((x) => x.email === email);
    return u ? fromMock(u) : null;
  }
  const u = await prisma.user.findUnique({ where: { email } });
  return u ? { ...u, role: u.role as UserRole } : null;
}

export async function getUserById(id: string): Promise<UserRecord | null> {
  if (!USE_DB) {
    const users = await readMock<MockUser[]>(USERS_FILE, []);
    const u = users.find((x) => x.id === id);
    return u ? fromMock(u) : null;
  }
  const u = await prisma.user.findUnique({ where: { id } });
  return u ? { ...u, role: u.role as UserRole } : null;
}

export async function createCustomer(input: {
  email: string;
  name: string;
  phone: string | null;
  passwordHash: string;
}): Promise<UserRecord> {
  if (!USE_DB) {
    return updateMock<MockUser[], UserRecord>(USERS_FILE, [], (users) => {
      if (users.some((u) => u.email === input.email)) throw new EmailTakenError();
      const user: MockUser = {
        id: `mock-user-${randomUUID()}`,
        email: input.email,
        name: input.name,
        phone: input.phone,
        passwordHash: input.passwordHash,
        role: "CUSTOMER",
        createdAt: new Date().toISOString(),
      };
      return { next: [...users, user], result: fromMock(user) };
    });
  }

  try {
    const u = await prisma.user.create({
      data: {
        email: input.email,
        name: input.name,
        phone: input.phone,
        passwordHash: input.passwordHash,
        role: "CUSTOMER",
      },
    });
    return { ...u, role: u.role as UserRole };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      throw new EmailTakenError();
    }
    throw err;
  }
}

export async function updateCustomerProfile(
  id: string,
  data: { name: string; phone: string | null }
): Promise<UserRecord | null> {
  if (!USE_DB) {
    return updateMock<MockUser[], UserRecord | null>(USERS_FILE, [], (users) => {
      const i = users.findIndex((u) => u.id === id);
      if (i < 0) return { next: users, result: null };
      const next = users.slice();
      next[i] = { ...next[i], name: data.name, phone: data.phone };
      return { next, result: fromMock(next[i]) };
    });
  }
  const u = await prisma.user.update({ where: { id }, data: { name: data.name, phone: data.phone } });
  return { ...u, role: u.role as UserRole };
}

export async function updateUserPasswordHash(id: string, passwordHash: string): Promise<void> {
  if (!USE_DB) {
    await updateMock<MockUser[], void>(USERS_FILE, [], (users) => ({
      next: users.map((u) => (u.id === id ? { ...u, passwordHash } : u)),
      result: undefined,
    }));
    return;
  }
  await prisma.user.update({ where: { id }, data: { passwordHash } });
}

/** Şifre sıfırlama sonrası: yeni şifre + oturumları geçersiz kılan zaman damgası */
export async function setPasswordAfterReset(id: string, passwordHash: string, at: Date): Promise<void> {
  if (!USE_DB) {
    await updateMock<MockUser[], void>(USERS_FILE, [], (users) => ({
      next: users.map((u) => (u.id === id ? { ...u, passwordHash, passwordResetAt: at.toISOString() } : u)),
      result: undefined,
    }));
    return;
  }
  await prisma.user.update({ where: { id }, data: { passwordHash, passwordResetAt: at } });
}

// ── Siparişlerim ──────────────────────────────────────────────

export interface CustomerOrderSummary {
  id: string;
  reference: string;
  status: OrderStatus;
  totalKurus: number;
  createdAt: Date;
  items: Array<{ name: string; variant: string; quantity: number }>;
}

/**
 * Yalnızca üye girişliyken verilen (userId bağlı) siparişler.
 * Misafir siparişleri e-postaya göre EŞLEŞTİRİLMEZ: e-posta doğrulanmadığı için başkasının
 * e-postasıyla üye olan biri o kişinin siparişlerini görebilirdi.
 */
export async function getCustomerOrders(userId: string): Promise<CustomerOrderSummary[]> {
  if (!USE_DB) return []; // veritabanısız modda sipariş oluşturulamaz

  const orders = await prisma.order.findMany({
    where: { userId },
    include: { items: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return orders.map((o) => ({
    id: o.id,
    reference: o.reference,
    status: o.status as OrderStatus,
    totalKurus: o.totalKurus,
    createdAt: o.createdAt,
    items: o.items.map((i) => ({ name: i.snapshotName, variant: i.snapshotVariant, quantity: i.quantity })),
  }));
}
