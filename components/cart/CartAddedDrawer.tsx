"use client";

/**
 * "Sepete eklendi" paneli — ürün sepete eklenince sağdan (mobilde alttan) açılır.
 *
 * Müşteriye iki net yol sunar: "Ödemeye Geç" / "Sepete Git" ya da "Alışverişe devam et".
 * Altında ücretsiz kargo ilerlemesi ve eşiği tamamlamaya yardımcı öneriler (tek tıkla eklenir).
 * Erişilebilirlik: role=dialog, açılınca başlığa odaklanır, Tab panel içinde döner, Esc/arka plan kapatır,
 * kapanınca odak "Sepete Ekle" düğmesine geri döner. Sayfa değişince kendiliğinden kapanır.
 */

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import { useCart } from "@/lib/cart/CartContext";
import { useShippingSettings } from "@/lib/shipping/useShippingSettings";
import { formatPrice } from "@/types";
import FreeShippingProgress from "./FreeShippingProgress";
import CartSuggestions from "./CartSuggestions";
import styles from "./CartAddedDrawer.module.css";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export default function CartAddedDrawer() {
  const { addedNotice, dismissAddedNotice, cart } = useCart();
  const shipping = useShippingSettings();
  const pathname = usePathname();
  const panelRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const openedOnPathRef = useRef<string | null>(null);

  const open = !!addedNotice;

  // Sayfa değişince kapan (Sepete Git / Ödemeye Geç / öneri ürününe tıklama)
  useEffect(() => {
    if (!open) {
      openedOnPathRef.current = null;
      return;
    }
    if (openedOnPathRef.current === null) openedOnPathRef.current = pathname;
    else if (openedOnPathRef.current !== pathname) dismissAddedNotice();
  }, [open, pathname, dismissAddedNotice]);

  // Açılış: odak, kaydırma kilidi, Esc ve Tab döngüsü
  useEffect(() => {
    if (!open) return;
    returnFocusRef.current = document.activeElement as HTMLElement | null;
    headingRef.current?.focus({ preventScroll: true });

    const root = document.documentElement;
    const prevOverflow = root.style.overflow;
    root.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        dismissAddedNotice();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === headingRef.current)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
      root.style.overflow = prevOverflow;
      const back = returnFocusRef.current;
      if (back && document.contains(back)) back.focus({ preventScroll: true });
    };
  }, [open, dismissAddedNotice]);

  if (!addedNotice) return null;

  const { item, addedQuantity, key } = addedNotice;
  const inCart = cart.items.find((i) => i.variantId === item.variantId);
  const settings = shipping.status === "ready" ? shipping.settings : null;

  return (
    <div className={styles.root}>
      <div className={styles.backdrop} onClick={dismissAddedNotice} aria-hidden="true" />
      <div
        ref={panelRef}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cart-added-title"
      >
        <div className={styles.handle} aria-hidden="true" />

        <header className={styles.header}>
          <span className={styles.check} aria-hidden="true">
            <CheckIcon />
          </span>
          <h2 id="cart-added-title" ref={headingRef} tabIndex={-1} className={styles.title}>
            Sepete eklendi
          </h2>
          <button type="button" className={styles.close} onClick={dismissAddedNotice} aria-label="Kapat">
            <CloseIcon />
          </button>
        </header>

        <div className={styles.body}>
          {/* Eklenen ürün */}
          <div className={styles.product} key={key}>
            <div className={styles.productImage}>
              <Image src={item.imageUrl} alt="" fill sizes="80px" quality={75} style={{ objectFit: "contain" }} />
            </div>
            <div className={styles.productInfo}>
              <p className={styles.productName}>{item.productName}</p>
              <p className={styles.productMeta}>
                {item.variantName} · {addedQuantity} adet eklendi
                {inCart && inCart.quantity > addedQuantity ? ` (sepette ${inCart.quantity})` : ""}
              </p>
              <p className={styles.productPrice}>{formatPrice(item.priceKurus * addedQuantity)}</p>
            </div>
          </div>

          {/* Sepet özeti + ücretsiz kargo */}
          <div className={styles.summary}>
            <div className={styles.summaryRow}>
              <span>
                Sepetinizde <strong>{cart.itemCount}</strong> ürün
              </span>
              <span className={styles.subtotal}>
                <span className={styles.subtotalLabel}>Ara toplam</span> {formatPrice(cart.subtotalKurus)}
              </span>
            </div>
            <FreeShippingProgress subtotalKurus={cart.subtotalKurus} settings={settings} />
          </div>

          {/* Yollar */}
          <div className={styles.actions}>
            <Link href="/odeme" className={styles.primary}>
              Ödemeye Geç
              <ArrowIcon />
            </Link>
            <Link href="/sepet" className={styles.secondary}>
              Sepete Git ({cart.itemCount})
            </Link>
            <button type="button" className={styles.continue} onClick={dismissAddedNotice}>
              Alışverişe devam et
            </button>
          </div>

          {/* Kargo bedava olsun diye öneriler */}
          <CartSuggestions freezeKey={key} className={styles.suggestions} />
        </div>
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}
