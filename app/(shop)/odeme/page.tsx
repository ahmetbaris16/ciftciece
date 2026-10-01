/**
 * Ödeme sayfası — sunucu kabuğu: işletme bilgilerini (sözleşmelerin siparişe özel hâli için) ve kart ödemesinin
 * sağlayıcı adını istemci bileşenine verir. Akış ve kurallar: CheckoutClient.tsx.
 */

import { Suspense } from "react";
import { getBusinessInfo } from "@/lib/business/business.repository";
import CheckoutClient from "./CheckoutClient";
import styles from "./checkout.module.css";

export const dynamic = "force-dynamic";

export default async function OdemePage() {
  const business = await getBusinessInfo();
  const cardProvider = process.env.PAYMENT_PROVIDER === "iyzico" ? "iyzico" : "Akbank";
  return (
    <Suspense
      fallback={
        <div className={styles.page}>
          <div className={styles.state}>Yükleniyor…</div>
        </div>
      }
    >
      <CheckoutClient business={business} cardProvider={cardProvider} />
    </Suspense>
  );
}
