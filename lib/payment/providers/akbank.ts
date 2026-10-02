/**
 * Akbank Sanal POS — Ortak Ödeme Sayfası (3D Pay Hosting, "payhosting").
 *
 * Müşteri Akbank'ın güvenli ödeme sayfasına bir form gönderimiyle (POST) geçer: kart bilgisi orada girilir,
 * 3D Secure doğrulaması orada yapılır; kart bilgisi sitemize HİÇ gelmez (imzaya da girmez). Ödeme sonucu
 * tarayıcıyla okUrl/failUrl adresimize POST edilir — bu yalnız tetikleyicidir: sonuç Akbank'tan sunucudan
 * "sipariş sorgu" (txnCode 1010) ile alınır ve lib/payment/verify.ts'deki denetimlerden geçer.
 *
 * Kimlik eşlemesi: Akbank orderId = ödeme denemesi id'si (her deneme ayrı numara; sipariş id'si bizde).
 *
 * KAYNAK ve DOĞRULAMA DURUMU: Akbank'ın teknik dokümanı herkese açık değil (başvuru sonrası verilir). Alan adları,
 * imza kuralı (HMAC-SHA512, base64), adresler, işlem kodları ve yanıt kodları açık kaynak mewebstudio/pos (MIT)
 * kütüphanesinin Akbank uygulamasından alındı: src/Gateway/AkbankPos.php, src/Crypt/AkbankPosCrypt.php,
 * src/DataMapper/Request/Mapper/AkbankPosRequestDataMapper.php, …/Response/Mapper/AkbankPosResponseDataMapper.php,
 * config/pos_test.php, config/pos_production.php. Akbank TEST ortamında baştan sona denenmeden canlıya
 * alınmamalı (docs/AKBANK_TEST.md). Taksit: şimdilik yalnız tek çekim (installCount 1).
 */

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentProvider,
  RetrievePaymentInput,
  RetrievePaymentResult,
} from "../types";

export type AkbankEnvironment = "test" | "prod";

export interface AkbankConfig {
  merchantSafeId: string;
  terminalSafeId: string;
  secretKey: string;
  environment: AkbankEnvironment;
  /** …/api/v1/payment/virtualpos (sorgu, iade) */
  apiUrl: string;
  /** …/payhosting (ortak ödeme sayfası) */
  gatewayUrl: string;
}

export const AKBANK_URLS: Record<AkbankEnvironment, { api: string; gateway: string }> = {
  test: {
    api: "https://apipre.akbank.com/api/v1/payment/virtualpos",
    gateway: "https://virtualpospaymentgatewaypre.akbank.com/payhosting",
  },
  prod: {
    api: "https://api.akbank.com/api/v1/payment/virtualpos",
    gateway: "https://virtualpospaymentgateway.akbank.com/payhosting",
  },
};

/** Başarılı işlem kodu */
export const AKBANK_SUCCESS = "VPS-0000";
const TXN_SALE_3D = "3000";
const TXN_SALE = "1000";
const TXN_ORDER_HISTORY = "1010";
const CURRENCY_TRY = "949";

const isPlaceholder = (v: string | undefined) => !v || /todo|xxx|your_|changeme/i.test(v);

export function akbankConfigFromEnv(env: Record<string, string | undefined> = process.env): AkbankConfig | null {
  const merchantSafeId = env.AKBANK_MERCHANT_SAFE_ID?.trim();
  const terminalSafeId = env.AKBANK_TERMINAL_SAFE_ID?.trim();
  const secretKey = env.AKBANK_SECRET_KEY?.trim();
  if (isPlaceholder(merchantSafeId) || isPlaceholder(terminalSafeId) || isPlaceholder(secretKey)) return null;
  const environment: AkbankEnvironment = env.AKBANK_ENV?.trim().toLowerCase() === "prod" ? "prod" : "test";
  const urls = AKBANK_URLS[environment];
  return {
    merchantSafeId: merchantSafeId!,
    terminalSafeId: terminalSafeId!,
    secretKey: secretKey!,
    environment,
    // Yalnız yerel denemede (sahte Akbank sunucusu) değiştirilebilir; canlıda açılış denetimi reddeder
    apiUrl: (env.AKBANK_API_URL?.trim() || urls.api).replace(/\/+$/, ""),
    gatewayUrl: env.AKBANK_GATEWAY_URL?.trim() || urls.gateway,
  };
}

// ── Yardımcılar ──────────────────────────────────────────────────────────

/** HMAC-SHA512, base64 (Akbank imzası) */
export function akbankHash(data: string, secretKey: string): string {
  return createHmac("sha512", secretKey).update(data, "utf8").digest("base64");
}

/** 128 karakter büyük harf onaltılık rastgele dizi */
export function akbankRandomNumber(): string {
  return randomBytes(64).toString("hex").toUpperCase();
}

