-- E-posta kuyruğu ve kaydı (yayına hazırlık Aşama 3, E1). Yalnız ekleme: yeni tablo, mevcut veriye dokunmaz.
-- Satırlar Prisma istemcisiyle yazılır (zaman damgaları uygulamadan gelir).

-- CreateTable
CREATE TABLE `email_messages` (
    `id` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(60) NOT NULL,
    `dedupeKey` VARCHAR(191) NOT NULL,
    `orderId` VARCHAR(191) NULL,
    `audience` VARCHAR(20) NOT NULL,
    `toAddress` VARCHAR(254) NOT NULL,
    `replyTo` VARCHAR(254) NULL,
    `subject` VARCHAR(300) NOT NULL,
    `html` MEDIUMTEXT NOT NULL,
    `text` MEDIUMTEXT NOT NULL,
    `status` ENUM('QUEUED', 'SENDING', 'SENT', 'FAILED', 'CANCELLED') NOT NULL DEFAULT 'QUEUED',
    `attempts` INTEGER NOT NULL DEFAULT 0,
    `availableAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lockedUntil` DATETIME(3) NULL,
    `expiresAt` DATETIME(3) NULL,
    `sentAt` DATETIME(3) NULL,
    `providerMessageId` VARCHAR(300) NULL,
    `lastError` TEXT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `email_messages_dedupeKey_key`(`dedupeKey`),
    INDEX `email_messages_status_availableAt_idx`(`status`, `availableAt`),
    INDEX `email_messages_orderId_idx`(`orderId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `email_messages` ADD CONSTRAINT `email_messages_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
