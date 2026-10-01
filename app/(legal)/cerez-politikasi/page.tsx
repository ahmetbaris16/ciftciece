import type { Metadata } from "next";
import Link from "next/link";
import LegalPage from "@/components/legal/LegalPage";
import styles from "../legal.module.css";

export const metadata: Metadata = {
  title: "Çerez Politikası",
  description: "Sitemizde kullanılan çerezler ve tarayıcı depolaması.",
  robots: { index: true, follow: true },
};

/**
 * Listede yalnız sitede GERÇEKTEN kullanılanlar var: next-auth oturum çerezleri, sepet (localStorage) ve ödeme
 * adımı anahtarı (sessionStorage). Yeni çerez/izleme eklenirse bu sayfa güncellenmeli.
 */
export default function CerezPolitikasiPage() {
  return (
    <LegalPage title="Çerez Politikası" updated="2026-10-02">
      <p>
        Çerezler, sitelerin tarayıcınıza kaydettiği küçük metin dosyalarıdır. Sitemizde <strong>yalnız sitenin çalışması için
        zorunlu</strong> çerezler ve tarayıcı depolaması kullanılır. Analiz, reklam ya da takip çerezi kullanılmaz; bu yüzden
        çerez onayı istenmez.
      </p>

      <h2>1. Zorunlu çerezler</h2>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Ad</th>
            <th>Amaç</th>
            <th>Süre</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>next-auth.session-token (güvenli bağlantıda __Secure- önekiyle)</td>
            <td>Üye ya da yönetici girişinin açık kalması</td>
            <td>Üyelerde 30 gün, yönetimde 8 saat; çıkış yapınca silinir</td>
          </tr>
          <tr>
            <td>next-auth.csrf-token (güvenli bağlantıda __Host- önekiyle)</td>
            <td>Giriş formlarının başka sitelerden kötüye kullanılmasını önleme</td>
            <td>Tarayıcı kapanana kadar</td>
          </tr>
          <tr>
            <td>next-auth.callback-url (güvenli bağlantıda __Secure- önekiyle)</td>
            <td>Girişten sonra kaldığınız sayfaya dönme</td>
            <td>Tarayıcı kapanana kadar</td>
          </tr>
        </tbody>
      </table>

      <h2>2. Tarayıcı depolaması</h2>
      <table className={styles.table}>
        <thead>
          <tr>
            <th>Ad</th>
            <th>Amaç</th>
            <th>Süre</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>ciftci_ece_cart_v1 (localStorage)</td>
            <td>Sepetinizdeki ürünler; yalnız sizin tarayıcınızda tutulur</td>
            <td>Sepeti boşaltana ya da sipariş tamamlanana kadar</td>
          </tr>
          <tr>
            <td>ciftci_ece_checkout_key_v2 (sessionStorage)</td>
            <td>Ödeme adımında aynı siparişin iki kez oluşmasını önleme</td>
            <td>Sekme kapanana kadar</td>
          </tr>
        </tbody>
      </table>

      <h2>3. Üçüncü taraflar</h2>
      <ul>
        <li>
          Kartla ödemede bankanın (Akbank) ödeme sayfasına geçtiğinizde o sayfanın çerezleri bankanın politikasına tabidir.
        </li>
        <li>
          Mağaza haritası görüntülendiğinde harita görselleri OpenStreetMap sunucularından yüklenir (çerez yazılmaz; IP
          adresiniz bu sunuculara iletilir).
        </li>
      </ul>

      <h2>4. Çerezleri yönetmek</h2>
      <p>
        Tarayıcı ayarlarınızdan çerezleri silebilir ya da engelleyebilirsiniz; zorunlu çerezler engellenirse giriş ve sepet
        çalışmayabilir. Ayrıntı: <Link href="/gizlilik">Gizlilik Politikası</Link>.
      </p>
    </LegalPage>
  );
}
