/**
 * iyzico — Ortak Ödeme Formu (Checkout Form) entegrasyonu.
 *
 * Müşteri iyzico'nun güvenli ödeme sayfasına yönlendirilir: kart bilgisi sitemize hiç gelmez,
 * taksit seçenekleri (kartın bankasına göre) ve iyzico ile kayıtlı kart/bakiye ile ödeme orada sunulur.
 * Satıcı tarafında ek iş yok; tahsilat iyzico hesabına düşer. Taksit vade farkının kimde kalacağı
 * iyzico panelinden ayarlanır.
 *
 * Akış: initialize → paymentPageUrl'e yönlendir → iyzico callbackUrl'e `token` POST eder →
 * /api/payment/verify bu token'la sonucu SUNUCUDAN sorgular (retrieve). Callback gövdesine güvenilmez.
 *
 * Kimlik doğrulama: IYZWSv2 (HMAC-SHA256: randomKey + istek yolu + JSON gövde).
 * NOT: Bu dosya iyzico dokümantasyonuna göre yazıldı; sandbox anahtarlarıyla uçtan uca denenmeden
 * canlıya alınmamalı (IYZICO_BASE_URL=https://sandbox-api.iyzipay.com ile test edin).
 */

import { createHmac, randomBytes } from "node:crypto";
import type {
  CreatePaymentInput,
  CreatePaymentResult,
  PaymentProvider,
  VerifyPaymentInput,
  VerifyPaymentResult,
  WebhookEvent,
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

/** Kuruş → iyzico fiyat metni ("1234.50") */
export const toIyzicoPrice = (kurus: number) => (kurus / 100).toFixed(2);
const fromIyzicoPrice = (v: unknown) => Math.round(Number(v) * 100);

const INITIALIZE_PATH = "/payment/iyzipos/checkoutform/initialize/auth/ecom";
const RETRIEVE_PATH = "/payment/iyzipos/checkoutform/auth/ecom/detail";
const INSTALLMENTS = [1, 2, 3, 6, 9, 12];

/** IYZWSv2 yetkilendirme başlıkları */
export function iyzicoAuthHeaders(config: IyzicoConfig, path: string, body: string, randomKey: string) {
  const signature = createHmac("sha256", config.secretKey).update(randomKey + path + body).digest("hex");
  const auth = Buffer.from(`apiKey:${config.apiKey}&randomKey:${randomKey}&signature:${signature}`).toString("base64");
  return { Authorization: `IYZWSv2 ${auth}`, "x-iyzi-rnd": randomKey };
}

interface IyzicoResponse {
  status?: "success" | "failure";
  errorCode?: string;
  errorMessage?: string;
  token?: string;
  paymentPageUrl?: string;
  checkoutFormContent?: string;
  paymentStatus?: string;
  paymentId?: string;
  price?: number | string;
  paidPrice?: number | string;
  basketId?: string;
  conversationId?: string;
  fraudStatus?: number;
}

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
    if (!data) throw new Error(`iyzico yanıtı okunamadı (HTTP ${res.status})`);
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
        conversationId: input.orderId,
        price: toIyzicoPrice(input.amountKurus),
        paidPrice: toIyzicoPrice(input.amountKurus),
        currency: "TRY",
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
      if (res.status !== "success" || !res.token || !res.paymentPageUrl) {
        return { success: false, error: `iyzico: ${res.errorCode ?? "?"} ${res.errorMessage ?? "başlatılamadı"}` };
      }
      return { success: true, providerRef: res.token, redirectUrl: res.paymentPageUrl };
    } catch (err) {
      return { success: false, error: `iyzico isteği başarısız: ${(err as Error).message}` };
    }
  }

  async verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult> {
    if (!input.token) return { success: false, error: "token yok" };
    try {
      const res = await this.call(RETRIEVE_PATH, {
        locale: "tr",
        ...(input.conversationId ? { conversationId: input.conversationId } : {}),
        token: input.token,
      });
      if (res.status !== "success") {
        return { success: false, error: `iyzico: ${res.errorCode ?? "?"} ${res.errorMessage ?? "sorgu başarısız"}` };
      }
      if (res.paymentStatus !== "SUCCESS") {
        return { success: false, orderId: res.basketId, error: `ödeme durumu: ${res.paymentStatus ?? "?"}` };
      }
      if (res.fraudStatus === -1) {
        return { success: false, orderId: res.basketId, error: "iyzico dolandırıcılık kontrolü ödemeyi reddetti" };
      }
      return {
        success: true,
        // price = sepet tutarı; paidPrice taksit vade farkını içerebilir → sipariş tutarıyla price karşılaştırılır
        amountKurus: fromIyzicoPrice(res.price),
        providerRef: res.paymentId,
        orderId: res.basketId,
        note: res.fraudStatus === 0 ? "iyzico ödemeyi incelemeye aldı (fraudStatus 0) — kargolamadan önce iyzico panelinden kontrol edin." : undefined,
      };
    } catch (err) {
      return { success: false, error: `iyzico sorgusu başarısız: ${(err as Error).message}` };
    }
  }

  async parseWebhook(): Promise<WebhookEvent | null> {
    // Ödeme sonucu callback + sunucudan sorgu (verifyPayment) ile işlenir; iyzico webhook'u kullanılmıyor.
    return null;
  }
}
