"use client";

import Link from "next/link";
import { useEffect } from "react";
import { STORE } from "@/lib/config/store";
import styles from "./StatusPage.module.css";

/** Beklenmeyen hata içeriği — error.tsx dosyaları kullanır (bu Next sürümünde prop adı `retry`) */
export default function ErrorContent({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className={styles.page} aria-labelledby="error-title">
      <div className={styles.inner}>
        <p className={styles.code} aria-hidden="true">
          !
        </p>
        <h1 id="error-title" className={styles.title}>
          Bir şeyler ters gitti
        </h1>
        <p className={styles.text}>
          Sayfa yüklenirken beklenmeyen bir sorun oluştu. Lütfen tekrar deneyin; sorun sürerse bizi arayabilirsiniz:{" "}
          <a href={`tel:${STORE.contact.phone}`}>{STORE.contact.phoneFormatted}</a>
        </p>
        <div className={styles.actions}>
          <button type="button" className="btn btn--primary" onClick={() => retry()}>
            Tekrar Dene
          </button>
          <Link href="/" className="btn btn--ghost">
            Ana Sayfaya Dön
          </Link>
        </div>
      </div>
    </section>
  );
}
