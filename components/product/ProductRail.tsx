/**
 * Ürün sayfası altındaki ürün şeridi ("Sofranızı tamamlayın", "Benzer ürünler").
 * Mobilde yatay kaydırılır, masaüstünde 4'lü ızgara.
 */

import Link from "next/link";
import ProductCard from "./ProductCard";
import type { LiteProduct } from "@/lib/catalog/recommendations";
import styles from "./ProductRail.module.css";

interface Props {
  id?: string;
  eyebrow?: string;
  title: string;
  text?: string;
  products: LiteProduct[];
  more?: { href: string; label: string };
}

export default function ProductRail({ id, eyebrow, title, text, products, more }: Props) {
  if (products.length === 0) return null;
  const headingId = `${id ?? title}-heading`.replace(/\s+/g, "-");
  return (
    <section className={styles.section} aria-labelledby={headingId} id={id}>
      <div className={styles.container}>
        <div className={styles.head}>
          <div>
            {eyebrow && <span className="section-label">{eyebrow}</span>}
            <h2 id={headingId} className={styles.title}>
              {title}
            </h2>
            {text && <p className={styles.text}>{text}</p>}
          </div>
          {more && (
            <Link href={more.href} className={styles.more}>
              {more.label} →
            </Link>
          )}
        </div>
        <div className={styles.track}>
          {products.map((p) => (
            <div key={p.slug} className={styles.cell}>
              <ProductCard
                slug={p.slug}
                name={p.name}
                variantName={p.variant?.name}
                priceKurus={p.variant?.priceKurus ?? 0}
                imageUrl={p.imageUrl}
                imageAlt={p.imageAlt}
                isAvailable={!!p.variant}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
