/**
 * Sahte Akbank Sanal POS (yalnız testler): global fetch'i yakalar, sipariş sorgu ucunu (txnCode 1010) taklit eder;
 * ortak ödeme sayfasının tarayıcıya geri POST ettiği dönüş alanlarını imzalı üretir.
 *
 * İstek imzası (auth-hash) her çağrıda test anahtarıyla yeniden hesaplanıp karşılaştırılır. Bu, istemcimizin
 * kütüphanedeki algoritmayı kendi içinde tutarlı uyguladığını gösterir; Akbank'ın gerçek davranışını kanıtlamaz
 * (bunun için Akbank test ortamı: docs/AKBANK_TEST.md).
 */

import { AKBANK_URLS, akbankHash } from "@/lib/payment/providers/akbank";

export const AKBANK_TEST_ENV = {
  PAYMENT_PROVIDER: "akbank",
  AKBANK_MERCHANT_SAFE_ID: "2023090417500272654BD9A49CF07574",
  AKBANK_TERMINAL_SAFE_ID: "2023090417500284633D137A249DBBEB",
  AKBANK_SECRET_KEY: "test-gizli-anahtar-akbank",
  AKBANK_ENV: "test",
} as const;

export interface FakeAkbankPayment {
  state: "SUCCESS" | "FAILURE" | "VOIDED";
  amount: string;
  currencyCode?: string;
  installCount?: number;
  rrn: string;
  authCode: string;
  /** Yanıttaki sipariş no'sunu değiştirir (eşleşmeme taklidi) */
  orderIdOverride?: string;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export class FakeAkbank {
  readonly payments = new Map<string, FakeAkbankPayment>();
  readonly calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  networkFailures = 0;
  /** Sonraki sorgu bu kodla dönsün (VPS-0000 dışı: sorgu hatası) */
  nextResponseCode: string | null = null;
  private original: typeof fetch | null = null;
  private seq = 0;

  install(): this {
    this.original = globalThis.fetch;
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => this.handle(input, init)) as typeof fetch;
    return this;
  }

  uninstall() {
    if (this.original) globalThis.fetch = this.original;
    this.original = null;
  }

  /** Müşteri ödeme sayfasında ödedi */
  pay(orderId: string, opts: Partial<FakeAkbankPayment> & { amount: string }) {
    this.seq++;
    this.payments.set(orderId, {
      state: "SUCCESS",
      currencyCode: "949",
      installCount: 1,
      rrn: `6${String(this.seq).padStart(11, "0")}`,
      authCode: `A${String(this.seq).padStart(5, "0")}`,
      ...opts,
    });
  }

  decline(orderId: string, amount: string) {
    this.pay(orderId, { amount, state: "FAILURE" });
  }

  /** Ortak ödeme sayfasının okUrl/failUrl'e POST ettiği alanlar (imzalı) */
  returnFields(orderId: string, opts: { tamper?: boolean } = {}): Record<string, string> {
    const p = this.payments.get(orderId);
    const fields: Record<string, string> = {
      orderId,
      responseCode: p?.state === "SUCCESS" ? "VPS-0000" : "VPS-1073",
      responseMessage: p?.state === "SUCCESS" ? "BAŞARILI" : "İŞLEM BAŞARISIZ",
      txnCode: "3000",
      amount: p?.amount ?? "0.00",
      rrn: p?.rrn ?? "",
      authCode: p?.authCode ?? "",
      // Kart verisi de gelebilir; uygulama kaydetmemeli
      maskedCardNumber: "435509******5232",
    };
    fields.hashParams = "orderId+responseCode+txnCode+amount+rrn+authCode+";
    const data = ["orderId", "responseCode", "txnCode", "amount", "rrn", "authCode"].map((k) => fields[k]).join("");
    fields.hash = akbankHash(data, AKBANK_TEST_ENV.AKBANK_SECRET_KEY);
    if (opts.tamper) fields.amount = "1.00";
    return fields;
  }

  private async handle(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (!url.startsWith(AKBANK_URLS.test.api) && !url.startsWith(AKBANK_URLS.prod.api)) {
      throw new Error(`sahte Akbank: beklenmeyen istek ${url}`);
    }
    if (this.networkFailures > 0) {
      this.networkFailures--;
      throw new TypeError("fetch failed (sahte ağ hatası)");
    }
    const body = String(init?.body ?? "");
    const headers = new Headers(init?.headers);
    if (headers.get("auth-hash") !== akbankHash(body, AKBANK_TEST_ENV.AKBANK_SECRET_KEY)) {
      return json({ code: 401, message: "auth-hash geçersiz" }, 401);
    }
    const parsed = JSON.parse(body) as Record<string, unknown>;
    this.calls.push({ url, body: parsed });
    if (this.nextResponseCode) {
      const code = this.nextResponseCode;
      this.nextResponseCode = null;
      return json({ responseCode: code, responseMessage: "Sistem hatası" });
    }
    if (parsed.txnCode !== "1010") return json({ responseCode: "VPS-1999", responseMessage: "desteklenmiyor" });
    const orderId = (parsed.order as Record<string, string>)?.orderId;
    const p = this.payments.get(orderId);
    if (!p) return json({ responseCode: "VPS-0000", responseMessage: "BAŞARILI", txnDetailList: [] });
    const approved = p.state !== "FAILURE";
    return json({
      responseCode: "VPS-0000",
      responseMessage: "BAŞARILI",
      txnDetailList: [
        {
          txnCode: "3000",
          responseCode: approved ? "VPS-0000" : "VPS-1073",
          hostMessage: approved ? undefined : "YETERSİZ BAKİYE",
          txnStatus: p.state === "VOIDED" ? "V" : approved ? "N" : "S",
          amount: Number(p.amount),
          currencyCode: Number(p.currencyCode ?? "949"),
          installCount: p.installCount ?? 1,
          rrn: approved ? p.rrn : null,
          authCode: approved ? p.authCode : null,
          orderId: p.orderIdOverride ?? orderId,
          txnDateTime: "2026-10-02T10:15:30.000",
          maskedCardNumber: "435509******5232",
        },
      ],
    });
  }
}
