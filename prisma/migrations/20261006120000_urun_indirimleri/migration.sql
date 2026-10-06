-- Ürün indirimleri (kampanya) ve varyant fiyat geçmişi. Yalnız ekleme: üç yeni tablo; mevcut tablolara ve verilere
-- dokunulmaz, eski kod bu tabloları okumadan çalışmaya devam eder (geri almak için tablolar boş bırakılabilir).
-- İndirimden önceki fiyat: indirimin başlangıcından önceki son 10 günde uygulanan en düşük fiyat (fiyat geçmişi
-- ve önceki indirimlerden hesaplanır; lib/pricing/discount.ts).

-- CreateTable
CREATE TABLE `product_discounts` (
    `id` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `percent` INTEGER NOT NULL,
    `startsAt` DATETIME(3) NOT NULL,
    `endsAt` DATETIME(3) NOT NULL,
    `endedAt` DATETIME(3) NULL,
    `createdById` VARCHAR(191) NULL,
    `endedById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `product_discounts_productId_startsAt_idx`(`productId`, `startsAt`),
    INDEX `product_discounts_endsAt_idx`(`endsAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product_discount_items` (
    `id` VARCHAR(191) NOT NULL,
    `discountId` VARCHAR(191) NOT NULL,
    `variantId` VARCHAR(191) NOT NULL,
    `referenceKurus` INTEGER NOT NULL,
    `saleKurus` INTEGER NOT NULL,

    INDEX `product_discount_items_variantId_idx`(`variantId`),
    UNIQUE INDEX `product_discount_items_discountId_variantId_key`(`discountId`, `variantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `variant_price_logs` (
    `id` VARCHAR(191) NOT NULL,
    `variantId` VARCHAR(191) NOT NULL,
    `priceKurus` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `variant_price_logs_variantId_createdAt_idx`(`variantId`, `createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `product_discounts` ADD CONSTRAINT `product_discounts_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_discount_items` ADD CONSTRAINT `product_discount_items_discountId_fkey` FOREIGN KEY (`discountId`) REFERENCES `product_discounts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_discount_items` ADD CONSTRAINT `product_discount_items_variantId_fkey` FOREIGN KEY (`variantId`) REFERENCES `product_variants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `variant_price_logs` ADD CONSTRAINT `variant_price_logs_variantId_fkey` FOREIGN KEY (`variantId`) REFERENCES `product_variants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;


-- Oran %1–90; bitiş başlangıçtan sonra
ALTER TABLE `product_discounts` ADD CONSTRAINT `product_discounts_percent_check` CHECK (`percent` >= 1 AND `percent` <= 90);
ALTER TABLE `product_discounts` ADD CONSTRAINT `product_discounts_dates_check` CHECK (`endsAt` > `startsAt`);

-- İndirimli fiyat negatif olamaz ve indirimden önceki fiyattan düşük olmalı (kuruş, tam sayı)
ALTER TABLE `product_discount_items` ADD CONSTRAINT `product_discount_items_price_check` CHECK (
    `saleKurus` >= 0 AND `referenceKurus` > `saleKurus`
);

ALTER TABLE `variant_price_logs` ADD CONSTRAINT `variant_price_logs_price_check` CHECK (`priceKurus` >= 0);
