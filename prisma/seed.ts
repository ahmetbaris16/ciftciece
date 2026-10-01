/**
 * Çiftçi Ece — Prisma Seed Script (İLK KURULUM)
 *
 * Boş bir veritabanını prisma/catalog.ts'deki katalogla doldurur ve ilk admin
 * kullanıcısını oluşturur.
 *
 * Kullanım:
 *   npx prisma db seed
 *
 * Güvenli tekrar çalıştırma: var olan HİÇBİR kayda dokunmaz.
 *  - Var olan kategori/ürün atlanır (fiyat, stok, görsel ezilmez)
 *  - Var olan admin kullanıcısının şifresi DEĞİŞMEZ
 *
 * Mevcut DB'yi katalogla karşılaştırmak/eşitlemek için: npm run db:sync-catalog
 */

import { PrismaClient } from "@prisma/client";
import { hash } from "bcryptjs";
import { CATEGORIES, PRODUCTS, REVIEWS } from "./catalog";
import { DEFAULT_SHIPPING_SETTINGS, SHIPPING_SETTING_KEY } from "../lib/shipping/settings";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seed başlıyor (var olan kayıtlara dokunulmaz)...\n");

  // 1. Kategoriler
  console.log("📂 Kategoriler");
  for (const cat of CATEGORIES) {
    const exists = await prisma.category.findUnique({ where: { slug: cat.slug } });
    if (exists) {
      console.log(`  ↷ ${cat.name} (zaten var)`);
      continue;
    }
    await prisma.category.create({ data: cat });
    console.log(`  ✓ ${cat.name}`);
  }

  // 2. Ürünler
  console.log("\n📦 Ürünler");
  for (const prod of PRODUCTS) {
    const exists = await prisma.product.findUnique({ where: { slug: prod.slug } });
    if (exists) {
      console.log(`  ↷ ${prod.name} (zaten var)`);
      continue;
    }
    const category = await prisma.category.findUnique({ where: { slug: prod.categorySlug } });
    if (!category) {
      console.error(`  ✗ Kategori bulunamadı: ${prod.categorySlug}`);
      continue;
    }
    await prisma.product.create({
      data: {
        name: prod.name,
        slug: prod.slug,
        description: prod.description,
        categoryId: category.id,
        isPublished: prod.isPublished,
        isFeatured: prod.isFeatured,
        sortOrder: prod.sortOrder,
        images: {
          create: prod.images.map((img) => ({
            url: img.url,
            altText: img.altText,
            sortOrder: img.sortOrder,
          })),
        },
        variants: {
          create: prod.variants.map((v) => ({
            name: v.name,
            sku: v.sku,
            priceKurus: v.priceKurus,
            isAvailable: true,
            sortOrder: v.sortOrder,
            inventory: { create: { quantity: v.stock } },
          })),
        },
      },
    });
    console.log(`  ✓ ${prod.name}`);
  }

  // 3. Yorumlar (aynı yazar + kaynak varsa atlanır)
  console.log("\n💬 Yorumlar");
  for (const r of REVIEWS) {
    const exists = await prisma.review.findFirst({
      where: { authorName: r.authorName, source: r.source },
    });
    if (exists) {
      console.log(`  ↷ ${r.authorName} (zaten var)`);
      continue;
    }
    await prisma.review.create({ data: { ...r, isPublished: true } });
    console.log(`  ✓ ${r.authorName}`);
  }

  // 4. Kargo ayarları (yoksa varsayılan)
  const shipping = await prisma.siteSetting.findUnique({ where: { key: SHIPPING_SETTING_KEY } });
  if (!shipping) {
    await prisma.siteSetting.create({
      data: { key: SHIPPING_SETTING_KEY, value: JSON.stringify(DEFAULT_SHIPPING_SETTINGS) },
    });
    console.log("\n🚚 Kargo ayarları oluşturuldu (firma ücretleri admin panelden girilmeli)");
  }

  // 5. Admin kullanıcısı — sadece yoksa oluşturulur, şifre ASLA ezilmez
  const adminEmail = process.env.ADMIN_EMAIL || "admin@ciftciece.com";
  const existingAdmin = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (existingAdmin) {
    console.log(`\n👤 Admin (${adminEmail}) zaten var — şifresine dokunulmadı`);
  } else {
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminPassword || adminPassword.length < 10) {
      throw new Error(
        "İlk admin için ADMIN_PASSWORD (en az 10 karakter) ortam değişkeni gerekli."
      );
    }
    await prisma.user.create({
      data: {
        email: adminEmail,
        name: "Admin",
        passwordHash: await hash(adminPassword, 12),
        role: "ADMIN",
      },
    });
    console.log(`\n👤 Admin oluşturuldu: ${adminEmail}`);
  }

  console.log("\n✅ Seed tamamlandı\n");
}

main()
  .catch((e) => {
    console.error("❌ Seed hatası:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
