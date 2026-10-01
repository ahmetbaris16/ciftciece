import Link from "next/link";
import ProductCard from "@/components/product/ProductCard";
import { getFeaturedProducts } from "@/lib/repositories";
import styles from "./FeaturedProducts.module.css";

export default async function FeaturedProducts() {
  let products: Awaited<ReturnType<typeof getFeaturedProducts>>;
  try {
    products = await getFeaturedProducts(4);
  } catch (err) {
    // Ana sayfanın tamamını düşürmemek için bu bölüm gizlenir — hata loglanır.
    console.error("[home] Öne çıkan ürünler yüklenemedi:", err);
    return null;
  }
  if (products.length === 0) return null;

  return (
    <section className={styles.section} aria-labelledby="featured-heading">
      <div className={styles.container}>
        <div className={styles.header}>
          <div>
            <span className="section-label">Öne Çıkanlar</span>
            <h2 className="section-title" id="featured-heading">
              Çok Tercih Edilenler
            </h2>
          </div>
          <Link href="/urunler" className={styles.viewAll}>
            Tümünü Gör →
          </Link>
        </div>

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
                imageUrl={primaryImage?.url ?? "/images/atmosphere/magaza-zeytin-tepsi.jpg"}
                imageAlt={primaryImage?.altText ?? product.name}
                isAvailable={primaryVariant?.isAvailable ?? true}
              />
            );
          })}
        </div>
      </div>
    </section>
  );
}
