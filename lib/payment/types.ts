/**
 * Payment Provider Types
 *
 * Ödeme sağlayıcı soyutlaması. Sağlayıcı yalnız HTTP konuşur ve yanıtı normalize eder;
 * "ödendi mi, tutar doğru mu" kararı lib/payment/verify.ts'de, kayıt lib/payment/apply.ts'de verilir.
 */

export interface CreatePaymentInput {
  /** Sipariş kimliği — sağlayıcıda sepet no (iyzico basketId) */
  orderId: string;
  /** Ödeme denemesi kimliği — sağlayıcıda conversationId */
  attemptId: string;
  orderReference: string;
  amountKurus: number;
  currency: string;
  buyer: {
    email: string;
    firstName: string;
    lastName: string;
    phone: string;
    city: string;
    address: string;
  };
  items: Array<{
    name: string;
    priceKurus: number;
    quantity: number;
  }>;
  callbackUrl: string;
  /** Üye siparişinde kullanıcı kimliği (sağlayıcıya alıcı kimliği olarak gider) */
  buyerId?: string;
  /** Müşterinin IP adresi (iyzico zorunlu tutar) */
  buyerIp?: string;
  /** Sunulacak en yüksek taksit (1 = tek çekim) */
  maxInstallment?: number;
}

export interface CreatePaymentResult {
  success: boolean;
  /** Ödeme formu token'ı (iyzico) */
  providerRef?: string;
  /** Token'ın geçerlilik sonu (sağlayıcı bildirdiyse) */
  tokenExpiresAt?: Date;
  /** Ödeme sayfası adresi */
  redirectUrl?: string;
  /** Checkout form HTML content (bazı provider'lar inline form verir) */
  checkoutFormHtml?: string;
  /** Hata mesajı (müşteriye gösterilmez) */
  error?: string;
}

/**
 * Sağlayıcıdan sunucu tarafında sorgulanan ödeme durumu. Alanlar sağlayıcının bildirdiği gibidir
 * (tutarlar ondalık metin); doğrulama yapılmamıştır.
 */
export type RetrievePaymentResult =
  | {
      /** Sağlayıcıya ulaşılamadı ya da yanıt okunamadı: ödeme durumu BİLİNMİYOR */
      ok: false;
      error: string;
    }
  | {
      ok: true;
      /** API çağrısının sonucu ("success" | "failure") — ödemenin değil */
      apiStatus: string;
      errorCode?: string;
      errorMessage?: string;
      /** Ödemenin sonucu: "SUCCESS", "FAILURE", "INIT_THREEDS", ... */
      paymentStatus?: string;
      paymentId?: string;
      basketId?: string;
      conversationId?: string;
      token?: string;
      currency?: string;
      /** Sepet tutarı (ondalık metin) */
      price?: string;
      /** Çekilen toplam (ondalık metin; taksit vade farkı dahil olabilir) */
      paidPrice?: string;
      installment?: number;
      /** iyzico: 1 onaylı, 0 incelemede, -1 reddedildi */
      fraudStatus?: number;
      /** Kayda yazılacak süzülmüş yanıt (kart verisi yok) */
      raw: Record<string, unknown>;
    };

export interface RetrievePaymentInput {
  token: string;
  conversationId?: string;
}

/**
 * Tüm ödeme sağlayıcıları bu arayüzü uygular.
 */
export interface PaymentProvider {
  readonly name: string;

  /** Ödeme başlat — redirect URL veya checkout form döner */
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;

  /** Ödemenin güncel durumunu sağlayıcıdan sorgula (callback/webhook/elle sorgu ortak) */
  retrievePayment(input: RetrievePaymentInput): Promise<RetrievePaymentResult>;
}
