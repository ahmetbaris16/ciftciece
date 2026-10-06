/**
 * Rol yardımcıları (sunucu ve tarayıcı ortak; içe aktarımsız).
 * Mağazada oturum: üye müşteri ve kendi hesabıyla alışveriş yapan yönetici/personel (tek hesap).
 * Yönetim paneli: yalnız yönetici/personel.
 */

/** Mağazada giriş yapmış sayılan roller */
export function isStoreRole(role: unknown): boolean {
  return role === "CUSTOMER" || role === "ADMIN" || role === "STAFF";
}

/** Yönetici ya da personel hesabı */
export function isStaffRole(role: unknown): boolean {
  return role === "ADMIN" || role === "STAFF";
}
