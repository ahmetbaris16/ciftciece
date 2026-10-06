/**
 * İndirim hesapları (saf fonksiyonlar; veritabanı yok). Tutarlar kuruş, tam sayı.
 *
 * İndirimden önceki fiyat (üstü çizili gösterilen): indirimin başlangıcından önceki son 10 günde uygulanan en düşük
 * satış fiyatı — liste fiyatı değişiklikleri ve o günlerdeki önceki indirimler dahil (Ticari Reklam ve Haksız Ticari
 * Uygulamalar Yönetmeliği; 1 Ağustos 2026'dan itibaren 30 gün yerine 10 gün). İndirimli fiyat bu fiyat üzerinden
 * hesaplanır: müşteriye yazılan oran yöneticinin girdiği orandır.
 */

/** Eski fiyat için geriye bakılan süre */
export const REFERENCE_WINDOW_DAYS = 10;
export const REFERENCE_WINDOW_MS = REFERENCE_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/**
 * Oranı ve süreyi yönetici belirler (kullanıcı kararı: panelde sayıyla sınır yok). Kalan sınırlar yalnız mantık
 * gereği: oran tam sayı ve %1–99 (%100 ürünü bedava yapar, 0 TL'lik satır ödenemez); bitiş tarihi zorunlu ve
 * gelecekte (yönetmelik kampanya tarihlerinin yazılmasını ister), en uzun süre yok.
 */
export const MIN_PERCENT = 1;
export const MAX_PERCENT = 99;

/** İndirimli fiyat: eski fiyat × (100 − oran) / 100, kuruşa yuvarlanır */
export function salePrice(referenceKurus: number, percent: number): number {
  return Math.round((referenceKurus * (100 - percent)) / 100);
}

export interface PriceChange {
  priceKurus: number;
  at: Date;
}

export interface PastSale {
  saleKurus: number;
  from: Date;
  /** Bittiği an (elle bitirildiyse o an, değilse planlanan bitiş) */
  to: Date;
}

/**
 * [from, to) aralığında uygulanan en düşük satış fiyatı.
 * - Liste fiyatı t anında: t'den önceki son kayıt; t'den önce kayıt yoksa ilk kaydın fiyatı (kayıt tutulmaya
 *   başlamadan önceki fiyat bilinmez); hiç kayıt yoksa bugünkü liste fiyatı (hiç değişmemiş sayılır).
 * - O anda bir indirim sürüyorsa satış fiyatı min(liste, indirimli).
 * Fiyat yalnız kayıt ve indirim başlangıç/bitiş anlarında değişir: aralığın başı ve içindeki bu anlar denenir.
 */
export function lowestPriceInWindow(input: {
  currentRegularKurus: number;
  changes: PriceChange[];
  sales: PastSale[];
  from: Date;
  to: Date;
}): number {
  const changes = [...input.changes].sort((a, b) => a.at.getTime() - b.at.getTime());
  const from = input.from.getTime();
  const to = input.to.getTime();

  const regularAt = (t: number): number => {
    if (changes.length === 0) return input.currentRegularKurus;
    let price = changes[0].priceKurus;
    for (const c of changes) {
      if (c.at.getTime() <= t) price = c.priceKurus;
      else break;
    }
    return price;
  };

  const sellingAt = (t: number): number => {
    let price = regularAt(t);
    for (const s of input.sales) {
      if (s.from.getTime() <= t && t < s.to.getTime()) price = Math.min(price, s.saleKurus);
    }
    return price;
  };

  const points = new Set<number>([from]);
  for (const c of changes) {
    const t = c.at.getTime();
    if (t > from && t < to) points.add(t);
  }
  for (const s of input.sales) {
    for (const t of [s.from.getTime(), s.to.getTime()]) {
      if (t > from && t < to) points.add(t);
    }
  }

  let lowest = Infinity;
  for (const t of points) lowest = Math.min(lowest, sellingAt(t));
  return lowest;
}

