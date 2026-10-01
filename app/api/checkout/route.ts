/**
 * Checkout API
 * POST /api/checkout
 *
 * Sipariş oluşturma — server-side fiyat hesaplama.
 *
 * Flow:
 * 1. Input doğrula (lib/validation/checkout — frontend ile aynı kurallar)
 *    Idempotency: aynı `idempotencyKey` ile daha önce sipariş açıldıysa yeni sipariş açılmaz, o döner
 *    (orders.idempotencyKey UNIQUE; içerik farklıysa 409)
 * 2. Her varyant için server'dan fiyat ve stok kontrol (Prisma)
 * 3. Kargo: Yurtiçi Kargo ücreti koli planı + tarifeyle (lib/shipping/quote) hesaplanır;
 *    hesaplanamıyorsa alıcı ödemeli (ayar açıksa) ya da sipariş açılmaz
 * 4. Ödeme yöntemi (kart / havale / kapıda ödeme) ayara ve tutar sınırına göre doğrulanır
 * 5. Toplam = ara toplam + kargo + yöntem ücreti (kapıda ödeme bedeli)
 * 6. DB'ye order kaydet (createOrder — transaction + stok düş)
 *    - kart: PENDING, 30 dk içinde ödenmezse iptal (lib/payment/reservation.ts); istemci /api/payment/create ile ödemeye geçer
 *    - havale: PENDING, ayardaki süre (varsayılan 48 sa) içinde ödenmezse iptal
 *    - kapıda ödeme: PROCESSING (kesin sipariş)
 * 7. orderId + sonraki adım (nextStep) döndür
 *
 * GÜVENLİK:
 * - Frontend fiyatı kullanılmaz
 * - Para değerleri kuruş (integer)
 * - Her variantId server'dan validate edilir
 */

import { NextRequest, NextResponse } from "next/server";
import { getVariantById, createOrder, releaseExpiredOrders } from "@/lib/repositories";
import { OutOfStockError, findOrderByIdempotencyKey } from "@/lib/repositories/order.repository";
import { checkoutRequestHash } from "@/lib/checkout/idempotency";
import type { BillingInfo, Order } from "@/types";
import { getShippingSettings } from "@/lib/shipping/shipping.repository";
import { getCurrentCustomer } from "@/lib/auth/session";
import { isQuoteFinal, quoteShipping, shippingModeOf, type ShippingLine } from "@/lib/shipping/quote";
import { getPaymentSettings } from "@/lib/payment/settings.repository";
import { availablePaymentOptions, isOptionAllowed } from "@/lib/payment/methods";
import { cardAvailabilityForRequest } from "@/lib/payment/availability";
import { cardPaymentDueAt } from "@/lib/payment/reservation";
import { clientIp } from "@/lib/security/rate-limit";
import { scheduleNotifications } from "@/lib/notifications/run";
import { CHECKOUT_CONSENT_DOCUMENTS, CHECKOUT_TERMS_VERSION, LEGAL_DOCUMENTS } from "@/lib/legal/documents";
import {
  type BillingInput,
  CheckoutSchema,
  CHECKOUT_MESSAGES,
  toFieldErrors,
} from "@/lib/validation/checkout";

/**
 * Hata yanıtı — müşteriye gösterilecek `error` her zaman kısa Türkçe metindir.
 * `code` frontend'in davranış seçmesi içindir (ör. sepete dön), gösterilmez.
 */
function fail(
  status: number,
  code: string,
  error: string,
  extra: Record<string, unknown> = {}
) {
  return NextResponse.json({ success: false, code, error, ...extra }, { status });
}

/** Başarılı yanıt — yeni sipariş ve aynı anahtarla tekrar gelen istek (replayed) aynı biçimde döner */
function orderResponse(order: Order, replayed: boolean) {
  // Sipariş e-postaları yanıt döndükten sonra (müşteri beklemez)
  if (!replayed) scheduleNotifications();
  return NextResponse.json({
    success: true,
    orderId: order.id,
    // "pay": kart ödemesini başlat (/api/payment/create); "order": sipariş sayfasına git (havale bilgisi / kapıda ödeme)
    nextStep: order.paymentMethod === "CARD" && order.status === "PENDING" ? "pay" : "order",
    order: {
      reference: order.reference,
      totalKurus: order.totalKurus,
      status: order.status,
      paymentMethod: order.paymentMethod,
    },
    ...(replayed ? { replayed: true } : {}),
  });
}

