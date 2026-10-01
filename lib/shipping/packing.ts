/**
 * Koli planı — sepetteki ürünleri dükkânın kolilerine yerleştirir (saf fonksiyon, fiyat bilmez).
 *
 * Amaç: her ürüne ayrı kargo yazılmasın; birden fazla kavanoz/şişe aynı koliye girer, koli
 * dolduğunda (hacim ya da ağırlık sınırı) yenisi açılır. Yöntem "büyükten küçüğe ilk uyan":
 * ürünler hacme göre sıralanır, her biri sığdığı ilk koliye konur; koli gerekiyorsa bir üst boya
 * büyütülür. Sonuçta her koli için gerçek ağırlık, desi ve faturalanan desi/kg hesaplanır.
 *
 * Desi (Yurtiçi Kargo yurt içi): en × boy × yükseklik (cm) / 3000. Faturalanan değer, gerçek
 * ağırlık (kg) ile desiden büyük olanın yukarı yuvarlanmışıdır. Anlaşmanızda bölen farklıysa
 * DESI_DIVISOR'u değiştirin.
 */

import { packagingTypeForSku } from "./packaging";
import type { PackagingMeasure, ShippingBox } from "./settings";

export const DESI_DIVISOR = 3000;
/** Cam ürün koli içinde balonlu naylon/dolgu ile kendi hacminden fazla yer kaplar */
export const FRAGILE_SPACE_FACTOR = 1.6;
export const SOLID_SPACE_FACTOR = 1.15;
/** Koli dış ölçüsünün ne kadarı kullanılabilir (duvar, köşe boşlukları) */
export const BOX_USABLE_RATIO = 0.85;

export interface ShippingLine {
  sku: string | null | undefined;
  quantity: number;
}

export interface PlannedParcel {
  boxId: string;
  boxName: string;
  itemCount: number;
  /** Ürünler + koli/dolgu, gram */
  grossGrams: number;
  /** Kolinin desisi (1 ondalık) */
  desi: number;
  /** Fiyatlandırmada kullanılan: max(kg, desi), yukarı yuvarlanmış */
  billableDesi: number;
}

export type PackingResult =
  | { ok: true; parcels: PlannedParcel[] }
  | {
      ok: false;
      reason: "NOT_MEASURED" | "NO_BOX" | "OVERSIZE";
      /** NOT_MEASURED: ölçüsü girilmemiş/eşlenmemiş SKU'lar */
      skus?: string[];
    };

interface Unit {
  grams: number;
  space: number; // cm³, dolgu payı dahil
  dims: [number, number, number]; // büyükten küçüğe
}

interface OpenParcel {
  box: ShippingBox;
  units: number;
  grams: number;
  space: number;
  dims: [number, number, number];
}

const sortDims = (a: number, b: number, c: number) =>
  [a, b, c].sort((x, y) => y - x) as [number, number, number];

const boxDims = (b: ShippingBox) => sortDims(b.lengthCm, b.widthCm, b.heightCm);
const boxVolume = (b: ShippingBox) => b.lengthCm * b.widthCm * b.heightCm;

function fits(box: ShippingBox, space: number, grams: number, dims: [number, number, number]): boolean {
  const bd = boxDims(box);
  return (
    dims[0] <= bd[0] &&
    dims[1] <= bd[1] &&
    dims[2] <= bd[2] &&
    space <= boxVolume(box) * BOX_USABLE_RATIO &&
    grams + box.tareGrams <= box.maxGrams
  );
}

export function planParcels(
  lines: ShippingLine[],
  packaging: Record<string, PackagingMeasure>,
  boxes: ShippingBox[]
): PackingResult {
  // Ürünleri tek tek birimlere aç (ölçüsü olmayan varsa hiç plan yapma: tahmin yok)
  const units: Unit[] = [];
  const missing = new Set<string>();
  for (const line of lines) {
    if (line.quantity <= 0) continue;
    const type = packagingTypeForSku(line.sku);
    const m = type ? packaging[type.id] : undefined;
    if (!type || !m) {
      missing.add(line.sku ?? "(SKU yok)");
      continue;
    }
    const fragile = m.fragile ?? type.fragile;
    const unit: Unit = {
      grams: m.grossGrams,
      space: m.lengthCm * m.widthCm * m.heightCm * (fragile ? FRAGILE_SPACE_FACTOR : SOLID_SPACE_FACTOR),
      dims: sortDims(m.lengthCm, m.widthCm, m.heightCm),
    };
    for (let i = 0; i < line.quantity; i++) units.push(unit);
  }
  if (missing.size > 0) return { ok: false, reason: "NOT_MEASURED", skus: [...missing] };
  if (units.length === 0) return { ok: true, parcels: [] };
  if (boxes.length === 0) return { ok: false, reason: "NO_BOX" };

  const byVolume = [...boxes].sort((a, b) => boxVolume(a) - boxVolume(b));
  const smallestFitting = (space: number, grams: number, dims: [number, number, number]) =>
    byVolume.find((b) => fits(b, space, grams, dims)) ?? null;

  units.sort((a, b) => b.space - a.space);
  const open: OpenParcel[] = [];

  for (const u of units) {
    let placed = false;
    for (const p of open) {
      const space = p.space + u.space;
      const grams = p.grams + u.grams;
      const dims: [number, number, number] = [
        Math.max(p.dims[0], u.dims[0]),
        Math.max(p.dims[1], u.dims[1]),
        Math.max(p.dims[2], u.dims[2]),
      ];
      const box = smallestFitting(space, grams, dims);
      if (box) {
        Object.assign(p, { box, space, grams, dims, units: p.units + 1 });
        placed = true;
        break;
      }
    }
    if (placed) continue;
    const box = smallestFitting(u.space, u.grams, u.dims);
    if (!box) return { ok: false, reason: "OVERSIZE" };
    open.push({ box, units: 1, grams: u.grams, space: u.space, dims: [...u.dims] });
  }

  return {
    ok: true,
    parcels: open.map((p) => {
      const grossGrams = p.grams + p.box.tareGrams;
      const desi = Math.ceil((boxVolume(p.box) / DESI_DIVISOR) * 10) / 10;
      return {
        boxId: p.box.id,
        boxName: p.box.name,
        itemCount: p.units,
        grossGrams,
        desi,
        billableDesi: Math.max(1, Math.ceil(Math.max(grossGrams / 1000, desi))),
      };
    }),
  };
}
