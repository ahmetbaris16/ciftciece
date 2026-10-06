/**
 * Sipariş sayfası → "Ürünleri değerlendirin" (yalnız sipariş teslim edildikten sonra; teslim e-postasındaki
 * "Siparişi görüntüle ve değerlendir" bağlantısı #degerlendir ile buraya gelir).
 * - Üye olmadan verilmiş sipariş: her ürün için form; sipariş numarasıyla gönderilir, giriş gerekmez.
 * - Üyelikle verilmiş sipariş: siparişi veren üye giriş yaptıysa form (hesabına yazılır); değilse giriş bağlantısı.
 * - Yönetici hesabı: değerlendirme yazamaz.
 */

import Link from "next/link";
import { isStaffRole } from "@/lib/auth/roles";
import type { OrderReviewContext } from "@/lib/repositories/product-review.repository";
import ReviewForm from "@/components/product/ReviewForm";
import styles from "./order.module.css";

interface Props {
  reference: string;
  context: OrderReviewContext;
  /** Sayfayı açan mağaza oturumu (yoksa null) */
  viewer: { id: string; role: string } | null;
}

export default function OrderReviews({ reference, context, viewer }: Props) {
  if (!context.delivered || context.items.length === 0) return null;
  const memberOrder = context.userId !== null;
  const staff = viewer !== null && isStaffRole(viewer.role);
  const owner = !memberOrder || viewer?.id === context.userId;
  const back = `/siparis/${reference}#degerlendir`;

  let blocked: string | null = null;
  if (staff) blocked = "Yönetici hesabıyla açtınız. Değerlendirmeleri siparişi veren müşteri yazar.";
  else if (!owner && viewer) blocked = "Bu sipariş başka bir üyelikle verildi. Değerlendirmek için siparişi veren hesapla giriş yapın.";
  else if (!owner) blocked = "Bu siparişi üyeliğinizle verdiniz. Değerlendirmek için giriş yapın.";

  return (
    <section id="degerlendir" className={styles.card} aria-labelledby="review-title">
      <h2 id="review-title" className={styles.cardTitle}>
        Ürünleri değerlendirin
      </h2>
      {blocked ? (
        <>
          <p className={styles.muted}>{blocked}</p>
          {!staff && (
            <p className={styles.reviewLogin}>
              <Link href={`/giris?next=${encodeURIComponent(back)}`} className={styles.secondaryBtn}>
                Giriş yap
              </Link>
            </p>
          )}
        </>
      ) : (
        <>
          <p className={styles.muted}>Deneyiminizi paylaşın; diğer müşterilere yol gösterin.</p>
          <ul className={styles.reviewItems}>
            {context.items.map((item) => (
              <li key={item.productId} className={styles.reviewItem}>
                <Link href={`/urun/${item.productSlug}`} className={styles.reviewProduct}>
                  {item.productName}
                </Link>
                <ReviewForm
                  productId={item.productId}
                  productSlug={item.productSlug}
                  preset={{ review: item.review, orderRef: memberOrder ? undefined : reference }}
                />
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