export interface DiscountWindow {
  startsAt: Date;
  endsAt: Date;
  endedAt: Date | null;
}

/** İndirim bu anda geçerli mi */
export function isDiscountActive(d: DiscountWindow, now: Date): boolean {
  const t = now.getTime();
  const end = d.endedAt && d.endedAt < d.endsAt ? d.endedAt : d.endsAt;
  return d.startsAt.getTime() <= t && t < end.getTime();
}

/** İndirimin fiilen bittiği an (erken bitirildiyse o an) */
export function discountEnd(d: DiscountWindow): Date {
  return d.endedAt && d.endedAt < d.endsAt ? d.endedAt : d.endsAt;
}

/**
 * Varyantın vitrindeki fiyatı: indirim sürüyorsa ve indirimli fiyat liste fiyatından düşükse indirimli fiyat ve
 * üstü çizili eski fiyat; değilse liste fiyatı.
 */
export function effectivePrice(
  regularKurus: number,
  item: { referenceKurus: number; saleKurus: number } | null | undefined
): { priceKurus: number; compareAtKurus: number | null } {
  if (item && regularKurus > 0 && item.saleKurus < regularKurus && item.saleKurus < item.referenceKurus) {
    return { priceKurus: item.saleKurus, compareAtKurus: item.referenceKurus };
  }
  return { priceKurus: regularKurus, compareAtKurus: null };
}

/** Sepetteki indirim tutarı: (eski fiyat − indirimli fiyat) × adet toplamı (yalnız gösterim; tutar sunucuda hesaplanır) */
export function cartSavingsKurus(items: Array<{ priceKurus: number; compareAtPriceKurus?: number | null; quantity: number }>): number {
  return items.reduce((sum, i) => {
    const before = i.compareAtPriceKurus ?? i.priceKurus;
    return sum + (before > i.priceKurus ? (before - i.priceKurus) * i.quantity : 0);
  }, 0);
}

/** Müşteriye gösterilen oran (yuvarlanmış; eski ve yeni fiyattan) */
export function discountPercentLabel(compareAtKurus: number, priceKurus: number): number {
  if (compareAtKurus <= 0 || priceKurus >= compareAtKurus) return 0;
  return Math.round(((compareAtKurus - priceKurus) / compareAtKurus) * 100);
}

const ISTANBUL_OFFSET = "+03:00"; // Türkiye 2016'dan beri yıl boyu UTC+3

/** "2026-10-13" → o günün sonu, İstanbul saatiyle (23:59:59.999) */
export function istanbulEndOfDay(isoDate: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) return null;
  const d = new Date(`${isoDate}T23:59:59.999${ISTANBUL_OFFSET}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Kampanya dönemi, İstanbul saatiyle: "6–13 Ekim 2026", "28 Ekim – 3 Kasım 2026", "29 Aralık 2026 – 4 Ocak 2027" */
export function formatDiscountPeriod(startsAtIso: string, endsAtIso: string): string {
  const parts = (iso: string) => {
    const f = new Intl.DateTimeFormat("tr-TR", { timeZone: "Europe/Istanbul", day: "numeric", month: "long", year: "numeric" });
    const p = Object.fromEntries(f.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
    return { day: p.day, month: p.month, year: p.year };
  };
  const a = parts(startsAtIso);
  const b = parts(endsAtIso);
  if (a.year !== b.year) return `${a.day} ${a.month} ${a.year} – ${b.day} ${b.month} ${b.year}`;
  if (a.month !== b.month) return `${a.day} ${a.month} – ${b.day} ${b.month} ${b.year}`;
  if (a.day !== b.day) return `${a.day}–${b.day} ${b.month} ${b.year}`;
  return `${b.day} ${b.month} ${b.year}`;
}

/** Bir anın İstanbul takvimindeki günü: "2026-10-06" */
export function istanbulDate(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
