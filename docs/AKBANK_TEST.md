# Akbank Sanal POS — test ve canlıya geçiş

Kart ödemesi **Akbank Sanal POS, Ortak Ödeme Sayfası (3D Pay Hosting)** ile alınır: müşteri "Siparişi onayla
ve öde" deyince Akbank'ın güvenli ödeme sayfasına geçer, kart bilgisini orada girer, 3D Secure doğrulaması orada
yapılır. **Kart bilgisi sitemize hiç gelmez, saklanmaz.** Ödeme sonucu tarayıcıyla siteye döner; site sonucu
ayrıca Akbank'tan sunucudan sorgular (tarayıcı dönüşü tek başına kanıt sayılmaz).

## Durumlar

| Durum | Ne zaman | Müşteri ne görür |
|---|---|---|
| **Demo** | Akbank bilgileri girilmemiş | **Müşteri:** kart seçeneği "Kartla ödeme çok yakında" notuyla görünür, seçilemez; sipariş havale/EFT (ve açıksa kapıda ödeme) ile alınır. **Yönetici** (admin girişi açıkken): kart "DEMO" etiketiyle seçilir; Akbank sayfasının yerine sitenin **demo banka sayfası** açılır (kart bilgileri → telefona gelmiş gibi gösterilen 6 haneli kod) ve sipariş "Ödendi" olur, admin'de "Demo ödeme" uyarısıyla. Gerçek para çekilmez; kart bilgileri hiçbir yere gönderilmez. Banka sunumu için: docs/YAYIN.md 7b. |
| **Test** | `AKBANK_ENV=test` + test bilgileri | Kart seçeneğini **yalnız yönetici** (admin girişi açıkken) görür ve kullanır; müşteriler "yakında" görür. Gerçek para çekilmez. Bu siparişler admin'de "TEST ÖDEMESİ" uyarısıyla görünür. |
| **Canlı** | `AKBANK_ENV=prod` + canlı bilgiler | Herkes kartla öder; gerçek tahsilat. |

Admin → Ayarlar → Ödeme bölümünün üstünde o anki durum yazar.

## Gereken bilgiler (Akbank verir)

| Ortam değişkeni | Nereden |
|---|---|
| `PAYMENT_PROVIDER` | `akbank` |
| `AKBANK_MERCHANT_SAFE_ID` | Akbank POS portalı → Yönetim → Üye İş Yeri İşlemleri → Üye İş Yeri Bilgileri → Güvenli İş Yeri No |
| `AKBANK_TERMINAL_SAFE_ID` | Akbank POS portalı → Yönetim → Terminal İşlemleri → Terminal Safe ID |
| `AKBANK_SECRET_KEY` | Akbank'ın verdiği gizli anahtar (kimseyle paylaşmayın, koda yazmayın) |
| `AKBANK_ENV` | `test` (önce) → `prod` (denemeler bitince) |

Bilgiler **hPanel → Node.js uygulaması → Ortam değişkenleri**ne girilir. Kaydedince site yeniden başlar.
`AKBANK_API_URL` / `AKBANK_GATEWAY_URL` yalnız bu bilgisayardaki denemede kullanılır; canlıda tanımlanırsa site
açılmaz (güvenlik).

## Test ortamında deneme listesi

Yönetici girişi açıkken (admin paneline giriş yapıp aynı tarayıcıda siteye geçin):

1. Bir ürünü sepete ekleyin, ödeme sayfasında "Kredi / Banka Kartı"nı seçin, sözleşmeyi onaylayıp ödeyin.
2. Akbank'ın test sayfası açılmalı. Akbank'ın verdiği **test kartı** ve SMS şifresiyle ödeyin.
3. Siteye dönünce "Siparişiniz alındı" sayfası gelmeli; admin'de sipariş **Ödendi** ve "TEST ÖDEMESİ" uyarısı
   görünmeli; müşteri e-postası gelmeli.
4. Başarısız ödeme: yanlış SMS şifresi ya da reddedilen test kartı → "Ödeme işlemi başarısız" mesajı, sipariş
   "Ödeme bekleniyor" kalmalı; yeniden denenebilmeli.
5. Ödeme sayfasında sekmeyi ödeme bittikten sonra kapatın: en geç 5 dakika içinde (zamanlanmış iş) sipariş
   **Ödendi** olmalı. Admin'de "Akbank'tan sorgula" ile de hemen görülebilir.
6. Ödeme yapmadan bırakın: 30 dakika sonra sipariş iptal olmalı, stok geri dönmeli.
7. Test siparişlerini admin'den iptal edin (iade kaydında yöntem "Diğer", sebep "test").

Sorun çıkarsa: admin → sipariş → "Ödeme olayları" bölümündeki kayıtları ve hPanel çalışma günlüğündeki
`[akbank/return]` / `[payment/verify]` satırlarını bana iletin.

## Canlıya geçiş

1. Akbank canlı bilgilerini girin ve `AKBANK_ENV=prod` yapın.
2. Admin → Ayarlar → Ödeme: "CANLI — gerçek tahsilat" yazmalı.
3. Küçük tutarlı gerçek bir siparişle kendi kartınızla deneyin; sonra Akbank panelinden iade edip sitede iade
   kaydını girin (admin → sipariş → İade kaydı).

## Doğrulanmamış noktalar (Akbank test ortamında netleşecek)

Akbank'ın teknik dokümanı herkese açık değil. Entegrasyon, açık kaynak **mewebstudio/pos** (MIT) kütüphanesinin
Akbank uygulamasına göre yazıldı (alan adları, imza kuralı HMAC-SHA512, adresler, işlem kodları). Test ortamında
şunlar kontrol edilmeli:

- Ortak ödeme sayfasının (payhosting) bu alanlarla açılması ve dönüşte `hash` / `hashParams` gönderilmesi.
- Sipariş sorgusunun (txnCode 1010) ödeme sonrası hemen sonucu vermesi; tutar ve para birimi alanlarının biçimi.
- Taksit: şimdilik yalnız tek çekim. Taksit açılacaksa Akbank'tan taksit yetkisi ve dokümandaki alan istenmeli.
- İade/iptal: sitede yalnız kayıt tutulur; para Akbank panelinden iade edilir. API ile otomatik iade, test
  ortamında denenmeden açılmaz.
