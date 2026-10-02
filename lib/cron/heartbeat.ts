/**
 * Zamanlanmış işin son çalışma zamanı (site_settings "cron_last_run"): admin panelindeki kontrol listesi cron'un
 * gerçekten çalışıp çalışmadığını buradan gösterir (hPanel'deki görev silinir/bozulursa fark edilir).
 */

import { prisma } from "@/lib/db/prisma";

const KEY = "cron_last_run";

export async function recordCronRun(ok: boolean, at = new Date()): Promise<void> {
  const value = JSON.stringify({ at: at.toISOString(), ok });
  await prisma.siteSetting.upsert({ where: { key: KEY }, update: { value }, create: { key: KEY, value } });
}

export async function lastCronRun(): Promise<{ at: Date; ok: boolean } | null> {
  const row = await prisma.siteSetting.findUnique({ where: { key: KEY } });
  if (!row) return null;
  try {
    const v = JSON.parse(row.value) as { at?: string; ok?: boolean };
    const at = v.at ? new Date(v.at) : null;
    return at && !Number.isNaN(at.getTime()) ? { at, ok: v.ok !== false } : null;
  } catch {
    return null;
  }
}
