/**
 * Arama Sonuçları Sayfası
 * /arama?q=...
 *
 * Server component — URL'den query alır, statik render
 */

import type { Metadata } from "next";
import Link from "next/link";
import ProductCard from "@/components/product/ProductCard";
import { searchProducts } from "@/lib/repositories";
import styles from "./page.module.css";

interface Props {
  searchParams: Promise<{ q?: string }>;
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const params = await searchParams;
  const q = params.q?.trim() ?? "";
  return {
    title: q ? `"${q}" için arama sonuçları` : "Arama",
    robots: { index: false, follow: false },
  };
}

export default async function AramaPage({ searchParams }: Props) {
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const results = query ? await searchProducts(query) : [];

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <h1 className="sr-only">{query ? `"${query}" için arama sonuçları` : "Ürün ara"}</h1>

        {/* Search form */}
        <form action="/arama" method="GET" className={styles.searchForm} role="search">
          <label htmlFor="search-input" className={styles.srOnly}>Ürün ara</label>
          <div className={styles.inputWrap}>
            <SearchIcon />
            <input
              id="search-input"
              name="q"
              type="search"
              defaultValue={query}
              placeholder="Ürün, kategori ara…"
              className={styles.input}
              autoFocus={!query}
            />
          </div>
          <button type="submit" className={styles.submitBtn}>Ara</button>
        </form>

        {/* Results */}
        {query ? (
          <>
            <p className={styles.resultCount}>
              {results.length > 0
                ? `"${query}" için ${results.length} sonuç bulundu`
                : `"${query}" için sonuç bulunamadı`}
            </p>

            {results.length > 0 ? (
              <div className={styles.grid}>
                {results.map((product) => {
                  const primaryImage = product.images[0] ?? null;
                  const primaryVariant = product.variants[0] ?? null;
                  return (
                    <ProductCard
                      key={product.slug}
                      slug={product.slug}
                      name={product.name}
                      variantName={primaryVariant?.name}
                      priceKurus={primaryVariant?.priceKurus ?? 0}
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
              <div className={styles.noResults}>
                <p>Aradığınız ürünü bulamadık.</p>
                <p>Tüm ürünlerimize göz atabilirsiniz:</p>
                <Link href="/urunler" className={styles.browseLink}>
                  Tüm Ürünleri Gör
                </Link>
              </div>
            )}
          </>
        ) : (
          <div className={styles.hint}>
            <p>Zeytin, zeytinyağı, turşu veya sabun arayabilirsiniz.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}
