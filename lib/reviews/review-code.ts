/**
 * Üye olmadan verilmiş siparişin tek kullanımlık değerlendirme kodu (F-33).
 *
 * Neden: misafir siparişinin değerlendirmesi eskiden yalnız sipariş numarasıyla yazılıyordu; numara paylaşılırsa
 * (ör. mağazaya WhatsApp'tan) başkası da yazabiliyordu. Artık paketin içindeki fişte ve teslim e-postasında yazan
 * kod gerekir. (e-Arşiv faturası muhasebe/GİB portalında düzenlendiği için koda yer yok; kod paket fişindedir.)
 *
 * - Kod 8 karakter ("XXXX-XXXX"; rakamlar ve I, L, O, U dışındaki büyük harfler — karışan harf yok), ~40 bit:
 *   tahmin edilemez, denemeler IP başına sınırlı (API). Sunucu sırrıyla sipariş + sürümden türetilir: fiş yeniden
 *   basılınca aynı kod çıkar; veritabanında yalnız (sırla alınmış) özeti durur.
 * - Tek kullanım: kod bir kez kullanılır; kullanan tarayıcıya 30 günlük değerlendirme izni verilir (httpOnly çerez,
 *   veritabanında özeti). Bu sürede siparişteki her ürünü yazıp düzenleyebilir. Kod başka cihazda/kişide çalışmaz.
 * - Sipariş teslim edilmeden kod kullanılamaz ve harcanmaz.
 * - Yönetici yeni kod üretebilir (müşteri kodunu kaybettiyse ya da başka tarayıcıdan yazmak istiyorsa): sürüm artar,
 *   eski kod ve verilmiş izin geçersiz olur.
 * - Üyelikle verilmiş siparişte kod yoktur: değerlendirme üyenin hesabıyla (giriş yaparak) yazılır.
 * - Sunucu sırrı (NEXTAUTH_SECRET) değişirse eski kodlar çalışmaz; kod bir sonraki gösterimde (fiş, panel) yeni
 *   sürümle yeniden üretilir.
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/db/prisma";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford base32
const CODE_LENGTH = 8;
const SECRET = process.env.NEXTAUTH_SECRET || randomBytes(32).toString("hex");

export const REVIEW_GRANT_COOKIE = "ce_review_grants";
export const REVIEW_GRANT_DAYS = 30;
/** Bir tarayıcıda en çok bu kadar siparişin izni tutulur (en yeniler) */
const MAX_GRANTS = 5;

/** Yazılan kod → standart biçim (boşluk/tire yok, büyük harf; O→0, I/L→1). Geçersizse null */
export function normalizeReviewCode(input: string): string | null {
  const t = input
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  if (t.length !== CODE_LENGTH) return null;
  return [...t].every((ch) => ALPHABET.includes(ch)) ? t : null;
}

export const formatReviewCode = (code: string) => `${code.slice(0, 4)}-${code.slice(4)}`;

/** Sipariş + sürüm → kod (HMAC'in ilk 40 biti, 8 × 5 bit) */
function deriveCode(orderId: string, version: number): string {
  const mac = createHmac("sha256", SECRET).update(`review-code:${orderId}:${version}`).digest();
  let n = 0;
  for (let i = 0; i < 5; i++) n = n * 256 + mac[i]; // 40 bit: double'da tam
  let out = "";
  for (let i = CODE_LENGTH - 1; i >= 0; i--) out += ALPHABET[Math.floor(n / 2 ** (i * 5)) % 32];
  return out;
}

/** Arama özeti (sırla): veritabanı tek başına sızsa da kodlar denenerek bulunamaz */
const codeHash = (normalized: string) => createHmac("sha256", SECRET).update(`review-code-hash:${normalized}`).digest("hex");
/** İzin anahtarı 192 bit rastgele: düz SHA-256 yeter */
const grantHash = (token: string) => createHash("sha256").update(`review-grant:${token}`).digest("hex");

const isUniqueViolation = (err: unknown) => (err as { code?: string }).code === "P2002";

export interface ReviewCodeInfo {
  /** "XXXX-XXXX" */
  code: string;
  version: number;
  usedAt: Date | null;
}

type CodeRow = { id: string; orderId: string; version: number; codeHash: string; usedAt: Date | null };

/**
 * Kodu verilen sürümden başlayarak yazar (yeni kayıt ya da sürüm artırma). Başka bir siparişin koduyla çakışırsa
 * (40 bitte çok düşük olasılık) bir sonraki sürüm denenir.
 */
async function writeCode(orderId: string, fromVersion: number, existingId: string | null): Promise<CodeRow> {
  for (let version = fromVersion; version < fromVersion + 5; version++) {
    const hash = codeHash(deriveCode(orderId, version));
    try {
      if (existingId) {
        return await prisma.orderReviewCode.update({
          where: { id: existingId },
          data: { version, codeHash: hash, usedAt: null, grantHash: null, grantExpiresAt: null },
        });
      }
      return await prisma.orderReviewCode.create({ data: { orderId, version, codeHash: hash } });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      // Aynı anda başka istek oluşturduysa onu kullan; değilse kod çakışması → sonraki sürüm
      if (!existingId) {
        const row = await prisma.orderReviewCode.findUnique({ where: { orderId } });
        if (row) return row;
      }
    }
  }
  throw new Error("Değerlendirme kodu üretilemedi");
}

/**
 * Misafir siparişinin değerlendirme kodu; yoksa oluşturur (fiş, teslim e-postası, panel). Üyelik siparişinde ya da
 * sipariş yoksa null.
 */
