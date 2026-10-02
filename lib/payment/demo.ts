/**
 * Demo banka sayfasının sunucu tarafı (/demo-odeme/<deneme>, POST /api/payment/demo).
 *
 * Sanal POS gelene kadar kartla ödemenin baştan sona gösterimi: kart bilgileri → telefona gelen 6 haneli kod →
 * sipariş "Ödendi". Gerçek para çekilmez. Kurallar:
 *  - Yalnız kart ödemesi DEMO kipindeyken ve canlı sunucuda yalnız yönetici girişiyle (lib/payment/availability.ts).
 *  - Deneme demo sağlayıcısıyla açılmış ve sonuçlanmamış olmalı; sipariş ödeme bekliyor, süresi dolmamış.
 *  - Kart bilgisi sunucuya hiç gelmez: istemci yalnız "kod gönder", "kodu doğrula", "vazgeç" der.
 *  - Kod 3 dakika geçerli, 30 sn'den önce yenisi istenemez, denemede en çok 5 kod; toplam 3 yanlış girişte ödeme
 *    reddedilir (bankalardaki gibi). Kod HMAC özetiyle saklanır. SMS gönderilmez: kod demo sayfasında "gelen SMS"
 *    olarak gösterilir.
 *  - Karar (onay / ret) denemeye özel tek kayıttır (lib/payment/providers/demo.ts). Buradaki onay siparişi tek başına
 *    "Ödendi" yapmaz: sonuç dönüş adresinde sunucudan sorgulanıp doğrulanır (lib/payment/card.ts handleCardCallback).
 */

import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getBusinessInfo } from "@/lib/business/business.repository";
import { cardAvailabilityForRequest } from "./availability";
import { recordPaymentEvent } from "./events";
import { DEMO_PROVIDER, demoDecisionKey } from "./providers/demo";

export const DEMO_CODE_TTL_MS = 3 * 60_000;
export const DEMO_RESEND_MS = 30_000;
export const DEMO_MAX_CODES = 5;
export const DEMO_MAX_WRONG = 3;

// Kod özeti için anahtar: canlıda NEXTAUTH_SECRET açılış denetiminden geçmiştir; yoksa süreç başına rastgele
const SECRET = process.env.NEXTAUTH_SECRET || randomBytes(32).toString("hex");
const codeHash = (attemptId: string, code: string) => createHmac("sha256", SECRET).update(`${attemptId}:${code}`).digest("hex");

/** Dönüş adresi: gerçek bankadaki okUrl/failUrl gibi; sonuç orada sunucudan sorgulanır */
export const demoReturnPath = (attemptId: string) =>
  `/api/payment/verify?attempt=${encodeURIComponent(attemptId)}&token=${encodeURIComponent(attemptId)}`;

/** "05XX *** ** 10" — siparişteki telefonun yalnız ilk ve son haneleri */
export function maskPhone(phone: string | null | undefined): string | null {
  let d = (phone ?? "").replace(/\D/g, "");
  if (d.startsWith("90") && d.length === 12) d = d.slice(2);
  if (d.startsWith("0") && d.length === 11) d = d.slice(1);
  if (d.length !== 10) return null;
  return `0${d.slice(0, 3)} *** ** ${d.slice(8)}`;
}

export type DemoSession =
  | {
      ok: true;
      attemptId: string;
      orderId: string;
      reference: string;
      amountKurus: number;
      merchant: string;
      phoneHint: string | null;
      dueAt: Date | null;
      returnPath: string;
    }
  | {
      ok: false;
      reason: "forbidden" | "not_found" | "decided" | "closed";
      message: string;
      /** Müşterinin dönebileceği yer (sipariş sayfası ya da sonucun işleneceği dönüş adresi) */
      backHref?: string;
    };

