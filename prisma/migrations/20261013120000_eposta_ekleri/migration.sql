-- E-posta ek dosyaları (kullanıcı isteği 2026-10-13): sipariş teyidindeki Ön Bilgilendirme Formu ve Mesafeli Satış
-- Sözleşmesi e-posta gövdesinden çıkarılıp ek dosya olarak gönderilir (kalıcı veri saklayıcısı korunur).
-- Yalnız ekleme, geriye uyumlu: boş olabilen yeni sütun; mevcut satırlar NULL (eki yok) kalır.
-- Geri almak için sütun kaldırılabilir (yalnız bekleyen e-postaların ekleri gider).

-- AlterTable
ALTER TABLE `email_messages` ADD COLUMN `attachments` JSON NULL;
