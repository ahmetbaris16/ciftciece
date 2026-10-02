"use client";

/**
 * Ürün Detay — Sepete Ekle Bölümü (Client Component)
 *
 * Server component'dan ayrıştırıldı:
 * - Varyant seçimi (interaktif)
 * - Miktar seçimi
 * - Sepete ekle (cart context)
 */

import { useState, useCallback } from "react";
import { useCart } from "@/lib/cart/CartContext";
import { STORE } from "@/lib/config/store";
import { formatPrice } from "@/types";
import { unitPriceLabel } from "@/lib/catalog/unit-price";
import type { ProductVariant } from "@/types";
import styles from "./AddToCartSection.module.css";

interface ProductData {
  id: string;
  name: string;
  slug: string;
  primaryImageUrl: string | null;
  primaryImageAlt: string;
  variants: ProductVariant[];
}

export default function AddToCartSection({ product }: { product: ProductData }) {
  const { addItem } = useCart();
  const availableVariants = product.variants.filter((v) => v.isAvailable);

  const [selectedVariantId, setSelectedVariantId] = useState<string>(
    availableVariants[0]?.id ?? product.variants[0]?.id ?? ""
  );
  const [quantity, setQuantity] = useState(1);
  const [added, setAdded] = useState(false);

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

  return (
    <div className={styles.wrap}>
      {/* Variant Selector */}
      {product.variants.length > 1 && (
        <div className={styles.variantSection}>
          <p className={styles.label}>Miktar / Boyut</p>
          <div className={styles.variantGrid}>
            {product.variants.map((variant) => (
              <button
                key={variant.id}
                className={`${styles.variantBtn} ${
                  selectedVariantId === variant.id ? styles.variantSelected : ""
                } ${!variant.isAvailable ? styles.variantUnavailable : ""}`}
                onClick={() => setSelectedVariantId(variant.id)}
                disabled={!variant.isAvailable}
                aria-pressed={selectedVariantId === variant.id}
              >
                <span className={styles.variantName}>{variant.name}</span>
                {variant.priceKurus > 0 && (
                  <span className={styles.variantPrice}>
                    {formatPrice(variant.priceKurus)}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Price Display */}
      <div className={styles.priceDisplay}>
        {priceAvailable ? (
          <>
            <span className={styles.price}>
              {formatPrice(selectedVariant!.priceKurus)}
            </span>
            {unitPriceLabel(selectedVariant!.priceKurus, selectedVariant!.name) && (
              <span className={styles.unitPrice}>
                ({unitPriceLabel(selectedVariant!.priceKurus, selectedVariant!.name)})
              </span>
            )}
          </>
        ) : (
          <span className={styles.priceContact}>
            Fiyat için{" "}
            <a href={`tel:${STORE.contact.phone}`}>iletişime geçin</a>
          </span>
        )}
      </div>

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
            </span>
            <button
              className={styles.qtyBtn}
              onClick={() =>
                setQuantity((q) =>
                  Math.min(q + 1, selectedVariant?.stockQuantity ?? 99)
                )
              }
              aria-label="Artır"
              disabled={quantity >= (selectedVariant?.stockQuantity ?? 99)}
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
