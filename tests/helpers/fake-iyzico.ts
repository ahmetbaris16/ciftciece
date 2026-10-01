/**
 * Sahte iyzico (yalnız testler): global fetch'i yakalar, Ortak Ödeme Formu initialize/retrieve
 * uçlarını docs.iyzico.com'daki istek/yanıt biçiminde taklit eder. Gerçek ağ isteği gitmez;
 * sandbox-api.iyzipay.com dışındaki her istek testi hatayla düşürür.
 *
 * İstek imzası (IYZWSv2) her çağrıda test anahtarıyla yeniden hesaplanıp karşılaştırılır.
 * Bu, bizim istemcimizin dokümandaki algoritmayı kendi içinde tutarlı uyguladığını gösterir;
 * iyzico'nun gerçek davranışını kanıtlamaz (bunun için docs/IYZICO_SANDBOX_TEST.md).
 */

import { createHmac, randomBytes } from "node:crypto";

export const FAKE_BASE_URL = "https://sandbox-api.iyzipay.com";
export const TEST_API_KEY = "test-api-key";
export const TEST_SECRET_KEY = "test-secret-key";
const INITIALIZE = "/payment/iyzipos/checkoutform/initialize/auth/ecom";
const RETRIEVE = "/payment/iyzipos/checkoutform/auth/ecom/detail";

export interface FakePayment {
  token: string;
  conversationId: string;
  basketId: string;
  price: string;
  paidPrice: string;
  currency: string;
  state: "INIT" | "SUCCESS" | "FAILURE";
  paymentId?: string;
  installment: number;
  fraudStatus: number;
  /** retrieve yanıtında üzerine yazılacak alanlar (uyuşmazlık taklidi) */
  overrides?: Record<string, unknown>;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function headerValue(headers: HeadersInit | undefined, name: string): string | undefined {
  if (!headers) return undefined;
  if (headers instanceof Headers) return headers.get(name) ?? undefined;
  if (Array.isArray(headers)) return headers.find(([k]) => k.toLowerCase() === name.toLowerCase())?.[1];
  const entry = Object.entries(headers).find(([k]) => k.toLowerCase() === name.toLowerCase());
  return entry?.[1];
}

export class FakeIyzico {
  readonly payments = new Map<string, FakePayment>();
  readonly calls: Array<{ path: string; body: Record<string, unknown> }> = [];
  /** Sonraki N istek ağ hatası versin (iyzico'ya ulaşılamıyor taklidi) */
  networkFailures = 0;
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

  tokens(): string[] {
    return [...this.payments.keys()];
  }

  get(token: string): FakePayment {
    const p = this.payments.get(token);
    if (!p) throw new Error(`sahte iyzico: token yok ${token}`);
    return p;
  }

  /** Müşteri ödeme formunda ödedi */
  pay(token: string, opts: Partial<Pick<FakePayment, "paidPrice" | "installment" | "fraudStatus" | "overrides">> = {}) {
    const p = this.get(token);
    p.state = "SUCCESS";
    p.paymentId = p.paymentId ?? String(20_000_000 + ++this.seq);
    if (opts.paidPrice !== undefined) p.paidPrice = opts.paidPrice;
    if (opts.installment !== undefined) p.installment = opts.installment;
    if (opts.fraudStatus !== undefined) p.fraudStatus = opts.fraudStatus;
    if (opts.overrides) p.overrides = { ...p.overrides, ...opts.overrides };
    return p;
  }

  /** Kart reddedildi */
  fail(token: string) {
    this.get(token).state = "FAILURE";
  }

