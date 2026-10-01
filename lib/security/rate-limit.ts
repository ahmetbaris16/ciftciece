/**
 * Basit kayan pencere hız sınırı (süreç belleğinde).
 *
 * Giriş/kayıt/yorum uç noktalarını kaba kuvvet ve spam'e karşı yavaşlatır. Tek sunucu sürecinde
 * geçerlidir; birden fazla örnek/serverless'ta sayaçlar paylaşılmaz — o durumda paylaşılan bir
 * depo (Redis vb.) gerekir. Bu bir ek önlemdir, asıl koruma şifre hash'i ve oturum çerezidir.
 */

const g = globalThis as unknown as { __ciftciRateLimit?: Map<string, number[]> };
const buckets: Map<string, number[]> = (g.__ciftciRateLimit ??= new Map());

/**
 * Geliştirmede sınırlar 10 kat gevşek: yerel denemelerde (hepsi aynı "IP") birkaç kayıt/girişten
 * sonra kilitlenilmesin. Production'da sınırlar olduğu gibi uygulanır.
 */
const DEV_FACTOR = process.env.NODE_ENV === "production" ? 1 : 10;

/** İzin verildiyse true; sınır aşıldıysa false (deneme kaydedilmez). */
export function rateLimit(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit * DEV_FACTOR) {
    buckets.set(key, hits);
    return false;
  }
  hits.push(now);
  buckets.set(key, hits);

  if (buckets.size > 5000) {
    for (const [k, v] of buckets) {
      if (!v.some((t) => now - t < windowMs)) buckets.delete(k);
    }
  }
  return true;
}

type HeaderSource = Headers | Record<string, string | string[] | undefined> | undefined | null;

function header(src: HeaderSource, name: string): string | undefined {
  if (!src) return undefined;
  if (typeof (src as Headers).get === "function") return (src as Headers).get(name) ?? undefined;
  const v = (src as Record<string, string | string[] | undefined>)[name];
  return Array.isArray(v) ? v[0] : v;
}

/** İstemci IP'si (vekil sunucu başlıklarından); bulunamazsa "yerel". */
export function clientIp(headers: HeaderSource): string {
  const fwd = header(headers, "x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return header(headers, "x-real-ip") ?? "yerel";
}