export async function ensureReviewCode(orderId: string): Promise<ReviewCodeInfo | null> {
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { userId: true, reviewCode: true } });
  if (!order || order.userId) return null;
  let row: CodeRow = order.reviewCode ?? (await writeCode(orderId, 1, null));
  let code = deriveCode(orderId, row.version);
  if (codeHash(code) !== row.codeHash) {
    // Sunucu sırrı değişmiş (ya da çakışmada sürüm atlanmış): bu sürümün kodu artık eşleşmiyor → yeni sürüm
    row = await writeCode(orderId, row.version + 1, row.id);
    code = deriveCode(orderId, row.version);
  }
  return { code: formatReviewCode(code), version: row.version, usedAt: row.usedAt };
}

/** Yönetici: yeni kod üret (eski kod ve verilmiş izin geçersiz). Üyelik siparişinde null */
export async function regenerateReviewCode(orderId: string): Promise<ReviewCodeInfo | null> {
  const current = await ensureReviewCode(orderId);
  if (!current) return null;
  const row = await prisma.orderReviewCode.findUniqueOrThrow({ where: { orderId } });
  const next = await writeCode(orderId, row.version + 1, row.id);
  return { code: formatReviewCode(deriveCode(orderId, next.version)), version: next.version, usedAt: null };
}

export type RedeemResult =
  | { ok: true; reference: string; orderId: string; grantToken: string | null; expiresAt: Date | null }
  | { ok: false; reason: "invalid" | "used" | "not_delivered" | "closed" };

const AWAITING = ["PENDING", "PAID", "PROCESSING", "SHIPPED"];

/**
 * Kodu kullan: geçerliyse ve sipariş teslim edildiyse bir kez harcanır, yeni izin anahtarı döner (çereze yazılır).
 * Bu tarayıcı kodu zaten kullandıysa (geçerli izni var) kod yeniden harcanmaz, aynı izinle devam edilir.
 * orderRef verilirse kod o siparişe ait olmalı (sipariş sayfasındaki form).
 */
export async function redeemReviewCode(
  input: string,
  opts: { orderRef?: string; tokens?: string[]; now?: Date } = {}
): Promise<RedeemResult> {
  const now = opts.now ?? new Date();
  const normalized = normalizeReviewCode(input);
  if (!normalized) return { ok: false, reason: "invalid" };
  const row = await prisma.orderReviewCode.findUnique({
    where: { codeHash: codeHash(normalized) },
    include: { order: { select: { id: true, reference: true, userId: true, status: true } } },
  });
  if (!row || row.order.userId || (opts.orderRef && row.order.reference !== opts.orderRef)) {
    return { ok: false, reason: "invalid" };
  }
  const { order } = row;
  if (grantMatches(row, opts.tokens ?? [], now)) {
    return { ok: true, reference: order.reference, orderId: order.id, grantToken: null, expiresAt: row.grantExpiresAt };
  }
  if (order.status !== "DELIVERED") {
    return { ok: false, reason: AWAITING.includes(order.status) ? "not_delivered" : "closed" };
  }
  if (row.usedAt) return { ok: false, reason: "used" };

  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(now.getTime() + REVIEW_GRANT_DAYS * 24 * 60 * 60_000);
  // Tek kullanım: yalnız henüz kullanılmamış (ve bu arada yenilenmemiş) kod harcanır; eşzamanlı ikinci istek kaybeder
  const { count } = await prisma.orderReviewCode.updateMany({
    where: { id: row.id, usedAt: null, version: row.version },
    data: { usedAt: now, grantHash: grantHash(token), grantExpiresAt: expiresAt },
  });
  if (count !== 1) return { ok: false, reason: "used" };
  return { ok: true, reference: order.reference, orderId: order.id, grantToken: token, expiresAt };
}

function grantMatches(
  row: { grantHash: string | null; grantExpiresAt: Date | null } | null,
  tokens: string[],
  now: Date
): boolean {
  if (!row?.grantHash || !row.grantExpiresAt || row.grantExpiresAt <= now || tokens.length === 0) return false;
  const expected = Buffer.from(row.grantHash, "hex");
  return tokens.some((t) => {
    const got = Buffer.from(grantHash(t), "hex");
    return got.length === expected.length && timingSafeEqual(got, expected);
  });
}

/** Bu tarayıcının (çerezdeki anahtarlar) bu siparişte değerlendirme izni var mı */
export async function hasReviewGrant(orderId: string, tokens: string[], now = new Date()): Promise<boolean> {
  if (tokens.length === 0) return false;
  const row = await prisma.orderReviewCode.findUnique({
    where: { orderId },
    select: { grantHash: true, grantExpiresAt: true },
  });
  return grantMatches(row, tokens, now);
}

/** Kod kullanıldı mı (sipariş sayfası "kod kullanıldı" der); kod yoksa false */
export async function reviewCodeUsed(orderId: string): Promise<boolean> {
  const row = await prisma.orderReviewCode.findUnique({ where: { orderId }, select: { usedAt: true } });
  return !!row?.usedAt;
}

// ── Çerez ─────────────────────────────────────────────────────

/** Çerezdeki izin anahtarları (en yeni önce) */
export function parseGrantCookie(value: string | undefined | null): string[] {
  if (!value) return [];
  return value
    .split(".")
    .filter((t) => /^[A-Za-z0-9_-]{20,64}$/.test(t))
    .slice(0, MAX_GRANTS);
}

/** Yeni anahtarı başa ekler (eskiler korunur, en çok 5) */
export function addGrantToCookie(value: string | undefined | null, token: string): string {
  return [token, ...parseGrantCookie(value).filter((t) => t !== token)].slice(0, MAX_GRANTS).join(".");
}
