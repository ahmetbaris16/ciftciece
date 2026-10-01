/**
 * Payment Provider Types
 *
 * Ödeme sağlayıcı abstraction — iyzico, PayTR veya başka bir provider
 * bu interface'i implement eder.
 */

export interface CreatePaymentInput {
  orderId: string;
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
  /** Provider'ın kendi ödeme referansı */
  providerRef?: string;
  /** 3D Secure veya checkout form redirect URL */
  redirectUrl?: string;
  /** Checkout form HTML content (bazı provider'lar inline form verir) */
  checkoutFormHtml?: string;
  /** Hata mesajı */
  error?: string;
}

export interface VerifyPaymentInput {
  /** Provider'dan gelen callback/token */
  token: string;
  /** Conversation ID veya benzeri provider referansı */
  conversationId?: string;
}

export interface VerifyPaymentResult {
  success: boolean;
  /** Provider'ın onayladığı tutar (kuruş) */
  amountKurus?: number;
  /** Provider'ın kendi referansı */
  providerRef?: string;
  /** Sağlayıcının bildirdiği sipariş kimliği (sepet no) — callback'teki orderId ile karşılaştırılır */
  orderId?: string;
  /** Admin'e not (ör. sağlayıcı dolandırıcılık incelemesinde) */
  note?: string;
  error?: string;
}

export interface WebhookEvent {
  eventType: string;
  providerEventId?: string;
  payload: Record<string, unknown>;
  orderId?: string;
  status?: "SUCCESS" | "FAILED" | "REFUNDED";
  amountKurus?: number;
}

/**
 * Tüm ödeme provider'ları bu interface'i implement eder.
 */
export interface PaymentProvider {
  readonly name: string;

  /** Ödeme başlat — redirect URL veya checkout form döner */
  createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult>;

  /** 3DS/callback sonrası ödeme doğrula */
  verifyPayment(input: VerifyPaymentInput): Promise<VerifyPaymentResult>;

  /** Webhook payload'ını parse et */
  parseWebhook(rawBody: string, headers: Record<string, string>): Promise<WebhookEvent | null>;
}
