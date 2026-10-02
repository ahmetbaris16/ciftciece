/**
 * Yönetici hesabı: kullanıcı adı ve şifre kuralları, giriş adıyla (kullanıcı adı ya da e-posta) hesap bulma,
 * panelden hesap bilgisi değiştirme (mevcut şifre şart) ve komut satırından/ilk kurulumda hesap açma-güncelleme.
 *
 * Kullanıcı adı küçük harfe çevrilerek saklanır ve aranır (Türkçe yerel ayarı kullanılmadan: "I" → "i"); yalnız
 * a-z, rakam, nokta, alt çizgi ve tire. Şifre değişince passwordResetAt yazılır: ondan önce açılmış oturumlar
 * en geç 5 dakikada düşer (lib/auth/auth-options.ts).
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { normalizeEmail } from "@/lib/validation/account";
import { hashPassword, verifyPassword } from "./password";

export const USERNAME_RULE = "3–40 karakter; küçük harf (a-z), rakam, nokta, alt çizgi ya da tire; harf ya da rakamla başlayıp bitmeli";
export const ADMIN_PASSWORD_RULE = "en az 12 karakter, içinde harf ve rakam olmalı";

const USERNAME_RE = /^[a-z0-9][a-z0-9._-]{1,38}[a-z0-9]$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

/** Geçersizse kullanıcıya gösterilecek mesaj, geçerliyse null (önce normalizeUsername) */
export function usernameError(username: string): string | null {
  return USERNAME_RE.test(username) ? null : `Kullanıcı adı geçersiz: ${USERNAME_RULE}.`;
}

export function adminPasswordError(password: string): string | null {
  if (new TextEncoder().encode(password).length > 72) return "Şifre çok uzun (en fazla 72 karakter).";
  if (password.length < 12 || !/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(password) || !/\d/.test(password)) {
    return `Şifre zayıf: ${ADMIN_PASSWORD_RULE}.`;
  }
  return null;
}

export function emailError(email: string): string | null {
  return email.length <= 254 && EMAIL_RE.test(email) ? null : "Geçerli bir e-posta adresi yazın.";
}

/** Giriş adı: "@" içeriyorsa e-posta, değilse kullanıcı adı (ikisi de tekil alan) */
export function adminLoginLookup(login: string): { email: string } | { username: string } {
  const v = login.trim();
  return v.includes("@") ? { email: normalizeEmail(v) } : { username: normalizeUsername(v) };
}

/** Kullanıcıya gösterilebilir hesap hatası */
export class AdminAccountError extends Error {
  constructor(
    message: string,
    public readonly status = 400
  ) {
    super(message);
    this.name = "AdminAccountError";
  }
}

function uniqueViolation(err: unknown): AdminAccountError | null {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== "P2002") return null;
  const target = JSON.stringify(err.meta?.target ?? "");
  return target.includes("username")
    ? new AdminAccountError("Bu kullanıcı adı başka bir hesapta kullanılıyor.", 409)
    : new AdminAccountError("Bu e-posta başka bir hesapta kullanılıyor.", 409);
}

export interface AdminAccountInput {
  currentPassword: string;
  username: string;
  email: string;
  /** Boşsa şifre değişmez */
  newPassword?: string;
}

export interface AdminAccountView {
  username: string | null;
  email: string;
  name: string | null;
}

export async function getAdminAccount(userId: string): Promise<AdminAccountView | null> {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { username: true, email: true, name: true, role: true } });
  return u && (u.role === "ADMIN" || u.role === "STAFF") ? { username: u.username, email: u.email, name: u.name } : null;
}

/** Panelden hesap bilgisi değiştirme: mevcut şifre doğrulanmadan hiçbir şey değişmez */
export async function updateAdminAccount(userId: string, input: AdminAccountInput): Promise<{ passwordChanged: boolean } & AdminAccountView> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || (user.role !== "ADMIN" && user.role !== "STAFF")) throw new AdminAccountError("Hesap bulunamadı.", 404);
  if (!(await verifyPassword(input.currentPassword, user.passwordHash))) {
    throw new AdminAccountError("Mevcut şifre yanlış.", 403);
  }

  const username = normalizeUsername(input.username);
  const email = normalizeEmail(input.email);
  const problem = usernameError(username) ?? emailError(email) ?? (input.newPassword ? adminPasswordError(input.newPassword) : null);
  if (problem) throw new AdminAccountError(problem);

  const data: Prisma.UserUpdateInput = {};
  if (username !== user.username) data.username = username;
  if (email !== user.email) data.email = email;
  if (input.newPassword) {
    data.passwordHash = await hashPassword(input.newPassword);
    data.passwordResetAt = new Date();
  }
  if (Object.keys(data).length === 0) {
    return { passwordChanged: false, username: user.username, email: user.email, name: user.name };
  }
  try {
    const updated = await prisma.user.update({ where: { id: userId }, data, select: { username: true, email: true, name: true } });
    return { passwordChanged: !!input.newPassword, ...updated };
  } catch (err) {
    throw uniqueViolation(err) ?? err;
  }
}

/**
 * Komut satırı / ilk kurulum: kullanıcı adı ya da e-postayla bulunan yönetici hesabını günceller, yoksa açar.
 * Müşteri hesabı yöneticiye çevrilmez. Dönen `created` hesap yeni mi açıldı.
 */
export async function upsertAdminAccount(input: { username: string; email: string; password: string; name?: string }) {
  const username = normalizeUsername(input.username);
  const email = normalizeEmail(input.email);
  const problem = usernameError(username) ?? emailError(email) ?? adminPasswordError(input.password);
  if (problem) throw new AdminAccountError(problem);

  const matches = await prisma.user.findMany({ where: { OR: [{ username }, { email }] } });
  if (matches.some((u) => u.role === "CUSTOMER")) {
    throw new AdminAccountError("Bu kullanıcı adı ya da e-posta bir müşteri hesabında; yönetici için başka bilgi verin.", 409);
  }
  if (matches.length > 1) {
    throw new AdminAccountError("Kullanıcı adı ile e-posta iki ayrı hesaba ait; ikisini de aynı hesabın bilgileriyle yazın.", 409);
  }
  const passwordHash = await hashPassword(input.password);
  try {
    if (matches.length === 1) {
      await prisma.user.update({
        where: { id: matches[0].id },
        data: { username, email, passwordHash, passwordResetAt: new Date() },
      });
      return { created: false, username, email };
    }
    await prisma.user.create({
      data: { username, email, name: input.name ?? "Yönetici", role: "ADMIN", passwordHash },
    });
    return { created: true, username, email };
  } catch (err) {
    throw uniqueViolation(err) ?? err;
  }
}