/** Doğrulanmış fatura girişi → siparişe yazılan fatura bilgisi (yoksa bireysel, teslimattaki ad-soyad) */
function billingInfoOf(billing: BillingInput | undefined, fullName: string): BillingInfo {
  if (!billing || billing.type === "INDIVIDUAL") {
    return {
      type: "INDIVIDUAL",
      name: fullName,
      sameAsShipping: billing?.sameAsShipping ?? true,
      ...(billing && !billing.sameAsShipping
        ? { address: billing.billingAddress, district: billing.billingDistrict, city: billing.billingCity }
        : {}),
    };
  }
  return {
    type: "CORPORATE",
    name: fullName,
    companyName: billing.companyName,
    taxOffice: billing.taxOffice,
    taxNumber: billing.taxNumber?.replace(/\s/g, ""),
    sameAsShipping: billing.sameAsShipping,
    ...(!billing.sameAsShipping
      ? { address: billing.billingAddress, district: billing.billingDistrict, city: billing.billingCity }
      : {}),
  };
}

// ── Handler ─────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "BAD_REQUEST", CHECKOUT_MESSAGES.orderFailed);
  }

  // Sözleşme onay alanı hiç yoksa istek bu sürümden önceki ödeme sayfasından geliyordur (onay kutusu yok)
  if (body && typeof body === "object" && !("acceptTerms" in body)) {
    return fail(409, "CLIENT_OUTDATED", CHECKOUT_MESSAGES.pageOutdated);
  }

  const parsed = CheckoutSchema.safeParse(body);
  if (!parsed.success) {
    const { fieldErrors, message } = toFieldErrors(parsed.error);
    return fail(400, "VALIDATION", message, { fieldErrors });
  }

  const { items, contact, shipping, paymentMethod, termsVersion, billing, note } = parsed.data;

  // ── Idempotency: aynı anahtarla gelen istek yeni sipariş açmaz, mevcut siparişi döndürür ──
  // Stok/fiyat kontrollerinden ÖNCE bakılır: ilk istek son ürünü almış olsa da tekrar aynı siparişi görür.
  // Son savunma hattı orders.idempotencyKey UNIQUE kısıtıdır (eşzamanlı istekler aşağıda yakalanır).
  const idempotencyKey = parsed.data.idempotencyKey ?? null;
  const idempotencyHash = idempotencyKey ? checkoutRequestHash(parsed.data) : null;
  const replay = async (): Promise<NextResponse | null> => {
    if (!idempotencyKey) return null;
    const existing = await findOrderByIdempotencyKey(idempotencyKey);
    if (!existing) return null;
    if (existing.idempotencyHash !== idempotencyHash) {
      return fail(409, "IDEMPOTENCY_CONFLICT", CHECKOUT_MESSAGES.idempotencyConflict);
    }
    if (existing.order.status === "CANCELLED" || existing.order.status === "REFUNDED") {
      return fail(409, "ORDER_CLOSED", CHECKOUT_MESSAGES.orderClosed, { reference: existing.order.reference });
    }
    return orderResponse(existing.order, true);
  };
  try {
    const replayed = await replay();
    if (replayed) return replayed;
  } catch (err) {
    console.error("[/api/checkout] idempotency lookup error:", err);
    return fail(503, "UNAVAILABLE", CHECKOUT_MESSAGES.serviceUnavailable);
  }

  // Müşterinin gördüğü sözleşme sürümü güncel değilse onay geçersiz: güncel metni onaylaması istenir
  if (termsVersion !== CHECKOUT_TERMS_VERSION) {
    return fail(409, "TERMS_OUTDATED", CHECKOUT_MESSAGES.termsOutdated, {
      fieldErrors: { acceptTerms: CHECKOUT_MESSAGES.termsOutdated },
    });
  }
  const consentAcceptedAt = new Date();
  const requestIp = clientIp(request.headers);

  // Süresi dolmuş ödenmemiş siparişlerin ayırdığı stoğu önce serbest bırak
  await releaseExpiredOrders().catch((err) =>
    console.error("[/api/checkout] releaseExpiredOrders:", err)
  );

  // ── Server-side fiyat ve stok doğrulaması ───────────────

  const orderItems: Array<{
    variantId: string;
    snapshotName: string;
    snapshotVariant: string;
    snapshotPrice: number;
    quantity: number;
    vatRateBps: number | null;
    discountKurus: number;
  }> = [];
  let subtotalKurus = 0;
  const shippingLines: ShippingLine[] = [];
  const stockErrors: string[] = [];

  for (const item of items) {
    let found: Awaited<ReturnType<typeof getVariantById>>;
    try {
      found = await getVariantById(item.variantId);
    } catch (err) {
      console.error("[/api/checkout] variant lookup error:", err);
      return fail(503, "UNAVAILABLE", CHECKOUT_MESSAGES.serviceUnavailable);
    }

    if (!found) {
      return fail(409, "PRODUCT_UNAVAILABLE", CHECKOUT_MESSAGES.productUnavailable);
    }

    const { product, variant } = found;

    if (!product.isPublished || !variant.isAvailable) {
      stockErrors.push(`${product.name} (${variant.name}) artık satışta değil.`);
      continue;
    }

    if (variant.priceKurus <= 0) {
      stockErrors.push(`${product.name} (${variant.name}) şu anda satışta değil.`);
      continue;
    }

    const maxQty = variant.stockQuantity ?? 0;
    if (item.quantity > maxQty) {
      stockErrors.push(
        maxQty > 0
          ? `${product.name} (${variant.name}) için en fazla ${maxQty} adet sipariş verebilirsiniz.`
          : `${product.name} (${variant.name}) şu anda stokta yok.`
      );
      continue;
    }

    // Kalem indirimi: şu an kampanya/kupon yok → 0 (alan snapshot'ta tutulur)
    const discountKurus = 0;
    const lineTotalKurus = variant.priceKurus * item.quantity - discountKurus;
    subtotalKurus += lineTotalKurus;

    orderItems.push({
      variantId: variant.id,
      snapshotName: product.name,      // Sipariş anı snapshot
      snapshotVariant: variant.name,   // Sipariş anı snapshot
      snapshotPrice: variant.priceKurus, // SERVER'DAN — frontend fiyatı değil
      quantity: item.quantity,
      vatRateBps: product.vatRateBps ?? null, // Katalogda yoksa boş — oran uydurulmaz
      discountKurus,
    });
    shippingLines.push({ sku: variant.sku, quantity: item.quantity });
  }

  if (stockErrors.length > 0) {
    return fail(409, "STOCK", stockErrors.join(" "), { details: stockErrors });
  }

  if (orderItems.length === 0) {
    return fail(400, "EMPTY", CHECKOUT_MESSAGES.productUnavailable);
  }

  // ── Kargo — Yurtiçi Kargo, ağırlık/desi ve paketlemeye göre SUNUCUDA hesaplanır ──
  let quote: Awaited<ReturnType<typeof quoteShipping>>;
  try {
    quote = await quoteShipping(
      { lines: shippingLines, subtotalKurus, destination: { city: shipping.city, district: shipping.district } },
      await getShippingSettings()
    );
  } catch (err) {
    console.error("[/api/checkout] shipping quote error:", err);
    return fail(503, "UNAVAILABLE", CHECKOUT_MESSAGES.serviceUnavailable);
  }
  if (!isQuoteFinal(quote)) {
    console.info(`[/api/checkout] kargo ücreti hesaplanamadı: ${quote.reason}${quote.skus ? ` (${quote.skus.join(", ")})` : ""}`);
    return fail(409, "SHIPPING_UNKNOWN", CHECKOUT_MESSAGES.shippingUnknown);
  }
  if (quote.status === "recipient") {
    console.info(`[/api/checkout] kargo alıcı ödemeli: ${quote.reason}${quote.skus ? ` (${quote.skus.join(", ")})` : ""}`);
  }
  const shippingKurus = quote.feeKurus;

  // ── Ödeme yöntemi — ayar + tutar sınırı SUNUCUDA kontrol edilir ──
  let paymentSettings: Awaited<ReturnType<typeof getPaymentSettings>>;
  try {
    paymentSettings = await getPaymentSettings();
  } catch (err) {
    console.error("[/api/checkout] payment settings error:", err);
    return fail(503, "UNAVAILABLE", CHECKOUT_MESSAGES.serviceUnavailable);
  }
  const option = availablePaymentOptions(paymentSettings, await cardAvailabilityForRequest()).find(
    (o) => o.id === paymentMethod && o.available
  );
  if (!option || !isOptionAllowed(option, subtotalKurus + shippingKurus)) {
    return fail(409, "PAYMENT_METHOD", CHECKOUT_MESSAGES.paymentMethodUnavailable, {
      fieldErrors: { paymentMethod: CHECKOUT_MESSAGES.paymentMethodUnavailable },
    });
  }
  const now = Date.now();
  const paymentDueAt =
    paymentMethod === "CARD"
      ? cardPaymentDueAt(now)
      : paymentMethod === "BANK_TRANSFER"
        ? new Date(now + paymentSettings.bankTransfer.paymentWindowHours * 3_600_000)
        : null;

  // Üye girişliyse sipariş hesaba bağlanır (Hesabım → Siparişlerim, "Satın aldı" rozeti)
  const customer = await getCurrentCustomer().catch(() => null);

  // ── Sipariş DB'ye yaz (transaction + stok düş) ───────────
  try {
    const order = await createOrder({
      userId: customer?.id ?? null,
      guestEmail: contact.email,
      guestName: `${contact.firstName} ${contact.lastName}`,
      guestPhone: contact.phone,
      shippingAddress: {
        firstName: contact.firstName,
        lastName: contact.lastName,
        phone: contact.phone,
        address: shipping.address,
        district: shipping.district,
        city: shipping.city,
        postalCode: shipping.postalCode,
        carrier: { id: quote.carrier.id, name: quote.carrier.name },
        shippingMode: shippingModeOf(quote),
        ...(quote.status === "priced" && {
          parcels: quote.parcels.map((p) => ({
            box: p.boxName,
            items: p.itemCount,
            grossGrams: p.grossGrams,
            desi: p.desi,
            billableDesi: p.billableDesi,
            feeKurus: p.feeKurus,
          })),
        }),
      },
      items: orderItems,
      billingInfo: billingInfoOf(billing, `${contact.firstName} ${contact.lastName}`),
      customerNote: note || null,
      subtotalKurus,
      shippingKurus,
      paymentMethod,
      paymentFeeKurus: option.feeKurus,
      paymentDueAt,
      initialStatus: paymentMethod === "CASH_ON_DELIVERY" ? "PROCESSING" : "PENDING",
      offlinePaymentProvider:
        paymentMethod === "BANK_TRANSFER" ? "havale" : paymentMethod === "CASH_ON_DELIVERY" ? "kapida" : undefined,
      consents: {
        documents: CHECKOUT_CONSENT_DOCUMENTS.map((document) => ({ document, version: LEGAL_DOCUMENTS[document].version })),
        acceptedAt: consentAcceptedAt,
        ipAddress: requestIp === "yerel" ? null : requestIp.slice(0, 64),
      },
      idempotencyKey,
      idempotencyHash,
    });

    return orderResponse(order, false);
  } catch (err) {
    // Aynı anahtarlı eşzamanlı istek önce yazdıysa: UNIQUE ihlali (P2002) ya da onun aldığı son stok
    // yüzünden stok hatası. Her iki durumda da o sipariş döndürülür, ikinci sipariş açılmaz.
    if (idempotencyKey) {
      const replayed = await replay().catch(() => null);
      if (replayed) return replayed;
    }
    if (err instanceof OutOfStockError) {
      return fail(409, "STOCK", err.userMessage, { details: [err.userMessage] });
    }
    console.error("[/api/checkout] createOrder error:", err);
    return fail(500, "ORDER_FAILED", CHECKOUT_MESSAGES.orderFailed);
  }
}
