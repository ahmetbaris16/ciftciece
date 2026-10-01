import Image from "next/image";
import Link from "next/link";
import styles from "./PremiumVisual.module.css";

export default function PremiumVisual() {
  return (
    <section className={styles.section} aria-label="Öne çıkan ürün">
      <div className={styles.container}>
        <div className={styles.grid}>
          {/* ---- Image Side ---- */}
          <div className={styles.imageCol}>
            <div className={styles.imageWrap}>
              <Image
                src="/images/atmosphere/tezgah-siyah-zeytin.jpg"
                alt="Mağaza tezgâhında yığın halinde siyah zeytin"
                fill
                sizes="(max-width: 768px) 100vw, 55vw"
                quality={85}
                className={styles.image}
                style={{ objectFit: "cover", objectPosition: "50% 55%" }}
                loading="lazy"
              />
            </div>
          </div>

          {/* ---- Content Side ---- */}
          <div className={styles.contentCol}>
            <span className="section-label">Taze ve Doğal</span>
            <h2 className={styles.headline}>
              Her gün taze,
              <br />
              <em className={styles.headlineEm}>Orhangazi’den</em>
            </h2>
            <p className={styles.body}>
              Zeytinciler Çarşısı’ndaki mağazamızın rafındaki ürünler burada:
              sızma zeytinyağı, sofralık zeytin, turşu, kahvaltılık,
              kestane şekeri ve zeytinyağlı sabun.
            </p>
            <p className={styles.body}>
              İsterseniz mağazaya gelip tadına bakın, isterseniz sipariş
              verin; kapınıza gönderelim.
            </p>

            <div className={styles.features}>
              <div className={styles.feature}>
                <span className={styles.featureDot} aria-hidden="true" />
                <span>Soğuk sıkım naturel sızma zeytinyağı</span>
              </div>
              <div className={styles.feature}>
                <span className={styles.featureDot} aria-hidden="true" />
                <span>Siyah ve yeşil sofralık zeytin çeşitleri</span>
              </div>
              <div className={styles.feature}>
                <span className={styles.featureDot} aria-hidden="true" />
                <span>Turşu, kahvaltılık ve kestane şekeri</span>
              </div>
              <div className={styles.feature}>
                <span className={styles.featureDot} aria-hidden="true" />
                <span>5 kalıp paket zeytinyağlı sabun</span>
              </div>
            </div>

            <Link href="/urunler" className="btn btn--primary">
              Tüm Ürünleri Gör
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
