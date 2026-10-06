/**
 * Admin — İndirimler: istediği an seçtiği ürünlerde istediği oranda indirim başlatır (bitiş günü zorunlu, en uzun süre
 * yok), süren indirimin bitiş gününü değiştirir ya da bitirir. Sitede indirimli ürün "%X İndirim" etiketi, üstü çizili eski fiyat ve kampanya tarihleriyle görünür.
 * Eski fiyat: son 10 günde uygulanan en düşük satış fiyatı (lib/pricing/discount.ts).
 */

import { requireAdmin } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getProductsForAdmin } from "@/lib/repositories";
import { getActiveDiscountsByProduct, listDiscountsForAdmin, referencePrices } from "@/lib/repositories/discount.repository";
import { istanbulDate } from "@/lib/pricing/discount";
import AdminShell from "@/components/admin/AdminShell";
import DiscountManager, { type DiscountRow, type PickerProduct } from "@/components/admin/DiscountManager";
import type { AdminDiscountRow } from "@/lib/repositories/discount.repository";

export const dynamic = "force-dynamic";

const DAY = 24 * 60 * 60 * 1000;

const toRow = (d: AdminDiscountRow): DiscountRow => ({
  id: d.id,
  productName: d.productName,
  productSlug: d.productSlug,
  percent: d.percent,
  startsAt: d.startsAt.toISOString(),
  endsAt: d.endsAt.toISOString(),
  endedAt: d.endedAt ? d.endedAt.toISOString() : null,
  items: d.items,
});

export default async function AdminIndirimlerPage() {
  const user = await requireAdmin();
  const now = new Date();
  const products = await getProductsForAdmin();
  const sellable = products.flatMap((p) => p.variants.filter((v) => v.isAvailable && v.priceKurus > 0));

  const [discounts, active, refs] = await Promise.all([
    listDiscountsForAdmin(now),
    getActiveDiscountsByProduct(products.map((p) => p.id), now),
    // Hesaplanamazsa önizlemede liste fiyatı görünür; indirim başlarken sunucu yine hesaplar
    referencePrices(prisma, sellable, now).catch((err) => {
      console.error("[admin/indirimler] Eski fiyatlar hesaplanamadı:", err);
      return new Map<string, number>();
    }),
  ]);

  const picker: PickerProduct[] = products.map((p) => ({
    id: p.id,
    name: p.name,
    slug: p.slug,
    category: p.category.name,
    published: p.isPublished,
    activePercent: active.get(p.id)?.percent ?? null,
    variants: p.variants
      .filter((v) => v.isAvailable && v.priceKurus > 0)
      .map((v) => ({ id: v.id, name: v.name, priceKurus: v.priceKurus, referenceKurus: refs.get(v.id) ?? v.priceKurus })),
  }));

  return (
    <AdminShell user={user} activeSection="indirimler">
      <div style={{ padding: "1.5rem clamp(1rem, 3vw, 2rem)", maxWidth: 980 }}>
        <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 700, color: "#e8e4d9" }}>İndirimler</h1>
        <p style={{ margin: "0.25rem 0 1.25rem", fontSize: "0.875rem", lineHeight: 1.5, color: "rgba(232,228,217,0.55)", maxWidth: 760 }}>
          Seçtiğiniz ürünlerde istediğiniz an indirim başlatın. İndirimli ürün sitede &quot;İndirim&quot; etiketi ve üstü çizili eski
          fiyatıyla görünür; sepet ve ödeme indirimli fiyatı kullanır.
        </p>
        <DiscountManager
          products={picker}
          active={discounts.active.map(toRow)}
          past={discounts.past.map(toRow)}
          today={istanbulDate(now)}
          defaultEnd={istanbulDate(new Date(now.getTime() + 7 * DAY))}
        />
      </div>
    </AdminShell>
  );
}