/** Demo sayfası açılabilir mi, ödeme yapılabilir mi — sayfa ve API ortak denetim */
export async function loadDemoSession(attemptId: string): Promise<DemoSession> {
  if ((await cardAvailabilityForRequest()) !== "demo") {
    return {
      ok: false,
      reason: "forbidden",
      message:
        "Bu sayfa yalnız demo ödeme içindir: sanal POS bağlı değilken yönetici girişiyle kullanılır. Kart ödemesi açıkken ödeme bankanın kendi sayfasında yapılır.",
    };
  }
  const attempt = await prisma.paymentAttempt.findUnique({
    where: { id: attemptId },
    select: {
      id: true,
      provider: true,
      method: true,
      status: true,
      amountKurus: true,
      order: { select: { id: true, reference: true, status: true, paymentDueAt: true, guestPhone: true } },
    },
  });
  if (!attempt || attempt.provider !== DEMO_PROVIDER || attempt.method !== "CARD") {
    return { ok: false, reason: "not_found", message: "Ödeme kaydı bulunamadı. Siparişinizi yeniden verin." };
  }
  const order = attempt.order;
  const orderHref = `/siparis/${order.reference}`;
  const decided = await prisma.paymentEvent.findUnique({
    where: { provider_eventKey: { provider: DEMO_PROVIDER, eventKey: demoDecisionKey(attempt.id) } },
    select: { id: true },
  });
  if (decided) {
    // Sonuç daha önce verildi (ör. sayfa yenilendi): dönüş adresi sonucu işler, müşteri doğru sayfaya gider
    return { ok: false, reason: "decided", message: "Bu ödeme sonuçlandı.", backHref: demoReturnPath(attempt.id) };
  }
  if (attempt.status !== "INITIATED" || order.status !== "PENDING") {
    return { ok: false, reason: "closed", message: "Bu ödeme sayfası artık geçerli değil.", backHref: orderHref };
  }
  if (order.paymentDueAt && order.paymentDueAt.getTime() <= Date.now()) {
    return { ok: false, reason: "closed", message: "Bu siparişin ödeme süresi doldu. Siparişi yeniden verin.", backHref: orderHref };
  }
  const business = await getBusinessInfo();
  return {
    ok: true,
    attemptId: attempt.id,
    orderId: order.id,
    reference: order.reference,
    amountKurus: attempt.amountKurus,
    merchant: business.tradeName,
    phoneHint: maskPhone(order.guestPhone),
    dueAt: order.paymentDueAt,
    returnPath: demoReturnPath(attempt.id),
  };
}

export type DemoActionResult =
  | { ok: true; status: "code_sent"; code: string; expiresAt: Date; resendAt: Date; phoneHint: string | null }
  | { ok: true; status: "approved" | "declined"; redirect: string }
  | { ok: false; httpStatus: number; error: string; triesLeft?: number; redirect?: string };

const refuse = (s: Extract<DemoSession, { ok: false }>): DemoActionResult => ({
  ok: false,
  httpStatus: s.reason === "forbidden" ? 403 : s.reason === "not_found" ? 404 : 409,
  error: s.message,
  redirect: s.backHref,
});

async function codeEvents(attemptId: string) {
  return prisma.paymentEvent.findMany({
    where: { attemptId, provider: DEMO_PROVIDER, eventType: { in: ["demo.code_sent", "demo.code_wrong"] } },
    orderBy: { processedAt: "desc" },
    select: { eventType: true, payload: true, processedAt: true },
  });
}

/** "Telefona" 6 haneli kod gönderir (demo: kod yanıtta döner, sayfada SMS olarak gösterilir) */
export async function sendDemoCode(attemptId: string): Promise<DemoActionResult> {
  const s = await loadDemoSession(attemptId);
  if (!s.ok) return refuse(s);

  const events = await codeEvents(attemptId);
  const sent = events.filter((e) => e.eventType === "demo.code_sent");
  const last = sent[0];
  const now = Date.now();
  if (last && now - last.processedAt.getTime() < DEMO_RESEND_MS) {
    const wait = Math.ceil((DEMO_RESEND_MS - (now - last.processedAt.getTime())) / 1000);
    return { ok: false, httpStatus: 429, error: `Yeni kod için ${wait} sn bekleyin.` };
  }
  if (sent.length >= DEMO_MAX_CODES) {
    return { ok: false, httpStatus: 429, error: "Bu ödeme için çok fazla kod istendi. Vazgeçip siparişi yeniden deneyin." };
  }

  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const expiresAt = new Date(now + DEMO_CODE_TTL_MS);
  await recordPaymentEvent(prisma, {
    source: "SYSTEM",
    eventType: "demo.code_sent",
    provider: DEMO_PROVIDER,
    orderId: s.orderId,
    attemptId,
    payload: { codeHash: codeHash(attemptId, code), expiresAt: expiresAt.toISOString(), phone: s.phoneHint },
  });
  return { ok: true, status: "code_sent", code, expiresAt, resendAt: new Date(now + DEMO_RESEND_MS), phoneHint: s.phoneHint };
}

