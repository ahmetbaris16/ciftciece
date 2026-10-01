-- Oturum 2 — checkout idempotency (R-05).
-- Yalnız ekleme (expand): iki boş kolon + UNIQUE indeks. Mevcut siparişlerde anahtar boştur;
-- PostgreSQL'de UNIQUE indeks birden çok NULL'a izin verir, mevcut veri etkilenmez.
-- Not: indeks CONCURRENTLY değildir (orders tablosu küçük; büyük tabloda kısa yazma kilidi alır).
-- Geri alma: kodu önceki commit'e döndürmek yeterli; kolon ve indeks bırakılabilir.

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "idempotencyHash" TEXT,
ADD COLUMN     "idempotencyKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "orders_idempotencyKey_key" ON "orders"("idempotencyKey");
