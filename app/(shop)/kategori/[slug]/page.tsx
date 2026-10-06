/**
 * Kategori Sayfası
 * /kategori/[slug]
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import ProductCard from "@/components/product/ProductCard";
import { getCategoryBySlug, getAllProducts, getAllCategories } from "@/lib/repositories";
import styles from "./page.module.css";

interface Props {
  params: Promise<{ slug: string }>;
}

export const dynamicParams = true;
// Fiyat/stok/görsel değişiklikleri en geç 60 sn'de yansır (admin ayrıca revalidatePath çağırır)
export const revalidate = 60;

export async function generateStaticParams() {
  try {
    const categories = await getAllCategories();
    return categories.map((c) => ({ slug: c.slug }));
  } catch (err) {
    // Build sırasında DB'ye ulaşılamazsa sayfalar ilk istekte üretilir
    console.warn("[build] generateStaticParams: DB'ye ulaşılamadı, sayfalar istek anında üretilecek.", err instanceof Error ? err.message : err);
    return [];
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) return {};
  return {
    title: category.name,
    description: category.description ?? `${category.name} ürünleri — Çiftçi Ece`,
  };
}

export default async function KategoriPage({ params }: Props) {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);

  if (!category) {
    notFound();
  }

  const products = await getAllProducts(slug);
  const allCategories = await getAllCategories();

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        {/* Breadcrumb */}
        <nav className={styles.breadcrumb} aria-label="Sayfa yolu">
          <Link href="/">Ana Sayfa</Link>
          <span aria-hidden="true"> / </span>
          <Link href="/urunler">Ürünler</Link>
          <span aria-hidden="true"> / </span>
          <span aria-current="page">{category.name}</span>
        </nav>

        {/* Page Header */}
        <div className={styles.pageHeader}>
          <h1 className={styles.title}>{category.name}</h1>
          {category.description && (
            <p className={styles.description}>{category.description}</p>
          )}
          <p className={styles.count}>{products.length} ürün</p>
        </div>

        {/* Category Tabs */}
        <nav className={styles.filterNav} aria-label="Kategori filtresi">
          <Link
            href="/urunler"
            className={styles.filterBtn}
          >
            Tümü
          </Link>
          {allCategories.map((cat) => (
            <Link
              key={cat.slug}
              href={`/kategori/${cat.slug}`}
              className={`${styles.filterBtn} ${cat.slug === slug ? styles.filterActive : ""}`}
            >
              {cat.name}
            </Link>
          ))}
        </nav>

        {/* Products */}
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
          </div>
        )}
      </div>
    </div>
  );
}
