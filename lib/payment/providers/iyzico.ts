/**
 * iyzico — Ortak Ödeme Formu (Checkout Form) entegrasyonu.
 *
 * Müşteri iyzico'nun güvenli ödeme sayfasına yönlendirilir: kart bilgisi sitemize hiç gelmez,
 * taksit seçenekleri (kartın bankasına göre) ve iyzico ile kayıtlı kart/bakiye ile ödeme orada sunulur.
 * Satıcı tarafında ek iş yok; tahsilat iyzico hesabına düşer. Taksit vade farkının kimde kalacağı
 * iyzico panelinden ayarlanır.
 *
 * Akış: initialize → paymentPageUrl'e yönlendir → iyzico callbackUrl'e `token` POST eder →
 * sonuç token'la SUNUCUDAN sorgulanır (retrieve). Callback gövdesine ve webhook içeriğine güvenilmez;
 * karar lib/payment/verify.ts'de verilir.
 *
 * Kimlik eşlemesi: basketId = sipariş id, conversationId = ödeme denemesi id (her token ayrı deneme).
 *
 * Kimlik doğrulama: IYZWSv2 (HMAC-SHA256: randomKey + istek yolu + JSON gövde).
 * Kaynak: docs.iyzico.com (CF-Initialize, CF-Retrieve). Sandbox anahtarlarıyla uçtan uca denenmeden
 * canlıya alınmamalı (IYZICO_BASE_URL=https://sandbox-api.iyzipay.com; docs/IYZICO_SANDBOX_TEST.md).
 */

import { createHmac, randomBytes } from "node:crypto";
import { kurusToDecimalString } from "../money";
import { sanitizeProviderResponse } from "../sanitize";
import type {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentProvider,
  RetrievePaymentInput,
  RetrievePaymentResult,
} from "../types";

export interface IyzicoConfig {
  apiKey: string;
  secretKey: string;
  baseUrl: string;
}

const isPlaceholder = (v: string | undefined) => !v || /todo|xxx|your|örnek|ornek/i.test(v);

export function iyzicoConfigFromEnv(): IyzicoConfig | null {
  const apiKey = process.env.IYZICO_API_KEY?.trim();
  const secretKey = process.env.IYZICO_SECRET_KEY?.trim();
  if (isPlaceholder(apiKey) || isPlaceholder(secretKey)) return null;
  return {
    apiKey: apiKey as string,
    secretKey: secretKey as string,
    baseUrl: (process.env.IYZICO_BASE_URL?.trim() || "https://sandbox-api.iyzipay.com").replace(/\/+$/, ""),
  };
}

/** Kuruş → iyzico fiyat metni ("1234.50"); tam sayı aritmetiği */
export const toIyzicoPrice = kurusToDecimalString;

export const INITIALIZE_PATH = "/payment/iyzipos/checkoutform/initialize/auth/ecom";
export const RETRIEVE_PATH = "/payment/iyzipos/checkoutform/auth/ecom/detail";
const INSTALLMENTS = [1, 2, 3, 6, 9, 12];

/** IYZWSv2 yetkilendirme başlıkları */
export function iyzicoAuthHeaders(config: IyzicoConfig, path: string, body: string, randomKey: string) {
  const signature = createHmac("sha256", config.secretKey).update(randomKey + path + body).digest("hex");
  const auth = Buffer.from(`apiKey:${config.apiKey}&randomKey:${randomKey}&signature:${signature}`).toString("base64");
  return { Authorization: `IYZWSv2 ${auth}`, "x-iyzi-rnd": randomKey };
}

type IyzicoResponse = Record<string, unknown> & {
  status?: string;
  errorCode?: string;
  errorMessage?: string;
  token?: string;
  tokenExpireTime?: number;
  paymentPageUrl?: string;
  checkoutFormContent?: string;
};

const asString = (v: unknown): string | undefined =>
  typeof v === "string" ? v : typeof v === "number" && Number.isFinite(v) ? String(v) : undefined;
const asInt = (v: unknown): number | undefined => {
  const n = typeof v === "string" && v.trim() !== "" ? Number(v) : v;
  return typeof n === "number" && Number.isInteger(n) ? n : undefined;
};

export class IyzicoProvider implements PaymentProvider {
  readonly name = "iyzico";

