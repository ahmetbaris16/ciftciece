/**
 * Sipariş Takibi (misafir) — /siparis-takip
 * Üyeler siparişlerini Hesabım → Siparişlerim'den görür.
 */

import type { Metadata } from "next";
import Link from "next/link";
import OrderTracker from "@/components/account/OrderTracker";
import styles from "@/components/account/Auth.module.css";

export const metadata: Metadata = {
  title: "Sipariş Takibi",
  description: "Sipariş referans kodunuzla siparişinizin durumunu sorgulayın.",
  robots: { index: false, follow: true },
};

export default function SiparisTakipPage() {
  return (
    <div className={styles.page}>
      <div className={styles.single}>
        <section className={styles.card} aria-labelledby="track-title">
          <p className={styles.eyebrow}>Misafir siparişi</p>
          <h1 id="track-title" className={styles.title}>
            Sipariş Takibi
          </h1>
          <p className={styles.lead}>Üye olmadan verdiğiniz siparişin durumunu referans koduyla sorgulayın.</p>
          <OrderTracker />
          <div className={styles.below}>
            <span>
              Üye misiniz?{" "}
              <Link href="/giris?next=/hesabim" className={styles.textLink}>
                Giriş yapıp siparişlerinizi görün
              </Link>
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}
