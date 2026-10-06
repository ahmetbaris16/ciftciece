/**
 * Ürün Detay Sayfası
 * /urun/[slug]
 *
 * Üst: fotoğraflar (kırpılmadan; fareyle/dokunarak yakınlaştırma) + ad, puan özeti, kısa açıklama, varyant/adet,
 *      sepete ekle (eklenince "Sepete eklendi" paneli açılır)
 * Bölüm menüsü (yapışkan): Ürün Açıklaması · Değerlendirmeler · Teslimat ve İade
 * Alt: "Sofranızı tamamlayın" (tamamlayıcı kategoriler) ve "Benzer ürünler" şeritleri
 * Yapısal veri: Product (+ onaylı değerlendirme varsa aggregateRating)
 */

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getProductBySlug, getAllProducts } from "@/lib/repositories";
import { emptySummary, getProductReviews } from "@/lib/repositories/product-review.repository";
import { getShippingSettings } from "@/lib/shipping/shipping.repository";
import { DEFAULT_SHIPPING_SETTINGS } from "@/lib/shipping/settings";
import { STORE } from "@/lib/config/store";
import { formatPrice } from "@/types";
import { getProductGuide } from "@/lib/catalog/product-guides";
import { pickComplementary, pickSimilar, toLiteProduct } from "@/lib/catalog/recommendations";
import AddToCartSection from "@/components/product/AddToCartSection";
import ProductGallery from "@/components/product/ProductGallery";
import ProductReviews from "@/components/product/ProductReviews";
import ProductRail from "@/components/product/ProductRail";
import ProductSectionNav from "@/components/product/ProductSectionNav";
import RatingStars from "@/components/product/RatingStars";
import styles from "./page.module.css";

interface Props {
  params: Promise<{ slug: string }>;
}

// DB yoksa boş array — sayfa runtime'da dynamic olarak serve edilir
export const dynamicParams = true;
// Fiyat/stok/görsel değişiklikleri en geç 60 sn'de yansır (admin ayrıca revalidatePath çağırır)
export const revalidate = 60;

