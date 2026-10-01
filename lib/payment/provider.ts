/**
 * Payment Provider Factory
 *
 * Config'e göre doğru provider'ı döner.
 * Yeni provider eklemek: providers/ altına class yaz, buraya case ekle.
 */

import type { PaymentProvider } from "./types";
import { StubPaymentProvider } from "./providers/stub";
import { IyzicoProvider, iyzicoConfigFromEnv } from "./providers/iyzico";

/**
 * Aktif ödeme sağlayıcısını döner.
 *
 * PAYMENT_PROVIDER env variable'ına göre seçim yapılır:
 * - "stub"   → StubPaymentProvider (development/test)
 * - "iyzico" → IyzicoProvider (ortak ödeme sayfası: kart + taksit). IYZICO_API_KEY / IYZICO_SECRET_KEY /
 *              IYZICO_BASE_URL gerekir (sandbox: https://sandbox-api.iyzipay.com).
 *
 * Varsayılan: stub (sadece development). Production'da stub için ALLOW_STUB_PAYMENTS=true gerekir.
 */
export function getPaymentProvider(): PaymentProvider {
  const providerName = process.env.PAYMENT_PROVIDER ?? "stub";
  const isProd = process.env.NODE_ENV === "production";

  switch (providerName) {
    case "stub":
      // Stub her ödemeyi başarılı sayar — production'da yalnız bu bilgisayardaki denemede (R-13):
      // ALLOW_STUB_PAYMENTS=true + LOCAL_PRODUCTION_TEST=1 + site adresi localhost. Aksi hâlde
      // gerçek sipariş ücretsiz "ödenmiş" olurdu. (Sunucu açılışı da bunu denetler: lib/config/runtime-check.ts)
      if (isProd && !isLocalStubAllowed()) {
        throw new Error(
          "Production'da stub ödeme sağlayıcısı kapalı. PAYMENT_PROVIDER ile gerçek sağlayıcıyı ayarlayın."
        );
      }
      return new StubPaymentProvider();

    case "iyzico": {
      const config = iyzicoConfigFromEnv();
      if (!config) throw new Error("iyzico seçili ama IYZICO_API_KEY / IYZICO_SECRET_KEY girilmemiş.");
      return new IyzicoProvider(config);
    }

    default:
      // Sessizce stub'a düşmek yok: bilinmeyen sağlayıcı bir kurulum hatasıdır
      throw new Error(`Bilinmeyen ödeme sağlayıcısı: "${providerName}"`);
  }
}

function isLocalStubAllowed(): boolean {
  if (process.env.ALLOW_STUB_PAYMENTS !== "true" || process.env.LOCAL_PRODUCTION_TEST !== "1") return false;
  try {
    const host = new URL(process.env.NEXT_PUBLIC_APP_URL ?? "").hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]";
  } catch {
    return false;
  }
}

/**
 * Kartla ödeme şu an alınabilir mi? (sağlayıcı kurulu ve anahtarları girilmiş)
 * Değilse ödeme sayfasında kart seçeneği gösterilmez — hata vereceği bilinen yöntem sunulmaz.
 */
export function isCardPaymentReady(): boolean {
  try {
    getPaymentProvider();
    return true;
  } catch {
    return false;
  }
}

/** Admin'de gösterilecek kısa durum */
export function paymentProviderStatus(): { name: string; ready: boolean; note: string } {
  const name = process.env.PAYMENT_PROVIDER ?? "stub";
  const ready = isCardPaymentReady();
  if (name === "stub") {
    return {
      name: "Test (stub)",
      ready,
      note: ready
        ? "Geliştirme modu: kart ödemesi gerçek para çekmeden başarılı sayılır."
        : "Canlıda test sağlayıcısı kapalı; kartla ödeme için iyzico anahtarları girilmeli.",
    };
  }
  if (name === "iyzico") {
    return {
      name: "iyzico",
      ready,
      note: ready
        ? `Bağlı (${process.env.IYZICO_BASE_URL?.includes("sandbox") ? "sandbox — test ortamı" : "canlı ortam"}).`
        : "iyzico anahtarları eksik — kartla ödeme gösterilmiyor.",
    };
  }
  return { name, ready, note: "Bilinmeyen sağlayıcı — kartla ödeme gösterilmiyor." };
}