/** İstanbul saatiyle "YYYY-MM-DDTHH:mm:ss.000" */
export function akbankDateTime(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}.000`;
}

/** Kuruş → "1234.50" (her zaman iki ondalık; tam sayı aritmetiği) */
export function akbankAmount(kurus: number): string {
  if (!Number.isSafeInteger(kurus) || kurus < 0) throw new Error(`Geçersiz tutar: ${kurus}`);
  const rest = kurus % 100;
  return `${(kurus - rest) / 100}.${String(rest).padStart(2, "0")}`;
}

/**
 * Ortak ödeme sayfası formunun imzası. Alan sırası kütüphanedekiyle aynı; kart alanları bu modelde boştur.
 */
export function akbank3DFormHash(inputs: Record<string, string>, secretKey: string): string {
  const fields = [
    "paymentModel",
    "txnCode",
    "merchantSafeId",
    "terminalSafeId",
    "orderId",
    "lang",
    "amount",
    "ccbRewardAmount",
    "pcbRewardAmount",
    "xcbRewardAmount",
    "currencyCode",
    "installCount",
    "okUrl",
    "failUrl",
    "emailAddress",
    "subMerchantId",
    "creditCard",
    "expiredDate",
    "cvv",
    "randomNumber",
    "requestDateTime",
    "b2bIdentityNumber",
  ];
  return akbankHash(fields.map((f) => inputs[f] ?? "").join(""), secretKey);
}

/**
 * Dönüş (okUrl/failUrl) imzası: `hashParams` alanında "+" ile ayrılmış alan adlarının değerleri yan yana
 * eklenir, gizli anahtarla HMAC-SHA512 (base64) alınır ve `hash` ile karşılaştırılır.
 */
export function verifyAkbankReturnHash(fields: Record<string, string>, secretKey: string): boolean {
  const params = fields.hashParams;
  const hash = fields.hash;
  if (!params || !hash) return false;
  const data = params
    .split("+")
    .filter(Boolean)
    .map((name) => fields[name] ?? "")
    .join("");
  const expected = Buffer.from(akbankHash(data, secretKey));
  const actual = Buffer.from(hash);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Kayda yazılacak süzülmüş alanlar — kart verisi (maskelenmiş numara dahil) yazılmaz */
const SAFE_FIELDS = [
  "responseCode",
  "responseMessage",
  "hostResponseCode",
  "hostMessage",
  "txnCode",
  "txnStatus",
  "amount",
  "currencyCode",
  "installCount",
  "rrn",
  "authCode",
  "orderId",
  "orgOrderId",
  "txnDateTime",
  "batchNumber",
] as const;

export function sanitizeAkbank(src: Record<string, unknown> | undefined | null): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!src) return out;
  for (const key of SAFE_FIELDS) {
    const v = src[key];
    if (v === undefined || v === null) continue;
    if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
      out[key] = typeof v === "string" ? v.slice(0, 300) : v;
    }
  }
  return out;
}

const asText = (v: unknown): string | undefined =>
  typeof v === "string" ? v : typeof v === "number" && Number.isFinite(v) ? String(v) : undefined;

/** Akbank'ın tutarını ("123.45" ya da 123.45) iki ondalıklı metne çevirir; okunamazsa undefined */
function amountText(v: unknown): string | undefined {
  const t = asText(v)?.trim();
  if (!t || !/^\d+(\.\d+)?$/.test(t)) return undefined;
  return t;
}

type AkbankTxn = Record<string, unknown>;

// ── Sağlayıcı ────────────────────────────────────────────────────────────

export class AkbankProvider implements PaymentProvider {
  /**
   * Deneme kayıtlarında test ve canlı ortam ayrı adla tutulur: test ortamında açılmış deneme canlı anahtarla
   * sorgulanmaz (verify.ts sağlayıcı adı eşleşmezse doğrulamaz) ve admin "TEST — gerçek para yok" görür.
   */
  readonly name: string;
  readonly callbackPath = "/api/payment/akbank/return";

  constructor(
    private readonly config: AkbankConfig,
    private readonly fetchImpl: typeof fetch = (...args) => fetch(...args)
  ) {
    this.name = config.environment === "prod" ? "akbank" : "akbank-test";
  }

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    const fields: Record<string, string> = {
      paymentModel: "3D_PAY_HOSTING",
      txnCode: TXN_SALE_3D,
      merchantSafeId: this.config.merchantSafeId,
      terminalSafeId: this.config.terminalSafeId,
      orderId: input.attemptId,
      lang: "TR",
      amount: akbankAmount(input.amountKurus),
      currencyCode: CURRENCY_TRY,
      installCount: "1",
      okUrl: input.callbackUrl,
      failUrl: input.callbackUrl,
      randomNumber: akbankRandomNumber(),
      requestDateTime: akbankDateTime(),
    };
    fields.hash = akbank3DFormHash(fields, this.config.secretKey);
    return {
      success: true,
      providerRef: input.attemptId,
      form: { action: this.config.gatewayUrl, fields },
    };
  }

  /** Sunucudan sipariş sorgusu (txnCode 1010). İstek gövdesi imzalanır: auth-hash başlığı. */
  async retrievePayment(input: RetrievePaymentInput): Promise<RetrievePaymentResult> {
    const akbankOrderId = input.token;
    const body = JSON.stringify({
      version: "1.00",
      txnCode: TXN_ORDER_HISTORY,
      requestDateTime: akbankDateTime(),
      randomNumber: akbankRandomNumber(),
      terminal: { merchantSafeId: this.config.merchantSafeId, terminalSafeId: this.config.terminalSafeId },
      order: { orderId: akbankOrderId },
    });

    let data: Record<string, unknown>;
    try {
      const res = await this.fetchImpl(`${this.config.apiUrl}/transaction/process`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          "auth-hash": akbankHash(body, this.config.secretKey),
        },
        body,
        signal: AbortSignal.timeout(20_000),
      });
      const parsed = (await res.json().catch(() => null)) as Record<string, unknown> | null;
      if (!parsed || typeof parsed !== "object") return { ok: false, error: `Akbank yanıtı okunamadı (HTTP ${res.status})` };
      if (res.status >= 400) {
        return {
          ok: true,
          apiStatus: "failure",
          errorCode: asText(parsed.code) ?? `HTTP ${res.status}`,
          errorMessage: asText(parsed.message) ?? asText(parsed.responseMessage),
          raw: sanitizeAkbank(parsed),
        };
      }
      data = parsed;
    } catch (err) {
      return { ok: false, error: `Akbank sorgusu başarısız: ${(err as Error).message}` };
    }

    const responseCode = asText(data.responseCode);
    if (responseCode !== AKBANK_SUCCESS) {
      return {
        ok: true,
        apiStatus: "failure",
        errorCode: responseCode ?? "?",
        errorMessage: asText(data.responseMessage),
        raw: sanitizeAkbank(data),
      };
    }

    const list = Array.isArray(data.txnDetailList) ? (data.txnDetailList as AkbankTxn[]) : [];
    const sales = list.filter((t) => [TXN_SALE_3D, TXN_SALE].includes(asText(t.txnCode) ?? ""));
    const approved = sales.find((t) => asText(t.responseCode) === AKBANK_SUCCESS);
    const tx = approved ?? sales[sales.length - 1];
    const returnedOrderId = asText(tx?.orderId) ?? asText(tx?.orgOrderId);

    let paymentStatus: string;
    let errorMessage: string | undefined;
    if (approved) {
      const txnStatus = asText(approved.txnStatus);
      if (txnStatus === "V" || txnStatus === "R") {
        paymentStatus = "FAILURE";
        errorMessage = txnStatus === "V" ? "işlem iptal edilmiş" : "işlem iade edilmiş";
      } else {
        paymentStatus = "SUCCESS";
      }
    } else if (sales.length > 0) {
      paymentStatus = "FAILURE";
      errorMessage = asText(tx?.hostMessage) ?? asText(tx?.responseMessage);
    } else {
      paymentStatus = "INIT"; // henüz satış işlemi yok (müşteri ödeme sayfasında ya da vazgeçti)
    }

    const amount = amountText(tx?.amount);
    const currencyCode = asText(tx?.currencyCode);
    return {
      ok: true,
      apiStatus: "success",
      paymentStatus,
      errorCode: paymentStatus === "FAILURE" ? asText(tx?.responseCode) : undefined,
      errorMessage,
      // Kayıttaki banka işlem no'su "<Akbank sipariş no>:<RRN>": RRN tek başına benzersiz olmayabilir (test ortamı
      // sabit/tekrarlanan değer dönebilir; yıllar içinde tekrar edebilir). payment_attempts'taki (sağlayıcı, işlem no)
      // tekilliği bir çakışmada doğrulanmış ödemenin işlenmesini engellerdi. Akbank sipariş no'su = bizim deneme
      // no'muz (benzersiz); sorgu zaten bu no ile yapılır.
      paymentId: approved
        ? `${returnedOrderId ?? akbankOrderId}:${asText(approved.rrn) ?? asText(approved.authCode) ?? "onay"}`
        : undefined,
      // Sepet no denetimi: Akbank sipariş no'su denemeyle eşleşiyorsa deneme bizim siparişimize aittir
      basketId: returnedOrderId === akbankOrderId ? input.orderId : returnedOrderId ? `akbank:${returnedOrderId}` : undefined,
      conversationId: returnedOrderId,
      token: returnedOrderId,
      currency: currencyCode === CURRENCY_TRY ? "TRY" : currencyCode,
      price: amount,
      paidPrice: amount,
      installment: Number(asText(tx?.installCount)) || 1,
      raw: { ...sanitizeAkbank(data), ...(tx ? { txn: sanitizeAkbank(tx) } : {}), saleCount: sales.length },
    };
  }
}
