import Link from "next/link";
import styles from "./StatusPage.module.css";

/** 404 içeriği — hem (shop) altındaki hem de eşleşmeyen adresler için kullanılır */
export default function NotFoundContent() {
  return (
    <section className={styles.page} aria-labelledby="notfound-title">
      <div className={styles.inner}>
        <p className={styles.code} aria-hidden="true">
          404
        </p>
        <h1 id="notfound-title" className={styles.title}>
          Aradığınız sayfa bulunamadı
        </h1>
        <p className={styles.text}>
          Bağlantı değişmiş ya da ürün artık satışta olmayabilir. Ana sayfaya dönebilir, ürünlere göz atabilir
          veya arama yapabilirsiniz.
        </p>
        <div className={styles.actions}>
          <Link href="/" className="btn btn--primary">
            Ana Sayfaya Dön
          </Link>
          <Link href="/urunler" className="btn btn--ghost">
            Tüm Ürünler
          </Link>
        </div>
        <form action="/arama" method="GET" role="search" className={styles.search}>
          <label htmlFor="notfound-q" className="sr-only">
            Ürün ara
          </label>
          <input id="notfound-q" name="q" type="search" placeholder="Ürün ara…" className="form-input" />
          <button type="submit" className="btn btn--secondary">
            Ara
          </button>
        </form>
      </div>
    </section>
  );
}
