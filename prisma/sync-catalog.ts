/**
 * Katalog ↔ DB senkronu (prisma/catalog.ts tek kaynak)
 *
 * Kullanım:
 *   npm run db:sync-catalog              → sadece FARK RAPORU (hiçbir şey yazmaz)
 *   npm run db:sync-catalog -- --apply   → kategori, ürün bilgisi, görsel, yayın durumu, varyant ad/sıra,
 *                                          katalogda olup DB'de olmayan varyantları ve varyant taşımalarını uygular
 *   ... --apply --prices                 → ayrıca aynı SKU'daki fiyat farklarını da uygular
 *   ... --only=slug1,slug2               → YALNIZ bu ürünler (katalog ya da REMOVED_PRODUCT_SLUGS slug'ları); kategoriler,
 *                                          diğer ürünler ve kaldırılan varyantlar atlanır
 *
 * DİKKAT: tam senkron, katalogdaki görselleri ve yayın durumunu veritabanına yazar — panelden yüklenen fotoğrafları ve
 * panelde açılıp kapatılan ürünleri GERİ ALIR. Panelde düzenlenmiş bir veritabanında önce kuru çalıştırın; yalnız belli
 * bir katalog değişikliği uygulanacaksa --only kullanın (2026-10-07: kapak birleşmesi kullanıcının veritabanına böyle
 * uygulandı).
 *
 * Güvenlik kuralları (sistemi bozmamak için):
 *  - Stok (inventory) yalnızca YENİ oluşturulan varyantta başlangıç değeri olarak yazılır; var olanlarda ASLA değişmez
 *  - Katalogda bir SKU başka bir ürünün altındaysa (ör. çok boylu ürün ayrı kartlara bölündü) varyant SİLİNİP YENİDEN
 *    OLUŞTURULMAZ, ürün bağlantısı taşınır: stok ve sipariş geçmişi korunur
 *  - Varyant yalnızca REMOVED_VARIANT_SKUS'taki SKU'lar için silinir (siparişte kullanılmışsa satışa kapatılır)
 *  - Fiyat yalnızca --prices ile ve yalnızca aynı SKU'lu varyantlarda güncellenir; değişiklik varyant fiyat geçmişine
 *    yazılır (indirimde "son 10 günün en düşük fiyatı" hesabı; panelden fiyat değişikliğiyle aynı kural)
 *  - REMOVED_PRODUCT_SLUGS: siparişte kullanılmadıysa ve değerlendirmesi/indirim kaydı yoksa silinir (sepet satırlarıyla
 *    birlikte), varsa yayından kaldırılır (değerlendirme ve indirim kayıtları ürünle birlikte silinmesin)
 *  - Katalogda olmayan DB ürünlerine ve varyantlarına dokunulmaz (raporlanır)
 */

import { PrismaClient } from "@prisma/client";
import { CATEGORIES, PRODUCTS, REMOVED_PRODUCT_SLUGS, REMOVED_VARIANT_SKUS } from "./catalog";

const prisma = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const PRICES = process.argv.includes("--prices");
// --only=slug1,slug2: yalnız bu ürünler; yazım hatası sessizce "hiçbir şey" yapmasın diye bilinmeyen slug'da durulur
const ONLY = (() => {
  const arg = process.argv.find((a) => a.startsWith("--only="));
  if (!arg) return null;
  const slugs = arg.slice("--only=".length).split(",").map((x) => x.trim()).filter(Boolean);
  const known = new Set([...PRODUCTS.map((p) => p.slug), ...REMOVED_PRODUCT_SLUGS]);
  const unknown = slugs.filter((x) => !known.has(x));
  if (slugs.length === 0 || unknown.length > 0) {
    console.error(`--only: katalogda olmayan slug: ${unknown.join(", ") || "(boş)"}`);
    process.exit(1);
  }
  return new Set(slugs);
})();
const selected = (slug: string) => !ONLY || ONLY.has(slug);
const tl = (k: number) => `${(k / 100).toLocaleString("tr-TR")} TL`;

