# Yayına alma — Hostinger (ilk kurulum)

Bu belge sitenin Hostinger'da ilk kez yayına alınmasını adım adım anlatır. Hostinger hesabı, alan adı
ve GitHub tarafındaki işlemler sizin; kod tarafı hazır. Canlı veritabanına geliştirici (Claude) bağlanmaz;
komutları siz çalıştırırsınız.

## 0. Ön koşullar

- **Hostinger paketi: Business Web Hosting ya da bir Cloud paketi.** Node.js uygulaması yalnız bunlarda
  çalışır; Single/Premium paketlerde bu site çalışmaz. Paketin hPanel'inde "Node.js" bölümü olmalı.
- Alan adı (öneri: Türkçe karaktersiz, ör. `ciftciece.com`; Türkçe karakterli alan adlarında e-posta adresleri
  birçok sistemde sorun çıkarır).
- GitHub'da **özel (private)** depo. Hostinger özel depoya GitHub hesabınızı bağlayarak erişir.
- Bilgisayarınızda Node.js 22 ya da 24 ve bu proje (`npm install` yapılmış).

## 1. Veritabanı (hPanel)

1. hPanel → Websites → Dashboard → **Databases → Management**: yeni MySQL veritabanı ve kullanıcı açın.
   Ad, kullanıcı ve şifreyi bir yere not edin (şifre güçlü olsun).
   - Hostinger'ın veritabanı MariaDB'dir (MySQL uyumlu); uygulama buna göre yazıldı ve yerelde aynı
     sürümle (11.8) test edildi.
2. **Remote MySQL** (aynı bölüm): bilgisayarınızın IP adresine izin verin. Bu yalnız ilk kurulumu ve
   ileride migration'ları bilgisayarınızdan çalıştırmak içindir. Sayfanın üstündeki **MySQL sunucu adını**
   not edin (bilgisayardan bağlanırken `localhost` yerine bu kullanılır).

## 2. İlk kurulum (bilgisayarınızdan, bir kez)

Proje klasöründe, Hostinger veritabanını gösteren adresle:

```bash
DATABASE_URL="mysql://KULLANICI:SIFRE@MYSQL_SUNUCU_ADI:3306/VERITABANI" npx prisma migrate deploy
```

```bash
DATABASE_URL="mysql://KULLANICI:SIFRE@MYSQL_SUNUCU_ADI:3306/VERITABANI" ADMIN_EMAIL="siz@alanadiniz.com" ADMIN_PASSWORD="EN-AZ-12-KARAKTER-1" npx prisma db seed
```

- Birinci komut tabloları ve veri kurallarını (CHECK kısıtları) kurar.
- İkinci komut kataloğu (kategoriler, ürünler, başlangıç stokları, mağaza yorumları, kargo ayarı) yükler ve
  yönetici hesabını açar. Şifre en az 12 karakter, harf ve rakam içermeli. Tekrar çalıştırmak güvenlidir:
  var olan kayıtlara dokunmaz, yönetici şifresini değiştirmez.
- Şifrede `@ : / ? #` gibi karakterler varsa adreste URL kodlamasıyla yazılmalıdır (ör. `@` → `%40`).
- Windows'ta (PowerShell) değişkenleri önce ayrı satırda tanımlayın: `$env:DATABASE_URL="..."` sonra komut.

## 3. Node.js uygulaması (hPanel)

1. hPanel → **Node.js** (Web Apps) → yeni uygulama → **GitHub'dan içe aktar** → depo ve `main` dalı.
2. Node sürümü: **22** (ya da 24). Framework: Next.js (otomatik algılanır).
3. Derleme komutu: `npm run build` (Prisma istemcisini üretir, sonra derler). Başlatma: `npm start`.
4. **Ortam değişkenleri** (derlemede de okunur):

| Değişken | Değer |
|---|---|
| `DATABASE_URL` | `mysql://KULLANICI:SIFRE@localhost:3306/VERITABANI?connection_limit=5` (sunucu içinden `localhost`) |
| `NEXTAUTH_URL` | `https://alanadiniz.com` |
| `NEXT_PUBLIC_APP_URL` | `https://alanadiniz.com` (NEXTAUTH_URL ile aynı) |
| `NEXTAUTH_SECRET` | En az 32 karakter rastgele değer (`openssl rand -base64 32`) |
| `PAYMENT_PROVIDER` | iyzico anahtarları gelince `iyzico`; o zamana kadar boş bırakılabilir (kart gizli kalır) |
| `IYZICO_API_KEY`, `IYZICO_SECRET_KEY`, `IYZICO_BASE_URL` | iyzico'dan; önce sandbox (`https://sandbox-api.iyzipay.com`), sonra canlı (`https://api.iyzipay.com`) |

