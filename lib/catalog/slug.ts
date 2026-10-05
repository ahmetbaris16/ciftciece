/**
 * Ürün adresi (slug): ürün adından üretilir, yönetici yazmaz. Türkçe harfler sadeleştirilir
 * ("Sızma Zeytinyağı 1 L" → "sizma-zeytinyagi-1-l"). Aynı adres varsa sonuna -2, -3… eklenir.
 */

export function slugify(text: string): string {
  const slug = text
    .toLocaleLowerCase("tr")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ı/g, "i")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .trim()
    .replace(/[\s-]+/g, "-")
    .slice(0, 80)
    .replace(/-+$/g, "");
  return slug || "urun";
}

/** taken: aynı kökle başlayan mevcut adresler. Boştaki ilk adres döner. */
export function firstFreeSlug(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; ; n++) {
    const candidate = `${base}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
}
