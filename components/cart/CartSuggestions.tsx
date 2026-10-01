"use client";

/**
 * Sepete eklemeye değer ürünler — sepetteki ürünlerle birlikte iyi gidenler; ücretsiz kargoya
 * kalan tutar varsa onu tek başına tamamlayan ürünler öne alınır ("Kargo bedava olur").
 *
 * Liste `freezeKey` değişene kadar sabit kalır: hızlı eklenen ürün listeden kaybolmaz,
 * "Sepette" olarak işaretlenir (satır zıplamaz).
 */

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useCart } from "@/lib/cart/CartContext";
import { useShippingSettings } from "@/lib/shipping/useShippingSettings";
import { remainingForFreeShipping } from "@/lib/shipping/settings";
import { pickCartSuggestions, type CartSuggestion, type LiteProduct } from "@/lib/catalog/recommendations";
import { useLiteProducts } from "@/lib/catalog/useLiteProducts";
import { formatPrice } from "@/types";
import styles from "./CartSuggestions.module.css";

interface Props {
  freezeKey: string | number;
  limit?: number;
  /** Ürün bağlantısına tıklanınca (ör. paneli kapat) */
  onNavigate?: () => void;
  className?: string;
}

export default function CartSuggestions({ freezeKey, limit = 3, onNavigate, className }: Props) {
  const { cart, addItem } = useCart();
  const shipping = useShippingSettings();
  const catalog = useLiteProducts(true);
  const [snapshot, setSnapshot] = useState<{ key: string | number; list: CartSuggestion[] } | null>(null);

  const settings = shipping.status === "ready" ? shipping.settings : null;
  const remaining = settings ? remainingForFreeShipping(cart.subtotalKurus, settings) : 0;
  const inputsReady = catalog.status === "ready" && shipping.status !== "loading";

  // Öneriler freezeKey başına bir kez hesaplanır (React: önceki render'dan türetilen durum)
  if (inputsReady && (!snapshot || snapshot.key !== freezeKey)) {
    const products = (catalog as { products: LiteProduct[] }).products;
    const bySlug = new Map(products.map((p) => [p.slug, p]));
    const recentFirst = [...cart.items].reverse();
    const anchorCategories = [
      ...new Set(recentFirst.map((i) => bySlug.get(i.productSlug)?.categorySlug).filter((c): c is string => !!c)),
    ];
    setSnapshot({
      key: freezeKey,
      list: pickCartSuggestions(products, {
        inCart: cart.items.map((i) => i.productSlug),
        anchorCategories,
        remainingKurus: remaining,
        limit,
      }),
    });
  }

  const list = snapshot?.key === freezeKey ? snapshot.list : [];
  if (list.length === 0) return null;

  const inCart = new Set(cart.items.map((i) => i.variantId));

  const quickAdd = (p: CartSuggestion) => {
    if (!p.variant) return;
    addItem(
      {
        variantId: p.variant.id,
        productSlug: p.slug,
        productName: p.name,
        variantName: p.variant.name,
        priceKurus: p.variant.priceKurus,
        quantity: 1,
        imageUrl: p.imageUrl,
        imageAlt: p.imageAlt,
        isAvailable: true,
        maxQuantity: p.variant.stock,
      },
      { notify: false }
    );
  };

  return (
    <section className={`${styles.wrap} ${className ?? ""}`} aria-labelledby={`suggest-${freezeKey}`}>
      <h3 id={`suggest-${freezeKey}`} className={styles.title}>
        {remaining > 0 ? "Kargo bedava olsun" : "Bunlar da sofranıza yakışır"}
      </h3>
      {remaining > 0 && (
        <p className={styles.subtitle}>Sepetinize yakışan ürünlerle ücretsiz kargoya ulaşın.</p>
      )}
      <ul className={styles.list} role="list">
        {list.map((p) => {
          const added = !!p.variant && inCart.has(p.variant.id);
          return (
            <li key={p.slug} className={styles.item}>
              <Link href={`/urun/${p.slug}`} className={styles.thumb} onClick={onNavigate} tabIndex={-1} aria-hidden="true">
                <Image src={p.imageUrl} alt="" fill sizes="64px" quality={70} style={{ objectFit: "cover" }} />
              </Link>
              <div className={styles.info}>
                <Link href={`/urun/${p.slug}`} className={styles.name} onClick={onNavigate}>
                  {p.name}
                </Link>
                <span className={styles.meta}>
                  <span className={styles.price}>{formatPrice(p.variant!.priceKurus)}</span>
                  {p.closesGap && !added && <span className={styles.tag}>Kargo bedava olur</span>}
                </span>
              </div>
              <button
                type="button"
                className={`${styles.add} ${added ? styles.added : ""}`}
                onClick={() => quickAdd(p)}
                disabled={added}
                aria-label={added ? `${p.name} sepette` : `${p.name} sepete ekle`}
              >
                {added ? (
                  <>
                    <CheckIcon /> Sepette
                  </>
                ) : (
                  <>
                    <PlusIcon /> Ekle
                  </>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function PlusIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
