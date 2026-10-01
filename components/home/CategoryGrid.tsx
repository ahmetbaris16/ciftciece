import Image from "next/image";
import Link from "next/link";
import { getAllCategories, getPublishedProductCounts } from "@/lib/repositories";
import styles from "./CategoryGrid.module.css";

/**
 * Kategori kartları — DB'deki yayındaki kategorilerden üretilir.
 * Görsel, kategorinin kendi görseli (admin/katalogdan) → kart ile içerik her zaman eşleşir.
 * Ürünü olmayan kategori gösterilmez. Sona "Tüm Ürünler" kartı eklenir.
 */

async function getCategoryCards() {
  const [categories, counts] = await Promise.all([getAllCategories(), getPublishedProductCounts()]);
  return categories
    .map((c) => ({ ...c, count: counts.get(c.id) ?? 0 }))
    .filter((c) => c.count > 0 && c.imageUrl);
}

export default async function CategoryGrid() {
  let cards: Awaited<ReturnType<typeof getCategoryCards>>;
  try {
    cards = await getCategoryCards();
  } catch (err) {
    console.error("[home] Kategoriler yüklenemedi:", err);
    return null;
  }
  if (cards.length === 0) return null;

  return (
    <section className={styles.section} aria-labelledby="categories-heading">
      <div className={styles.container}>
        <div className={styles.header}>
          <span className="section-label">Kategoriler</span>
          <h2 className="section-title" id="categories-heading">
            Ne arıyorsunuz?
          </h2>
        </div>

        <div className={styles.grid}>
          {cards.map((cat, index) => (
            <Link
              key={cat.id}
              href={`/kategori/${cat.slug}`}
              className={styles.card}
              style={{ "--card-index": index } as React.CSSProperties}
            >
              <div className={styles.imageWrap}>
                <Image
                  src={cat.imageUrl as string}
                  alt=""
                  fill
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                  quality={80}
                  className={styles.image}
                  style={{ objectFit: "cover" }}
                />
                <div className={styles.overlay} aria-hidden="true" />
              </div>
              <div className={styles.cardContent}>
                <h3 className={styles.cardName}>{cat.name}</h3>
                <p className={styles.cardDesc}>{cat.count} ürün</p>
                <span className={styles.cardCta} aria-hidden="true">
                  İncele →
                </span>
              </div>
            </Link>
          ))}

          <Link href="/urunler" className={`${styles.card} ${styles.allCard}`}>
            <div className={styles.cardContent}>
              <h3 className={styles.cardName}>Tüm Ürünler</h3>
              <p className={styles.cardDesc}>Mağazadaki tüm ürünleri görün</p>
              <span className={styles.cardCta} aria-hidden="true">
                Göz at →
              </span>
            </div>
          </Link>
        </div>
      </div>
    </section>
  );
}
