/**
 * Zamanlanmış işler — /api/cron/run her çağrıldığında sırayla çalışır (Hostinger hPanel → Cron Jobs,
 * 5 dakikada bir). Her iş tekrar çalıştırılmaya dayanıklıdır (idempotent); biri hata verirse diğerleri
 * yine çalışır.
 */

import { releaseExpiredOrders } from "@/lib/repositories/order.repository";
import { runNotifications } from "@/lib/notifications/run";

export interface CronJobResult {
  name: string;
  ok: boolean;
  detail: unknown;
  ms: number;
}

type Job = { name: string; run: () => Promise<unknown> };

/** Sıra önemli: önce süresi dolan siparişler (iptal olayları üretir), en son e-postalar */
export function cronJobs(): Job[] {
  return [
    { name: "suresi-dolan-siparisler", run: () => releaseExpiredOrders() },
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
