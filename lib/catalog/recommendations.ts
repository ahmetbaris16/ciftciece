/**
 * Ürün önerileri — hem sunucu (ürün sayfası) hem istemci (sepet paneli, sepet sayfası) kullanır.
 *
 * Satış verisine dayanmaz ("en çok birlikte alınanlar" gibi bir iddia YOK): öneriler kategori
 * eşleşmesiyle seçilir. Sofrada birlikte kullanılan kategoriler COMPLEMENTS'te elle tanımlıdır.
 * Kargo eşiğine yaklaşırken, tek başına ücretsiz kargoyu tamamlayan ürünler öne alınır.
 */

import type { Product } from "@/types";

/** Kategori → birlikte iyi giden kategoriler (öncelik sırasıyla) */
export const COMPLEMENTS: Record<string, string[]> = {
  zeytinyagi: ["zeytin", "kahvaltilik", "sirke-icecek"],
  zeytin: ["zeytinyagi", "kahvaltilik", "tursu"],
  kahvaltilik: ["zeytin", "zeytinyagi", "kestane-sekeri"],
  tursu: ["zeytin", "kahvaltilik", "sirke-icecek"],
  "kestane-sekeri": ["kahvaltilik", "zeytin", "sirke-icecek"],
  "sirke-icecek": ["zeytinyagi", "tursu", "kahvaltilik"],
  sabun: ["zeytinyagi", "zeytin", "kahvaltilik"],
};

/** Öneri kartları için hafif ürün özeti (satın alınabilir tek varyantla) */
export interface LiteProduct {
  slug: string;
  name: string;
  categorySlug: string;
  categoryName: string;
  imageUrl: string;
  imageAlt: string;
  isFeatured: boolean;
  sortOrder: number;
  variant: {
    id: string;
    name: string;
    priceKurus: number;
    stock: number;
  } | null;
}

export const FALLBACK_IMAGE = "/images/atmosphere/magaza-zeytin-tepsi.jpg";

/** Satın alınabilir ilk varyant (fiyatı girilmiş, stokta) */
export function defaultVariant(p: Pick<Product, "variants">) {
  return p.variants.find((v) => v.isAvailable && v.priceKurus > 0 && (v.stockQuantity ?? 0) > 0) ?? null;
}

export function toLiteProduct(p: Product): LiteProduct {
  const v = defaultVariant(p);
  const img = p.images[0];
  return {
    slug: p.slug,
    name: p.name,
    categorySlug: p.category.slug,
    categoryName: p.category.name,
    imageUrl: img?.url ?? FALLBACK_IMAGE,
    imageAlt: img?.altText ?? p.name,
    isFeatured: p.isFeatured,
    sortOrder: p.sortOrder,
    variant: v ? { id: v.id, name: v.name, priceKurus: v.priceKurus, stock: v.stockQuantity ?? 0 } : null,
  };
}

const buyable = (p: LiteProduct) => !!p.variant && p.variant.priceKurus > 0 && p.variant.stock > 0;

/** Aynı kategoriden en fazla `perCategory` ürün alarak sırayı korur */
function diversify<T extends { categorySlug: string }>(list: T[], limit: number, perCategory: number): T[] {
  const taken = new Map<string, number>();
  const out: T[] = [];
  for (const item of list) {
    const n = taken.get(item.categorySlug) ?? 0;
    if (n >= perCategory) continue;
    taken.set(item.categorySlug, n + 1);
    out.push(item);
    if (out.length === limit) break;
  }
  return out;
}

/** Ürün sayfası: aynı kategoriden diğer ürünler */
export function pickSimilar(current: LiteProduct, all: LiteProduct[], limit = 4): LiteProduct[] {
  return all
    .filter((p) => p.slug !== current.slug && p.categorySlug === current.categorySlug && buyable(p))
    .sort((a, b) => Number(b.isFeatured) - Number(a.isFeatured) || a.sortOrder - b.sortOrder)
    .slice(0, limit);
}

/** Ürün sayfası: sofrada birlikte iyi gidenler (tamamlayıcı kategorilerden) */
export function pickComplementary(current: LiteProduct, all: LiteProduct[], limit = 4): LiteProduct[] {
  const cats = COMPLEMENTS[current.categorySlug] ?? [];
  const ranked = all
    .filter((p) => p.slug !== current.slug && cats.includes(p.categorySlug) && buyable(p))
    .sort(
      (a, b) =>
        cats.indexOf(a.categorySlug) - cats.indexOf(b.categorySlug) ||
        Number(b.isFeatured) - Number(a.isFeatured) ||
        a.sortOrder - b.sortOrder
    );
  // Önce her tamamlayıcı kategoriden en iyi ürün, sonra kalan yerler sıradakilerle
  const firstPass = diversify(ranked, limit, 1);
  if (firstPass.length >= limit) return firstPass;
  const rest = ranked.filter((p) => !firstPass.includes(p));
  return [...firstPass, ...rest].slice(0, limit);
}

export interface CartSuggestion extends LiteProduct {
  /** Tek başına eklenince ücretsiz kargo eşiğini geçiyor */
  closesGap: boolean;
}

/**
 * Sepet paneli / sepet sayfası: sepetteki ürünlerle iyi gidenler; eşiğe kalan tutar varsa
 * onu tek başına kapatan ürünler öne alınır. Sepetteki ürünler önerilmez.
 */
export function pickCartSuggestions(
  all: LiteProduct[],
  opts: {
    /** Sepetteki ürünlerin slug'ları */
    inCart: string[];
    /** Sepetteki kategoriler, en son eklenen önce */
    anchorCategories: string[];
    /** Ücretsiz kargoya kalan (kuruş); 0 = eşik geçildi */
    remainingKurus: number;
    limit?: number;
  }
): CartSuggestion[] {
  const limit = opts.limit ?? 3;
  const exclude = new Set(opts.inCart);
  const remaining = Math.max(0, opts.remainingKurus);

  const ranked = all
    .filter((p) => buyable(p) && !exclude.has(p.slug))
    .map((p) => {
      const price = p.variant!.priceKurus;
      let score = 0;
      opts.anchorCategories.slice(0, 3).forEach((anchor, a) => {
        const c = (COMPLEMENTS[anchor] ?? []).indexOf(p.categorySlug);
        const s = c >= 0 ? (3 - c) * 10 - a * 3 : p.categorySlug === anchor ? 8 - a * 3 : 0;
        score = Math.max(score, s);
      });
      if (p.isFeatured) score += 4;
      const closesGap = remaining > 0 && price >= remaining;
      if (closesGap) score += 15 - Math.min(10, ((price - remaining) / remaining) * 5);
      return { item: { ...p, closesGap }, score };
    })
    .sort((a, b) => b.score - a.score || a.item.sortOrder - b.item.sortOrder)
    .map((x) => x.item);

  return diversify(ranked, limit, 2);
}
