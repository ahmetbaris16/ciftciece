-- Üye olmadan verilmiş siparişin tek kullanımlık değerlendirme kodu (F-33, kullanıcı isteği 2026-10-07): sipariş numarası
-- tek başına değerlendirme yazdırmaz; paket fişindeki / teslim e-postasındaki kod bir kez kullanılır.
-- Yalnız ekleme, geriye uyumlu: yeni tablo; mevcut tablolara dokunulmaz. Kod, sipariş fişi basılınca ya da teslim
-- e-postası hazırlanınca oluşur (eski siparişlere de o anda). Geri almak için tablo kaldırılabilir (yalnız kodlar gider).

-- CreateTable
CREATE TABLE `order_review_codes` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `version` INTEGER NOT NULL DEFAULT 1,
    `codeHash` CHAR(64) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `grantHash` CHAR(64) NULL,
    `grantExpiresAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `order_review_codes_orderId_key`(`orderId`),
    UNIQUE INDEX `order_review_codes_codeHash_key`(`codeHash`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `order_review_codes` ADD CONSTRAINT `order_review_codes_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
