/**
 * Para dönüşümleri — yalnız tam sayı aritmetiği. Para her yerde kuruş (integer) tutulur;
 * sağlayıcıyla konuşurken ondalık metne çevrilir. Float çarpma/bölme kullanılmaz.
 */

/** Kuruş → "1234.50" (iyzico fiyat metni). */
export function kurusToDecimalString(kurus: number): string {
  if (!Number.isSafeInteger(kurus) || kurus < 0) {
    throw new Error(`Geçersiz kuruş değeri: ${kurus}`);
  }
  const rest = kurus % 100;
  return `${(kurus - rest) / 100}.${String(rest).padStart(2, "0")}`;
}

/**
 * Sağlayıcının bildirdiği ondalık tutar → kuruş.
 * Kabul: "239", "239.9", "239.90", "239.900", 239.9 (JSON sayısı). Kuruştan küçük kesir
 * ("239.901"), negatif, üstel gösterim ya da sayı olmayan değer → null (tutar doğrulanamaz).
 */
export function decimalToKurus(value: unknown): number | null {
  let text: string;
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0) return null;
    text = String(value);
  } else if (typeof value === "string") {
    text = value.trim();
  } else {
    return null;
  }
  const match = /^(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match) return null;
  const fraction = match[2] ?? "";
  if (fraction.length > 2 && /[^0]/.test(fraction.slice(2))) return null;
  const kurus = Number(match[1]) * 100 + Number(fraction.padEnd(2, "0").slice(0, 2));
  return Number.isSafeInteger(kurus) ? kurus : null;
}
