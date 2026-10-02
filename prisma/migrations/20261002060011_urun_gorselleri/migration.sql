-- Ürün görselleri veritabanında (Y-18, E5). Yalnız ekleme: yeni tablo uploaded_images. Mevcut veriye dokunmaz.
-- Geri alma: tablo boşsa DROP TABLE uploaded_images (önce product_images'ta /gorsel/ adresli satırlar kaldırılmalı).

-- CreateTable
CREATE TABLE `uploaded_images` (
    `id` VARCHAR(191) NOT NULL,
    `contentType` VARCHAR(40) NOT NULL,
    `data` MEDIUMBLOB NOT NULL,
    `byteSize` INTEGER NOT NULL,
    `width` INTEGER NULL,
    `height` INTEGER NULL,
    `sha256` CHAR(64) NOT NULL,
    `createdById` VARCHAR(191) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `uploaded_images_sha256_idx`(`sha256`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

