/**
 * Çiftçi Ece — Prisma Seed Script (İLK KURULUM)
 *
 * Boş bir veritabanını prisma/catalog.ts'deki katalogla doldurur ve ilk admin
 * kullanıcısını oluşturur.
 *
 * Kullanım (ilk kurulum, yönetici hesabıyla birlikte):
 *   ADMIN_EMAIL=siz@alanadiniz.com ADMIN_PASSWORD=<en az 12 karakter> npx prisma db seed
 * Yönetici zaten varsa ADMIN_* gerekmez. Yayın kurulumu adım adım: docs/YAYIN.md
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

  // 5. Yönetici — yalnız yoksa açılır, şifre ASLA ezilmez (Y-05). Gerçek e-posta ve güçlü şifre şart:
  // "TODO" gibi yer tutucuyla açılan hesap giriş formundan kullanılamıyordu.
  const rawEmail = process.env.ADMIN_EMAIL?.trim() ?? "";
  const adminCount = await prisma.user.count({ where: { role: "ADMIN" } });
  if (!rawEmail || /todo/i.test(rawEmail)) {
    if (adminCount === 0) {
      throw new Error(
        "Hiç yönetici yok: ADMIN_EMAIL (gerçek e-posta) ve ADMIN_PASSWORD (en az 12 karakter, harf ve rakam) ile yeniden çalıştırın."
      );
    }
    console.log("\n👤 Yönetici zaten var; ADMIN_EMAIL verilmedi, dokunulmadı");
  } else {
    const adminEmail = rawEmail.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(adminEmail)) {
      throw new Error(`ADMIN_EMAIL geçerli bir e-posta değil: ${adminEmail}`);
    }
    const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
    if (existing && existing.role !== "ADMIN") {
      throw new Error(`${adminEmail} bir müşteri hesabı; yönetici için başka bir e-posta verin.`);
    }
    if (existing) {
      console.log(`\n👤 Yönetici (${adminEmail}) zaten var — şifresine dokunulmadı`);
    } else {
      const adminPassword = process.env.ADMIN_PASSWORD ?? "";
      if (adminPassword.length < 12 || !/[A-Za-zÇĞİÖŞÜçğıöşü]/.test(adminPassword) || !/\d/.test(adminPassword)) {
        throw new Error("ADMIN_PASSWORD en az 12 karakter olmalı; harf ve rakam içermeli.");
      }
      await prisma.user.create({
        data: {
          email: adminEmail,
          name: "Yönetici",
          passwordHash: await hash(adminPassword, 12),
          role: "ADMIN",
        },
      });
      console.log(`\n👤 Yönetici oluşturuldu: ${adminEmail}`);
      console.log("   ADMIN_PASSWORD'u ortam değişkenlerinden silin (yalnız ilk kurulumda gerekir).");
    }
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
