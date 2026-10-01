"use client";

/**
 * Sepet Sayfası
 * /sepet
 *
 * localStorage sepet state'ini okur ve gösterir.
 * Kargo: Yurtiçi Kargo; ücret sunucudan (sepetin ağırlık/desisi) gelir, bilinmiyorsa rakam gösterilmez.
 */

import Link from "next/link";
import Image from "next/image";
import { useCart } from "@/lib/cart/CartContext";
import { formatPrice } from "@/types";
import { useShippingSettings } from "@/lib/shipping/useShippingSettings";
import { useShippingQuote } from "@/lib/shipping/useShippingQuote";
import { RECIPIENT_PAYS_NOTE, SHIPPING_BASIS_NOTE } from "@/lib/shipping/quote";
import FreeShippingProgress from "@/components/cart/FreeShippingProgress";
import CartSuggestions from "@/components/cart/CartSuggestions";
import styles from "./page.module.css";

// Not: Client component olduğu için metadata export burada çalışmaz.
// metadata için ayrı bir layout veya page.metadata.ts gerekir.
// Bu nedenle title <head> tag'inden yönetilecek (next.js metadata default'u kullanır).

export default function SepetPage() {
  const { cart, removeItem, updateQuantity, isHydrated } = useCart();
  const shippingState = useShippingSettings();
  const shippingSettings = shippingState.status === "ready" ? shippingState.settings : null;
  const quoteState = useShippingQuote(cart.items);
  const quote = quoteState.status === "ready" ? quoteState.quote : null;

  if (!isHydrated) {
    return (
      <div className={styles.page}>
        <div className={styles.container}>
          <div className={styles.loading}>Sepet yükleniyor…</div>
        </div>
      </div>
    );
  }

  const isEmpty = cart.items.length === 0;
  const recipientPays = quote?.status === "recipient";
  const shippingKnown = quote?.status === "free" || quote?.status === "priced" || recipientPays;
  const shippingKurus = quote && quote.status !== "unknown" ? quote.feeKurus : 0;
  const shippingLabel =
    quoteState.status === "loading"
      ? "Hesaplanıyor…"
      : !quote || quote.status === "unknown"
        ? "Hesaplanamadı"
        : quote.status === "free"
          ? "Ücretsiz"
          : quote.status === "recipient"
            ? "Teslimatta ödenir"
            : formatPrice(quote.feeKurus);

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <h1 className={styles.title}>Sepetim</h1>

        {isEmpty ? (
          <div className={styles.empty}>
            <EmptyCartIcon />
            <p className={styles.emptyText}>Sepetiniz boş</p>
            <p className={styles.emptySubText}>
              Ürünleri keşfetmeye başlayın
            </p>
            <Link href="/urunler" className={styles.browseBtn}>
              Ürünlere Git
            </Link>
          </div>
        ) : (
          <div className={styles.layout}>
            {/* Items */}
            <div className={styles.itemsSection}>
              <ul className={styles.itemList} role="list">
                {cart.items.map((item) => (
                  <li key={item.variantId} className={styles.item}>
                    {/* Görsel */}
                    <Link
                      href={`/urun/${item.productSlug}`}
                      className={styles.itemImageLink}
                    >
                      <div className={styles.itemImage}>
                        <Image
                          src={item.imageUrl}
                          alt={item.imageAlt}
                          fill
                          sizes="96px"
                          quality={70}
                          style={{ objectFit: "cover" }}
                        />
                      </div>
                    </Link>

                    {/* Info */}
                    <div className={styles.itemInfo}>
                      <div className={styles.itemMeta}>
                        <Link
                          href={`/urun/${item.productSlug}`}
                          className={styles.itemName}
                        >
                          {item.productName}
                        </Link>
                        <span className={styles.itemVariant}>
                          {item.variantName}
                        </span>
                      </div>

                      <div className={styles.itemControls}>
                        {/* Miktar */}
                        <div
                          className={styles.qtyWrap}
                          role="group"
                          aria-label={`${item.productName} adedi`}
                        >
                          <button
                            className={styles.qtyBtn}
                            onClick={() =>
                              updateQuantity(item.variantId, item.quantity - 1)
                            }
                            aria-label="Azalt"
                          >
                            −
                          </button>
                          <span className={styles.qtyVal}>{item.quantity}</span>
                          <button
                            className={styles.qtyBtn}
                            onClick={() =>
                              updateQuantity(item.variantId, item.quantity + 1)
                            }
                            aria-label="Artır"
                            disabled={
                              item.quantity >= (item.maxQuantity ?? 99)
                            }
                          >
                            +
                          </button>
                        </div>

                        {/* Fiyat */}
                        <span className={styles.itemPrice}>
                          {formatPrice(item.priceKurus * item.quantity)}
                        </span>

                        {/* Sil */}
                        <button
                          className={styles.removeBtn}
                          onClick={() => removeItem(item.variantId)}
                          aria-label={`${item.productName} sepetten çıkar`}
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              {/* Kargo bedava olsun diye / sepete yakışanlar */}
              <CartSuggestions freezeKey="sepet" limit={4} className={styles.suggestions} />
            </div>

            {/* Order Summary */}
            <div className={styles.summarySection}>
              <div className={styles.summaryCard}>
                <h2 className={styles.summaryTitle}>Sipariş Özeti</h2>

                <div className={styles.summaryRows}>
                  <div className={styles.summaryRow}>
                    <span>Ara Toplam</span>
                    <span>{formatPrice(cart.subtotalKurus)}</span>
                  </div>
                  <div className={styles.summaryRow}>
                    <span>Kargo firması</span>
                    <span>{quote?.carrierName ?? shippingSettings?.carrierName ?? "Yurtiçi Kargo"}</span>
                  </div>
                  <div className={styles.summaryRow}>
                    <span>Kargo ücreti</span>
                    <span
                      className={shippingKnown ? (quote?.status === "free" ? styles.shippingFree : undefined) : styles.shippingNote}
                      aria-live="polite"
                    >
                      {shippingLabel}
                    </span>
                  </div>
                  <p className={styles.shippingBasis}>
                    {SHIPPING_BASIS_NOTE}
                    {recipientPays && <> {RECIPIENT_PAYS_NOTE}</>}
                  </p>
                </div>

                <div className={styles.freeShipNote}>
                  <FreeShippingProgress subtotalKurus={cart.subtotalKurus} settings={shippingSettings} />
                </div>

                <div className={styles.summaryTotal}>
                  <span>Genel Toplam</span>
                  {/* Kargo ücreti bilinmeden genel toplam uydurulmaz */}
                  <span>
                    {shippingKnown
                      ? formatPrice(cart.subtotalKurus + shippingKurus)
                      : `${formatPrice(cart.subtotalKurus)} + kargo`}
                  </span>
                </div>

                <Link href="/odeme" className={styles.checkoutBtn}>
                  Ödemeye Geç
                </Link>

                <Link href="/urunler" className={styles.continueLink}>
                  Alışverişe Devam Et
                </Link>

                {/* Trust */}
                <div className={styles.trust}>
                  <span>🔒 Güvenli ödeme</span>
                  <span>Siparişiniz güvende</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function EmptyCartIcon() {
  return (
    <svg
      width="64"
      height="64"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={styles.emptyIcon}
    >
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}
