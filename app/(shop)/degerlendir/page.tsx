/**
 * Değerlendirme kodu — /degerlendir (paket fişinde yazan adres). Üye olmadan sipariş veren müşteri, paketteki fişte ve
 * teslim e-postasında yazan tek kullanımlık kodu girer; kod doğruysa siparişinin "Ürünleri değerlendirin" bölümüne
 * gider (lib/reviews/review-code.ts).
 */

import type { Metadata } from "next";
import Link from "next/link";
import ReviewCodeForm from "@/components/reviews/ReviewCodeForm";
import styles from "@/components/account/Auth.module.css";

export const metadata: Metadata = {
  title: "Ürünleri Değerlendirin",
  description: "Üye olmadan verdiğiniz siparişin ürünlerini paketinizdeki değerlendirme koduyla değerlendirin.",
  robots: { index: false, follow: true },
};

export default function DegerlendirPage() {
  return (
    <div className={styles.page}>
      <div className={styles.single}>
        <section className={styles.card} aria-labelledby="review-code-title">
          <h1 id="review-code-title" className={styles.title}>
            Ürünlerinizi değerlendirin
          </h1>
          <p className={styles.lead}>
            Üye olmadan verdiğiniz siparişin ürünlerini, paketinizdeki fişte ve teslim e-postanızda yazan kodla
            değerlendirin. Kodu girince siparişinizdeki ürünler açılır.
          </p>
          <ReviewCodeForm />
          <div className={styles.below}>
            <span>
              Üyeyseniz kod gerekmez:{" "}
              <Link href="/giris?next=/hesabim" className={styles.textLink}>
                giriş yapıp
              </Link>{" "}
              ürün sayfasından ya da siparişinizden değerlendirin.
            </span>
            <span>
              Kodunuzu bulamıyorsanız{" "}
              <Link href="/iletisim" className={styles.textLink}>
                bize ulaşın
              </Link>
              ; yeni kod gönderelim.
            </span>
          </div>
        </section>
      </div>
    </div>
  );
}
