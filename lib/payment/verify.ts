/**
 * Ödeme doğrulama — sağlayıcıdan SUNUCU TARAFINDA sorgulanan sonucun sınıflandırılması.
 *
 * Tarayıcı dönüşü (callback), webhook ve admin'in elle sorgusu yalnız TETİKLEYİCİDİR: hiçbiri kanıt
 * sayılmaz. Her biri burada aynı yoldan geçer: token ile sağlayıcıya sorulur (retrieve), sonuç
 * denemenin beklenen değerleriyle karşılaştırılır, kayıt lib/payment/apply.ts'de tek transaction'da yapılır.
 */

import { prisma } from "@/lib/db/prisma";
import type { PaymentAttemptStatus, PaymentEventSource } from "@prisma/client";
import { getPaymentProvider } from "./provider";
import { decimalToKurus } from "./money";
import { recordPaymentEvent } from "./events";
import { applyProviderResult, type ApplyOutcome, type ApplyResult } from "./apply";
import type { RetrievePaymentResult } from "./types";

type RetrievedOk = Extract<RetrievePaymentResult, { ok: true }>;

/** Sağlayıcının bildirdiği, denemeye yazılacak alanlar (kuruşa çevrilmiş) */
export interface ProviderPaymentData {
  paymentId?: string;
  paidAmountKurus: number | null;
  chargedAmountKurus: number | null;
  currency?: string;
  installment?: number;
  fraudStatus?: number;
  raw: Record<string, unknown>;
}

export type Classification =
  | { kind: "success"; data: ProviderPaymentData; fraudReview: boolean }
  | { kind: "mismatch"; data: ProviderPaymentData; reasons: string[] }
  | { kind: "failed"; data: ProviderPaymentData; reason: string }
  | { kind: "pending"; data: ProviderPaymentData; reason: string };

export interface ClassifyContext {
  orderId: string;
  amountKurus: number;
  currency: string;
  providerToken: string | null;
  conversationId: string | null;
  /** Tetikleyicinin bildirdiği kimlikler (webhook: iyziPaymentId, paymentConversationId) */
  expected?: { paymentId?: string; conversationId?: string };
}

/**
 * "Başarılı" bildirilen ödemenin doğrulanması. Herhangi biri tutmazsa sipariş PAID yapılmaz (MISMATCH).
 *  - ödeme no (paymentId) var; tetikleyici bir ödeme no bildirdiyse (webhook) aynı
 *  - sepet no (basketId) = sipariş id
 *  - token ve conversationId sağlayıcı bildirdiyse denemeninkiyle aynı; tetikleyicinin bildirdiği
 *    conversationId (webhook paymentConversationId) denemeninkiyle aynı
 *  - para birimi = denemenin para birimi (TRY)
 *  - sepet tutarı (price) = beklenen tutar (sipariş toplamı), kuruşu kuruşuna
 *  - çekilen tutar (paidPrice) sepet tutarından az olamaz; tek çekimde ona eşit olmalı. Taksitte
 *    fazlası, iyzico panelinde vade farkı müşteriye yansıtılıyorsa beklenir ve kaydedilir.
 */