Tanımlanmaması gerekenler: `ALLOW_STUB_PAYMENTS`, `LOCAL_PRODUCTION_TEST`, `ADMIN_PASSWORD` (yalnız ilk
kurulumda, bilgisayarınızda kullanılır).

5. Yayınla. Her `main` push'unda Hostinger yeniden derler.

**Site açılmazsa:** Uygulama, eksik ya da tehlikeli ayarla bilerek açılmaz. Çalışma günlüğünde (runtime logs)
`[ayar] HATA: ...` satırları neyin eksik olduğunu yazar (ör. zayıf `NEXTAUTH_SECRET`, `http` adres). Düzeltip
yeniden başlatın.

## 4. Alan adı ve HTTPS

hPanel → alan adını uygulamaya bağlayın, ücretsiz SSL'i açın ve HTTP'yi HTTPS'e yönlendirin.
Site adresi değişirse `NEXTAUTH_URL` ve `NEXT_PUBLIC_APP_URL`'i güncelleyip **yeniden derleyin**
(`NEXT_PUBLIC_APP_URL` derleme anında koda gömülür).

## 5. Yayın sonrası kontrol

1. `https://alanadiniz.com/api/health` → `{"status":"ok","db":"ok", ... "checks":{"strictMode":true,"utf8mb4":true}}`.
   - `"degraded"` ve `strictMode: false`: veritabanı "katı mod"da değil — sığmayan veri hata vermek yerine
     sessizce kesilebilir. Hostinger desteğine sorun; düzelene kadar yayına almayın.
   - `utf8mb4: false`: veritabanı Türkçe karakter/emoji için doğru karakter setinde açılmamış; veritabanını
     utf8mb4 ile yeniden açın (henüz sipariş yokken).
2. Ana sayfa, kategori, ürün, arama, sepet, ödeme sayfası açılıyor mu.
3. `/admin/giris` → yönetici girişi. Ayarlar → Ödeme: IBAN, banka adı, hesap sahibi; Kargo: tarife, koliler,
   paket ölçüleri. Ürünler: gerçek stoklar ve KDV oranları.
4. Havale ile deneme siparişi verin → sipariş sayfasında IBAN görünüyor mu → admin'den iptal edin
   (stok geri gelir).

## 6. Yedek

- Business ve üstü paketlerde Hostinger dosyaları ve veritabanlarını günlük yedekler (hPanel → Files →
  Backups). Kaç gün saklandığını panelden kontrol edin.
- **Gerçek sipariş almadan önce bir kez geri yüklemeyi deneyin** (Restore → Database only). Yedeğin
  çalıştığından ancak böyle emin olunur.
- Ek güvence: düzenli olarak bir veritabanı yedeğini indirip başka bir yerde saklayın.

## 7. Güncellemeler ve migration

- Kod değişikliği: `main`'e push → Hostinger derler ve yeniden başlatır.
- **Yeni migration varsa** (prisma/migrations altında yeni klasör): kodu push etmeden **önce** bilgisayarınızdan
  `npx prisma migrate deploy` (2. adımdaki adresle) çalıştırın. Migration'lar yalnız ekleme yapacak şekilde
  yazılır; eski kod yeni tablo/kolonlarla çalışmaya devam eder.

## Kalan riskler

- Tek uygulama sunucusu ve tek veritabanı: biri çökerse site durur. Günlük yedekte en kötü durumda bir
  günlük kayıt kaybolabilir.
- Paylaşımlı hostingde kaynak sınırları var (saatlik veritabanı bağlantı sınırı, CPU, bellek).
- Hostinger derleme ortamının veritabanına erişimi canlıda doğrulanmadı: sayfaların bir kısmı derleme
  anında veritabanından üretilir. Derleme veritabanına ulaşamazsa derleme hatası görülür; o zaman bu
  sayfalar "ilk istekte üret" moduna alınır.
