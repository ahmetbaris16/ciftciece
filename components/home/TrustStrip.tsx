import styles from "./TrustStrip.module.css";

const TRUST_ITEMS = [
  {
    id: "shipping",
    icon: <TruckIcon />,
    title: "Kapınıza Teslim",
    desc: "Sipariş verin, paketleyip gönderelim",
  },
  {
    id: "quality",
    icon: <LeafIcon />,
    title: "Mağazadaki Ürünler",
    desc: "Rafımızdaki ürünlerin aynısı",
  },
  {
    id: "secure",
    icon: <LockIcon />,
    title: "Güvenli Ödeme",
    desc: "SSL ile şifreli bağlantı",
  },
  {
    id: "local",
    icon: <PinIcon />,
    title: "Fiziksel Mağaza",
    desc: "Orhangazi, Zeytinciler Çarşısı",
  },
];

export default function TrustStrip() {
  return (
    <section className={styles.section} aria-label="Güven unsurları">
      <div className={styles.container}>
        <ul className={styles.list} role="list">
          {TRUST_ITEMS.map((item) => (
            <li key={item.id} className={styles.item}>
              <span className={styles.icon} aria-hidden="true">{item.icon}</span>
              <div className={styles.text}>
                <strong className={styles.title}>{item.title}</strong>
                <span className={styles.desc}>{item.desc}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function TruckIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 17H3a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v3" />
      <rect x="9" y="11" width="14" height="10" rx="2" />
      <circle cx="12" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
    </svg>
  );
}

function LeafIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
      <path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}

function PinIcon() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
      <circle cx="12" cy="10" r="3" />
    </svg>
  );
}
