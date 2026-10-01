/**
 * Test veritabanı yardımcıları: tabloları boşaltma, örnek ürün/stok, test bitince bağlantıyı kapatma.
 * Yalnız test veritabanında çalışır (adı "_test" ile bitmeyen veritabanında hata verir).
 */

import { after, beforeEach } from "node:test";
import { prisma } from "@/lib/db/prisma";

let checked = false;

async function assertTestDatabase() {
  if (checked) return;
  const rows = await prisma.$queryRaw<Array<{ db: string }>>`SELECT current_database() AS db`;
  const db = rows[0]?.db ?? "";
  if (!db.endsWith("_test")) {
    throw new Error(`Testler yalnız test veritabanında çalışır; bağlı olunan: "${db}"`);
  }
  checked = true;
}

/** Migration tablosu dışındaki tüm tabloları boşaltır. */
export async function resetDb() {
  await assertTestDatabase();
  const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const list = tables.map((t) => `"${t.tablename.replace(/"/g, '""')}"`).join(", ");
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}

/** Her testten önce tabloları boşaltır, dosya bitince bağlantıyı kapatır. */
export function setupTestDb() {
  beforeEach(async () => {
    await resetDb();
  });
  after(async () => {
    await prisma.$disconnect();
  });
}

let seq = 0;

/** Yayında bir ürün + tek varyant + stok oluşturur. */
export async function createProduct(opts: {
  name?: string;
  variantName?: string;
  priceKurus: number;
  stock: number;
  sku?: string;
}) {
  seq += 1;
  const category = await prisma.category.upsert({
    where: { slug: "test-kategori" },
    update: {},
    create: { name: "Test Kategori", slug: "test-kategori" },
  });
  const product = await prisma.product.create({
    data: {
      name: opts.name ?? `Test Ürün ${seq}`,
      slug: `test-urun-${seq}-${Date.now()}`,
      categoryId: category.id,
      isPublished: true,
      variants: {
        create: {
          name: opts.variantName ?? "1 kg",
          sku: opts.sku ?? `TEST-${seq}-${Date.now()}`,
          priceKurus: opts.priceKurus,
          isAvailable: true,
          inventory: { create: { quantity: opts.stock } },
        },
      },
    },
    include: { variants: true },
  });
  return { product, variant: product.variants[0] };
}

/**
 * Transaction ortasında DB hatası taklidi: verilen tabloya INSERT, test süresince yapay hata verir
 * (yalnız test veritabanında, geçici tetikleyiciyle). `fn` bitince tetikleyici kaldırılır.
 */
export async function withFailingInserts<T>(table: string, fn: () => Promise<T>): Promise<T> {
  await assertTestDatabase();
  if (!/^[a-z_]+$/.test(table)) throw new Error(`geçersiz tablo adı: ${table}`);
  await prisma.$executeRawUnsafe(`
    CREATE OR REPLACE FUNCTION test_fail_insert() RETURNS trigger AS $$
    BEGIN RAISE EXCEPTION 'test: yapay DB hatasi (%)', TG_TABLE_NAME; END;
    $$ LANGUAGE plpgsql`);
  await prisma.$executeRawUnsafe(
    `CREATE TRIGGER test_fail_${table} BEFORE INSERT ON "${table}" FOR EACH ROW EXECUTE FUNCTION test_fail_insert()`
  );
  try {
    return await fn();
  } finally {
    await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS test_fail_${table} ON "${table}"`);
  }
}

export async function stockOf(variantId: string): Promise<number> {
  const inv = await prisma.inventory.findUnique({ where: { variantId } });
  return inv?.quantity ?? -1;
}

/** Havale/EFT'yi açar (geçerli örnek IBAN; ISO 13616 mod-97 doğrulamasından geçer). */
export async function enableBankTransfer(paymentWindowHours = 48) {
  const value = JSON.stringify({
    card: { enabled: true, maxInstallment: 6 },
    bankTransfer: {
      enabled: true,
      bankName: "Test Bankası",
      accountHolder: "Test Hesap Sahibi",
      iban: "TR330006100519786457841326",
      paymentWindowHours,
    },
    cashOnDelivery: { enabled: false, feeKurus: 0, maxOrderKurus: null },
  });
  await prisma.siteSetting.upsert({
    where: { key: "payment" },
    update: { value },
    create: { key: "payment", value },
  });
}
