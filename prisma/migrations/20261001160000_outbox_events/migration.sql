-- Oturum 2 — outbox tablosu (kullanıcı maddesi 5). Yalnız ekleme (expand).
-- Ödeme kaydıyla aynı transaction'da yazılır; gönderen işçi sonraki oturumda (Oturum 4/6).
-- Geri alma: kodu önceki commit'e döndürmek yeterli; tablo bırakılabilir.

-- CreateTable
CREATE TABLE "outbox_events" (
    "id" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "aggregateType" TEXT NOT NULL,
    "aggregateId" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "availableAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "publishedAt" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,

    CONSTRAINT "outbox_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "outbox_events_dedupeKey_key" ON "outbox_events"("dedupeKey");

-- CreateIndex
CREATE INDEX "outbox_events_publishedAt_availableAt_idx" ON "outbox_events"("publishedAt", "availableAt");