  private async handle(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (!url.startsWith(FAKE_BASE_URL)) throw new Error(`Testte beklenmeyen dış istek: ${url}`);
    if (this.networkFailures > 0) {
      this.networkFailures -= 1;
      throw new TypeError("fetch failed (sahte ağ hatası)");
    }
    const path = url.slice(FAKE_BASE_URL.length);
    const rawBody = typeof init?.body === "string" ? init.body : "";
    const body = JSON.parse(rawBody || "{}") as Record<string, unknown>;
    if (!this.authValid(path, rawBody, init?.headers)) {
      return json({ status: "failure", errorCode: "1000", errorMessage: "Geçersiz imza" }, 401);
    }
    this.calls.push({ path, body });
    if (path === INITIALIZE) return json(this.initialize(body));
    if (path === RETRIEVE) return json(this.retrieve(body));
    return json({ status: "failure", errorCode: "404", errorMessage: "bilinmeyen uç" }, 404);
  }

  /** IYZWSv2: base64("apiKey:..&randomKey:..&signature:" + HMAC-SHA256(secret, randomKey + path + body) hex) */
  private authValid(path: string, rawBody: string, headers: HeadersInit | undefined): boolean {
    const auth = headerValue(headers, "Authorization") ?? "";
    if (!auth.startsWith("IYZWSv2 ")) return false;
    const decoded = Buffer.from(auth.slice("IYZWSv2 ".length), "base64").toString("utf8");
    const parts = Object.fromEntries(decoded.split("&").map((kv) => [kv.slice(0, kv.indexOf(":")), kv.slice(kv.indexOf(":") + 1)]));
    if (parts.apiKey !== TEST_API_KEY || !parts.randomKey) return false;
    const expected = createHmac("sha256", TEST_SECRET_KEY).update(parts.randomKey + path + rawBody).digest("hex");
    return parts.signature === expected && headerValue(headers, "x-iyzi-rnd") === parts.randomKey;
  }

  private initialize(body: Record<string, unknown>) {
    const token = `tok-${++this.seq}-${randomBytes(4).toString("hex")}`;
    this.payments.set(token, {
      token,
      conversationId: String(body.conversationId),
      basketId: String(body.basketId),
      price: String(body.price),
      paidPrice: String(body.paidPrice),
      currency: String(body.currency),
      state: "INIT",
      installment: 1,
      fraudStatus: 1,
    });
    return {
      status: "success",
      locale: "tr",
      systemTime: Date.now(),
      conversationId: body.conversationId,
      token,
      checkoutFormContent: "<script></script>",
      tokenExpireTime: 1800,
      paymentPageUrl: `https://sandbox-cpp.iyzipay.com?token=${token}&lang=tr`,
    };
  }

  private retrieve(body: Record<string, unknown>) {
    const p = this.payments.get(String(body.token));
    if (!p) {
      return { status: "failure", errorCode: "5129", errorMessage: "Geçersiz token", conversationId: body.conversationId };
    }
    if (p.state === "INIT") {
      // Ödenmemiş form: gerçek iyzico'nun bu durumdaki yanıtı doğrulanmadı; ara durum olarak taklit edilir
      return { status: "failure", errorCode: "5131", errorMessage: "Ödeme bulunamadı", conversationId: body.conversationId };
    }
    const common = {
      status: "success",
      locale: "tr",
      systemTime: Date.now(),
      conversationId: body.conversationId,
      token: p.token,
      basketId: p.basketId,
      currency: p.currency,
      price: Number(p.price),
      paidPrice: Number(p.paidPrice),
      installment: p.installment,
      fraudStatus: p.fraudStatus,
      // Kart alanları: kayda yazılmamalı (sanitize testi)
      binNumber: "55287900",
      lastFourDigits: "0008",
      cardType: "CREDIT_CARD",
      cardAssociation: "MASTER_CARD",
      cardFamily: "Paraf",
      itemTransactions: [{ itemId: "K1", paymentTransactionId: `${p.paymentId ?? "0"}1`, transactionStatus: 2, price: Number(p.price), paidPrice: Number(p.paidPrice) }],
    };
    if (p.state === "FAILURE") {
      return { ...common, paymentStatus: "FAILURE", errorCode: "10051", errorMessage: "Kart limiti yetersiz" };
    }
    return { ...common, paymentStatus: "SUCCESS", paymentId: p.paymentId, ...p.overrides };
  }
}