export async function generateStaticParams() {
  try {
    const products = await getAllProducts();
    return products.map((p) => ({ slug: p.slug }));
  } catch (err) {
    // Build sırasında DB'ye ulaşılamazsa sayfalar ilk istekte üretilir
    console.warn("[build] generateStaticParams: DB'ye ulaşılamadı, sayfalar istek anında üretilecek.", err instanceof Error ? err.message : err);
    return [];
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return {};

  const primaryImage = product.images[0];

  return {
    title: product.name,
    description:
      product.description ??
      `${product.name} — ${STORE.name}'in ${product.category.name} kategorisinden seçkin ürün.`,
    openGraph: {
      title: product.name,
      description: product.description ?? undefined,
      images: primaryImage ? [{ url: primaryImage.url }] : [],
    },
  };
}

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export default async function UrunDetayPage({ params }: Props) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);

  if (!product) {
    notFound();
  }

  // Değerlendirme/kargo/öneri verisi gelmezse sayfa yine açılır (hata loglanır, bölüm boş kalır)
  const [reviewData, shipping, allProducts] = await Promise.all([
    getProductReviews(product.id).catch((err) => {
      console.error("[urun] Değerlendirmeler yüklenemedi:", err);
      return { reviews: [], summary: emptySummary() };
    }),
    getShippingSettings().catch((err) => {
      console.error("[urun] Kargo ayarları yüklenemedi:", err);
      return DEFAULT_SHIPPING_SETTINGS;
    }),
    getAllProducts().catch((err) => {
      console.error("[urun] Öneriler yüklenemedi:", err);
      return [];
    }),
  ]);

  const { reviews, summary } = reviewData;
  const primaryImage = product.images[0] ?? null;
  const lite = toLiteProduct(product);
  const catalog = allProducts.map(toLiteProduct);
  const complementary = pickComplementary(lite, catalog, 4);
  const similar = pickSimilar(lite, catalog, 4);
  const guide = getProductGuide(product.slug, product.category.slug);
  const buyable = product.variants.filter((v) => v.isAvailable && v.priceKurus > 0);
  const skus = product.variants.map((v) => v.sku).filter(Boolean);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description ?? undefined,
    image: product.images.map((i) => `${SITE_URL}${i.url}`),
    sku: skus[0] ?? undefined,
    category: product.category.name,
    offers: buyable.map((v) => ({
      "@type": "Offer",
      name: v.name,
      sku: v.sku ?? undefined,
      price: (v.priceKurus / 100).toFixed(2),
      priceCurrency: "TRY",
      // İndirimli fiyat kampanya bitişine kadar geçerli
      ...(v.compareAtPriceKurus && product.discount ? { priceValidUntil: product.discount.endsAt.slice(0, 10) } : {}),
      availability:
        (v.stockQuantity ?? 0) > 0 ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      url: `${SITE_URL}/urun/${product.slug}`,
      seller: { "@type": "Organization", name: STORE.name },
    })),
    ...(summary.count > 0
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: summary.average,
            reviewCount: summary.count,
            bestRating: 5,
            worstRating: 1,
          },
          review: reviews.slice(0, 5).map((r) => ({
            "@type": "Review",
            author: { "@type": "Person", name: r.authorName },
            datePublished: r.createdAt.slice(0, 10),
            reviewRating: { "@type": "Rating", ratingValue: r.rating, bestRating: 5, worstRating: 1 },
            ...(r.title ? { name: r.title } : {}),
            reviewBody: r.text,
          })),
        }
      : {}),
  };

  return (
    <div className={styles.page}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />

      <div className={styles.container}>
        {/* Breadcrumb */}
        <nav className={styles.breadcrumb} aria-label="Sayfa yolu">
          <Link href="/">Ana Sayfa</Link>
          <span aria-hidden="true"> / </span>
          <Link href={`/kategori/${product.category.slug}`}>
            {product.category.name}
          </Link>
          <span aria-hidden="true"> / </span>
          <span aria-current="page">{product.name}</span>
        </nav>

        <div className={styles.grid}>
          {/* SOL: fotoğraflar (kırpılmadan; fareyle / dokunarak yakınlaştırma) */}
          <div className={styles.imageSection}>
            <ProductGallery images={product.images} productName={product.name} />
          </div>

          {/* RIGHT: Info + Actions */}
          <div className={styles.infoSection}>
            <div className={styles.categoryTag}>
              <Link href={`/kategori/${product.category.slug}`}>
                {product.category.name}
              </Link>
            </div>

            <h1 className={styles.name}>{product.name}</h1>

            <a href="#degerlendirmeler" className={styles.ratingLink}>
              {summary.count > 0 ? (
                <>
                  <RatingStars value={summary.average} size={16} />
                  <span className={styles.ratingValue}>
                    {summary.average.toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
                  </span>
                  <span className={styles.ratingCount}>({summary.count} değerlendirme)</span>
                </>
              ) : (
                <>
                  <RatingStars value={0} size={16} label="Henüz puan yok" />
                  <span className={styles.ratingCount}>İlk değerlendirmeyi siz yazın</span>
                </>
              )}
            </a>

            {product.description && (
              <p className={styles.description}>{product.description}</p>
            )}

            {/* Client component: variant selector + add to cart */}
            <AddToCartSection
              product={{
                id: product.id,
                name: product.name,
                slug: product.slug,
                primaryImageUrl: primaryImage?.url ?? null,
                primaryImageAlt: primaryImage?.altText ?? product.name,
                variants: product.variants,
                discount: product.discount ?? null,
              }}
            />

            {/* Trust items */}
            <ul className={styles.trustList}>
              <li className={styles.trustItem}>
                <TruckIcon />
                <span>
                  <strong>{formatPrice(shipping.freeThresholdKurus)}</strong> ve üzeri siparişlerde kargo ücretsiz
                </span>
              </li>
              <li className={styles.trustItem}>
                <BoxIcon />
                <span>Cam ve kırılabilir ürünler korumalı ambalajla gönderilir</span>
              </li>
              <li className={styles.trustItem}>
                <StoreIcon />
                <span>
                  Orhangazi Zeytinciler Çarşısı&apos;ndaki mağazamızdan
                </span>
              </li>
              <li className={styles.trustItem}>
                <ChatIcon />
                <span>
                  Sorunuz mu var?{" "}
                  <a
                    href={`https://wa.me/${STORE.contact.whatsapp}?text=${encodeURIComponent(`Merhaba, "${product.name}" hakkında bilgi almak istiyorum.`)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.trustLink}
                  >
                    WhatsApp&apos;tan yazın
                  </a>
                </span>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <ProductSectionNav
        items={[
          { id: "aciklama", label: "Ürün Açıklaması" },
          { id: "degerlendirmeler", label: "Değerlendirmeler", count: summary.count },
          { id: "teslimat", label: "Teslimat ve İade" },
        ]}
      />

      {/* ── Ürün Açıklaması ── */}
      <section id="aciklama" className={styles.section} aria-labelledby="aciklama-baslik">
        <div className={styles.container}>
          <h2 id="aciklama-baslik" className={styles.sectionTitle}>
            Ürün Açıklaması
          </h2>
          <div className={styles.descGrid}>
            <div className={styles.descText}>
              {product.description && <p className={styles.descLead}>{product.description}</p>}

              {guide.usage && guide.usage.length > 0 && (
                <>
                  <h3 className={styles.descHeading}>Kullanım önerileri</h3>
                  <ul className={styles.descList}>
                    {guide.usage.map((u) => (
                      <li key={u}>{u}</li>
                    ))}
                  </ul>
                </>
              )}

              {guide.storage && (
                <>
                  <h3 className={styles.descHeading}>Saklama</h3>
                  <p>{guide.storage}</p>
                </>
              )}

              {(guide.usage || guide.storage) && (
                <p className={styles.descNote}>
                  Genel önerilerdir; ürün ambalajındaki bilgiler esastır.
                </p>
              )}
            </div>

            <aside className={styles.specs} aria-label="Ürün bilgileri">
              <h3 className={styles.specsTitle}>Ürün bilgileri</h3>
              <dl className={styles.specList}>
                <div>
                  <dt>Kategori</dt>
                  <dd>
                    <Link href={`/kategori/${product.category.slug}`}>{product.category.name}</Link>
                  </dd>
                </div>
                <div>
                  <dt>{product.variants.length > 1 ? "Seçenekler" : "Ambalaj / miktar"}</dt>
                  <dd>{product.variants.map((v) => v.name).join(", ")}</dd>
                </div>
                {skus.length > 0 && (
                  <div>
                    <dt>Stok kodu</dt>
                    <dd>{skus.join(", ")}</dd>
                  </div>
                )}
                <div>
                  <dt>Satıcı</dt>
                  <dd>
                    {STORE.name} — {STORE.address.district}/{STORE.address.city}
                  </dd>
                </div>
              </dl>
            </aside>
          </div>
        </div>
      </section>

      {/* ── Değerlendirmeler ── */}
      <section id="degerlendirmeler" className={styles.section} aria-labelledby="degerlendirmeler-baslik">
        <div className={styles.container}>
          <h2 id="degerlendirmeler-baslik" className={styles.sectionTitle}>
            Değerlendirmeler
          </h2>
          <ProductReviews
            productId={product.id}
            productSlug={product.slug}
            summary={summary}
            reviews={reviews}
          />
        </div>
      </section>

      {/* ── Teslimat ve İade ── */}
      <section id="teslimat" className={styles.section} aria-labelledby="teslimat-baslik">
        <div className={styles.container}>
          <h2 id="teslimat-baslik" className={styles.sectionTitle}>
            Teslimat ve İade
          </h2>
          <div className={styles.infoCards}>
            <div className={styles.infoCard}>
              <TruckIcon />
              <h3>Kargo</h3>
              <p>
                Siparişler Yurtiçi Kargo ile gönderilir. <strong>{formatPrice(shipping.freeThresholdKurus)}</strong> ve üzeri
                siparişlerde kargo ücretsizdir
                {shipping.feeKurus !== null ? (
                  <>
                    ; altındaki siparişlerde kargo ücreti <strong>{formatPrice(shipping.feeKurus)}</strong>.
                  </>
                ) : (
                  "."
                )}
              </p>
            </div>
            <div className={styles.infoCard}>
              <ClockIcon />
              <h3>Teslimat süresi</h3>
              <p>
                Siparişler ödeme onayından sonra genellikle 1–3 iş günü içinde kargoya verilir; teslimat bölgeye göre 1–5
                iş günü sürer.
              </p>
            </div>
            <div className={styles.infoCard}>
              <ReturnIcon />
              <h3>İade</h3>
              <p>
                Ambalajı açılmış gıda ürünleri hijyen nedeniyle iade alınamaz. Hasarlı ya da hatalı teslimatta sipariş
                numaranızla bize ulaşın.
              </p>
            </div>
          </div>
          <p className={styles.infoLinks}>
            Ayrıntılar: <Link href="/teslimat">Teslimat Bilgileri</Link> · <Link href="/iade-ve-iptal">İade ve İptal</Link>
          </p>
        </div>
      </section>

      <ProductRail
        id="birlikte"
        eyebrow="Birlikte iyi gider"
        title="Sofranızı tamamlayın"
        text="Bu ürünle aynı sofrada buluşan ürünlerimiz."
        products={complementary}
      />
      <ProductRail
        id="benzer"
        eyebrow={product.category.name}
        title="Benzer ürünler"
        products={similar}
        more={{ href: `/kategori/${product.category.slug}`, label: "Tümünü gör" }}
      />
    </div>
  );
}

function TruckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v3m0 0h4l3 4v4h-7m0-7H8" />
      <circle cx="7.5" cy="17.5" r="2.5" />
      <circle cx="17.5" cy="17.5" r="2.5" />
    </svg>
  );
}

function StoreIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <polyline points="9 22 9 12 15 12 15 22" />
    </svg>
  );
}

function BoxIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 8 12 3 3 8v8l9 5 9-5V8Z" />
      <path d="m3 8 9 5 9-5M12 13v8" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 8.9 8.9 0 0 1-3.9-.9L3 20l1.1-4.4A8.2 8.2 0 0 1 3 11.5 8.6 8.6 0 0 1 12 3a8.6 8.6 0 0 1 9 8.5Z" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function ReturnIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h11a5 5 0 0 1 0 10h-4" />
    </svg>
  );
}
