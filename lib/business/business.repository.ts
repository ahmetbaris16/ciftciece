/**
 * İşletme bilgilerinin veritabanı katmanı (site_settings, key "business"). Şema değişikliği gerektirmez.
 * Veritabanısız geliştirme modunda .mock-data/business.json kullanılır (yalnız development).
 */

import { cache } from "react";
import { prisma } from "@/lib/db/prisma";
import { USE_DB } from "@/lib/data/source";
import { readMock, updateMock } from "@/lib/data/mock-store";
import { BUSINESS_SETTING_KEY, parseBusinessInfo, type BusinessInfo } from "./info";

const MOCK_FILE = "business.json";

/** Aynı istekte (sayfa + altbilgi + sözleşme) tek sorgu */
export const getBusinessInfo = cache(async (): Promise<BusinessInfo> => {
  if (!USE_DB) {
    const raw = await readMock<BusinessInfo | null>(MOCK_FILE, null);
    return parseBusinessInfo(raw ? JSON.stringify(raw) : null);
  }
  const row = await prisma.siteSetting.findUnique({ where: { key: BUSINESS_SETTING_KEY } });
  return parseBusinessInfo(row?.value);
});

export async function saveBusinessInfo(info: BusinessInfo): Promise<BusinessInfo> {
  const value = JSON.stringify(info);
  if (!USE_DB) {
    await updateMock<BusinessInfo | null, void>(MOCK_FILE, null, () => ({ next: info, result: undefined }));
    return parseBusinessInfo(value);
  }
  await prisma.siteSetting.upsert({
    where: { key: BUSINESS_SETTING_KEY },
    update: { value },
    create: { key: BUSINESS_SETTING_KEY, value },
  });
  return parseBusinessInfo(value);
}
