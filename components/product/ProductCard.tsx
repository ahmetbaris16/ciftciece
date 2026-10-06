import Image from "next/image";
import Link from "next/link";
import styles from "./ProductCard.module.css";
import { unitPriceLabel } from "@/lib/catalog/unit-price";

export interface ProductCardProps {
  slug: string;
  name: string;
  variantName?: string;
  priceKurus: number; // 0 = fiyat girilmemiş
  originalPriceKurus?: number; // indirimli fiyat varsa
  imageUrl: string;
  imageAlt: string;
  isAvailable?: boolean;
}

/**
 * Kuruş → TL formatla (örn. 12500 → "125,00 ₺")
 */
function formatPrice(kurus: number): string {
  const lira = kurus / 100;
  return lira.toLocaleString("tr-TR", {
    style: "currency",
    currency: "TRY",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function ProductCard({
  slug,
  name,
  variantName,
  priceKurus,
  originalPriceKurus,
  imageUrl,
  imageAlt,
  isAvailable = true,
}: ProductCardProps) {
  const hasDiscount =
    originalPriceKurus != null && originalPriceKurus > priceKurus;
  const priceAvailable = priceKurus > 0;
  const unitLabel = priceAvailable && variantName ? unitPriceLabel(priceKurus, variantName) : null;

  return (
    <article className={styles.card}>
      <Link
        href={`/urun/${slug}`}
        className={styles.imageLink}
        tabIndex={-1}
        aria-hidden="true"
      >
        <div className={styles.imageWrap}>
          <Image
            src={imageUrl}
            alt={imageAlt}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            quality={80}
            className={styles.image}
            style={{ objectFit: "contain" }}
            loading="lazy"
          />
          {!isAvailable && (
            <div className={styles.unavailableBadge} aria-label="Stokta yok">
              Stok Dışı
            </div>
          )}
        </div>
      </Link>

      <div className={styles.body}>
        {variantName && (
          <span className={styles.variant}>{variantName}</span>
        )}

        <h3 className={styles.name}>
          <Link href={`/urun/${slug}`} className={styles.nameLink}>
            {name}
          </Link>
        </h3>

        <div className={styles.footer}>
          <div className={styles.priceWrap}>
            {priceAvailable ? (
              <>
                <span
                  className={`${styles.price} ${hasDiscount ? styles.priceSale : ""}`}
                >
                  {formatPrice(priceKurus)}
                </span>
                {hasDiscount && originalPriceKurus != null && (
                  <span className={styles.priceOriginal}>
                    {formatPrice(originalPriceKurus)}
                  </span>
                )}
                {unitLabel && <span className={styles.unitPrice}>{unitLabel}</span>}
              </>
            ) : (
              <span className={styles.priceUnknown}>Fiyat için irtibata geçin</span>
            )}
          </div>

          {isAvailable && priceAvailable && (
            <Link
              href={`/urun/${slug}`}
              className={styles.addBtn}
              aria-label={`${name} — ürün sayfasına git`}
            >
              <PlusIcon />
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}

function PlusIcon() {
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
      <path d="M5 12h14M12 5v14" />
    </svg>
  );
}
