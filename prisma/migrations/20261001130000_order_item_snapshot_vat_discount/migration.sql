-- Oturum 2 — sipariş kalemi snapshot'ı: KDV oranı ve kalem indirimi.
-- Yalnız ekleme (expand). Mevcut satırlar: vatRateBps boş (bilinmiyor), discountKurus 0.
-- KDV oranları katalogda henüz yok; uydurulmaz. products.vatRateBps girilene kadar siparişe boş kopyalanır.
-- Geri alma: kodu önceki commit'e döndürmek yeterli; kolonlar bırakılabilir (eski kod okumaz).

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "discountKurus" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "vatRateBps" INTEGER;

-- AlterTable
ALTER TABLE "products" ADD COLUMN     "vatRateBps" INTEGER;

-- Yeni kolonlar için kısıtlar (mevcut veri bunları zaten sağlar: boş ve 0)
ALTER TABLE "products" ADD CONSTRAINT "products_vat_rate_check" CHECK (
    "vatRateBps" IS NULL OR ("vatRateBps" >= 0 AND "vatRateBps" <= 10000)
);
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_vat_rate_check" CHECK (
    "vatRateBps" IS NULL OR ("vatRateBps" >= 0 AND "vatRateBps" <= 10000)
);
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_discount_check" CHECK (
    "discountKurus" >= 0 AND "discountKurus" <= "snapshotPrice"::bigint * "quantity"
);
