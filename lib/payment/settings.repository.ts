/**
 * Ödeme ayarlarının DB katmanı (site_settings, key = "payment"). Şema değişikliği gerektirmez.
 * Veritabanısız geliştirme modunda varsayılanlar döner (havale IBAN'ı boş → havale görünmez).
 */

import { prisma } from "@/lib/db/prisma";
import { USE_DB } from "@/lib/data/source";
import {
  DEFAULT_PAYMENT_SETTINGS,
  PAYMENT_SETTING_KEY,
  parsePaymentSettings,
  type PaymentSettings,
} from "./methods";

export async function getPaymentSettings(): Promise<PaymentSettings> {
  if (!USE_DB) return DEFAULT_PAYMENT_SETTINGS;
  const row = await prisma.siteSetting.findUnique({ where: { key: PAYMENT_SETTING_KEY } });
  return parsePaymentSettings(row?.value);
}

export async function savePaymentSettings(settings: PaymentSettings): Promise<PaymentSettings> {
  const value = JSON.stringify(settings);
  await prisma.siteSetting.upsert({
    where: { key: PAYMENT_SETTING_KEY },
    update: { value },
    create: { key: PAYMENT_SETTING_KEY, value },
  });
  return parsePaymentSettings(value);
}
