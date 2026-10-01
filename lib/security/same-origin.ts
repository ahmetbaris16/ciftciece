/**
 * Durum değiştiren müşteri uç noktaları için köken kontrolü (CSRF'e ek savunma).
 * Oturum çerezi zaten SameSite=Lax; bu kontrol başka bir sitenin tarayıcı üzerinden
 * istek göndermesini ayrıca reddeder. Origin başlığı yoksa (tarayıcı dışı istemci) çerez
 * olmadan işlem yapılamayacağı için izin verilir.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}
