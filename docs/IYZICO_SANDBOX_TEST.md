# iyzico sandbox ile uçtan uca deneme

Otomatik testler (`npm test`) gerçek iyzico'ya bağlanmaz; iyzico'yu dokümandaki biçimle taklit eden
sahte bir sunucu kullanır (`tests/helpers/fake-iyzico.ts`). Bunlar **bizim kodumuzun** doğru
çalıştığını gösterir, **iyzico'nun gerçek davranışını kanıtlamaz**. Canlıya geçmeden önce aşağıdaki
denemeler sandbox anahtarlarıyla yapılmalıdır.

> Durum (2026-10-01): sandbox anahtarı yok (`.env`'de yer tutucu). Bu belgedeki adımlar henüz
> çalıştırılmadı.

## Ön koşullar

1. iyzico sandbox üye işyeri hesabı: <https://sandbox-merchant.iyzipay.com> (hesabı siz açarsınız).
   Panelden API anahtarı ve gizli anahtarı (secret key) alın.
2. Yerel `.env`:

   ```
   PAYMENT_PROVIDER="iyzico"
   IYZICO_API_KEY="sandbox-..."
   IYZICO_SECRET_KEY="sandbox-..."
   IYZICO_BASE_URL="https://sandbox-api.iyzipay.com"
   NEXT_PUBLIC_APP_URL="http://localhost:3000"
   ```

   Anahtarlar `.env`'de kalır, depoya girmez (`.gitignore`). Canlı anahtar kullanmayın.
3. Veritabanı açık (`Docker Baslat.bat`) ve migration'lar uygulanmış (`npx prisma migrate deploy`).
4. Site DB ile çalışıyor: `npm run dev` (3000). Mock site (`Siteyi Ac.bat`, 3100) DB kullanmaz; bu
   denemeler için uygun değildir.
5. Test kartları: <https://docs.iyzico.com/en/add-ons/test-cards> — "başarılı" kartlardan biri ve
   hata üreten kartlardan "Not sufficient funds" kartı. Son kullanma tarihi ileri bir tarih, CVC
   rastgele 3 hane.

## A. Kartla ödeme — tarayıcı dönüşü (callback)

| # | Adım | Beklenen |
|---|------|----------|
| A1 | Sepete ürün ekle, ödeme adımında kartı seç, sözleşmeyi onayla, "Ödemeye Geç" | iyzico sandbox ödeme sayfası açılır |
| A2 | Başarılı test kartıyla öde | `/siparis/<ref>` "Siparişiniz alındı"; admin → sipariş: durum Ödendi, deneme **Başarılı**, sağlayıcı ödeme no dolu, sepet ve çekilen tutar = sipariş toplamı |
| A3 | Admin → sipariş → "Ödeme olayları" | `callback.received` ve `verify.success`; olay içeriğinde kart BIN/son 4 hane **yok** |
| A4 | Yeni sipariş, "Not sufficient funds" kartıyla öde | `/odeme?error=payment_failed`; deneme **Başarısız**; sipariş Ödeme bekleniyor |
| A5 | A4'ün ardından aynı sayfada tekrar "Ödemeye Geç", başarılı kartla öde | Yeni sipariş açılmaz (aynı idempotency anahtarı); siparişte 2 deneme (Başarısız, Başarılı), sipariş Ödendi |
| A6 | Taksitli ödeme (panelde taksit açıksa, 3 taksit) | Ödendi; denemede taksit sayısı ve çekilen tutar görünür. Vade farkı müşteriye yansıtılıyorsa çekilen tutar sepetten büyük olabilir — bu beklenen durumdur |
| A7 | Ödeme sayfasını açıp 30 dk bekle (ödemeden) | Sipariş süre dolunca (bir sonraki checkout ya da admin sipariş listesi açılınca) İptal; stok geri döner; deneme **Süresi doldu**. iyzico'nun süresi dolmuş token için ne döndürdüğünü olay kaydından not edin (doğrulanmamış davranış) |

Doğrulanacak açık sorular (sonuçları `harbi/RELIABILITY_AUDIT.md` §6'ya işleyin):

- CF-Retrieve yanıtında `conversationId`: bizim gönderdiğimizin aynısı mı (echo), ödemenin ilk
  `conversationId`'si mi? (İki durumda da kodumuz denemenin id'sini gönderdiği için eşleşir.)
- Ödenmemiş (açık) token sorgulandığında yanıt: `status=failure` + hata kodu mu, `paymentStatus`
  ara değer mi? Kod her ikisini de "beklemede" sayar.
- `tokenExpireTime` değeri (beklenen 1800). Daha kısa gelirse rezervasyon kısalır ve
  `reservation.shortened_to_token` olayı yazılır.
- Aynı `basketId` ile ikinci başarılı ödemeye izin veriliyor mu (R-03)? İki sekmede iki form açıp
  ikisini de ödeyin: ikincisi **Çift ödeme** + "Dikkat" alarmı olmalı.

## B. Webhook (Üye İşyeri Bildirimi)

Uç nokta: `POST /api/payment/webhook/iyzico`. Kaynak: <https://docs.iyzico.com/en/advanced/webhook>.

Ek ön koşullar:

1. **Herkese açık HTTPS adres.** iyzico yalnız HTTPS adrese bildirim gönderir; `localhost`'a
   ulaşamaz. Yerelde denemek için bir tünel gerekir (ör. `cloudflared tunnel --url http://localhost:3000`
   ya da ngrok). Bu yeni bir araçtır; kurulumu sizin kararınız. Tünel adresini `NEXT_PUBLIC_APP_URL`
   olarak da verin (callback de o adrese döner).
2. Sandbox panelinde: Ayarlar > Üye İşyeri Ayarları > Üye İşyeri Bildirimleri →
   `https://<tünel-adresi>/api/payment/webhook/iyzico`.
3. **X-IYZ-SIGNATURE-V3 imzasının açılması** için iyzico'ya yazın (entegrasyon@iyzico.com).
   İmza açılmadan gelen bildirimler **reddedilir** (401) ve admin'de "İmzası doğrulanamayan ödeme
   bildirimi" alarmı görünür — bu beklenen davranıştır, imzasız bildirim işlenmez.
4. İmza anahtarı üye işyerinin API gizli anahtarıdır (`IYZICO_SECRET_KEY`); ayrı bir webhook
   anahtarı yoktur (`.env.example`'daki `IYZICO_WEBHOOK_SECRET` kullanılmaz).

| # | Adım | Beklenen |
|---|------|----------|
| B1 | Başarılı kartla öde, iyzico "başarılı" sayfasında **tarayıcı sekmesini hemen kapat** (callback gelmesin) | 10–15 sn içinde bildirim gelir; admin → sipariş: Ödendi; olaylarda `webhook.CHECKOUT_FORM_AUTH` satırı **İşlendi (paid)** ve `verify.success` (kaynak: Bildirim) |
| B2 | Normal ödeme (callback de gelir) | Hangisi önce gelirse sipariş Ödendi olur; sonraki `already_paid` ya da `settled:paid` olarak kapanır. Sipariş tek kez Ödendi, stok tek kez düşer |
| B3 | Panelde bildirim adresini geçici olarak yanlış yap (ör. 404 veren yol) → öde → adresi düzelt | iyzico 15 dk arayla en çok 3 kez dener; düzeltme 3. denemeden önceyse bildirim işlenir. Kaçtıysa admin → "iyzico'dan sorgula" ile düzelir (C1) |
| B4 | Başarısız kartla öde | Bildirim gelir, deneme **Başarısız**; sipariş Ödeme bekleniyor kalır |
| B5 | Gerçek bildirimin gövdesini ve başlıklarını not edin (gelen kutusu satırının içeriği) | `iyziPaymentId`/`iyziEventTime` sayı mı metin mi, `merchantId` alanı, imza başlığının adı — dokümanla karşılaştırın, farklıysa `harbi/FINDINGS.md`'ye yazın |

## C. Elle sorgu ("iyzico'dan sorgula")

| # | Adım | Beklenen |
|---|------|----------|
| C1 | B1'i webhook adresi tanımlı değilken yap (bildirim de gelmesin), sonra admin → sipariş → "iyzico'dan sorgula" | Sonuç kutusunda iyzico durumu SUCCESS, ödeme no, tutarlar; sipariş Ödendi; olaylarda `manual_query.run` (admin kimliği) |
| C2 | Sipariş süre dolup iptal edildikten sonra C1 | "Geç ödeme" — stok varsa sipariş yeniden açılır ve **Dikkat** işaretlenir |

## D. Sandbox yokken yerel deneme

Uç noktanın imza doğrulaması, gelen kutusu ve tekrar koruması gerçek HTTP üzerinden şu betikle
denenebilir (iyzico'yu taklit eder, gerçek bildirim biçimini kanıtlamaz):

```bash
npx tsx scripts/iyzico-webhook-sim.ts --attempt <denemeId> --twice
```

- 1. gönderim `200 {"received":true,"duplicate":false}`, 2. gönderim `duplicate:true` olmalı.
- `--bad-signature` ile `401` ve admin'de imza alarmı.
- Betik yalnız yerel adrese gönderir; `IYZICO_SECRET_KEY` `.env`'den okunur.

### Tam yerel uçtan uca (sahte iyzico sunucusuyla)

Sandbox anahtarı yokken tarayıcı → site → "iyzico" → dönüş/bildirim zincirinin tamamı gerçek HTTP
üzerinden şöyle denenir (2026-10-01'de bu yolla denendi; sonuçlar `harbi/PROGRESS.md`):

1. Sahte iyzico: `npx tsx scripts/dev/fake-iyzico-server.ts --port 3299`
2. Site derlemesi, dönüş adresiyle: `NEXT_PUBLIC_APP_URL=http://127.0.0.1:3200 npx next build`
   (`NEXT_PUBLIC_*` derleme anında gömülür; denemeden sonra normal ayarla yeniden derleyin.)
3. Site: `PAYMENT_PROVIDER=iyzico IYZICO_API_KEY=test-api-key IYZICO_SECRET_KEY=test-secret-key
   IYZICO_BASE_URL=http://127.0.0.1:3299 npx next start -p 3200 -H 127.0.0.1`
4. Kartla sipariş → sahte ödeme sayfası:
   - "Öde ve siteye dön" → tarayıcı dönüşü (POST) → sipariş sayfası "Siparişiniz alındı".
   - "Öde, siteye dönme" → sipariş Ödeme bekleniyor kalır; sonra
     `IYZICO_SECRET_KEY=test-secret-key npx tsx scripts/iyzico-webhook-sim.ts --attempt <id> --payment-id <sahte sayfadaki ödeme no> --url http://127.0.0.1:3200/api/payment/webhook/iyzico --twice`
     → 1. teslim işlenir (Ödendi), 2. teslim `duplicate:true`.
   - Hiçbir haber gelmezse admin → sipariş → "iyzico'dan sorgula".

Bu düzen DB'ye gerçek sipariş yazar: denemeyi yerel/geçici bir veritabanında yapın ve sonra
yedekten geri dönün.
