/**
 * Kabul edilen kart markaları ve güvenli ödeme işaretleri (altbilgi ve ödeme adımı).
 * Visa işareti: simple-icons (CC0-1.0) yolu. Mastercard: markanın iki daireli işareti. Troy: yazı.
 * Markalar sahiplerine aittir; yalnız "bu kartlarla ödeme kabul edilir" anlamında gösterilir.
 */

import styles from "./PaymentMarks.module.css";

const VISA_PATH =
  "M9.112 8.262L5.97 15.758H3.92L2.374 9.775c-.094-.368-.175-.503-.461-.658C1.447 8.864.677 8.627 0 8.479l.046-.217h3.3a.904.904 0 01.894.764l.817 4.338 2.018-5.102zm8.033 5.049c.008-1.979-2.736-2.088-2.717-2.972.006-.269.262-.555.822-.628a3.66 3.66 0 011.913.336l.34-1.59a5.207 5.207 0 00-1.814-.333c-1.917 0-3.266 1.02-3.278 2.479-.012 1.079.963 1.68 1.698 2.04.756.367 1.01.603 1.006.931-.005.504-.602.725-1.16.734-.975.015-1.54-.263-1.992-.473l-.351 1.642c.453.208 1.289.39 2.156.398 2.037 0 3.37-1.006 3.377-2.564m5.061 2.447H24l-1.565-7.496h-1.656a.883.883 0 00-.826.55l-2.909 6.946h2.036l.405-1.12h2.488zm-2.163-2.656l1.02-2.815.588 2.815zm-8.16-4.84l-1.603 7.496H8.34l1.605-7.496z";

function Visa() {
  return (
    <span className={styles.mark} title="Visa">
      <svg viewBox="0 0 24 24" width="38" height="24" role="img" aria-label="Visa">
        <path d={VISA_PATH} fill="#1A1F71" />
      </svg>
    </span>
  );
}

function Mastercard() {
  return (
    <span className={styles.mark} title="Mastercard">
      <svg viewBox="0 0 40 24" width="36" height="22" role="img" aria-label="Mastercard">
        <circle cx="15" cy="12" r="9" fill="#EB001B" />
        <circle cx="25" cy="12" r="9" fill="#F79E1B" />
        <path d="M20 4.5a9 9 0 0 1 0 15 9 9 0 0 1 0-15z" fill="#FF5F00" />
      </svg>
    </span>
  );
}

function Troy() {
  return (
    <span className={`${styles.mark} ${styles.troy}`} title="Troy" role="img" aria-label="Troy">
      troy
    </span>
  );
}

export function SecureBadge({ label = "3D Secure güvenli ödeme" }: { label?: string }) {
  return (
    <span className={styles.secure}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="11" width="18" height="11" rx="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
      {label}
    </span>
  );
}

export default function PaymentMarks({ showSecure = true, compact = false }: { showSecure?: boolean; compact?: boolean }) {
  return (
    <div className={`${styles.row} ${compact ? styles.compact : ""}`} aria-label="Kabul edilen kartlar">
      <Visa />
      <Mastercard />
      <Troy />
      {showSecure && <SecureBadge />}
    </div>
  );
}
