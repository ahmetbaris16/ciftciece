"use client";

/**
 * Ürün Detay — Sepete Ekle Bölümü (Client Component)
 *
 * Server component'dan ayrıştırıldı:
 * - Seçenek (varyant) seçimi; seçeneğe özel bilgi varsa seçeneklerin altında yazar, seçenekler arasında fiyat farkı
 *   varsa nedenini de (ör. kapak altı jelatin: "… kavanoz başına ₺150,00 daha fazladır"); seçenek değişince fiyat kısa
 *   bir an vurgulanır (lib/catalog/variant-notes.ts)
 * - Miktar seçimi: "+" / "−" ile gösterilen fiyat adetle birlikte değişir (toplam; altında "N adet × birim fiyat")
 * - Sepete ekle (cart context)
 * - İndirim sürüyorsa: "%X İndirim" etiketi, indirimli fiyat, üstü çizili eski fiyat ve kampanya tarihleri
 */

import { useState, useCallback } from "react";
import { useCart } from "@/lib/cart/CartContext";
import { STORE } from "@/lib/config/store";
import { formatPrice } from "@/types";
import { unitPriceLabel } from "@/lib/catalog/unit-price";
import { variantExplanation } from "@/lib/catalog/variant-notes";
import { discountPercentLabel, formatDiscountPeriod } from "@/lib/pricing/discount";
import type { ProductDiscountInfo, ProductVariant } from "@/types";
import styles from "./AddToCartSection.module.css";

interface ProductData {
  id: string;
  name: string;
  slug: string;
  primaryImageUrl: string | null;
  primaryImageAlt: string;
  variants: ProductVariant[];
  /** Süren indirim (varsa) */
  discount?: ProductDiscountInfo | null;
}

