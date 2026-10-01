/**
 * Yasal sayfalarda satıcı/veri sorumlusu iletişim kartı (admin → İşletme bilgileri'nden).
 */

import { formatPhoneTr, sellerDisplayName, type BusinessInfo } from "@/lib/business/info";
import styles from "@/app/(legal)/legal.module.css";

export default function SellerContact({ business, title = "İletişim" }: { business: BusinessInfo; title?: string }) {
  return (
    <div className={styles.contactCard}>
      <h3>{title}</h3>
      <p>
        <strong>{sellerDisplayName(business)}</strong>
      </p>
      <p>{business.address}</p>
      {business.phone && (
        <p>
          Telefon: <a href={`tel:${business.phone}`}>{formatPhoneTr(business.phone)}</a>
        </p>
      )}
      {business.email && (
        <p>
          E-posta: <a href={`mailto:${business.email}`}>{business.email}</a>
        </p>
      )}
      {business.kepAddress && <p>KEP: {business.kepAddress}</p>}
    </div>
  );
}
