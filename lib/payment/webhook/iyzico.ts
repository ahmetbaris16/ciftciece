/**
 * iyzico webhook (Üye İşyeri Bildirimleri) — gelen kutusu (inbox) + işleme.
 *
 * Kaynak: https://docs.iyzico.com/en/advanced/webhook (2026-10-01'de okundu)
 *  - Bildirim ödemeden 10–15 sn sonra JSON POST olarak gelir; 2xx alınana kadar 15 dk arayla,
 *    en fazla 3 deneme yapılır. Panel: Ayarlar > Üye İşyeri Ayarları > Üye İşyeri Bildirimleri (HTTPS).
 *  - İmza başlığı X-IYZ-SIGNATURE-V3 (iyzico'dan açtırılmalı: entegrasyon@iyzico.com).
 *    HPP (Ortak Ödeme Formu) biçimi:
 *      HMAC-SHA256(anahtar = secretKey,
 *                  mesaj = secretKey + iyziEventType + iyziPaymentId + token + paymentConversationId + status), HEX
 *    Direct biçimi (token yok): secretKey + iyziEventType + paymentId + paymentConversationId + status.
 *  - secretKey üye işyerinin API gizli anahtarıdır (IYZICO_SECRET_KEY).
 *
 * Akış:
 *  1. ingest: ham gövde + imza doğrulaması → payment_events'e yazılır (provider + eventKey UNIQUE).
 *     Tekrar gelen olay aynı anahtarı üretir → ikinci satır açılmaz, etkisi olmaz.
 *     İmza doğrulanamazsa olay REJECTED olarak yine kaydedilir ve alarm üretilir; işlenmez.
 *  2. Yanıt hemen döner (2xx); işleme yanıt sonrasında yapılır (route: after()).
 *  3. process: bildirimin içeriğine güvenilmez — token ile iyzico'dan sorgulanır (verify.ts), sonuç
 *     tx2'de kaydedilir. Sonuçlanmış deneme ve sipariş durumu geri gitmez (sıra dışı olay etkisiz).
 */

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { raiseAlert, logAlert } from "../alerts";
import { verifyAttempt, type VerifyOutcome } from "../verify";

export const IYZICO_SIGNATURE_HEADER = "x-iyz-signature-v3";
/** iyzico bildirimleri küçüktür; bundan büyük gövde kaydedilmeden reddedilir */
export const MAX_WEBHOOK_BODY_BYTES = 16 * 1024;

const WEBHOOK_FIELDS = [
  "paymentConversationId",
  "merchantId",
  "token",
  "paymentId",
  "status",
  "iyziReferenceCode",
  "iyziEventType",
  "iyziEventTime",
  "iyziPaymentId",
] as const;

type WebhookPayload = Partial<Record<(typeof WEBHOOK_FIELDS)[number], string>>;

const str = (v: unknown): string | undefined =>
  typeof v === "string" ? v : typeof v === "number" && Number.isFinite(v) ? String(v) : undefined;

function pickPayload(raw: Record<string, unknown>): WebhookPayload {
  const out: WebhookPayload = {};
  for (const key of WEBHOOK_FIELDS) {
    const value = str(raw[key]);
    if (value !== undefined) out[key] = value.slice(0, 200);
  }
  return out;
}

/** Dokümandaki V3 imzası (HPP ya da Direct biçimi) — HEX, küçük harf */
export function iyzicoWebhookSignature(secretKey: string, p: WebhookPayload): string {
  const message = p.token
    ? secretKey + (p.iyziEventType ?? "") + (p.iyziPaymentId ?? "") + p.token + (p.paymentConversationId ?? "") + (p.status ?? "")
    : secretKey + (p.iyziEventType ?? "") + (p.paymentId ?? "") + (p.paymentConversationId ?? "") + (p.status ?? "");
  return createHmac("sha256", secretKey).update(message, "utf8").digest("hex");
}