/** Demo kararını yazar; deneme daha önce sonuçlandıysa o sonuç döner (aynı denemeye ikinci karar yazılamaz) */
async function decide(
  s: Extract<DemoSession, { ok: true }>,
  decision: { approved: true } | { approved: false; reason: string }
): Promise<DemoActionResult> {
  try {
    await recordPaymentEvent(prisma, {
      source: "SYSTEM",
      eventType: decision.approved ? "demo.approved" : "demo.declined",
      provider: DEMO_PROVIDER,
      eventKey: demoDecisionKey(s.attemptId),
      orderId: s.orderId,
      attemptId: s.attemptId,
      outcome: decision.approved ? "approved" : "declined",
      payload: decision.approved
        ? { amountKurus: s.amountKurus, authCode: randomBytes(3).toString("hex").toUpperCase() }
        : { reason: decision.reason },
    });
    return { ok: true, status: decision.approved ? "approved" : "declined", redirect: s.returnPath };
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const existing = await prisma.paymentEvent.findUnique({
        where: { provider_eventKey: { provider: DEMO_PROVIDER, eventKey: demoDecisionKey(s.attemptId) } },
        select: { eventType: true },
      });
      return { ok: true, status: existing?.eventType === "demo.approved" ? "approved" : "declined", redirect: s.returnPath };
    }
    throw err;
  }
}

/** Girilen kodu doğrular: doğruysa ödeme onaylanır; toplam 3 yanlışta reddedilir */
export async function verifyDemoCode(attemptId: string, code: string): Promise<DemoActionResult> {
  const s = await loadDemoSession(attemptId);
  if (!s.ok) return refuse(s);

  const events = await codeEvents(attemptId);
  const last = events.find((e) => e.eventType === "demo.code_sent");
  if (!last) return { ok: false, httpStatus: 409, error: "Önce doğrulama kodu isteyin." };
  const payload = (last.payload ?? {}) as Record<string, unknown>;
  const expiresAt = typeof payload.expiresAt === "string" ? Date.parse(payload.expiresAt) : NaN;
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    return { ok: false, httpStatus: 409, error: "Kodun süresi doldu. Yeni kod isteyin." };
  }

  const expected = Buffer.from(typeof payload.codeHash === "string" ? payload.codeHash : "");
  const actual = Buffer.from(codeHash(attemptId, code));
  if (expected.length === actual.length && timingSafeEqual(expected, actual)) {
    return decide(s, { approved: true });
  }

  await recordPaymentEvent(prisma, {
    source: "SYSTEM",
    eventType: "demo.code_wrong",
    provider: DEMO_PROVIDER,
    orderId: s.orderId,
    attemptId,
  });
  const wrong = events.filter((e) => e.eventType === "demo.code_wrong").length + 1;
  if (wrong >= DEMO_MAX_WRONG) {
    return decide(s, { approved: false, reason: `doğrulama kodu ${DEMO_MAX_WRONG} kez yanlış girildi` });
  }
  const triesLeft = DEMO_MAX_WRONG - wrong;
  return { ok: false, httpStatus: 400, error: `Kod hatalı. ${triesLeft} deneme hakkınız kaldı.`, triesLeft };
}

/** Ödeme sayfasında "Vazgeç": ödeme reddedilmiş sayılır, müşteri ödeme adımına döner */
export async function cancelDemoPayment(attemptId: string): Promise<DemoActionResult> {
  const s = await loadDemoSession(attemptId);
  if (!s.ok) return refuse(s);
  return decide(s, { approved: false, reason: "ödeme sayfasında vazgeçildi" });
}