function successMismatches(res: RetrievedOk, data: ProviderPaymentData, ctx: ClassifyContext): string[] {
  const reasons: string[] = [];
  if (!data.paymentId) {
    reasons.push("sağlayıcı ödeme no (paymentId) bildirmedi");
  } else if (ctx.expected?.paymentId && ctx.expected.paymentId !== data.paymentId) {
    reasons.push(`ödeme no uyuşmuyor (bildirimde ${ctx.expected.paymentId}, sorguda ${data.paymentId})`);
  }
  if (res.basketId !== ctx.orderId) {
    reasons.push(`sepet no uyuşmuyor (beklenen ${ctx.orderId}, gelen ${res.basketId ?? "yok"})`);
  }
  if (res.token && ctx.providerToken && res.token !== ctx.providerToken) {
    reasons.push("token uyuşmuyor");
  }
  if (res.conversationId && ctx.conversationId && res.conversationId !== ctx.conversationId) {
    reasons.push(`conversationId uyuşmuyor (beklenen ${ctx.conversationId}, gelen ${res.conversationId})`);
  }
  if (ctx.expected?.conversationId && ctx.expected.conversationId !== ctx.conversationId) {
    reasons.push(`bildirimdeki conversationId (${ctx.expected.conversationId}) denemeyle eşleşmiyor`);
  }
  if (!res.currency) {
    reasons.push("para birimi bildirilmedi");
  } else if (res.currency !== ctx.currency) {
    reasons.push(`para birimi uyuşmuyor (beklenen ${ctx.currency}, gelen ${res.currency})`);
  }
  if (data.paidAmountKurus === null) {
    reasons.push(`sepet tutarı okunamadı (${res.price ?? "yok"})`);
  } else if (data.paidAmountKurus !== ctx.amountKurus) {
    reasons.push(`tutar uyuşmuyor (beklenen ${ctx.amountKurus} kuruş, sağlayıcı ${data.paidAmountKurus} kuruş)`);
  }
  if (data.chargedAmountKurus === null) {
    reasons.push(`çekilen tutar okunamadı (${res.paidPrice ?? "yok"})`);
  } else if (data.paidAmountKurus !== null) {
    if (data.chargedAmountKurus < data.paidAmountKurus) {
      reasons.push(`çekilen tutar (${data.chargedAmountKurus} kuruş) sepet tutarından az`);
    } else if (data.chargedAmountKurus > data.paidAmountKurus && (data.installment ?? 1) <= 1) {
      reasons.push(`tek çekimde çekilen tutar (${data.chargedAmountKurus} kuruş) sepet tutarından farklı`);
    }
  }
  return reasons;
}

/** Saf fonksiyon: sağlayıcı yanıtı + beklenen değerler → sonuç. DB'ye dokunmaz. */
export function classifyRetrieve(res: RetrievedOk, ctx: ClassifyContext): Classification {
  const data: ProviderPaymentData = {
    paymentId: res.paymentId || undefined,
    paidAmountKurus: res.price === undefined ? null : decimalToKurus(res.price),
    chargedAmountKurus: res.paidPrice === undefined ? null : decimalToKurus(res.paidPrice),
    currency: res.currency,
    installment: res.installment,
    fraudStatus: res.fraudStatus,
    raw: res.raw,
  };

  if (res.apiStatus !== "success") {
    // Sorgunun kendisi başarısız (örn. token bulunamadı): ödeme durumu bilinmiyor, "ödenmedi" denmez
    return { kind: "pending", data, reason: `sorgu başarısız: ${res.errorCode ?? "?"} ${res.errorMessage ?? ""}`.trim() };
  }

  if (res.paymentStatus === "SUCCESS") {
    if (res.fraudStatus === -1) {
      return { kind: "failed", data, reason: "ödeme kuruluşunun dolandırıcılık kontrolü ödemeyi reddetti (fraudStatus -1)" };
    }
    const reasons = successMismatches(res, data, ctx);
    if (reasons.length > 0) return { kind: "mismatch", data, reasons };
    return { kind: "success", data, fraudReview: res.fraudStatus === 0 };
  }

  if (res.paymentStatus === "FAILURE") {
    return { kind: "failed", data, reason: `ödeme başarısız${res.errorCode ? ` (${res.errorCode})` : ""}` };
  }

  // INIT_THREEDS, CALLBACK_THREEDS vb. ara durumlar ya da durum yok
  return { kind: "pending", data, reason: `ödeme durumu: ${res.paymentStatus ?? "bilinmiyor"}` };
}

export type VerifyOutcome = ApplyOutcome | "unverified";

