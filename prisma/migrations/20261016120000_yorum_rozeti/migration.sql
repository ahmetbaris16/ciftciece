-- Mağaza yorumlarında yazar rozeti (kullanıcı isteği 2026-10-16): Google'daki "Yerel Rehber" rozeti ana sayfadaki
-- yorum kartında görünür.
-- Yalnız ekleme, geriye uyumlu: boş olabilen yeni sütun; mevcut satırlar NULL (rozet yok) kalır.
-- Geri almak için sütun kaldırılabilir (yalnız rozet bilgisi gider).

-- AlterTable
ALTER TABLE `reviews` ADD COLUMN `authorBadge` VARCHAR(60) NULL;
