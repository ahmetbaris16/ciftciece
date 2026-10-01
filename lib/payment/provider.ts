/**
 * Ödeme sağlayıcısı seçimi ve kart ödemesinin durumu (demo / test / canlı).
 *
 * PAYMENT_PROVIDER:
 * - "akbank" → Akbank Sanal POS, ortak ödeme sayfası (lib/payment/providers/akbank.ts). AKBANK_MERCHANT_SAFE_ID,
 *              AKBANK_TERMINAL_SAFE_ID, AKBANK_SECRET_KEY, AKBANK_ENV (test | prod) gerekir.
 * - "iyzico" → iyzico ortak ödeme formu. IYZICO_API_KEY / IYZICO_SECRET_KEY / IYZICO_BASE_URL.
 * - "stub"   → geliştirme: gerçek para çekmeden başarılı sayar. Canlıda kapalı (R-13).
 *
 * Kart ödemesinin durumu (admin → Ayarlar → Ödeme'de görünür):
 * - demo: sanal POS bağlı değil. Müşteri kart seçeneğini "yakında" olarak görür, seçemez.
 * - test: bankanın TEST ortamı (gerçek para çekilmez). Kart seçeneğini YALNIZ yönetici görür ve kullanır:
 *         gerçek müşteri test ödemesiyle "ödenmiş" sipariş veremez.
 * - live: canlı tahsilat; herkes kartla öder.
 */

import type { PaymentProvider } from "./types";
import { StubPaymentProvider } from "./providers/stub";
import { IyzicoProvider, iyzicoConfigFromEnv } from "./providers/iyzico";
import { AkbankProvider, akbankConfigFromEnv } from "./providers/akbank";

export type CardPaymentMode = "demo" | "test" | "live";

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

    case "akbank": {
      const config = akbankConfigFromEnv();
      if (!config) {
        throw new Error("Akbank seçili ama AKBANK_MERCHANT_SAFE_ID / AKBANK_TERMINAL_SAFE_ID / AKBANK_SECRET_KEY girilmemiş.");
      }
      return new AkbankProvider(config);
    }

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

/** Sağlayıcı kurulu ve anahtarları girilmiş mi */
export function isCardPaymentReady(): boolean {
  try {
    getPaymentProvider();
    return true;
  } catch {
    return false;
  }
}

/** Kart ödemesinin durumu: demo (bağlı değil), test (test ortamı), live (canlı) */
export function cardPaymentMode(): CardPaymentMode {
  if (!isCardPaymentReady()) return "demo";
  const name = process.env.PAYMENT_PROVIDER ?? "stub";
  if (name === "akbank") return akbankConfigFromEnv()?.environment === "prod" ? "live" : "test";
  if (name === "iyzico") {
    const base = process.env.IYZICO_BASE_URL?.trim() || "https://sandbox-api.iyzipay.com";
    return base.includes("sandbox") ? "test" : "live";
  }
  // stub: yalnız geliştirmede ve yerel denemede açılır
  return "test";
}

/**
 * Bu ziyaretçi kartla ödeyebilir mi? Canlıda herkes; test ortamında yalnız yönetici (gerçek müşteri test
 * ödemesiyle sipariş vermesin). Geliştirmede (NODE_ENV != production) test ortamı herkese açıktır.
 */
export function canUseCardPayment(viewerIsAdmin: boolean): boolean {
  const mode = cardPaymentMode();
  if (mode === "live") return true;
  if (mode === "test") return viewerIsAdmin || process.env.NODE_ENV !== "production";
  return false;
}

export interface ProviderStatus {
  /** Sağlayıcının görünen adı */
  name: string;
  mode: CardPaymentMode;
  ready: boolean;
  note: string;
}

/** Admin'de gösterilecek durum */
export function paymentProviderStatus(): ProviderStatus {
  const name = process.env.PAYMENT_PROVIDER ?? "stub";
  const mode = cardPaymentMode();
  const ready = mode !== "demo";
  const display = name === "akbank" ? "Akbank Sanal POS" : name === "iyzico" ? "iyzico" : name === "stub" ? "Test (stub)" : name;

  if (mode === "demo") {
    return {
      name: display,
      mode,
      ready,
      note:
        name === "akbank"
          ? "Akbank bilgileri (Güvenli İş Yeri No, Terminal Safe ID, gizli anahtar) girilmemiş."
          : "Sanal POS bağlı değil. Müşteri kart seçeneğini “yakında” olarak görür; siparişler havale/EFT (ve açıksa kapıda ödeme) ile alınır.",
    };
  }
  if (mode === "test") {
    return {
      name: display,
      mode,
      ready,
      note:
        name === "stub"
          ? "Geliştirme: kart ödemesi gerçek para çekmeden başarılı sayılır."
          : "TEST ortamı: gerçek para çekilmez. Kartla ödemeyi yalnız siz (yönetici girişi açıkken) görürsünüz; müşteriler “yakında” görür.",
    };
  }
  return { name: display, mode, ready, note: "CANLI: kartla ödemeler gerçek tahsilattır." };
}

/** Ödeme denemesi kaydındaki sağlayıcı adının görünen karşılığı */
export const PROVIDER_LABELS: Record<string, string> = {
  akbank: "Akbank",
  "akbank-test": "Akbank (TEST — gerçek para yok)",
  iyzico: "iyzico",
  stub: "Test (stub — gerçek para yok)",
  havale: "Havale/EFT",
  kapida: "Kapıda ödeme",
};

/** Bu sağlayıcıyla alınan "ödeme" gerçek para mı (test ortamı/stub değil) */
export function isTestProvider(provider: string): boolean {
  return provider === "stub" || provider === "akbank-test";
}