const report: string[] = [];
const log = (line: string) => report.push(line);

const ALL_CATALOG_SKUS = new Set(PRODUCTS.flatMap((p) => p.variants.map((v) => v.sku)));

/**
 * Liste fiyatını günceller ve fiyat geçmişine yazar (tek işlemde). Varyantın hiç kaydı yoksa önce eski fiyat, ürünün
 * eklendiği tarihle yazılır (lib/repositories/discount.repository.ts → recordPriceChange ile aynı kural).
 */
async function updatePrice(variant: { id: string; priceKurus: number }, since: Date, newPrice: number) {
  await prisma.$transaction(async (tx) => {
    await tx.productVariant.update({ where: { id: variant.id }, data: { priceKurus: newPrice } });
    if ((await tx.variantPriceLog.count({ where: { variantId: variant.id } })) === 0) {
      await tx.variantPriceLog.create({ data: { variantId: variant.id, priceKurus: variant.priceKurus, createdAt: since } });
    }
    await tx.variantPriceLog.create({ data: { variantId: variant.id, priceKurus: newPrice } });
  });
}

async function main() {
  log(`Mod: ${APPLY ? "UYGULA" : "KURU ÇALIŞMA (değişiklik yok)"}${PRICES ? " + FİYATLAR" : ""}${ONLY ? ` — yalnız: ${[...ONLY].join(", ")}` : ""}\n`);

  // ── Kategoriler (--only'de atlanır) ──
  for (const cat of ONLY ? [] : CATEGORIES) {
    const db = await prisma.category.findUnique({ where: { slug: cat.slug } });
    const data = {
      name: cat.name,
      description: cat.description,
      imageUrl: cat.imageUrl,
      sortOrder: cat.sortOrder,
      isPublished: cat.isPublished,
    };
    if (!db) {
      log(`+ kategori oluştur: ${cat.slug}`);
      if (APPLY) await prisma.category.create({ data: { ...data, slug: cat.slug } });
      continue;
    }
    const changed = (Object.keys(data) as (keyof typeof data)[]).filter((k) => db[k] !== data[k]);
    if (changed.length) {
      log(`~ kategori ${cat.slug}: ${changed.join(", ")}`);
      if (APPLY) await prisma.category.update({ where: { slug: cat.slug }, data });
    }
  }

  const cats = new Map((await prisma.category.findMany()).map((c) => [c.slug, c]));

  // ── Ürünler ──
  const include = {
    images: { orderBy: { sortOrder: "asc" as const } },
    variants: { orderBy: { sortOrder: "asc" as const } },
  };

  for (const prod of PRODUCTS) {
    if (!selected(prod.slug)) continue;
    const category = cats.get(prod.categorySlug);
    if (!category) {
      log(`! kategori yok (${prod.categorySlug}) — ${prod.slug} atlandı${APPLY ? "" : " (uygulamada oluşacak)"}`);
      continue;
    }
    let db = await prisma.product.findUnique({ where: { slug: prod.slug }, include });
    let created = false;

    if (!db) {
      log(`+ ürün oluştur: ${prod.slug}`);
      if (APPLY) {
        // Varyantlar aşağıda ayrıca eklenir ya da taşınır (SKU başka bir ürünün altında olabilir)
        await prisma.product.create({
          data: {
            name: prod.name, slug: prod.slug, description: prod.description, categoryId: category.id,
            isPublished: prod.isPublished, isFeatured: prod.isFeatured, sortOrder: prod.sortOrder,
            images: { create: prod.images.map((img) => ({ url: img.url, altText: img.altText, sortOrder: img.sortOrder })) },
          },
        });
        db = await prisma.product.findUnique({ where: { slug: prod.slug }, include });
        created = true;
      }
    }

    if (db && !created) {
      const fields: string[] = [];
      if (db.name !== prod.name) fields.push(`ad "${db.name}" → "${prod.name}"`);
      if ((db.description ?? "") !== (prod.description ?? "")) fields.push("açıklama");
      if (db.categoryId !== category.id) fields.push(`kategori → ${prod.categorySlug}`);
      if (db.isPublished !== prod.isPublished) fields.push(prod.isPublished ? "yayına al" : "YAYINDAN KALDIR");
      if (fields.length) {
        log(`~ ${prod.slug}: ${fields.join("; ")}`);
        if (APPLY) {
          await prisma.product.update({
            where: { id: db.id },
            data: { name: prod.name, description: prod.description, categoryId: category.id, isPublished: prod.isPublished },
          });
        }
      }

      const dbUrls = db.images.map((i) => i.url).join("|");
      const catUrls = prod.images.map((i) => i.url).join("|");
      if (dbUrls !== catUrls) {
        log(`~ ${prod.slug}: görseller [${db.images.map((i) => i.url.split("/").pop()).join(", ")}] → [${prod.images.map((i) => i.url.split("/").pop()).join(", ")}]`);
        if (APPLY) {
          const productId = db.id;
          await prisma.$transaction([
            prisma.productImage.deleteMany({ where: { productId } }),
            prisma.productImage.createMany({
              data: prod.images.map((img) => ({ productId, url: img.url, altText: img.altText, sortOrder: img.sortOrder })),
            }),
          ]);
        }
      }
    }

    // Varyantlar: SKU ile eşleştir
    const bySku = new Map((db?.variants ?? []).filter((v) => v.sku).map((v) => [v.sku as string, v]));
    for (const v of prod.variants) {
      const dv = bySku.get(v.sku);
      if (!dv) {
        const other = await prisma.productVariant.findUnique({
          where: { sku: v.sku },
          include: { product: { select: { slug: true, createdAt: true } } },
        });
        if (other) {
          log(`> ${prod.slug}: varyant taşı ${v.sku} (${other.product.slug} → ${prod.slug}; stok ve sipariş geçmişi korunur)`);
          if (APPLY && db) {
            await prisma.productVariant.update({
              where: { id: other.id },
              data: { productId: db.id, name: v.name, sortOrder: v.sortOrder },
            });
          }
          if (other.priceKurus !== v.priceKurus) {
            log(`$ ${prod.slug} ${v.sku}: DB ${tl(other.priceKurus)} ↔ katalog ${tl(v.priceKurus)}${PRICES ? "" : " (uygulanmadı)"}`);
            if (APPLY && PRICES) await updatePrice(other, other.product.createdAt, v.priceKurus);
          }
          continue;
        }
        if (db) {
          // (Kuru çalışmada henüz olmayan ürünün varyantları "ürün oluştur" satırına dahildir)
          log(`+ ${prod.slug}: varyant oluştur "${v.name}" (${v.sku}, ${tl(v.priceKurus)}, başlangıç stoğu ${v.stock})`);
          if (APPLY) {
            await prisma.productVariant.create({
              data: {
                productId: db.id, name: v.name, sku: v.sku, priceKurus: v.priceKurus, isAvailable: true,
                sortOrder: v.sortOrder, inventory: { create: { quantity: v.stock } },
              },
            });
          }
        }
        continue;
      }
      const meta: string[] = [];
      if (dv.name !== v.name) meta.push(`ad "${dv.name}" → "${v.name}"`);
      if (dv.sortOrder !== v.sortOrder) meta.push(`sıra ${dv.sortOrder} → ${v.sortOrder}`);
      if (meta.length) {
        log(`~ ${prod.slug} ${v.sku}: ${meta.join("; ")}`);
        if (APPLY) await prisma.productVariant.update({ where: { id: dv.id }, data: { name: v.name, sortOrder: v.sortOrder } });
      }
      if (dv.priceKurus !== v.priceKurus) {
        log(`$ ${prod.slug} ${v.sku}: DB ${tl(dv.priceKurus)} ↔ katalog ${tl(v.priceKurus)}${PRICES ? "" : " (uygulanmadı)"}`);
        if (APPLY && PRICES && db) await updatePrice(dv, db.createdAt, v.priceKurus);
      }
    }
    if (db) {
      const catSkus = new Set(prod.variants.map((v) => v.sku));
      for (const dv of db.variants) {
        if (dv.sku && REMOVED_VARIANT_SKUS.includes(dv.sku)) continue; // aşağıda ele alınıyor
        if (dv.sku && !catSkus.has(dv.sku) && ALL_CATALOG_SKUS.has(dv.sku)) continue; // başka katalog ürününe taşınıyor
        if (!dv.sku || !catSkus.has(dv.sku)) {
          log(`? ${prod.slug}: DB'deki "${dv.name}" (${dv.sku ?? "SKU yok"}, ${tl(dv.priceKurus)}) katalogda yok — dokunulmadı`);
        }
      }
    }
  }

  // ── Kaldırılan varyantlar (--only'de atlanır) ──
  for (const sku of ONLY ? [] : REMOVED_VARIANT_SKUS) {
    const dv = await prisma.productVariant.findUnique({
      where: { sku },
      include: { product: { select: { slug: true } }, orderItems: { take: 1 } },
    });
    if (!dv) continue;
    const used = dv.orderItems.length > 0;
    if (used && !dv.isAvailable) continue; // zaten satışa kapalı
    log(`- ${dv.product.slug} ${sku} ("${dv.name}", ${tl(dv.priceKurus)}): ${used ? "siparişte kullanılmış → satışa kapat" : "sil (sepet satırlarıyla birlikte)"}`);
    if (APPLY) {
      if (used) await prisma.productVariant.update({ where: { id: dv.id }, data: { isAvailable: false } });
      else {
        await prisma.$transaction([
          prisma.cartItem.deleteMany({ where: { variantId: dv.id } }),
          prisma.productVariant.delete({ where: { id: dv.id } }), // stok cascade
        ]);
      }
    }
  }

  // ── Kaldırılan ürünler ──
  for (const slug of REMOVED_PRODUCT_SLUGS) {
    if (!selected(slug)) continue;
    const db = await prisma.product.findUnique({
      where: { slug },
      include: { variants: { include: { orderItems: { take: 1 } } }, _count: { select: { reviews: true, discounts: true } } },
    });
    if (!db) continue;
    const ordered = db.variants.some((v) => v.orderItems.length > 0);
    // Ürün silinince değerlendirmeleri ve indirim kayıtları da silinirdi (cascade): onlar varsa yalnız yayından kalkar
    const used = ordered || db._count.reviews > 0 || db._count.discounts > 0;
    if (used && !db.isPublished) continue; // zaten yayında değil
    const why = ordered ? "siparişte kullanılmış" : "değerlendirmesi/indirim kaydı var";
    log(`- ${slug}: ${used ? `${why} → yayından kaldır` : "sil (sepet satırlarıyla birlikte)"}`);
    if (APPLY) {
      if (used) await prisma.product.update({ where: { id: db.id }, data: { isPublished: false } });
      else {
        // CartItem → varyant ilişkisi cascade değil: sepette bu ürün varsa önce satırlar silinmeli
        await prisma.$transaction([
          prisma.cartItem.deleteMany({ where: { variantId: { in: db.variants.map((v) => v.id) } } }),
          prisma.product.delete({ where: { id: db.id } }), // görsel/varyant/stok cascade
        ]);
      }
    }
  }

  // ── Katalogda olmayan DB ürünleri (--only'de atlanır) ──
  const known = new Set([...PRODUCTS.map((p) => p.slug), ...REMOVED_PRODUCT_SLUGS]);
  for (const p of ONLY ? [] : await prisma.product.findMany({ select: { slug: true, isPublished: true } })) {
    if (!known.has(p.slug)) log(`? DB'de var, katalogda yok: ${p.slug}${p.isPublished ? "" : " (yayında değil)"}`);
  }

  console.log(report.join("\n") || "Fark yok.");
}

main()
  .catch((e) => {
    console.error("❌ Senkron hatası:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
