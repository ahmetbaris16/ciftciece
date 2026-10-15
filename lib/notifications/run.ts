/**
 * Bildirim döngüsü: outbox olaylarını e-postaya çevir, sırası gelen e-postaları gönder.
 *
 * Tetikleyiciler (Hostinger uygulamayı yalnız trafik varken çalıştırır; arka planda zamanlayıcıya
 * güvenilmez):
 *  - İşlemden hemen sonra: sipariş, ödeme, durum değişikliği gibi istekler yanıt döndükten sonra
 *    scheduleNotifications() ile döngüyü çalıştırır (müşteri beklemeden e-posta alır).
 *  - Zamanlanmış iş: /api/cron/run (hPanel Cron Jobs, 5 dakikada bir) — yeniden denemeler ve kaçanlar.
 *  - Admin: E-postalar sayfasındaki "Şimdi gönder".
 * Aynı süreçte üst üste binen çağrılar döngüyü paylaşmaz: sürmekte olan döngü olay adımını geçmiş olabilir
 * (ör. "Kargoya verildi" e-postası gönderilirken yazılan "Teslim edildi" olayı atlanırdı), bu yüzden döngü
 * bitince bir tur daha çalışır; o arada gelen bütün çağrılar bu ikinci turu bekler. Farklı süreçler arası
 * güvenlik satır düzeyindedir (dispatcher/sender).
 */

import { after } from "next/server";
import { USE_DB } from "@/lib/data/source";
import { processOutbox, type DispatchResult } from "./dispatcher";
import { sendDueEmails, type SendResult } from "./sender";

export interface NotificationRunResult {
  dispatch: DispatchResult;
  send: SendResult;
}

const EMPTY: NotificationRunResult = {
  dispatch: { processed: 0, emails: 0, failed: 0 },
  send: { sent: 0, failed: 0, retried: 0, notConfigured: false, blocked: null },
};

let running: Promise<NotificationRunResult> | null = null;
let rerun: Promise<NotificationRunResult> | null = null;

export function runNotifications(): Promise<NotificationRunResult> {
  if (!USE_DB) return Promise.resolve(EMPTY);
  if (running) {
    if (!rerun) {
      rerun = running
        .catch(() => undefined)
        .then(() => {
          rerun = null;
          return runNotifications();
        });
    }
    return rerun;
  }
  running = (async () => {
    try {
      const dispatch = await processOutbox();
      const send = await sendDueEmails();
      return { dispatch, send };
    } finally {
      running = null;
    }
  })();
  return running;
}

/**
 * Yanıt gönderildikten sonra bildirim döngüsünü çalıştırır. İstek bağlamı dışında (test, betik) bir şey
 * yapmaz: e-postalar kuyrukta kalır, zamanlanmış iş gönderir.
 */
export function scheduleNotifications(): void {
  if (!USE_DB) return;
  try {
    after(async () => {
      try {
        await runNotifications();
      } catch (err) {
        console.error("[bildirim] döngü hatası:", err);
      }
    });
  } catch {
    // İstek bağlamı yok
  }
}
