/**
 * Birim fiyat (₺/kg, ₺/L) — Fiyat Etiketi Yönetmeliği: ağırlık/hacimle satılan ürünlerde satış fiyatının yanında
 * birim fiyat gösterilir. Net miktar varyant adından okunur: "1 kg", "500 g", "400 gr", "1,5 kg", "1 L Cam",
 * "500 ml Sıkmalı Şişe", "5 lt Teneke", "2 x 500 g".
 *
 * Hacim "kavanoz" ile yazılmışsa (ör. "720 ml Kavanoz") okunmaz: kavanoz hacmi net miktar değildir (turşu ve
 * zeytin kavanozunda net/süzme ağırlık farklıdır). Okunamayan adda birim fiyat gösterilmez — uydurulmaz;
 * işletme varyant adını "400 g" gibi net miktarla yazarsa görünür.
 *
 * Yalnız gösterim: tam sayı aritmetiği, kuruşa yarım yukarı yuvarlama; sipariş tutarına etkisi yok.
 */

import { formatPrice } from "@/types";

export interface NetQuantity {
  /** gram ya da mililitre */
  amount: number;
  unit: "g" | "ml";
}

const FACTORS: Record<string, { unit: "g" | "ml"; factor: number }> = {
  kg: { unit: "g", factor: 1000 },
  kilo: { unit: "g", factor: 1000 },
  gr: { unit: "g", factor: 1 },
  g: { unit: "g", factor: 1 },
  lt: { unit: "ml", factor: 1000 },
  l: { unit: "ml", factor: 1000 },
  litre: { unit: "ml", factor: 1000 },
  cl: { unit: "ml", factor: 10 },
  ml: { unit: "ml", factor: 1 },
};

/** "1,5" × 1000 → 1500 (kesir basamakları tam sayıyla) */
function scaled(text: string, factor: number): number | null {
  const [intPart, frac = ""] = text.split(/[.,]/);
  const base = 10 ** frac.length;
  const total = Number(intPart) * factor * base + Number(frac || 0) * factor;
  return total % base === 0 ? total / base : null;
}

export function parseNetQuantity(variantName: string): NetQuantity | null {
  const name = variantName.toLocaleLowerCase("tr-TR");
  const m = /(?:(\d{1,3})\s*[x×]\s*)?(\d+(?:[.,]\d{1,3})?)\s*(kg|kilo|gr|g|litre|lt|l|cl|ml)(?![a-zçğıöşü])/.exec(name);
  if (!m) return null;
  const spec = FACTORS[m[3]];
  if (spec.unit === "ml" && /kavanoz/.test(name)) return null;
  const each = scaled(m[2], spec.factor);
  if (!each || each <= 0) return null;
  const amount = each * (m[1] ? Number(m[1]) : 1);
  return amount > 0 && amount <= 1_000_000 ? { amount, unit: spec.unit } : null;
}

/** Birim fiyat kuruş + birim ("kg" / "L"); okunamıyorsa null */
export function unitPrice(priceKurus: number, variantName: string): { kurus: number; per: "kg" | "L" } | null {
  if (!Number.isSafeInteger(priceKurus) || priceKurus <= 0) return null;
  const q = parseNetQuantity(variantName);
  if (!q) return null;
  // fiyat × 1000 / miktar, yarım yukarı
  const kurus = Math.floor((priceKurus * 2000 + q.amount) / (2 * q.amount));
  return { kurus, per: q.unit === "g" ? "kg" : "L" };
}

/** "₺500,00/kg" — okunamıyorsa null */
export function unitPriceLabel(priceKurus: number, variantName: string): string | null {
  const u = unitPrice(priceKurus, variantName);
  return u ? `${formatPrice(u.kurus)}/${u.per}` : null;
}
