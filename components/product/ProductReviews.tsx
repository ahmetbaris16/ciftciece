/**
 * Ürün sayfası → Değerlendirmeler bölümü (sunucu bileşeni)
 * Solda puan özeti ve dağılım, sağda yazma formu + yayındaki yorumlar (yalnız satın alanlar yazar, hemen yayınlanır).
 */

import type { PublicProductReview, ReviewSummary } from "@/lib/repositories/product-review.repository";
import RatingStars from "./RatingStars";
import ReviewForm from "./ReviewForm";
import ReviewList from "./ReviewList";
import styles from "./ProductReviews.module.css";

interface Props {
  productId: string;
  productSlug: string;
  summary: ReviewSummary;
  reviews: PublicProductReview[];
}

export default function ProductReviews({ productId, productSlug, summary, reviews }: Props) {
  return (
    <div className={styles.grid}>
      <aside className={styles.summary} aria-label="Puan özeti">
        {summary.count > 0 ? (
          <>
            <div className={styles.average}>
              <span className={styles.averageNumber}>
                {summary.average.toLocaleString("tr-TR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}
              </span>
              <div>
                <RatingStars value={summary.average} size={18} />
                <p className={styles.count}>{summary.count} değerlendirme</p>
              </div>
            </div>
            <ol className={styles.bars} aria-label="Puan dağılımı">
              {[5, 4, 3, 2, 1].map((star) => {
                const n = summary.distribution[star - 1];
                const pct = summary.count ? Math.round((n / summary.count) * 100) : 0;
                return (
                  <li key={star} className={styles.bar}>
                    <span className={styles.barLabel}>{star} yıldız</span>
                    <span className={styles.barTrack} aria-hidden="true">
                      <span className={styles.barFill} style={{ width: `${pct}%` }} />
                    </span>
                    <span className={styles.barCount}>{n}</span>
                  </li>
                );
              })}
            </ol>
          </>
        ) : (
          <div className={styles.noReviews}>
            <RatingStars value={0} size={20} label="Henüz puan yok" />
            <p className={styles.noReviewsTitle}>Henüz değerlendirme yok</p>
            <p className={styles.noReviewsText}>Bu ürünü ilk değerlendiren siz olun.</p>
          </div>
        )}
        <p className={styles.policy}>
          Değerlendirmeleri yalnız bu ürünü sitemizden üye girişiyle satın alan müşterilerimiz yazar; sipariş kargoya
          verildikten sonra yazılır ve hemen yayınlanır. Mağaza yalnız hakaret, kişisel bilgi ya da ürünle ilgisi olmayan
          içeriği yayından kaldırır.
        </p>
      </aside>

      <div className={styles.main}>
        <ReviewForm productId={productId} productSlug={productSlug} />
        <ReviewList reviews={reviews} />
      </div>
    </div>
  );
}