export interface VerifyResult {
  outcome: VerifyOutcome;
  attemptId: string;
  orderId: string;
  orderReference: string;
  attemptStatus: PaymentAttemptStatus;
  /** Sağlayıcıya ulaşılamadıysa ya da sorgu yapılamadıysa */
  error?: string;
  /** Sağlayıcının yanıtı (süzülmüş) — admin ekranında gösterilir */
  provider?: Record<string, unknown>;
  classification?: Classification["kind"];
  reasons?: string[];
  applied?: ApplyResult;
}

const TERMINAL: Record<string, ApplyOutcome> = {
  SUCCEEDED: "already_paid",
  MISMATCH: "mismatch",
  DUPLICATE: "duplicate",
};

export interface VerifyOptions {
  source: PaymentEventSource;
  actorId?: string | null;
  /** Gelen kutusundaki webhook olayı işleniyorsa onun id'si */
  inboxEventId?: string | null;
  expected?: { paymentId?: string; conversationId?: string };
  /** Sonuçlanmış denemeyi de sağlayıcıya yeniden sor (admin elle sorgu) */
  force?: boolean;
}

/**
 * Denemenin sonucunu sağlayıcıdan sorgular ve kaydeder. Dış çağrı transaction DIŞINDADIR;
 * kayıt applyProviderResult içinde tek transaction'dır. Aynı deneme için tekrar çağrılması güvenlidir.
 */
export async function verifyAttempt(attemptId: string, opts: VerifyOptions): Promise<VerifyResult> {
  const attempt = await prisma.paymentAttempt.findUnique({
    where: { id: attemptId },
    include: { order: { select: { id: true, reference: true } } },
  });
  if (!attempt) throw new Error(`Ödeme denemesi bulunamadı: ${attemptId}`);

  const base = {
    attemptId: attempt.id,
    orderId: attempt.order.id,
    orderReference: attempt.order.reference,
    attemptStatus: attempt.status,
  };

  if (!opts.force && TERMINAL[attempt.status]) {
    return { ...base, outcome: TERMINAL[attempt.status] };
  }

  const unverified = async (error: string): Promise<VerifyResult> => {
    if (opts.inboxEventId) {
      await prisma.paymentEvent.update({
        where: { id: opts.inboxEventId },
        data: { status: "FAILED", error: error.slice(0, 1000), attemptId: attempt.id, orderId: attempt.orderId },
      });
    } else {
      await recordPaymentEvent(prisma, {
        source: opts.source,
        eventType: "verify.error",
        provider: attempt.provider,
        orderId: attempt.orderId,
        attemptId: attempt.id,
        actorId: opts.actorId,
        outcome: "unverified",
        error,
      });
    }
    return { ...base, outcome: "unverified", error };
  };

  if (!attempt.providerToken) return unverified("Denemenin sağlayıcı token'ı yok (ödeme formu açılamamış).");

  let provider;
  try {
    provider = getPaymentProvider();
  } catch (err) {
    return unverified(`Ödeme sağlayıcısı hazır değil: ${(err as Error).message}`);
  }
  if (provider.name !== attempt.provider) {
    return unverified(`Deneme "${attempt.provider}" ile açılmış, etkin sağlayıcı "${provider.name}".`);
  }

  const res = await provider.retrievePayment({
    token: attempt.providerToken,
    conversationId: attempt.conversationId ?? undefined,
    orderId: attempt.orderId,
  });
  if (!res.ok) return unverified(res.error);

  const classification = classifyRetrieve(res, {
    orderId: attempt.orderId,
    amountKurus: attempt.amountKurus,
    currency: attempt.currency,
    providerToken: attempt.providerToken,
    conversationId: attempt.conversationId,
    expected: opts.expected,
  });

  const applied = await applyProviderResult({
    attemptId: attempt.id,
    classification,
    source: opts.source,
    actorId: opts.actorId,
    inboxEventId: opts.inboxEventId,
  });

  return {
    ...base,
    outcome: applied.outcome,
    attemptStatus: applied.attemptStatus,
    provider: res.raw,
    classification: classification.kind,
    reasons: classification.kind === "mismatch" ? classification.reasons : undefined,
    applied,
  };
}
