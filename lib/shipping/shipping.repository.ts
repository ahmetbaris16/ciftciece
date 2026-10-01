/**
 * Kargo ayarlarının DB katmanı (site_settings tablosu, key = "shipping").
 * Şema değişikliği gerektirmez; değer JSON olarak saklanır.
 */

import { prisma } from "@/lib/db/prisma";
import { USE_DB } from "@/lib/data/source";
import {
  DEFAULT_SHIPPING_SETTINGS,
  SHIPPING_SETTING_KEY,
  parseShippingSettings,
  type ShippingSettings,
} from "./settings";

export async function getShippingSettings(): Promise<ShippingSettings> {
  if (!USE_DB) return DEFAULT_SHIPPING_SETTINGS;
  const row = await prisma.siteSetting.findUnique({ where: { key: SHIPPING_SETTING_KEY } });
  return parseShippingSettings(row?.value);
}

export async function saveShippingSettings(settings: ShippingSettings): Promise<ShippingSettings> {
  const value = JSON.stringify(settings);
  await prisma.siteSetting.upsert({
    where: { key: SHIPPING_SETTING_KEY },
    update: { value },
    create: { key: SHIPPING_SETTING_KEY, value },
  });
  return parseShippingSettings(value);
}
