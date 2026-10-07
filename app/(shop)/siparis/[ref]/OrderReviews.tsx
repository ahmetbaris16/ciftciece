/**
 * Sipariş sayfası → "Ürünleri değerlendirin" (yalnız sipariş teslim edildikten sonra; teslim e-postasındaki
 * "Siparişi görüntüle ve değerlendir" bağlantısı #degerlendir ile buraya gelir).
 * - Üye olmadan verilmiş sipariş: sipariş numarası yetmez (F-33). Önce paket fişindeki / teslim e-postasındaki tek
 *   kullanımlık değerlendirme kodu girilir; kodu kullanan tarayıcıda her ürün için form açılır (giriş gerekmez).
 *   Kod başka cihazda kullanıldıysa bu söylenir (yeni kodu mağaza panelden üretir).
 * - Üyelikle verilmiş sipariş: siparişi veren üye giriş yaptıysa form (hesabına yazılır); değilse giriş bağlantısı.
 * - Yönetici hesabı: değerlendirme yazamaz.
 */

import Link from "next/link";
import { isStaffRole } from "@/lib/auth/roles";
import type { OrderReviewContext } from "@/lib/repositories/product-review.repository";
import ReviewForm from "@/components/product/ReviewForm";
import ReviewCodeForm from "@/components/reviews/ReviewCodeForm";
import styles from "./order.module.css";

interface Props {
  reference: string;
  context: OrderReviewContext;
  /** Sayfayı açan mağaza oturumu (yoksa null) */
  viewer: { id: string; role: string } | null;
  /** Misafir siparişi: bu tarayıcının değerlendirme izni var mı, kod kullanılmış mı (üye siparişinde null) */
  guestAccess: { granted: boolean; codeUsed: boolean } | null;
}

export default function OrderReviews({ reference, context, viewer, guestAccess }: Props) {
  if (!context.delivered || context.items.length === 0) return null;
  const memberOrder = context.userId !== null;
  const staff = viewer !== null && isStaffRole(viewer.role);
  const owner = !memberOrder || viewer?.id === context.userId;
  const back = `/siparis/${reference}#degerlendir`;

  let blocked: string | null = null;
  if (staff) blocked = "Yönetici hesabıyla açtınız. Değerlendirmeleri siparişi veren müşteri yazar.";
  else if (!owner && viewer) blocked = "Bu sipariş başka bir üyelikle verildi. Değerlendirmek için siparişi veren hesapla giriş yapın.";
  else if (!owner) blocked = "Bu siparişi üyeliğinizle verdiniz. Değerlendirmek için giriş yapın.";
  // Misafir siparişi, bu tarayıcıda izin yok: önce değerlendirme kodu
  const needsCode = !blocked && !memberOrder && !guestAccess?.granted;
  const written = context.items.filter((i) => i.review).length;

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
      ) : needsCode ? (
        <>
          <p className={styles.muted}>
            {guestAccess?.codeUsed
              ? `Bu siparişin değerlendirme kodu kullanıldı${written > 0 ? ` (${written} ürün değerlendirildi)` : ""}. Değerlendirmeyi kodu kullandığınız cihazdan yazıp düzenleyebilirsiniz. Başka bir cihazdan yazmak isterseniz bize ulaşın; yeni kod gönderelim.`
              : "Ürünleri değerlendirmek için paketinizdeki sipariş fişinde ve “Siparişiniz teslim edildi” e-postasında yazan değerlendirme kodunu girin. Kod tek kullanımlıktır; sipariş numarası tek başına yetmez (başkası sizin adınıza yazamasın)."}
          </p>
          <ReviewCodeForm orderRef={reference} compact />
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
