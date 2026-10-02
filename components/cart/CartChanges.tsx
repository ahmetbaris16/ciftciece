"use client";

/** Sepet eşitlemesinde değişenleri söyler (çıkarılan ürün, güncellenen fiyat/adet). */

import { useCart } from "@/lib/cart/CartContext";
import styles from "./CartChanges.module.css";

export default function CartChanges({ className }: { className?: string }) {
  const { cartChanges, dismissCartChanges } = useCart();
  if (cartChanges.length === 0) return null;

  return (
    <div className={`${styles.box} ${className ?? ""}`} role="status" aria-live="polite">
      <div className={styles.body}>
        <p className={styles.title}>Sepetiniz güncellendi</p>
        <ul className={styles.list}>
          {cartChanges.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      </div>
      <button type="button" className={styles.dismiss} onClick={dismissCartChanges}>
        Tamam
      </button>
    </div>
  );
}
