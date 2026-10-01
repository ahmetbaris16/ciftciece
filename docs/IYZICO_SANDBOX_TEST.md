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
