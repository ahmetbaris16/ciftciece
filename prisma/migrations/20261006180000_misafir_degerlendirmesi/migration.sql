-- Üye olmadan sipariş verenler de teslim edilen ürünü değerlendirebilir (kullanıcı kararı 2026-10-06): değerlendirme
-- üyeye (userId) ya da misafir siparişine (orderId; o siparişin sayfasından yazılır) bağlanır.
-- Yalnız ekleme ve gevşetme, geriye uyumlu: yeni boş kolon + userId boş olabilir hâle gelir; mevcut kayıtların hepsi
-- üye değerlendirmesidir (userId dolu) ve değişmez. Eski kod yeni kolonu okumadan çalışır.

-- AlterTable
ALTER TABLE `product_reviews` ADD COLUMN `orderId` VARCHAR(191) NULL,
    MODIFY `userId` VARCHAR(191) NULL;

-- CreateIndex
CREATE INDEX `product_reviews_orderId_idx` ON `product_reviews`(`orderId`);

-- Misafir siparişinde sipariş başına ürün başına tek değerlendirme (üyede ürün başına tek: productId_userId)
-- CreateIndex
CREATE UNIQUE INDEX `product_reviews_productId_orderId_key` ON `product_reviews`(`productId`, `orderId`);

-- AddForeignKey
ALTER TABLE `product_reviews` ADD CONSTRAINT `product_reviews_orderId_fkey` FOREIGN KEY (`orderId`) REFERENCES `orders`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