function signatureMatches(expectedHex: string, given: string): boolean {
  const a = Buffer.from(expectedHex, "utf8");
  const b = Buffer.from(given.trim().toLowerCase(), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}

const sha256 = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

export type IngestResult =
  | { kind: "accepted"; eventId: string; duplicate: boolean; needsProcessing: boolean }
  | { kind: "rejected"; eventId: string | null; duplicate: boolean; reason: string }
  | { kind: "too_large" };

/**
 * Bildirimi gelen kutusuna yazar. Dış çağrı yapmaz (hızlı). İşlenmesi gerekiyorsa needsProcessing.
 * @param secretKey iyzico API gizli anahtarı; yoksa imza doğrulanamaz → REJECTED
 */
export async function ingestIyzicoWebhook(
  rawBody: string,
  signatureHeader: string | null,
  secretKey: string | null
): Promise<IngestResult> {
  if (Buffer.byteLength(rawBody, "utf8") > MAX_WEBHOOK_BODY_BYTES) return { kind: "too_large" };

  let parsed: Record<string, unknown> | null = null;
  try {
    const value: unknown = JSON.parse(rawBody);
    if (value && typeof value === "object" && !Array.isArray(value)) parsed = value as Record<string, unknown>;
  } catch {
    parsed = null;
  }
  const payload = parsed ? pickPayload(parsed) : {};

  let reason: string | null = null;
  if (!parsed) reason = "gövde JSON değil";
  else if (!secretKey) reason = "iyzico gizli anahtarı tanımlı değil (IYZICO_SECRET_KEY)";
  else if (!signatureHeader) reason = "X-IYZ-SIGNATURE-V3 başlığı yok (iyzico'dan V3 imzası açtırılmalı)";
  else if (!signatureMatches(iyzicoWebhookSignature(secretKey, payload), signatureHeader)) reason = "imza tutmadı";

  // Eşleşen deneme/sipariş (yalnız DB; dış çağrı yok) — süre dolumu bu siparişi işlenene kadar iptal etmez
  const attempt = payload.token
    ? await prisma.paymentAttempt.findUnique({
        where: { provider_providerToken: { provider: "iyzico", providerToken: payload.token } },
        select: { id: true, orderId: true },
      })
    : null;

  const valid = reason === null;
  const eventKey = valid
    ? `v3:${sha256([payload.iyziEventType, payload.token ?? "", payload.iyziPaymentId ?? payload.paymentId ?? "", payload.paymentConversationId, payload.status].join("|"))}`
    : // Doğrulanamayan olay geçerli olayın anahtarını işgal edemez; aynı gövdenin tekrarı tek satır olur
      `unverified:${sha256(`${rawBody}|${signatureHeader ?? ""}`)}`;

  const data = {
    provider: "iyzico",
    eventKey,
    source: "WEBHOOK" as const,
    eventType: `webhook.${payload.iyziEventType ?? "unknown"}`.slice(0, 100),
    payload: (parsed ? payload : { raw: rawBody.slice(0, 2000) }) as Prisma.InputJsonValue,
    status: valid ? ("RECEIVED" as const) : ("REJECTED" as const),
    signatureValid: valid,
    error: reason,
    // Doğrulanmamış olay siparişe bağlanmaz: sahte bildirim siparişin otomatik iptalini engelleyemesin
    orderId: valid ? (attempt?.orderId ?? null) : null,
    attemptId: valid ? (attempt?.id ?? null) : null,
  };

  try {
    const event = await prisma.$transaction(async (tx) => {
      const ev = await tx.paymentEvent.create({ data, select: { id: true } });
      if (!valid) {
        const isNew = await raiseAlert(tx, {
          kind: "WEBHOOK_SIGNATURE_INVALID",
          dedupeKey: `WEBHOOK_SIGNATURE_INVALID:${eventKey}`,
          message: `İmzası doğrulanamayan ödeme bildirimi geldi ve işlenmedi (${reason}). Sahte olabilir; iyzico panelinden kontrol edin.`,
          eventId: ev.id,
          details: { reason, iyziEventType: payload.iyziEventType ?? null, status: payload.status ?? null },
        });
        if (isNew) logAlert("WEBHOOK_SIGNATURE_INVALID", eventKey.slice(0, 24), reason ?? "");
      }
      return ev;
    });
    return valid
      ? { kind: "accepted", eventId: event.id, duplicate: false, needsProcessing: true }
      : { kind: "rejected", eventId: event.id, duplicate: false, reason: reason ?? "" };
  } catch (err) {
    if (!(err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")) throw err;
    // Aynı olay daha önce geldi: yeni satır yok. Önceki işleme yarım kaldıysa yeniden işlenebilir.
    const existing = await prisma.paymentEvent.findUnique({
      where: { provider_eventKey: { provider: "iyzico", eventKey } },
      select: { id: true, status: true },
    });
    if (!valid) return { kind: "rejected", eventId: existing?.id ?? null, duplicate: true, reason: reason ?? "" };
    return {
      kind: "accepted",
      eventId: existing?.id ?? "",
      duplicate: true,
      needsProcessing: existing?.status === "RECEIVED" || existing?.status === "FAILED",
    };
  }
}

const FINAL_STATUSES = new Set(["SUCCESS", "FAILURE"]);

export interface ProcessResult {
  eventId: string;
  outcome: VerifyOutcome | "ignored" | "skipped";
  detail?: string;
}

/**
 * Gelen kutusundaki doğrulanmış bildirimi işler. Tekrar çağrılması güvenlidir (zaten işlenmişse atlar).
 * Bildirimdeki durum kullanılmaz; token ile iyzico'ya sorulur.
 */
export async function processWebhookEvent(eventId: string): Promise<ProcessResult> {
  const event = await prisma.paymentEvent.findUnique({ where: { id: eventId } });
  if (!event || event.source !== "WEBHOOK" || !event.signatureValid) {
    return { eventId, outcome: "skipped", detail: "işlenecek doğrulanmış bildirim değil" };
  }
  if (event.status !== "RECEIVED" && event.status !== "FAILED") {
    return { eventId, outcome: "skipped", detail: `zaten ${event.status}` };
  }
  const p = event.payload as WebhookPayload;

  const ignore = async (detail: string): Promise<ProcessResult> => {
    await prisma.paymentEvent.updateMany({
      where: { id: event.id, status: { in: ["RECEIVED", "FAILED"] } },
      data: { status: "IGNORED", outcome: detail, handledAt: new Date() },
    });
    return { eventId, outcome: "ignored", detail };
  };

  if (!p.status || !FINAL_STATUSES.has(p.status)) {
    // INIT_THREEDS, CALLBACK_THREEDS vb. ara durumlar: sonuç bildirimi değil
    return ignore(`ara durum: ${p.status ?? "yok"}`);
  }

  let attempt = event.attemptId
    ? await prisma.paymentAttempt.findUnique({ where: { id: event.attemptId } })
    : p.token
      ? await prisma.paymentAttempt.findUnique({
          where: { provider_providerToken: { provider: "iyzico", providerToken: p.token } },
        })
      : null;
  if (!attempt && p.paymentConversationId) {
    // conversationId = deneme id'si (token kaydedilmeden süreç kesildiyse)
    const byConversation = await prisma.paymentAttempt.findFirst({
      where: { provider: "iyzico", conversationId: p.paymentConversationId },
      orderBy: { createdAt: "desc" },
    });
    // Token'ı olmayan denemeye bildirimdeki token yazılır (aynı token başka denemede olamaz: UNIQUE)
    if (byConversation && !byConversation.providerToken && p.token) {
      attempt = await prisma.paymentAttempt.update({ where: { id: byConversation.id }, data: { providerToken: p.token } });
    } else {
      attempt = byConversation;
    }
  }
  if (!attempt) return ignore("bilinmeyen ödeme (bu siteye ait deneme yok)");

  if (!event.attemptId) {
    await prisma.paymentEvent.update({ where: { id: event.id }, data: { attemptId: attempt.id, orderId: attempt.orderId } });
  }

  const result = await verifyAttempt(attempt.id, {
    source: "WEBHOOK",
    inboxEventId: event.id,
    expected: {
      paymentId: p.iyziPaymentId ?? p.paymentId,
      conversationId: p.paymentConversationId,
    },
  });
  if (p.status === "SUCCESS" && result.outcome === "pending") {
    // Bildirim "başarılı" diyor ama sorgu henüz kesin değil: satır açık kalır (yeniden denenebilir) ve
    // sipariş bu sürede otomatik iptal edilmez
    await prisma.paymentEvent.update({
      where: { id: event.id },
      data: { status: "FAILED", error: "bildirim başarılı diyor, sağlayıcı sorgusu henüz kesin değil; yeniden denenecek" },
    });
    return { eventId, outcome: result.outcome, detail: "sorgu kesin değil" };
  }
  // Deneme zaten sonuçlanmışsa verify sağlayıcıya sormaz; gelen kutusu satırı burada kapanır
  await prisma.paymentEvent.updateMany({
    where: { id: event.id, status: "RECEIVED" },
    data: { status: "PROCESSED", outcome: result.outcome, handledAt: new Date() },
  });
  return { eventId, outcome: result.outcome, detail: result.error };
}

