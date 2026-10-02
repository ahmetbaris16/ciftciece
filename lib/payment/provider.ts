/**
 * Ödeme sağlayıcısı seçimi ve kart ödemesinin durumu (demo / test / canlı).
 *
 * PAYMENT_PROVIDER:
 * - "akbank" → Akbank Sanal POS, ortak ödeme sayfası (lib/payment/providers/akbank.ts). AKBANK_MERCHANT_SAFE_ID,
 *              AKBANK_TERMINAL_SAFE_ID, AKBANK_SECRET_KEY, AKBANK_ENV (test | prod) gerekir. Bilgiler girilene
 *              kadar kart ödemesi DEMO'dur (aşağıda).
 * - "demo"   → (tanımsızsa da) demo banka: banka sayfasının demo kopyası (lib/payment/providers/demo.ts).
 * - "iyzico" → iyzico ortak ödeme formu. IYZICO_API_KEY / IYZICO_SECRET_KEY / IYZICO_BASE_URL.
 * - "stub"   → yalnız geliştirme/otomatik test: sayfasız, gerçek para çekmeden başarılı sayar. Canlıda kapalı (R-13).
 *
 * Kart ödemesinin durumu (admin → Ayarlar → Ödeme'de görünür):
 * - demo: sanal POS bağlı değil. Kartla ödeme banka sayfasının demo kopyasıyla baştan sona gösterilir (kart bilgileri
 *         → 6 haneli kod → sipariş "Ödendi"); gerçek para çekilmez. YALNIZ yönetici kullanır; müşteri kartı "yakında"
 *         görür. Akbank bilgileri girilince kendiliğinden test/canlıya geçer.
 * - test: bankanın TEST ortamı (gerçek para çekilmez). Kart seçeneğini YALNIZ yönetici görür ve kullanır:
 *         gerçek müşteri test ödemesiyle "ödenmiş" sipariş veremez.
 * - live: canlı tahsilat; herkes kartla öder.
 * - off:  ayar hatası (bilinmeyen sağlayıcı, canlıda stub, anahtarsız iyzico): kart "yakında", kimse kullanamaz.
 * Geliştirmede (NODE_ENV != production) demo ve test herkese açıktır.
 */

import type { PaymentProvider } from "./types";
import { StubPaymentProvider } from "./providers/stub";
import { IyzicoProvider, iyzicoConfigFromEnv } from "./providers/iyzico";
import { AkbankProvider, akbankConfigFromEnv } from "./providers/akbank";
import { DemoBankProvider, DEMO_PROVIDER } from "./providers/demo";

export type CardPaymentMode = "off" | "demo" | "test" | "live";

export function getPaymentProvider(): PaymentProvider {
  const providerName = process.env.PAYMENT_PROVIDER?.trim() || DEMO_PROVIDER;
  const isProd = process.env.NODE_ENV === "production";

  switch (providerName) {
    case DEMO_PROVIDER:
      return new DemoBankProvider();

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
      // Sanal POS bilgileri girilene kadar demo banka (yalnız yönetici; müşteriye "yakında")
      const config = akbankConfigFromEnv();
      return config ? new AkbankProvider(config) : new DemoBankProvider();
    }

    case "iyzico": {
      const config = iyzicoConfigFromEnv();
      if (!config) throw new Error("iyzico seçili ama IYZICO_API_KEY / IYZICO_SECRET_KEY girilmemiş.");
      return new IyzicoProvider(config);
    }

    default:
      // Sessizce başka sağlayıcıya düşmek yok: bilinmeyen sağlayıcı bir kurulum hatasıdır
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

/** Kart ödemesinin durumu: off (ayar hatası), demo (sanal POS bağlı değil), test (test ortamı), live (canlı) */
export function cardPaymentMode(): CardPaymentMode {
  let provider: PaymentProvider;
  try {
    provider = getPaymentProvider();
  } catch {
    return "off";
  }
  switch (provider.name) {
    case DEMO_PROVIDER:
      return "demo";
    case "akbank":
      return "live";
    case "iyzico": {
      const base = process.env.IYZICO_BASE_URL?.trim() || "https://sandbox-api.iyzipay.com";
      return base.includes("sandbox") ? "test" : "live";
    }
    default:
      // akbank-test, stub (yalnız geliştirmede ve yerel denemede açılır)
      return "test";
  }
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
  const name = process.env.PAYMENT_PROVIDER?.trim() || DEMO_PROVIDER;
  const mode = cardPaymentMode();
  const ready = mode === "test" || mode === "live";
  const display =
    name === "akbank" ? "Akbank Sanal POS" : name === "iyzico" ? "iyzico" : name === "stub" ? "Test (stub)" : name === DEMO_PROVIDER ? "Demo banka" : name;

  if (mode === "off") {
    return {
      name: display,
      mode,
      ready,
      note: `Kartla ödeme kapalı: ödeme sağlayıcısı ayarı geçersiz (PAYMENT_PROVIDER="${name}"). Müşteri kart seçeneğini “yakında” görür.`,
    };
  }
  if (mode === "demo") {
    return {
      name: display,
      mode,
      ready,
      note:
        (name === "akbank" ? "Akbank bilgileri (Güvenli İş Yeri No, Terminal Safe ID, gizli anahtar) henüz girilmemiş. " : "Sanal POS bağlı değil. ") +
        "Yönetici girişi açıkken kartla ödemeyi banka sayfasının demo kopyasıyla baştan sona deneyebilirsiniz: kart bilgileri, " +
        "6 haneli doğrulama kodu, sipariş “Ödendi”. Gerçek para çekilmez. Müşteriler kartı “yakında” görür.",
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
  demo: "Demo banka (gerçek para yok)",
  iyzico: "iyzico",
  stub: "Test (stub — gerçek para yok)",
  havale: "Havale/EFT",
  kapida: "Kapıda ödeme",
};

/** Bu sağlayıcıyla alınan "ödeme" gerçek para mı (test ortamı/stub/demo değil) */
export function isTestProvider(provider: string): boolean {
  return provider === "stub" || provider === "akbank-test" || provider === DEMO_PROVIDER;
}
