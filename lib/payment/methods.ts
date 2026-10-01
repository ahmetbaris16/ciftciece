/**
 * Ödeme yöntemleri — ayarlar ve kullanılabilirlik (saf; sunucu ve istemci ortak).
 *
 *  - CARD             Kredi/banka kartı (Akbank Sanal POS ortak ödeme sayfası, 3D Secure). Para otomatik gelir;
 *                     satıcının yapacağı iş yok. Sanal POS bağlanmadan "yakında" olarak görünür, seçilemez
 *                     (lib/payment/provider.ts: demo / test / canlı).
 *  - BANK_TRANSFER    Havale/EFT. Sipariş verilir, müşteriye IBAN + açıklama (sipariş no) gösterilir; satıcı
 *                     parayı görünce admin'de tek tıkla "ödeme alındı" der. Süresinde ödenmezse sipariş
 *                     kendiliğinden iptal olur, stok geri döner (satıcı takip etmek zorunda kalmaz).
 *  - CASH_ON_DELIVERY Kapıda ödeme. Varsayılan KAPALI: kargo firmasıyla tahsilatlı gönderi anlaşması ve
 *                     teslim alınmayan paket riski satıcıdadır; isteyen admin'den açar, hizmet bedeli ve
 *                     üst tutar sınırı koyabilir.
 *
 * Ayarlar admin → Ayarlar → Ödeme'den girilir (site_settings "payment"). IBAN, banka adı gibi bilgiler
 * uydurulmaz: girilmeden havale seçeneği müşteriye gösterilmez.
 */

export const PAYMENT_SETTING_KEY = "payment";

export const PAYMENT_METHOD_IDS = ["CARD", "BANK_TRANSFER", "CASH_ON_DELIVERY"] as const;
export type PaymentMethodId = (typeof PAYMENT_METHOD_IDS)[number];

export const INSTALLMENT_CHOICES = [1, 2, 3, 6, 9, 12] as const;

export interface PaymentSettings {
  card: {
    enabled: boolean;
    /** Kartta sunulacak en yüksek taksit sayısı (1 = yalnız tek çekim) */
    maxInstallment: number;
  };
  bankTransfer: {
    enabled: boolean;
    bankName: string;
    accountHolder: string;
    /** Boşluksuz, büyük harf: TR + 24 hane */
    iban: string;
    /** Sipariş bu kadar saat içinde ödenmezse otomatik iptal (stok iade) */
    paymentWindowHours: number;
  };
  cashOnDelivery: {
    enabled: boolean;
    /** Kapıda ödeme hizmet bedeli (kuruş); 0 = ücretsiz */
    feeKurus: number;
    /** Bu tutarın üstündeki siparişlerde kapıda ödeme sunulmaz; null = sınır yok */
    maxOrderKurus: number | null;
  };
}

