/**
 * Doğrudan (kuyruksuz) e-posta gönderimi — yalnız içeriği veritabanına yazılmaması gereken e-postalar için
 * (şifre sıfırlama bağlantısı). Sipariş e-postaları kuyruktan gider: lib/notifications.
 *
 * Gönderim ayarı yoksa:
 * - production: e-posta isteyen özellik (şifre sıfırlama) bunu açıkça söyler, sessizce "gönderildi" demez;
 * - geliştirme: e-posta gönderilmez, .mock-data/outbox.json'a yazılır (bağlantıyı denemek için).
 */

import { readMock } from "@/lib/data/mock-store";
import { emailMode, type EmailMode } from "./config";
import { deliver, type OutgoingEmail } from "./transport";

export type EmailDelivery = EmailMode;

export function emailDelivery(): EmailDelivery {
  return emailMode();
}

export type EmailMessage = OutgoingEmail;

export async function sendEmail(message: EmailMessage): Promise<void> {
  await deliver(message);
}

/** Geliştirme: son gönderilen e-postalar (test ve hata ayıklama için) */
export async function readDevOutbox(): Promise<Array<EmailMessage & { at: string }>> {
  return readMock<Array<EmailMessage & { at: string }>>("outbox.json", []);
}