  constructor(
    private readonly config: IyzicoConfig,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  private async call(path: string, payload: Record<string, unknown>): Promise<IyzicoResponse> {
    const body = JSON.stringify(payload);
    const randomKey = `${Date.now()}${randomBytes(6).toString("hex")}`;
    const res = await this.fetchImpl(this.config.baseUrl + path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...iyzicoAuthHeaders(this.config, path, body, randomKey),
      },
      body,
      signal: AbortSignal.timeout(20_000),
    });
    const data = (await res.json().catch(() => null)) as IyzicoResponse | null;
    if (!data || typeof data !== "object") throw new Error(`iyzico yanıtı okunamadı (HTTP ${res.status})`);
    return data;
  }

  async createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
    // Sepet kalemleri: iyzico'da adet alanı yok → kalem fiyatı = birim × adet. 0 TL kalem gönderilmez.
    const basketItems = input.items
      .filter((i) => i.priceKurus * i.quantity > 0)
      .map((i, idx) => ({
        id: `K${idx + 1}`,
        name: i.name.slice(0, 120),
        category1: "Gıda",
        itemType: "PHYSICAL",
        price: toIyzicoPrice(i.priceKurus * i.quantity),
      }));
    const basketTotal = input.items.reduce((sum, i) => sum + i.priceKurus * i.quantity, 0);
    if (basketTotal !== input.amountKurus) {
      return { success: false, error: `Sepet toplamı (${basketTotal}) sipariş tutarıyla (${input.amountKurus}) uyuşmuyor` };
    }

    const name = input.buyer.firstName.trim() || "Müşteri";
    const surname = input.buyer.lastName.trim() || name;
    const address = {
      contactName: `${name} ${surname}`.trim(),
      city: input.buyer.city || "Türkiye",
      country: "Turkey",
      address: input.buyer.address || "-",
    };
    const max = Math.max(1, input.maxInstallment ?? 1);

    try {
      const res = await this.call(INITIALIZE_PATH, {
        locale: "tr",
        conversationId: input.attemptId,
        price: toIyzicoPrice(input.amountKurus),
        paidPrice: toIyzicoPrice(input.amountKurus),
        currency: input.currency,
        basketId: input.orderId,
        paymentGroup: "PRODUCT",
        callbackUrl: input.callbackUrl,
        enabledInstallments: INSTALLMENTS.filter((n) => n <= max),
        buyer: {
          id: input.buyerId ?? `misafir-${input.orderReference}`,
          name,
          surname,
          gsmNumber: input.buyer.phone,
          email: input.buyer.email,
          // iyzico alanı zorunlu tutar; TC kimlik no toplamıyoruz. iyzico'nun kimlik no toplamayan
          // üye işyerleri için kabul ettiği değer gönderilir (fatura için gerekirse ayrıca toplanmalı).
          identityNumber: "11111111111",
          registrationAddress: address.address,
          city: address.city,
          country: "Turkey",
          ip: input.buyerIp || "127.0.0.1",
        },
        shippingAddress: address,
        billingAddress: address,
        basketItems,
      });
      if (res.status !== "success" || typeof res.token !== "string" || typeof res.paymentPageUrl !== "string") {
        return { success: false, error: `iyzico: ${res.errorCode ?? "?"} ${res.errorMessage ?? "başlatılamadı"}` };
      }
      // tokenExpireTime: saniye (iyzico dokümanı: 1800 sn = 30 dk)
      const ttl = asInt(res.tokenExpireTime);
      return {
        success: true,
        providerRef: res.token,
        tokenExpiresAt: ttl && ttl > 0 ? new Date(Date.now() + ttl * 1000) : undefined,
        redirectUrl: res.paymentPageUrl,
      };
    } catch (err) {
      return { success: false, error: `iyzico isteği başarısız: ${(err as Error).message}` };
    }
  }

  async retrievePayment(input: RetrievePaymentInput): Promise<RetrievePaymentResult> {
    if (!input.token) return { ok: false, error: "token yok" };
    let res: IyzicoResponse;
    try {
      res = await this.call(RETRIEVE_PATH, {
        locale: "tr",
        ...(input.conversationId ? { conversationId: input.conversationId } : {}),
        token: input.token,
      });
    } catch (err) {
      return { ok: false, error: `iyzico sorgusu başarısız: ${(err as Error).message}` };
    }
    return {
      ok: true,
      apiStatus: asString(res.status) ?? "",
      errorCode: asString(res.errorCode),
      errorMessage: asString(res.errorMessage),
      paymentStatus: asString(res.paymentStatus),
      paymentId: asString(res.paymentId),
      basketId: asString(res.basketId),
      conversationId: asString(res.conversationId),
      token: asString(res.token),
      currency: asString(res.currency),
      price: asString(res.price),
      paidPrice: asString(res.paidPrice),
      installment: asInt(res.installment),
      fraudStatus: asInt(res.fraudStatus),
      raw: sanitizeProviderResponse(res),
    };
  }
}
