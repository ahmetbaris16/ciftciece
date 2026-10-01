-- Oturum 2 — sipariş onayı kaydı: Ön Bilgilendirme Formu ve Mesafeli Satış Sözleşmesi
-- (belge, sürüm, zaman, IP). Yalnız ekleme (expand); mevcut siparişlere satır eklenmez
-- (onları onaylandığına dair kayıt yoktu, uydurulmaz).
-- Geri alma: kodu önceki commit'e döndürmek yeterli; tablo bırakılabilir.

-- CreateTable
CREATE TABLE "order_consents" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "document" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,

    CONSTRAINT "order_consents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "order_consents_orderId_document_key" ON "order_consents"("orderId", "document");

-- AddForeignKey
ALTER TABLE "order_consents" ADD CONSTRAINT "order_consents_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
