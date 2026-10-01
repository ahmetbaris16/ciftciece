/**
 * Sağlayıcı yanıtını kayda yazmadan önce süzer: yalnız izinli alanlar kalır.
 * Kart verisi (BIN, son 4 hane, kart tipi/ailesi, kart token'ı) ve komisyon ayrıntıları atılır;
 * "kart numarası asla saklanmaz/loglanmaz" kuralı alan listesiyle değil izin listesiyle korunur.
 */

const TOP_LEVEL_FIELDS = [
  "status",
  "errorCode",
  "errorMessage",
  "errorGroup",
  "locale",
  "systemTime",
  "conversationId",
  "paymentStatus",
  "paymentId",
  "price",
  "paidPrice",
  "currency",
  "installment",
  "basketId",
  "token",
  "tokenExpireTime",
  "fraudStatus",
  "phase",
] as const;

// İade için gereken kalem bazlı işlem kimlikleri (R-07/R-11) tutulur
const ITEM_FIELDS = ["itemId", "paymentTransactionId", "transactionStatus", "price", "paidPrice"] as const;

function pick(src: Record<string, unknown>, fields: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of fields) {
    const value = src[key];
    if (value === undefined) continue;
    if (value === null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      out[key] = typeof value === "string" ? value.slice(0, 500) : value;
    }
  }
  return out;
}

export function sanitizeProviderResponse(raw: unknown): Record<string, unknown> {
  if (!raw || typeof raw !== "object") return {};
  const src = raw as Record<string, unknown>;
  const out = pick(src, TOP_LEVEL_FIELDS);
  if (Array.isArray(src.itemTransactions)) {
    out.itemTransactions = src.itemTransactions
      .slice(0, 50)
      .map((item) => (item && typeof item === "object" ? pick(item as Record<string, unknown>, ITEM_FIELDS) : {}));
  }
  return out;
}
