/**
 * Yayın ortamı ayar denetimi (Y-03, R-13).
 *
 * Production sunucusu açılırken (instrumentation.ts) çalışır. Eksik ya da tehlikeli ayarla uygulama hiç
 * açılmaz — yarım yapılandırılmış site müşteri görmez:
 *  - NEXTAUTH_SECRET yer tutucu/kısa ise oturum çerezi (yönetici dahil) taklit edilebilir,
 *  - site adresi yanlışsa ödeme dönüşü ve e-posta bağlantıları yanlış yere gider,
 *  - test ödeme sağlayıcısı (stub) canlıda açıksa her sipariş "ödenmiş" sayılabilir.
 * Saf fonksiyon: ortam değişkenlerini alır, hata ve uyarı listesi döner (tests/runtime-check.test.ts).
 */

import { emailConfigWarnings } from "@/lib/email/config";

export interface ConfigCheckResult {
  errors: string[];
  warnings: string[];
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const PLACEHOLDER = /todo|xxx|your_|örnek|ornek|change_?me|degistir/i;
const IYZICO_HOSTS = new Set(["api.iyzipay.com", "sandbox-api.iyzipay.com"]);

function parseUrl(value: string | undefined): URL | null {
  if (!value?.trim()) return null;
  try {
    return new URL(value.trim());
  } catch {
    return null;
  }
}

export type EnvVars = Record<string, string | undefined>;

export function checkProductionConfig(env: EnvVars): ConfigCheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  // Yalnız bu bilgisayarda production derlemesini denemek için (http://localhost); canlıda tanımlanmaz
  const localTest = env.LOCAL_PRODUCTION_TEST === "1";

  // Veritabanı
  const db = env.DATABASE_URL?.trim();
  if (!db) errors.push("DATABASE_URL tanımlı değil (MariaDB/MySQL bağlantı adresi).");
  else if (!db.startsWith("mysql://")) errors.push("DATABASE_URL mysql:// ile başlamalı (veritabanı MariaDB/MySQL).");

  // Oturum anahtarı
  const secret = env.NEXTAUTH_SECRET ?? "";
  if (!secret) errors.push("NEXTAUTH_SECRET tanımlı değil.");
  else if (secret.length < 32 || PLACEHOLDER.test(secret)) {
    errors.push("NEXTAUTH_SECRET zayıf ya da yer tutucu: en az 32 karakter rastgele değer olmalı (openssl rand -base64 32).");
  }

  // Site adresi
  const appUrl = parseUrl(env.NEXT_PUBLIC_APP_URL);
  const authUrl = parseUrl(env.NEXTAUTH_URL);
  if (!appUrl) errors.push("NEXT_PUBLIC_APP_URL tanımlı değil ya da geçersiz (ör. https://alanadiniz.com).");
  if (!authUrl) errors.push("NEXTAUTH_URL tanımlı değil ya da geçersiz (ör. https://alanadiniz.com).");
  if (appUrl && authUrl && appUrl.origin !== authUrl.origin) {
    errors.push(`NEXT_PUBLIC_APP_URL (${appUrl.origin}) ile NEXTAUTH_URL (${authUrl.origin}) aynı adres olmalı.`);
  }
  const isLocalApp = !!appUrl && LOCAL_HOSTS.has(appUrl.hostname);
  if (appUrl) {
    if (isLocalApp && !localTest) {
      errors.push(`NEXT_PUBLIC_APP_URL yerel adres (${appUrl.origin}); canlıda gerçek alan adı olmalı.`);
    } else if (!isLocalApp && appUrl.protocol !== "https:") {
      errors.push(`NEXT_PUBLIC_APP_URL https olmalı (şu an ${appUrl.protocol}//).`);
    }
  }
  if (localTest) warnings.push("LOCAL_PRODUCTION_TEST=1: yalnız yerel production denemesi içindir, canlıda tanımlanmamalı.");

  // Ödeme sağlayıcısı (R-13: test sağlayıcısı canlıda asla)
  const provider = env.PAYMENT_PROVIDER?.trim() || "stub";
  if (env.ALLOW_STUB_PAYMENTS === "true" && !(isLocalApp && localTest)) {
    errors.push("ALLOW_STUB_PAYMENTS canlıda tanımlanamaz: test sağlayıcısı her kart ödemesini başarılı sayar.");
  }
  if (provider === "stub") {
    warnings.push("PAYMENT_PROVIDER tanımlı değil: kartla ödeme kapalı (havale/kapıda ödeme ayarlarına göre çalışır).");
  } else if (provider === "iyzico") {
    const key = env.IYZICO_API_KEY?.trim();
    const sec = env.IYZICO_SECRET_KEY?.trim();
    if (!key || !sec || PLACEHOLDER.test(key) || PLACEHOLDER.test(sec)) {
      warnings.push("iyzico anahtarları girilmemiş: kartla ödeme gösterilmez.");
    }
    const base = parseUrl(env.IYZICO_BASE_URL || "https://sandbox-api.iyzipay.com");
    if (!base || (!IYZICO_HOSTS.has(base.hostname) && !localTest)) {
      errors.push("IYZICO_BASE_URL https://api.iyzipay.com (canlı) ya da https://sandbox-api.iyzipay.com (test) olmalı.");
    } else if (base.hostname === "sandbox-api.iyzipay.com") {
      warnings.push("iyzico SANDBOX (test) ortamında: gerçek para çekilmez.");
    }
  } else {
    errors.push(`Bilinmeyen PAYMENT_PROVIDER: "${provider}".`);
  }

  // E-posta (sipariş teyidi yasal zorunluluk): eksikse site açılır ama e-postalar kuyrukta bekler
  warnings.push(...emailConfigWarnings({ ...env, NODE_ENV: "production" }));

  // Zamanlanmış işler (süresi dolan siparişler, e-posta yeniden denemeleri)
  const cron = env.CRON_SECRET?.trim() ?? "";
  if (!cron) {
    warnings.push("CRON_SECRET tanımlı değil: zamanlanmış iş adresi (/api/cron/run) kapalı; hPanel Cron Jobs kurulamaz.");
  } else if (cron.length < 24 || PLACEHOLDER.test(cron)) {
    errors.push("CRON_SECRET zayıf ya da yer tutucu: en az 24 karakter rastgele değer olmalı.");
  }

  if (env.ADMIN_PASSWORD) {
    warnings.push("ADMIN_PASSWORD tanımlı: yalnız ilk kurulumda gerekir, yönetici hesabı açıldıysa silin.");
  }
  return { errors, warnings };
}
