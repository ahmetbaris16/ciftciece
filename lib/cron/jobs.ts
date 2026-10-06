/**
 * Zamanlanmış işler — /api/cron/run her çağrıldığında sırayla çalışır (Hostinger hPanel → Cron Jobs,
 * 5 dakikada bir). Her iş tekrar çalıştırılmaya dayanıklıdır (idempotent); biri hata verirse diğerleri
 * yine çalışır.
 */

import { releaseExpiredOrders } from "@/lib/repositories/order.repository";
import { runNotifications } from "@/lib/notifications/run";
import { reconcilePendingCardPayments } from "@/lib/payment/auto-reconcile";
import { enqueueTransferReminders } from "@/lib/orders/reminders";
import { discountsEndedRecently } from "@/lib/repositories/discount.repository";
import { revalidateStorefront } from "@/lib/cache/revalidate";

export interface CronJobResult {
  name: string;
  ok: boolean;
  detail: unknown;
  ms: number;
}

type Job = { name: string; run: () => Promise<unknown> };

/** Son 15 dakikada biten indirim varsa vitrin önbelleği tazelenir: bitmiş indirim sayfalarda kalmasın */
async function refreshEndedDiscounts() {
  const ended = await discountsEndedRecently(15 * 60_000);
  if (ended > 0) revalidateStorefront();
  return { ended };
}

/**
 * Sıra önemli: önce bankaya sorulur (ödenmiş sipariş iptal edilmesin), sonra süresi dolan siparişler bırakılır,
 * havale hatırlatmaları kuyruğa girer, biten indirimler için vitrin tazelenir, en son e-postalar gönderilir.
 */
export function cronJobs(): Job[] {
  return [
    { name: "kart-odeme-mutabakati", run: () => reconcilePendingCardPayments() },
    { name: "suresi-dolan-siparisler", run: () => releaseExpiredOrders(new Date(), { cardGraceMs: 0 }) },
    { name: "havale-hatirlatma", run: () => enqueueTransferReminders() },
    { name: "indirim-bitisi", run: () => refreshEndedDiscounts() },
    { name: "bildirimler", run: () => runNotifications() },
  ];
}

export async function runCronJobs(jobs: Job[] = cronJobs()): Promise<CronJobResult[]> {
  const results: CronJobResult[] = [];
  for (const job of jobs) {
    const started = Date.now();
    try {
      results.push({ name: job.name, ok: true, detail: await job.run(), ms: Date.now() - started });
    } catch (err) {
      console.error(`[cron] ${job.name} hata verdi:`, err);
      results.push({ name: job.name, ok: false, detail: err instanceof Error ? err.message : String(err), ms: Date.now() - started });
    }
  }
  return results;
}
