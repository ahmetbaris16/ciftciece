-- İndirim oranını yönetici belirler (kullanıcı kararı 2026-10-06: panelde sayıyla sınır yok). Denetim %1–90 iken
-- %1–99 olur: %100 ve üstü olamaz (fiyat sıfır/eksi olur). Yalnız gevşetme — tablo ve veriler aynı kalır, mevcut her
-- kayıt yeni kurala da uyar; eski kod da çalışır. En uzun süre zaten veritabanında yoktu (yalnız uygulamadaydı).
-- MariaDB'de CHECK değiştirilemez: aynı adla kaldırılıp yeniden eklenir.
ALTER TABLE `product_discounts` DROP CONSTRAINT `product_discounts_percent_check`;
ALTER TABLE `product_discounts` ADD CONSTRAINT `product_discounts_percent_check` CHECK (`percent` >= 1 AND `percent` <= 99);
