-- Oturum 2 — ödeme kayıtları (R-02, R-03, R-10, R-11)
-- Yalnız ekleme (expand). Silinen tablo/kolon yok, veri değişmez. Tek gevşetme: şu an BOŞ olan
-- payment_events.paymentId kolonunun NOT NULL'u kaldırılır (eski kod bu kolonu her zaman doldurur).
--
-- Geri alma: kodu önceki commit'e döndürmek yeterli; eski kod bu tablo/kolonları okumaz, bırakılabilir.
-- Tabloları silmek gerekmez (silinirse içlerindeki ödeme kayıtları kaybolur — önce yedek alın).
--
-- Not (Prisma): CHECK kısıtları şemada ifade edilemez; `prisma migrate dev` bunları silmez ama
-- yeni migration üretirken diff'te görünmez. Elle eklenmiştir.

-- CreateEnum
CREATE TYPE "PaymentAttemptStatus" AS ENUM ('INITIATED', 'SUCCEEDED', 'FAILED', 'MISMATCH', 'DUPLICATE', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PaymentEventSource" AS ENUM ('WEBHOOK', 'CALLBACK', 'QUERY', 'MANUAL', 'ADMIN', 'SYSTEM');

-- CreateEnum
CREATE TYPE "PaymentEventStatus" AS ENUM ('RECEIVED', 'PROCESSED', 'IGNORED', 'FAILED', 'REJECTED', 'RECORDED');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "needsAttention" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "payment_events" ADD COLUMN     "actorId" TEXT,
ADD COLUMN     "attemptId" TEXT,
ADD COLUMN     "error" TEXT,
ADD COLUMN     "eventKey" TEXT,
ADD COLUMN     "handledAt" TIMESTAMP(3),
ADD COLUMN     "orderId" TEXT,
ADD COLUMN     "outcome" TEXT,
ADD COLUMN     "provider" TEXT,
ADD COLUMN     "signatureValid" BOOLEAN,
ADD COLUMN     "source" "PaymentEventSource",
ADD COLUMN     "status" "PaymentEventStatus" NOT NULL DEFAULT 'RECORDED',
ALTER COLUMN "paymentId" DROP NOT NULL;

-- CreateTable
CREATE TABLE "payment_attempts" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "status" "PaymentAttemptStatus" NOT NULL DEFAULT 'INITIATED',
    "amountKurus" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'TRY',
    "conversationId" TEXT,
    "providerToken" TEXT,
    "tokenExpiresAt" TIMESTAMP(3),
    "providerPaymentId" TEXT,
    "paidAmountKurus" INTEGER,
    "chargedAmountKurus" INTEGER,
    "paidCurrency" TEXT,
    "installment" INTEGER,
    "fraudStatus" INTEGER,
    "failureReason" TEXT,
    "successOrderId" TEXT,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_alerts" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "orderId" TEXT,
    "attemptId" TEXT,
    "eventId" TEXT,
    "message" TEXT NOT NULL,
    "details" JSONB,
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedBy" TEXT,

    CONSTRAINT "payment_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "payment_attempts_successOrderId_key" ON "payment_attempts"("successOrderId");

-- CreateIndex
CREATE INDEX "payment_attempts_orderId_idx" ON "payment_attempts"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_attempts_provider_providerToken_key" ON "payment_attempts"("provider", "providerToken");

-- CreateIndex
CREATE UNIQUE INDEX "payment_attempts_provider_providerPaymentId_key" ON "payment_attempts"("provider", "providerPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_alerts_dedupeKey_key" ON "payment_alerts"("dedupeKey");

-- CreateIndex
CREATE INDEX "payment_alerts_orderId_idx" ON "payment_alerts"("orderId");

-- CreateIndex
CREATE INDEX "payment_alerts_kind_resolvedAt_idx" ON "payment_alerts"("kind", "resolvedAt");

-- CreateIndex
CREATE INDEX "payment_events_orderId_idx" ON "payment_events"("orderId");

-- CreateIndex
CREATE INDEX "payment_events_attemptId_idx" ON "payment_events"("attemptId");

-- CreateIndex
CREATE INDEX "payment_events_status_idx" ON "payment_events"("status");

-- CreateIndex
CREATE UNIQUE INDEX "payment_events_provider_eventKey_key" ON "payment_events"("provider", "eventKey");

-- AddForeignKey
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_events" ADD CONSTRAINT "payment_events_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "payment_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_alerts" ADD CONSTRAINT "payment_alerts_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_alerts" ADD CONSTRAINT "payment_alerts_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "payment_attempts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_alerts" ADD CONSTRAINT "payment_alerts_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "payment_events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Bir siparişte en fazla BİR başarılı deneme (son savunma hattı DB'dedir):
-- successOrderId yalnız SUCCEEDED iken doludur ve orderId'ye eşittir; kolon UNIQUE.
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_success_order_check" CHECK (
    ("status" = 'SUCCEEDED' AND "successOrderId" IS NOT NULL AND "successOrderId" = "orderId")
    OR ("status" <> 'SUCCEEDED' AND "successOrderId" IS NULL)
);

-- Tutarlar negatif olamaz (kuruş, tam sayı)
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_amounts_check" CHECK (
    "amountKurus" >= 0
    AND ("paidAmountKurus" IS NULL OR "paidAmountKurus" >= 0)
    AND ("chargedAmountKurus" IS NULL OR "chargedAmountKurus" >= 0)
);