export default function AddToCartSection({ product }: { product: ProductData }) {
  const { addItem } = useCart();
  const availableVariants = product.variants.filter((v) => v.isAvailable);

  const [selectedVariantId, setSelectedVariantId] = useState<string>(
    availableVariants[0]?.id ?? product.variants[0]?.id ?? ""
  );
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);
  // Seçenek değişim sayısı: fiyat vurgusu yalnız değişimde oynar (sayfa açılışında değil)
  const [priceFlash, setPriceFlash] = useState(0);

  const selectedVariant = product.variants.find((v) => v.id === selectedVariantId);

  const handleAddToCart = useCallback(() => {
    if (!selectedVariant) return;
    if (selectedVariant.priceKurus <= 0) return;

    addItem({
      variantId: selectedVariant.id,
      productSlug: product.slug,
      productName: product.name,
      variantName: selectedVariant.name,
      priceKurus: selectedVariant.priceKurus,
      compareAtPriceKurus: selectedVariant.compareAtPriceKurus ?? null,
      quantity,
      imageUrl: product.primaryImageUrl ?? "/images/atmosphere/magaza-zeytin-tepsi.jpg",
      imageAlt: product.primaryImageAlt,
      isAvailable: selectedVariant.isAvailable,
      maxQuantity: selectedVariant.stockQuantity ?? 99,
    });

    setAdded(true);
    setTimeout(() => setAdded(false), 2000);
  }, [addItem, product, quantity, selectedVariant]);

  const priceAvailable = selectedVariant && selectedVariant.priceKurus > 0;
  const isAvailable = selectedVariant?.isAvailable ?? false;
  const compareAt =
    priceAvailable && selectedVariant!.compareAtPriceKurus && selectedVariant!.compareAtPriceKurus > selectedVariant!.priceKurus
      ? selectedVariant!.compareAtPriceKurus
      : null;
  const percent = compareAt ? discountPercentLabel(compareAt, selectedVariant!.priceKurus) : 0;
  const unitLabel = priceAvailable ? unitPriceLabel(selectedVariant!.priceKurus, selectedVariant!.name) : null;
  const explanation = selectedVariant ? variantExplanation(selectedVariant, product.variants) : null;
  const maxQuantity = selectedVariant?.stockQuantity ?? 99;

  // Seçenek değişince adet yeni seçeneğin stoğunu aşmasın; fiyat kısa bir an vurgulanır (değiştiği fark edilsin)
  const selectVariant = (variant: ProductVariant) => {
    if (variant.id === selectedVariantId) return;
    setSelectedVariantId(variant.id);
    setQuantity((q) => Math.max(1, Math.min(q, variant.stockQuantity ?? 99)));
    setPriceFlash((n) => n + 1);
  };

  return (
    <div className={styles.wrap}>
      {/* Variant Selector */}
      {product.variants.length > 1 && (
        <div className={styles.variantSection}>
          <p className={styles.label}>Seçenek</p>
          <div className={styles.variantGrid}>
            {product.variants.map((variant) => (
              <button
                key={variant.id}
                className={`${styles.variantBtn} ${
                  selectedVariantId === variant.id ? styles.variantSelected : ""
                } ${!variant.isAvailable ? styles.variantUnavailable : ""}`}
                onClick={() => selectVariant(variant)}
                disabled={!variant.isAvailable}
                aria-pressed={selectedVariantId === variant.id}
              >
                <span className={styles.variantName}>{variant.name}</span>
                {variant.priceKurus > 0 && (
                  <span className={`${styles.variantPrice} ${variant.compareAtPriceKurus ? styles.variantPriceSale : ""}`}>
                    {formatPrice(variant.priceKurus)}
                  </span>
                )}
              </button>
            ))}
          </div>
          {/* Seçilen seçeneğin bilgisi ve fiyat farkının nedeni; seçim değişince okunur */}
          {explanation && (
            <div className={styles.variantNote} aria-live="polite">
              <InfoIcon />
              <p>
                <strong data-testid="variant-note">{explanation.note}</strong>{" "}
                <span data-testid="variant-compare">{explanation.compare}</span>
              </p>
            </div>
          )}
        </div>
      )}

      {/* Fiyat (indirimde: etiket + indirimli fiyat + üstü çizili eski fiyat) */}
      {compareAt && percent > 0 && <span className={styles.saleBadge}>%{percent} İndirim</span>}
      {/* Birden çok adette fiyat = toplam (adet × birim fiyat); birim ve kg/L fiyatı altında yazar */}
      <div className={styles.priceDisplay} data-testid="product-price">
        {priceAvailable ? (
          <>
            <span
              key={priceFlash}
              className={`${styles.price} ${compareAt ? styles.priceSale : ""} ${priceFlash > 0 ? styles.priceFlash : ""}`}
            >
              {formatPrice(selectedVariant!.priceKurus * quantity)}
            </span>
            {compareAt && (
              <span className={styles.priceOriginal}>
                <span className="sr-only">İndirimden önceki fiyat: </span>
                {formatPrice(compareAt * quantity)}
              </span>
            )}
            {quantity === 1 && unitLabel && <span className={styles.unitPrice}>({unitLabel})</span>}
          </>
        ) : (
          <span className={styles.priceContact}>
            Fiyat için{" "}
            <a href={`tel:${STORE.contact.phone}`}>iletişime geçin</a>
          </span>
        )}
      </div>
      {priceAvailable && quantity > 1 && (
        <p className={styles.qtyNote} data-testid="product-price-breakdown">
          {quantity} adet × {formatPrice(selectedVariant!.priceKurus)}
          {unitLabel && <span className={styles.unitPrice}> ({unitLabel})</span>}
        </p>
      )}
      {compareAt && product.discount && (
        <p className={styles.saleNote}>
          İndirim {formatDiscountPeriod(product.discount.startsAt, product.discount.endsAt)} tarihleri arasında geçerlidir.
          Üstü çizili fiyat, ürünün indirimden önceki son 10 gündeki en düşük fiyatıdır.
        </p>
      )}

      {/* Quantity + Add to Cart */}
      {isAvailable && priceAvailable && (
        <div className={styles.addRow}>
          {/* Quantity selector */}
          <div className={styles.quantityWrap} role="group" aria-label="Adet seçimi">
            <button
              className={styles.qtyBtn}
              onClick={() => setQuantity((q) => Math.max(1, q - 1))}
              aria-label="Azalt"
              disabled={quantity <= 1}
            >
              −
            </button>
            <span className={styles.qtyValue} aria-live="polite" aria-atomic="true">
              {quantity}
              {priceAvailable && <span className="sr-only"> adet, toplam {formatPrice(selectedVariant!.priceKurus * quantity)}</span>}
            </span>
            <button
              className={styles.qtyBtn}
              onClick={() => setQuantity((q) => Math.min(q + 1, maxQuantity))}
              aria-label="Artır"
              disabled={quantity >= maxQuantity}
            >
              +
            </button>
          </div>

          {/* Add to cart button */}
          <button
            className={`${styles.addBtn} ${added ? styles.addBtnSuccess : ""}`}
            onClick={handleAddToCart}
            aria-label={`${product.name} sepete ekle`}
          >
            {added ? (
              <>
                <CheckIcon />
                <span>Sepete Eklendi</span>
              </>
            ) : (
              <>
                <CartIcon />
                <span>Sepete Ekle</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Stock out message */}
      {!isAvailable && (
        <p className={styles.stockOut}>Bu varyant şu an stokta bulunmuyor.</p>
      )}
    </div>
  );
}

function CartIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </svg>
  );
}

function InfoIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
