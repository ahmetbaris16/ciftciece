/**
 * Tüm Ürünler Sayfası
 * /urunler
 *
 * - Kategori filtresi
 * - Ürün grid'i
 * - Server component — statik render, hızlı
 */

import type { Metadata } from "next";
import Link from "next/link";
import ProductCard from "@/components/product/ProductCard";
import { getAllProducts, getAllCategories } from "@/lib/repositories";
import { STORE } from "@/lib/config/store";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Tüm Ürünler",
  description: `${STORE.name}'in tüm ürünleri: zeytinyağı, zeytin, turşu ve doğal sabunlar. Orhangazi'den sofranıza.`,
};

interface Props {
  searchParams: Promise<{ kategori?: string }>;
}

export default async function UrunlerPage({ searchParams }: Props) {
  const params = await searchParams;
  const activeCategory = params.kategori;

  const categories = await getAllCategories();
  const products = await getAllProducts(activeCategory);

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        {/* Page Header */}
        <div className={styles.pageHeader}>
          <h1 className={styles.title}>Ürünlerimiz</h1>
          <p className={styles.subtitle}>
            Orhangazi Zeytinciler Çarşısı&apos;nın en taze ürünleri
          </p>
        </div>

        {/* Category Filter */}
        <nav className={styles.filterNav} aria-label="Kategori filtresi">
          <Link
            href="/urunler"
            className={`${styles.filterBtn} ${!activeCategory ? styles.filterActive : ""}`}
          >
            Tümü
          </Link>
          {categories.map((cat) => (
            <Link
              key={cat.slug}
              href={`/urunler?kategori=${cat.slug}`}
              className={`${styles.filterBtn} ${activeCategory === cat.slug ? styles.filterActive : ""}`}
            >
              {cat.name}
            </Link>
          ))}
        </nav>

        {/* Product Grid */}
        {products.length > 0 ? (
          <div className={styles.grid}>
            {products.map((product) => {
              const primaryImage = product.images[0] ?? null;
              const primaryVariant = product.variants[0] ?? null;
              return (
                <ProductCard
                  key={product.slug}
                  slug={product.slug}
                  name={product.name}
                  variantName={primaryVariant?.name}
                  priceKurus={primaryVariant?.priceKurus ?? 0}
                  originalPriceKurus={primaryVariant?.compareAtPriceKurus}
                  imageUrl={
                    primaryImage?.url ??
                    "/images/atmosphere/magaza-zeytin-tepsi.jpg"
                  }
                  imageAlt={primaryImage?.altText ?? product.name}
                  isAvailable={primaryVariant?.isAvailable ?? true}
                />
              );
            })}
          </div>
        ) : (
          <div className={styles.empty}>
            <p>Bu kategoride henüz ürün bulunmuyor.</p>
            <Link href="/urunler" className={styles.resetLink}>
              Tüm ürünleri gör
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
