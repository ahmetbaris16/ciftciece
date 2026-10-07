/**
 * Sıkça Sorulan Sorular — /sss
 * Yanıtlar sitenin gerçek kurallarıyla aynı kaynaktan: kargo eşiği ve havale süresi admin ayarlarından,
 * teslimat ve iade metinleri lib/legal/content.ts'ten. Bir kural değişirse burası da kendiliğinden güncellenir.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { getShippingSettings } from "@/lib/shipping/shipping.repository";
import { getPaymentSettings } from "@/lib/payment/settings.repository";
import { getBusinessInfo } from "@/lib/business/business.repository";
import { formatPhoneTr } from "@/lib/business/info";
import { DELIVERY_TERMS } from "@/lib/legal/content";
import { formatPrice } from "@/types";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Sıkça Sorulan Sorular",
  description: "Sipariş, ödeme, kargo, iade ve üyelik hakkında sık sorulan sorular.",
};

export const revalidate = 300;

interface QA {
  q: string;
  a: React.ReactNode;
  /** Yapısal veri (FAQPage) için düz metin */
  text: string;
}

export default async function SssPage() {
  const [shipping, payment, business] = await Promise.all([getShippingSettings(), getPaymentSettings(), getBusinessInfo()]);
  const freeAbove = shipping.freeThresholdKurus > 0 ? formatPrice(shipping.freeThresholdKurus) : null;
  const hours = payment.bankTransfer.paymentWindowHours;
  const phone = formatPhoneTr(business.phone);

  const groups: Array<{ title: string; items: QA[] }> = [
    {
      title: "Sipariş ve ödeme",
      items: [
        {
          q: "Hangi ödeme yöntemleriyle ödeyebilirim?",
          text: "Ödeme sayfasında o an kullanılabilen yöntemler görünür: kredi/banka kartı (3D Secure), havale/EFT ve sunulduğu siparişlerde kapıda ödeme.",
          a: (
            <>
              Ödeme sayfasında o an kullanılabilen yöntemler görünür: <strong>kredi/banka kartı</strong> (bankanın 3D Secure
              güvenli ödeme sayfasında), <strong>havale/EFT</strong> ve sunulduğu siparişlerde <strong>kapıda ödeme</strong>.
            </>
          ),
        },
        {
          q: "Kart bilgilerim güvende mi?",
          text: "Kart bilgileriniz bankanın 3D Secure güvenli ödeme sayfasında girilir; sitemize gelmez ve saklanmaz.",
          a: "Evet. Kart numaranız, son kullanma tarihi ve güvenlik kodu bankanın 3D Secure güvenli ödeme sayfasında girilir; sitemize gelmez ve hiçbir yerde saklanmaz.",
        },
        {
          q: "Havale/EFT ile nasıl öderim?",
          text: `Siparişten sonra IBAN, tutar ve açıklama ekranda ve e-postada gösterilir. Açıklamaya sipariş numaranızı yazın; ödeme ${hours} saat içinde yapılmazsa sipariş iptal olur.`,
          a: (
            <>
              Siparişi verdiğinizde IBAN, tutar ve açıklama ekranda gösterilir ve e-postanıza gönderilir. Açıklamaya{" "}
              <strong>sipariş numaranızı</strong> yazmanız yeterli. Ürünleriniz <strong>{hours} saat</strong> sizin için ayrılır;
              bu sürede ödeme gelmezse sipariş kendiliğinden iptal olur. Ödemeniz bize ulaşınca e-postayla haber veririz.
            </>
          ),
        },
        {
          q: "Siparişimi nasıl takip ederim?",
          text: "Sipariş e-postanızdaki bağlantıdan ya da Sipariş Takibi sayfasından sipariş numaranızla takip edebilirsiniz.",
          a: (
            <>
              Sipariş e-postanızdaki “Siparişi görüntüle” bağlantısından ya da <Link href="/siparis-takip">Sipariş Takibi</Link>{" "}
              sayfasından sipariş numaranızla. Üyeyseniz <Link href="/hesabim">Hesabım</Link>&apos;da tüm siparişleriniz durur.
              Her adımda (ödeme, kargo, teslim) e-posta da gelir.
            </>
          ),
        },
        {
          q: "Şirketim adına fatura alabilir miyim?",
          text: "Evet. Ödeme adımında Kurumsal fatura seçip unvan, vergi dairesi ve vergi numaranızı yazın.",
          a: "Evet. Ödeme adımında “Kurumsal fatura”yı seçip unvanınızı, vergi dairenizi ve vergi numaranızı yazın.",
        },
      ],
    },
    {
      title: "Kargo ve teslimat",
      items: [
        {
          q: "Siparişim ne zaman gelir?",
          text: `${DELIVERY_TERMS.dispatch} ${DELIVERY_TERMS.carrierTransit}`,
          a: (
            <>
              {DELIVERY_TERMS.dispatch} {DELIVERY_TERMS.carrierTransit} Kargoya verildiğinde takip numaranızı e-postayla
              göndeririz.
            </>
          ),
        },
        {
          q: "Kargo ücreti ne kadar?",
          text: freeAbove
            ? `${freeAbove} ve üzeri siparişlerde kargo ücretsizdir. Altında ücret paketin ağırlığına ve boyutuna göre hesaplanır ve ödeme adımında gösterilir.`
            : "Kargo ücreti paketin ağırlığına ve boyutuna göre hesaplanır ve ödeme adımında gösterilir.",
          a: (
            <>
              {freeAbove && (
                <>
                  <strong>{freeAbove} ve üzeri</strong> siparişlerde kargo ücretsiz.{" "}
                </>
              )}
              Diğer siparişlerde ücret paketin ağırlığına ve boyutuna göre hesaplanır ve siparişi onaylamadan önce ödeme
              adımında gösterilir. Ayrıntı: <Link href="/teslimat">Teslimat Bilgileri</Link>.
            </>
          ),
        },
        {
          q: "Paketim hasarlı geldi, ne yapmalıyım?",
          text: "Kargo görevlisine tutanak tutturun, fotoğraf çekin ve bize bildirin; yeniden gönderir ya da iade ederiz.",
          a: (
            <>
              Kargo görevlisine tutanak tutturun, paketin fotoğrafını çekin ve bize bildirin (sipariş sayfanızdaki “İade /
              iptal” bölümü ya da <Link href="/iletisim">İletişim</Link>). Ürünü yeniden göndeririz ya da ücretini iade ederiz.
            </>
          ),
        },
      ],
    },
    {
      title: "İade ve iptal",
      items: [
        {
          q: "Siparişimi iptal edebilir miyim?",
          text: "Ödemesi yapılmamış siparişi sipariş sayfanızdan hemen iptal edebilirsiniz; ödenmiş ama kargolanmamış sipariş için iptal isteği gönderin.",
          a: "Ödemesi yapılmamış siparişi sipariş sayfanızdan tek tıkla iptal edebilirsiniz. Ödenmiş ama kargoya verilmemiş siparişte iptal isteği gönderin; iptal edip ödemenizin tamamını iade ederiz.",
        },
        {
          q: "Ürünü iade edebilir miyim?",
          text: "Teslimattan itibaren 14 gün içinde cayma hakkınızı kullanabilirsiniz. Ambalajı açılmış gıda ürünleri sağlık ve hijyen nedeniyle iade alınamaz.",
          a: (
            <>
              Teslimattan itibaren <strong>14 gün</strong> içinde gerekçe göstermeden cayabilirsiniz. Ambalajı açılmış gıda
              ürünleri (zeytin, zeytinyağı, turşu vb.) sağlık ve hijyen nedeniyle iade alınamaz; açılmamış ürünlerde hakkınız
              geçerlidir. Ayrıntı: <Link href="/iade-ve-iptal">İade ve İptal</Link>.
            </>
          ),
        },
        {
          q: "Param ne zaman iade edilir?",
          text: "Cayma bildiriminiz bize ulaştıktan sonra en geç 14 gün içinde ödediğiniz tutarın tamamı ödeme yönteminize iade edilir.",
          a: "Cayma bildiriminiz bize ulaştıktan sonra en geç 14 gün içinde, kargo ücreti dahil ödediğiniz tutarın tamamı ödeme yönteminize iade edilir. İadeyi yaptığımızda e-posta gönderiyoruz; kartınıza yansıma süresi bankanıza göre değişebilir.",
        },
      ],
    },
    {
      title: "Üyelik ve mağaza",
      items: [
        {
          q: "Sipariş vermek için üye olmam gerekir mi?",
          text: "Hayır. Üye olmadan sipariş verebilirsiniz; üyelik siparişlerinizi tek yerden takip etmenizi sağlar.",
          a: (
            <>
              Hayır, üye olmadan sipariş verebilirsiniz. Teslim edilen ürünleri, paketinizdeki fişte ve teslim e-postanızda
              yazan tek kullanımlık kodla <Link href="/degerlendir">değerlendirebilirsiniz</Link>.{" "}
              <Link href="/uye-ol">Üyelik</Link> ücretsizdir ve siparişlerinizi tek yerden takip etmenizi sağlar.
            </>
          ),
        },
        {
          q: "Ürünleri mağazadan alabilir miyim?",
          text: "Evet, Orhangazi Zeytinciler Çarşısı'ndaki mağazamızdan her gün alabilirsiniz.",
          a: (
            <>
              Evet. Orhangazi Zeytinciler Çarşısı&apos;ndaki mağazamız her gün açık: <Link href="/magaza">adres ve yol tarifi</Link>.
            </>
          ),
        },
        {
          q: "Sorum burada yok, size nasıl ulaşırım?",
          text: `Telefon ${phone}, WhatsApp ya da İletişim sayfasındaki form.`,
          a: (
            <>
              Telefon (<a href={`tel:${business.phone}`}>{phone}</a>), WhatsApp ya da <Link href="/iletisim">İletişim</Link>{" "}
              sayfasındaki form. En hızlı yanıt telefon ve WhatsApp&apos;tan gelir.
            </>
          ),
        },
      ],
    },
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: groups.flatMap((g) =>
      g.items.map((i) => ({ "@type": "Question", name: i.q, acceptedAnswer: { "@type": "Answer", text: i.text } }))
    ),
  };

  return (
    <div className={styles.page}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }} />
      <div className={styles.container}>
        <header className={styles.header}>
          <p className={styles.eyebrow}>Yardım</p>
          <h1 className={styles.title}>Sıkça sorulan sorular</h1>
          <p className={styles.lead}>Sipariş, ödeme, kargo ve iade hakkında merak ettikleriniz.</p>
        </header>
        {groups.map((g) => (
          <section key={g.title} className={styles.group} aria-labelledby={`g-${g.title}`}>
            <h2 id={`g-${g.title}`} className={styles.groupTitle}>
              {g.title}
            </h2>
            {g.items.map((i) => (
              <details key={i.q} className={styles.item}>
                <summary className={styles.question}>{i.q}</summary>
                <div className={styles.answer}>{i.a}</div>
              </details>
            ))}
          </section>
        ))}
        <div className={styles.cta}>
          <p>Aradığınızı bulamadınız mı?</p>
          <Link href="/iletisim" className={styles.ctaBtn}>
            Bize yazın
          </Link>
        </div>
      </div>
    </div>
  );
}
