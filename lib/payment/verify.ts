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
      return { kind: "failed", data, reason: "iyzico dolandırıcılık kontrolü ödemeyi reddetti (fraudStatus -1)" };
    }
    const reasons: string[] = [];
    if (res.basketId !== ctx.orderId) {
      reasons.push(`sepet no uyuşmuyor (beklenen ${ctx.orderId}, gelen ${res.basketId ?? "yok"})`);
    }
    if (data.paidAmountKurus === null) {
      reasons.push(`ödenen tutar okunamadı (${res.price ?? "yok"})`);
    } else if (data.paidAmountKurus !== ctx.amountKurus) {
      reasons.push(`tutar uyuşmuyor (beklenen ${ctx.amountKurus} kuruş, ödenen ${data.paidAmountKurus} kuruş)`);
    }
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