export const DEFAULT_PAYMENT_SETTINGS: PaymentSettings = {
  card: { enabled: true, maxInstallment: 6 },
  bankTransfer: { enabled: true, bankName: "", accountHolder: "", iban: "", paymentWindowHours: 48 },
  cashOnDelivery: { enabled: false, feeKurus: 0, maxOrderKurus: null },
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethodId, string> = {
  CARD: "Kredi / Banka Kartı",
  BANK_TRANSFER: "Havale / EFT",
  CASH_ON_DELIVERY: "Kapıda Ödeme",
};

// ── IBAN ────────────────────────────────────────────────────

export function normalizeIban(value: string): string {
  return value.replace(/\s+/g, "").toUpperCase();
}

/** Türkiye IBAN'ı: TR + 24 hane ve ISO 13616 mod-97 kontrolü */
export function isValidTrIban(value: string): boolean {
  const iban = normalizeIban(value);
  if (!/^TR\d{24}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  const digits = rearranged.replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let rem = 0;
  for (const d of digits) rem = (rem * 10 + Number(d)) % 97;
  return rem === 1;
}

/** "TR330006100519786457841326" → "TR33 0006 1005 1978 6457 8413 26" */
export function formatIban(value: string): string {
  return normalizeIban(value).replace(/(.{4})/g, "$1 ").trim();
}

// ── Kullanılabilirlik ───────────────────────────────────────

export interface PaymentOption {
  id: PaymentMethodId;
  title: string;
  description: string;
  /** Seçilebilir mi (kart: sanal POS bağlanmadan "yakında" görünür ama seçilemez) */
  available: boolean;
  /** Bankanın test ortamı: gerçek para çekilmez (yalnız yönetici görür) */
  testMode?: boolean;
  /** Bu yöntemle toplama eklenen ücret (kuruş) */
  feeKurus: number;
  /** Kapıda ödeme üst sınırı; istemci toplam değişince yeniden kontrol eder */
  maxOrderKurus: number | null;
}

/** Hesap bilgileri eksiksiz mi (havale bekleyen eski siparişlerde yöntem kapatılmış olsa da gösterilir) */
export function hasBankDetails(b: PaymentSettings["bankTransfer"]): boolean {
  return isValidTrIban(b.iban) && b.accountHolder.trim().length > 1 && b.bankName.trim().length > 1;
}

/** Yeni siparişte havale sunulabilir mi */
export function isBankTransferReady(b: PaymentSettings["bankTransfer"]): boolean {
  return b.enabled && hasBankDetails(b);
}

/**
 * Kartın bu ziyaretçi için durumu: "ready" (canlı), "test" (test ortamı — yalnız yönetici), "unavailable"
 * (sanal POS bağlı değil ya da test ortamında müşteri). Sunucu hesaplar (lib/payment/provider.ts).
 */
export type CardAvailability = "ready" | "test" | "unavailable";

/**
 * Müşteriye gösterilecek yöntemler. Sıra: kart, havale, kapıda ödeme. Seçilebilenler `available: true`;
 * kart sanal POS bağlanana kadar "yakında" olarak listelenir (seçilemez).
 */
export function availablePaymentOptions(s: PaymentSettings, card: CardAvailability | boolean): PaymentOption[] {
  const cardState: CardAvailability = card === true ? "ready" : card === false ? "unavailable" : card;
  const out: PaymentOption[] = [];
  if (s.card.enabled) {
    out.push(
      cardState === "unavailable"
        ? {
            id: "CARD",
            title: PAYMENT_METHOD_LABELS.CARD,
            description: "Kartla ödeme çok yakında. Şimdilik diğer yöntemlerle ödeyebilirsiniz.",
            available: false,
            feeKurus: 0,
            maxOrderKurus: null,
          }
        : {
            id: "CARD",
            title: PAYMENT_METHOD_LABELS.CARD,
            description:
              "Tek çekim. Kart bilgileriniz bankanın 3D Secure güvenli ödeme sayfasında girilir; sitemize gelmez, saklanmaz.",
            available: true,
            ...(cardState === "test" ? { testMode: true } : {}),
            feeKurus: 0,
            maxOrderKurus: null,
          }
    );
  }
  if (isBankTransferReady(s.bankTransfer)) {
    out.push({
      id: "BANK_TRANSFER",
      title: PAYMENT_METHOD_LABELS.BANK_TRANSFER,
      description: `Siparişten sonra IBAN bilgimiz gösterilir. Açıklamaya sipariş numaranızı yazmanız yeterli; ödeme ${s.bankTransfer.paymentWindowHours} saat içinde yapılmalıdır.`,
      available: true,
      feeKurus: 0,
      maxOrderKurus: null,
    });
  }
  if (s.cashOnDelivery.enabled) {
    out.push({
      id: "CASH_ON_DELIVERY",
      title: PAYMENT_METHOD_LABELS.CASH_ON_DELIVERY,
      description:
        s.cashOnDelivery.feeKurus > 0
          ? "Ödemeyi teslimatta kargo görevlisine yaparsınız. Kapıda ödeme hizmet bedeli toplama eklenir."
          : "Ödemeyi teslimatta kargo görevlisine yaparsınız.",
      available: true,
      feeKurus: s.cashOnDelivery.feeKurus,
      maxOrderKurus: s.cashOnDelivery.maxOrderKurus,
    });
  }
  return out;
}

/** Seçilen yöntem bu tutar için kullanılabilir mi? (tutar: ürünler + kargo, yöntem ücreti hariç) */
export function isOptionAllowed(option: PaymentOption, amountKurus: number): boolean {
  return option.available && (option.maxOrderKurus === null || amountKurus <= option.maxOrderKurus);
}

// ── Ayrıştırma ──────────────────────────────────────────────

const int = (v: unknown, min: number, max: number, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
};
const str = (v: unknown, max = 120) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export function parsePaymentSettings(raw: string | null | undefined): PaymentSettings {
  if (!raw) return DEFAULT_PAYMENT_SETTINGS;
  try {
    const v = JSON.parse(raw) as Partial<Record<keyof PaymentSettings, Record<string, unknown>>>;
    const d = DEFAULT_PAYMENT_SETTINGS;
    const maxInst = int(v.card?.maxInstallment, 1, 12, d.card.maxInstallment);
    const maxOrder = v.cashOnDelivery?.maxOrderKurus;
    return {
      card: {
        enabled: v.card?.enabled !== false,
        maxInstallment: (INSTALLMENT_CHOICES as readonly number[]).includes(maxInst) ? maxInst : 1,
      },
      bankTransfer: {
        enabled: v.bankTransfer?.enabled !== false,
        bankName: str(v.bankTransfer?.bankName),
        accountHolder: str(v.bankTransfer?.accountHolder),
        iban: normalizeIban(str(v.bankTransfer?.iban, 40)),
        paymentWindowHours: int(v.bankTransfer?.paymentWindowHours, 6, 168, d.bankTransfer.paymentWindowHours),
      },
      cashOnDelivery: {
        enabled: v.cashOnDelivery?.enabled === true,
        feeKurus: int(v.cashOnDelivery?.feeKurus, 0, 100_000_00, 0),
        maxOrderKurus: maxOrder === null || maxOrder === undefined ? null : int(maxOrder, 0, 1_000_000_00, 0) || null,
      },
    };
  } catch (err) {
    console.error("[payment] Ödeme ayarı JSON'u bozuk, varsayılan kullanılıyor:", err);
    return DEFAULT_PAYMENT_SETTINGS;
  }
}
