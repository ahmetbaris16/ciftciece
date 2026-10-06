/**
 * Çiftçi Ece — Session Helpers
 *
 * Server component ve API route'larda auth kontrolü.
 */

import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "./auth-options";
import { isStoreRole } from "./roles";

export interface SessionUser {
  id: string;
  email: string;
  name?: string | null;
  role: string;
}

/**
 * Geçerli session'ı döner. Yoksa null.
 */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;
  return session.user as SessionUser;
}

/**
 * Admin rolü gerektirir. Yoksa login sayfasına yönlendirir.
 * Server component'larda kullanılır.
 */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    redirect("/admin/giris");
  }
  return user;
}

/**
 * Staff veya Admin rolü gerektirir.
 */
export async function requireStaff(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user || (user.role !== "ADMIN" && user.role !== "STAFF")) {
    redirect("/admin/giris");
  }
  return user;
}

/**
 * Mağazada giriş yapmış hesap ya da null: üye müşteri ya da kendi hesabıyla alışveriş yapan yönetici/personel.
 * Yöneticiye kapalı mağaza işlemleri (ürün değerlendirmesi, şifre değiştirme) ayrıca isStaffRole ile denetlenir.
 */
export async function getCurrentCustomer(): Promise<SessionUser | null> {
  const user = await getCurrentUser();
  return user && isStoreRole(user.role) ? user : null;
}

/**
 * Üye girişi gerektirir; yoksa girişten sonra aynı sayfaya dönecek şekilde /giris'e yönlendirir.
 */
export async function requireCustomer(returnTo: string): Promise<SessionUser> {
  const user = await getCurrentCustomer();
  if (!user) {
    redirect(`/giris?next=${encodeURIComponent(returnTo)}`);
  }
  return user;
}

/**
 * API route'lar için admin kontrolü.
 * Redirect yerine null döner — caller 401 response verir.
 */
export async function requireAdminApi(): Promise<SessionUser | null> {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    return null;
  }
  return user;
}
