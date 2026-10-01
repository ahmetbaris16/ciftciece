/**
 * Otomatik mutabakat (R-01): kart ödemesi bekleyen siparişlerin açık denemeleri bankaya sorulur.
 *
 * Akbank ortak ödeme sayfası sonucu yalnız tarayıcıyla bildirir; müşteri ödedikten sonra sekmeyi kapatırsa ya da
 * bağlantı koparsa sitemiz ödemeyi bilmez. Bu iş (cron, 5 dakikada bir) denemeleri sunucudan sorgular:
 * ödenmiş sipariş "Ödendi" olur, süre dolumu ödemesi alınmış siparişi iptal etmez. Süre dolduktan sonra gelen
 * ödeme (iptal edilmiş sipariş) geç ödeme kurallarıyla işlenir (lib/payment/apply.ts).
 *
 * Sorgu kayıtları payment_events'te (source QUERY). Dış çağrılar veritabanı işlemi dışındadır.
 */

import { prisma } from "@/lib/db/prisma";
import { getPaymentProvider } from "./provider";
import { verifyAttempt } from "./verify";

export interface AutoReconcileResult {
  checked: number;
  outcomes: Record<string, number>;
}

/** Süresi dolup kapanan denemeler bu süre boyunca sorgulanmaya devam eder (geç ödemeyi yakalamak için) */
const LATE_WINDOW_MS = 60 * 60_000;

export async function reconcilePendingCardPayments(
  opts: { limit?: number; minAgeMs?: number; now?: Date } = {}
): Promise<AutoReconcileResult> {
  const result: AutoReconcileResult = { checked: 0, outcomes: {} };
  let providerName: string;
  try {
    providerName = getPaymentProvider().name;
  } catch {
    return result; // sanal POS bağlı değil (demo)
  }
  const now = opts.now?.getTime() ?? Date.now();
  const attempts = await prisma.paymentAttempt.findMany({
    where: {
      provider: providerName,
      method: "CARD",
      providerToken: { not: null },
      OR: [
        // Ödeme bekleyen sipariş: form açılalı en az 1 dk olmuş (müşteri henüz ödeme sayfasında olabilir)
        {
          status: "INITIATED",
          createdAt: { lte: new Date(now - (opts.minAgeMs ?? 60_000)), gte: new Date(now - 48 * 3_600_000) },
          order: { status: "PENDING" },
        },
        // Süre dolumuyla kapanmış deneme: son bir saat içinde kapandıysa geç ödeme için sorulur
        { status: "EXPIRED", updatedAt: { gte: new Date(now - LATE_WINDOW_MS) } },
      ],
    },
    orderBy: { createdAt: "asc" },
    take: opts.limit ?? 20,
    select: { id: true },
  });

  for (const { id } of attempts) {
    try {
      const r = await verifyAttempt(id, { source: "QUERY" });
      result.outcomes[r.outcome] = (result.outcomes[r.outcome] ?? 0) + 1;
    } catch (err) {
      result.outcomes.error = (result.outcomes.error ?? 0) + 1;
      console.error("[mutabakat] deneme sorgulanamadı:", id, err);
    }
    result.checked++;
  }
  return result;
}
