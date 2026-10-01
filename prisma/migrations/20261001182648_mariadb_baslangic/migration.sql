-- MariaDB başlangıç şeması (2026-10-01). Site henüz yayında değilken PostgreSQL'den MariaDB'ye
-- (Hostinger web hosting) geçildi: önceki 8 PostgreSQL migration'ının yerini alır (onlar git
-- geçmişinde). Canlıda veri olmadığı için veri taşıma yok; katalog seed/sync ile yüklenir.

-- CreateTable
CREATE TABLE `users` (
    `id` VARCHAR(191) NOT NULL,
    `email` VARCHAR(254) NOT NULL,
    `name` VARCHAR(191) NULL,
    `phone` VARCHAR(191) NULL,
    `passwordHash` VARCHAR(191) NULL,
    `role` ENUM('CUSTOMER', 'STAFF', 'ADMIN') NOT NULL DEFAULT 'CUSTOMER',
    `passwordResetAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `users_email_key`(`email`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `addresses` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `firstName` VARCHAR(191) NOT NULL,
    `lastName` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NOT NULL,
    `city` VARCHAR(191) NOT NULL,
    `district` VARCHAR(191) NOT NULL,
    `postalCode` VARCHAR(191) NULL,
    `address` TEXT NOT NULL,
    `isDefault` BOOLEAN NOT NULL DEFAULT false,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `categories` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `imageUrl` VARCHAR(500) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `isPublished` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `categories_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `products` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `slug` VARCHAR(191) NOT NULL,
    `description` TEXT NULL,
    `categoryId` VARCHAR(191) NOT NULL,
    `isPublished` BOOLEAN NOT NULL DEFAULT false,
    `isFeatured` BOOLEAN NOT NULL DEFAULT false,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `vatRateBps` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `products_slug_key`(`slug`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product_images` (
    `id` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `url` VARCHAR(500) NOT NULL,
    `altText` VARCHAR(500) NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product_variants` (
    `id` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `sku` VARCHAR(191) NULL,
    `priceKurus` INTEGER NOT NULL,
    `isAvailable` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,

    UNIQUE INDEX `product_variants_sku_key`(`sku`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `inventory` (
    `id` VARCHAR(191) NOT NULL,
    `variantId` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 0,
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `inventory_variantId_key`(`variantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `carts` (
    `id` VARCHAR(191) NOT NULL,
    `sessionId` VARCHAR(191) NULL,
    `userId` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `carts_sessionId_key`(`sessionId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `cart_items` (
    `id` VARCHAR(191) NOT NULL,
    `cartId` VARCHAR(191) NOT NULL,
    `variantId` VARCHAR(191) NOT NULL,
    `quantity` INTEGER NOT NULL DEFAULT 1,
    `addedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `cart_items_cartId_variantId_key`(`cartId`, `variantId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `orders` (
    `id` VARCHAR(191) NOT NULL,
    `reference` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `guestEmail` VARCHAR(254) NULL,
    `guestName` VARCHAR(191) NULL,
    `guestPhone` VARCHAR(191) NULL,
    `status` ENUM('PENDING', 'PAID', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED', 'REFUNDED') NOT NULL DEFAULT 'PENDING',
    `shippingAddress` JSON NOT NULL,
    `subtotalKurus` INTEGER NOT NULL,
    `shippingKurus` INTEGER NOT NULL,
    `discountKurus` INTEGER NOT NULL DEFAULT 0,
    `totalKurus` INTEGER NOT NULL,
    `paymentMethod` ENUM('CARD', 'BANK_TRANSFER', 'CASH_ON_DELIVERY') NOT NULL DEFAULT 'CARD',
    `paymentFeeKurus` INTEGER NOT NULL DEFAULT 0,
    `paymentDueAt` DATETIME(3) NULL,
    `notes` TEXT NULL,
    `idempotencyKey` VARCHAR(191) NULL,
    `idempotencyHash` VARCHAR(191) NULL,
    `needsAttention` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `orders_reference_key`(`reference`),
    UNIQUE INDEX `orders_idempotencyKey_key`(`idempotencyKey`),
    INDEX `orders_status_paymentDueAt_idx`(`status`, `paymentDueAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `order_items` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `variantId` VARCHAR(191) NOT NULL,
    `snapshotName` VARCHAR(255) NOT NULL,
    `snapshotVariant` VARCHAR(191) NOT NULL,
    `snapshotPrice` INTEGER NOT NULL,
    `quantity` INTEGER NOT NULL,
    `vatRateBps` INTEGER NULL,
    `discountKurus` INTEGER NOT NULL DEFAULT 0,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `order_consents` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `document` VARCHAR(191) NOT NULL,
    `version` VARCHAR(191) NOT NULL,
    `acceptedAt` DATETIME(3) NOT NULL,
    `ipAddress` VARCHAR(191) NULL,

    UNIQUE INDEX `order_consents_orderId_document_key`(`orderId`, `document`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payments` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(191) NOT NULL,
    `providerRef` VARCHAR(191) NULL,
    `conversationId` VARCHAR(191) NULL,
    `status` ENUM('PENDING', 'SUCCESS', 'FAILED', 'REFUNDED') NOT NULL DEFAULT 'PENDING',
    `amountKurus` INTEGER NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'TRY',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `payments_orderId_key`(`orderId`),
    UNIQUE INDEX `payments_conversationId_key`(`conversationId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payment_attempts` (
    `id` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NOT NULL,
    `provider` VARCHAR(191) NOT NULL,
    `method` ENUM('CARD', 'BANK_TRANSFER', 'CASH_ON_DELIVERY') NOT NULL,
    `status` ENUM('INITIATED', 'SUCCEEDED', 'FAILED', 'MISMATCH', 'DUPLICATE', 'EXPIRED') NOT NULL DEFAULT 'INITIATED',
    `amountKurus` INTEGER NOT NULL,
    `currency` VARCHAR(191) NOT NULL DEFAULT 'TRY',
    `conversationId` VARCHAR(191) NULL,
    `providerToken` VARCHAR(191) NULL,
    `tokenExpiresAt` DATETIME(3) NULL,
    `providerPaymentId` VARCHAR(191) NULL,
    `paidAmountKurus` INTEGER NULL,
    `chargedAmountKurus` INTEGER NULL,
    `paidCurrency` VARCHAR(191) NULL,
    `installment` INTEGER NULL,
    `fraudStatus` INTEGER NULL,
    `failureReason` TEXT NULL,
    `successOrderId` VARCHAR(191) NULL,
    `verifiedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `payment_attempts_successOrderId_key`(`successOrderId`),
    INDEX `payment_attempts_orderId_idx`(`orderId`),
    UNIQUE INDEX `payment_attempts_provider_providerToken_key`(`provider`, `providerToken`),
    UNIQUE INDEX `payment_attempts_provider_providerPaymentId_key`(`provider`, `providerPaymentId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payment_events` (
    `id` VARCHAR(191) NOT NULL,
    `paymentId` VARCHAR(191) NULL,
    `providerEventId` VARCHAR(191) NULL,
    `eventType` VARCHAR(191) NOT NULL,
    `payload` JSON NOT NULL,
    `processedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `provider` VARCHAR(191) NULL,
    `eventKey` VARCHAR(191) NULL,
    `source` ENUM('WEBHOOK', 'CALLBACK', 'QUERY', 'MANUAL', 'ADMIN', 'SYSTEM') NULL,
    `status` ENUM('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED', 'REJECTED', 'RECORDED') NOT NULL DEFAULT 'RECORDED',
    `signatureValid` BOOLEAN NULL,
    `orderId` VARCHAR(191) NULL,
    `attemptId` VARCHAR(191) NULL,
    `actorId` VARCHAR(191) NULL,
    `outcome` VARCHAR(191) NULL,
    `error` TEXT NULL,
    `handledAt` DATETIME(3) NULL,

    UNIQUE INDEX `payment_events_providerEventId_key`(`providerEventId`),
    INDEX `payment_events_orderId_idx`(`orderId`),
    INDEX `payment_events_attemptId_idx`(`attemptId`),
    INDEX `payment_events_status_idx`(`status`),
    UNIQUE INDEX `payment_events_provider_eventKey_key`(`provider`, `eventKey`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payment_alerts` (
    `id` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NULL,
    `attemptId` VARCHAR(191) NULL,
    `eventId` VARCHAR(191) NULL,
    `message` TEXT NOT NULL,
    `details` JSON NULL,
    `dedupeKey` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `resolvedAt` DATETIME(3) NULL,
    `resolvedBy` VARCHAR(191) NULL,

    UNIQUE INDEX `payment_alerts_dedupeKey_key`(`dedupeKey`),
    INDEX `payment_alerts_orderId_idx`(`orderId`),
    INDEX `payment_alerts_kind_resolvedAt_idx`(`kind`, `resolvedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reviews` (
    `id` VARCHAR(191) NOT NULL,
    `authorName` VARCHAR(191) NOT NULL,
    `authorAvatar` VARCHAR(500) NULL,
    `rating` INTEGER NOT NULL,
    `text` TEXT NOT NULL,
    `date` DATETIME(3) NOT NULL,
    `source` VARCHAR(191) NULL,
    `sourceUrl` VARCHAR(1000) NULL,
    `isPublished` BOOLEAN NOT NULL DEFAULT false,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `product_reviews` (
    `id` VARCHAR(191) NOT NULL,
    `productId` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `rating` INTEGER NOT NULL,
    `title` VARCHAR(191) NULL,
    `text` TEXT NOT NULL,
    `status` ENUM('PENDING', 'APPROVED', 'REJECTED') NOT NULL DEFAULT 'PENDING',
    `isVerifiedPurchase` BOOLEAN NOT NULL DEFAULT false,
    `adminNote` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,
    `approvedAt` DATETIME(3) NULL,

    INDEX `product_reviews_productId_status_idx`(`productId`, `status`),
    INDEX `product_reviews_status_createdAt_idx`(`status`, `createdAt`),
    UNIQUE INDEX `product_reviews_productId_userId_key`(`productId`, `userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `coupons` (
    `id` VARCHAR(191) NOT NULL,
    `code` VARCHAR(191) NOT NULL,
    `type` ENUM('PERCENTAGE', 'FIXED_AMOUNT') NOT NULL,
    `value` INTEGER NOT NULL,
    `minOrderKurus` INTEGER NULL,
    `usageLimit` INTEGER NULL,
    `usageCount` INTEGER NOT NULL DEFAULT 0,
    `isActive` BOOLEAN NOT NULL DEFAULT true,
    `expiresAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `coupons_code_key`(`code`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `site_settings` (
    `id` VARCHAR(191) NOT NULL,
    `key` VARCHAR(191) NOT NULL,
    `value` TEXT NOT NULL,

    UNIQUE INDEX `site_settings_key_key`(`key`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `audit_logs` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `action` VARCHAR(191) NOT NULL,
    `entity` VARCHAR(191) NOT NULL,
    `entityId` VARCHAR(191) NULL,
    `details` JSON NULL,
    `ipAddress` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `password_reset_tokens` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(191) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `usedAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `password_reset_tokens_tokenHash_key`(`tokenHash`),
    INDEX `password_reset_tokens_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `outbox_events` (
    `id` VARCHAR(191) NOT NULL,
    `topic` VARCHAR(191) NOT NULL,
    `aggregateType` VARCHAR(191) NOT NULL,
    `aggregateId` VARCHAR(191) NOT NULL,
    `payload` JSON NOT NULL,
    `dedupeKey` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `availableAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `publishedAt` DATETIME(3) NULL,
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `lastError` TEXT NULL,

    UNIQUE INDEX `outbox_events_dedupeKey_key`(`dedupeKey`),
    INDEX `outbox_events_publishedAt_availableAt_idx`(`publishedAt`, `availableAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `addresses` ADD CONSTRAINT `addresses_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `products` ADD CONSTRAINT `products_categoryId_fkey` FOREIGN KEY (`categoryId`) REFERENCES `categories`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_images` ADD CONSTRAINT `product_images_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_variants` ADD CONSTRAINT `product_variants_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `inventory` ADD CONSTRAINT `inventory_variantId_fkey` FOREIGN KEY (`variantId`) REFERENCES `product_variants`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cart_items` ADD CONSTRAINT `cart_items_cartId_fkey` FOREIGN KEY (`cartId`) REFERENCES `carts`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `cart_items` ADD CONSTRAINT `cart_items_variantId_fkey` FOREIGN KEY (`variantId`) REFERENCES `product_variants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `orders` ADD CONSTRAINT `orders_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_variantId_fkey` FOREIGN KEY (`variantId`) REFERENCES `product_variants`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order_consents` ADD CONSTRAINT `order_consents_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payments` ADD CONSTRAINT `payments_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payment_attempts` ADD CONSTRAINT `payment_attempts_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `payment_events` ADD CONSTRAINT `payment_events_paymentId_fkey` FOREIGN KEY (`paymentId`) REFERENCES `payments`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payment_events` ADD CONSTRAINT `payment_events_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payment_events` ADD CONSTRAINT `payment_events_attemptId_fkey` FOREIGN KEY (`attemptId`) REFERENCES `payment_attempts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payment_alerts` ADD CONSTRAINT `payment_alerts_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payment_alerts` ADD CONSTRAINT `payment_alerts_attemptId_fkey` FOREIGN KEY (`attemptId`) REFERENCES `payment_attempts`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `payment_alerts` ADD CONSTRAINT `payment_alerts_eventId_fkey` FOREIGN KEY (`eventId`) REFERENCES `payment_events`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_reviews` ADD CONSTRAINT `product_reviews_productId_fkey` FOREIGN KEY (`productId`) REFERENCES `products`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `product_reviews` ADD CONSTRAINT `product_reviews_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `password_reset_tokens` ADD CONSTRAINT `password_reset_tokens_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- ============================================================================================
-- Veri kuralları (CHECK). Prisma şemada ifade edemez: elle eklenir, `prisma migrate dev` bunları
-- silmez ama yeni migration üretirken diff'te göstermez. MariaDB 10.2+ / MySQL 8.0.16+ uygular.
-- Not: MySQL'de CHECK'teki sütun ON UPDATE CASCADE'li yabancı anahtarda olamaz; bu yüzden
-- payment_attempts.orderId ilişkisi şemada onUpdate: Restrict.
-- ============================================================================================

-- Ödeme: bir siparişte en fazla bir başarılı deneme. successOrderId yalnız SUCCEEDED iken dolu ve
-- orderId'ye eşit; UNIQUE (payment_attempts_successOrderId_key) ikinci başarılı denemeyi engeller.
ALTER TABLE `payment_attempts` ADD CONSTRAINT `payment_attempts_success_order_check` CHECK (
    (`status` = 'SUCCEEDED' AND `successOrderId` IS NOT NULL AND `successOrderId` = `orderId`)
    OR (`status` <> 'SUCCEEDED' AND `successOrderId` IS NULL)
);

-- Ödeme tutarları negatif olamaz (kuruş, tam sayı)
ALTER TABLE `payment_attempts` ADD CONSTRAINT `payment_attempts_amounts_check` CHECK (
    `amountKurus` >= 0
    AND (`paidAmountKurus` IS NULL OR `paidAmountKurus` >= 0)
    AND (`chargedAmountKurus` IS NULL OR `chargedAmountKurus` >= 0)
);

-- KDV oranı baz puan: 0 – 10000 (%0 – %100); boş = girilmemiş
ALTER TABLE `products` ADD CONSTRAINT `products_vat_rate_check` CHECK (
    `vatRateBps` IS NULL OR (`vatRateBps` >= 0 AND `vatRateBps` <= 10000)
);
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_vat_rate_check` CHECK (
    `vatRateBps` IS NULL OR (`vatRateBps` >= 0 AND `vatRateBps` <= 10000)
);

-- Kalem: adet pozitif, birim fiyat negatif değil, indirim 0 ile (birim fiyat × adet) arasında
-- (MySQL tam sayı çarpımı 64 bit yapılır; taşma yok)
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_quantity_check` CHECK (`quantity` > 0 AND `snapshotPrice` >= 0);
ALTER TABLE `order_items` ADD CONSTRAINT `order_items_discount_check` CHECK (
    `discountKurus` >= 0 AND `discountKurus` <= `snapshotPrice` * `quantity`
);

-- R-27: stok sıfırın altına inemez (hatalı bir kod yolu olmayan ürünü satamasın)
ALTER TABLE `inventory` ADD CONSTRAINT `inventory_quantity_check` CHECK (`quantity` >= 0);

-- R-27: fiyat ve sipariş tutarları negatif olamaz; toplam = ara toplam + kargo + ödeme ücreti − indirim
ALTER TABLE `product_variants` ADD CONSTRAINT `product_variants_price_check` CHECK (`priceKurus` >= 0);
ALTER TABLE `orders` ADD CONSTRAINT `orders_amounts_check` CHECK (
    `subtotalKurus` >= 0 AND `shippingKurus` >= 0 AND `discountKurus` >= 0
    AND `paymentFeeKurus` >= 0 AND `totalKurus` >= 0
);
ALTER TABLE `orders` ADD CONSTRAINT `orders_total_check` CHECK (
    `totalKurus` = `subtotalKurus` + `shippingKurus` + `paymentFeeKurus` - `discountKurus`
);
