/**
 * Checkout API
 * POST /api/checkout
 *
 * Sipariş oluşturma — server-side fiyat hesaplama.
 *
 * Flow:
 * 1. Input doğrula (lib/validation/checkout — frontend ile aynı kurallar)
 * 2. Her varyant için server'dan fiyat ve stok kontrol (Prisma)
 * 3. Kargo: Yurtiçi Kargo ücreti koli planı + tarifeyle (lib/shipping/quote) hesaplanır;
 *    hesaplanamıyorsa alıcı ödemeli (ayar açıksa) ya da sipariş açılmaz
 * 4. Ödeme yöntemi (kart / havale / kapıda ödeme) ayara ve tutar sınırına göre doğrulanır
 * 5. Toplam = ara toplam + kargo + yöntem ücreti (kapıda ödeme bedeli)
 * 6. DB'ye order kaydet (createOrder — transaction + stok düş)
 *    - kart: PENDING, ~1 sa içinde ödenmezse iptal; istemci /api/payment/create ile ödemeye geçer
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
import { OutOfStockError } from "@/lib/repositories/order.repository";
import { getShippingSettings } from "@/lib/shipping/shipping.repository";
import { getCurrentCustomer } from "@/lib/auth/session";
import { isQuoteFinal, quoteShipping, shippingModeOf, type ShippingLine } from "@/lib/shipping/quote";
import { getPaymentSettings } from "@/lib/payment/settings.repository";
import { availablePaymentOptions, isOptionAllowed } from "@/lib/payment/methods";
import { isCardPaymentReady } from "@/lib/payment/provider";
import { PENDING_ORDER_TTL_MINUTES } from "@/lib/repositories/order.repository";
import {
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

// ── Handler ─────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return fail(400, "BAD_REQUEST", CHECKOUT_MESSAGES.orderFailed);
  }

  const parsed = CheckoutSchema.safeParse(body);
  if (!parsed.success) {
    const { fieldErrors, message } = toFieldErrors(parsed.error);
    return fail(400, "VALIDATION", message, { fieldErrors });
  }

  const { items, contact, shipping, paymentMethod } = parsed.data;

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
  const option = availablePaymentOptions(paymentSettings, isCardPaymentReady()).find((o) => o.id === paymentMethod);
  if (!option || !isOptionAllowed(option, subtotalKurus + shippingKurus)) {
    return fail(409, "PAYMENT_METHOD", CHECKOUT_MESSAGES.paymentMethodUnavailable, {
      fieldErrors: { paymentMethod: CHECKOUT_MESSAGES.paymentMethodUnavailable },
    });
  }
  const now = Date.now();
  const paymentDueAt =
    paymentMethod === "CARD"
      ? new Date(now + PENDING_ORDER_TTL_MINUTES * 60_000)
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
      subtotalKurus,
      shippingKurus,
      paymentMethod,
      paymentFeeKurus: option.feeKurus,
      paymentDueAt,
      initialStatus: paymentMethod === "CASH_ON_DELIVERY" ? "PROCESSING" : "PENDING",
      offlinePaymentProvider:
        paymentMethod === "BANK_TRANSFER" ? "havale" : paymentMethod === "CASH_ON_DELIVERY" ? "kapida" : undefined,
    });

    return NextResponse.json({
      success: true,
      orderId: order.id,
      // "pay": kart ödemesini başlat (/api/payment/create); "order": sipariş sayfasına git (havale bilgisi / kapıda ödeme)
      nextStep: paymentMethod === "CARD" ? "pay" : "order",
      order: {
        reference: order.reference,
        totalKurus: order.totalKurus,
        status: order.status,
        paymentMethod: order.paymentMethod,
      },
    });
  } catch (err) {
    if (err instanceof OutOfStockError) {
      return fail(409, "STOCK", err.userMessage, { details: [err.userMessage] });
    }
    console.error("[/api/checkout] createOrder error:", err);
    return fail(500, "ORDER_FAILED", CHECKOUT_MESSAGES.orderFailed);
  }
}
