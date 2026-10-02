# Yayına alma — Hostinger (ilk kurulum)

Bu belge sitenin Hostinger'da ilk kez yayına alınmasını adım adım anlatır. Hostinger hesabı, alan adı, e-posta
hesabı ve GitHub tarafındaki işlemler sizin; kod tarafı hazır. Canlı veritabanına geliştirici (Claude) bağlanmaz;
komutları siz çalıştırırsınız. Ortam değişkenlerinin tam listesi: depodaki `.env.example`.

## 0. Ön koşullar

- **Hostinger paketi: Business Web Hosting ya da bir Cloud paketi.** Node.js uygulaması yalnız bunlarda
  çalışır; Single/Premium paketlerde bu site çalışmaz. Paketin hPanel'inde "Node.js" bölümü olmalı.
- Alan adı (öneri: Türkçe karaktersiz, ör. `ciftciece.com`; Türkçe karakterli alan adlarında e-posta adresleri
  birçok sistemde sorun çıkarır).
- GitHub deposu. **Önerimiz özel (private) depo**: kodda gizli bilgi yok, ama iş kuralları ve yönetim paneli
  yapısı herkese açık olmasın. Hostinger özel depoya GitHub hesabınızı bağlayarak erişir.
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
DATABASE_URL="mysql://KULLANICI:SIFRE@MYSQL_SUNUCU_ADI:3306/VERITABANI" ADMIN_USERNAME="ece" ADMIN_EMAIL="siz@alanadiniz.com" ADMIN_PASSWORD="EN-AZ-12-KARAKTER-1" npx prisma db seed
```

- Birinci komut tabloları ve veri kurallarını (CHECK kısıtları) kurar.
- İkinci komut kataloğu (kategoriler, ürünler, başlangıç stokları, mağaza yorumları, kargo ayarı) yükler ve
  yönetici hesabını açar. Tekrar çalıştırmak güvenlidir: var olan kayıtlara dokunmaz, yönetici şifresini
  değiştirmez.
- **Yönetici girişi:** `/admin/giris` → **kullanıcı adı** (`ADMIN_USERNAME`; küçük harf, rakam, `. _ -`, 3–40
  karakter) ya da e-posta + şifre. Şifre en az 12 karakter, harf ve rakam içermeli. Kullanıcı adı, e-posta ve
  şifre sonradan **Admin → Ayarlar → Yönetici hesabı**'ndan değiştirilir (mevcut şifre istenir; şifre değişince
  açık oturumlar en geç 5 dakikada kapanır). Şifre unutulursa SSH'tan ya da bilgisayardan
  `ADMIN_USERNAME=... ADMIN_EMAIL=... ADMIN_PASSWORD=... npm run admin:hesap` (aynı veritabanı adresiyle) hesabı
  günceller.
- Şifrede `@ : / ? #` gibi karakterler varsa adreste URL kodlamasıyla yazılmalıdır (ör. `@` → `%40`).
- Windows'ta (PowerShell) değişkenleri önce ayrı satırda tanımlayın: `$env:DATABASE_URL="..."` sonra komut.

## 3. E-posta hesabı (hPanel)

Sipariş teyidi, havale bilgisi, kargo takibi, iade gibi e-postalar ve müşteriye yazdığınız mesajlar bu hesaptan
gider. Sipariş teyit e-postası (sözleşmelerle birlikte) yasal zorunluluktur.

1. hPanel → **Emails**: alan adınızda bir hesap açın, ör. `siparis@alanadiniz.com`. Şifresini not edin.
   - Hostinger'ın ücretsiz e-posta planının günlük gönderim sınırı düşüktür; paket özelliklerinden günlük
     gönderim sınırını kontrol edin (Business Starter'da günde 1000 — Hostinger'ın ilan ettiği değer).
2. Aynı bölümde alan adının **SPF, DKIM ve DMARC** kayıtlarının etkin olduğunu kontrol edin. Alan adı Hostinger
   DNS'ini kullanıyorsa genelde kendiliğinden eklenir; eksikse e-postalar gereksiz (spam) klasörüne düşer.
   (Hostinger panelindeki tam menü adı doğrulanmadı.)
3. Sitede ayrıca Admin → Ayarlar → İşletme: **e-posta** (müşteriye görünen, yanıtların geleceği adres) ve
   **bildirim e-postası** (yeni sipariş, ödeme uyarısı, iletişim mesajı size buraya gelir).

## 4. Node.js uygulaması (hPanel)

1. hPanel → **Node.js** (Web Apps) → yeni uygulama → **GitHub'dan içe aktar** → depo ve `main` dalı.
2. Node sürümü: **22** (ya da 24). Framework: Next.js (otomatik algılanır).
3. Derleme komutu: `npm run build` (Prisma istemcisini üretir, sonra derler). Başlatma: `npm start`.
4. **Ortam değişkenleri** (derlemede de okunur; kaydedince site yeniden derlenir):

| Değişken | Değer |
|---|---|
| `DATABASE_URL` | `mysql://KULLANICI:SIFRE@localhost:3306/VERITABANI?connection_limit=5` (sunucu içinden `localhost`) |
| `NEXTAUTH_URL` | `https://alanadiniz.com` |
| `NEXT_PUBLIC_APP_URL` | `https://alanadiniz.com` (NEXTAUTH_URL ile aynı) |
| `NEXTAUTH_SECRET` | En az 32 karakter rastgele değer (`openssl rand -base64 32`) |
| `SMTP_HOST` | `smtp.hostinger.com` |
| `SMTP_PORT` | `465` (SSL; olmazsa `587`) |
| `SMTP_USER` | 3. adımdaki hesabın tam adresi (ör. `siparis@alanadiniz.com`) |
| `SMTP_PASS` | O hesabın şifresi |
| `EMAIL_FROM` | `Çiftçi Ece <siparis@alanadiniz.com>` (adres SMTP_USER ile aynı olmalı) |
| `CRON_SECRET` | En az 24 karakter rastgele değer (`openssl rand -hex 24`); 6. adımda kullanılır |
| `PAYMENT_PROVIDER` | `akbank` |
| `AKBANK_ENV` | Sanal POS gelene kadar boş bırakılabilir; test bilgileri gelince `test`, sonra `prod` |
| `AKBANK_MERCHANT_SAFE_ID`, `AKBANK_TERMINAL_SAFE_ID`, `AKBANK_SECRET_KEY` | Akbank verince (docs/AKBANK_TEST.md). Boşken kart **demo**dur: müşteri “yakında” görür, sipariş havale/EFT ve kapıda ödemeyle alınır; yönetici girişiyle banka sayfasının demo kopyası açılır (aşağıda “Banka sunumu”) |

Tanımlanmaması gerekenler: `ALLOW_STUB_PAYMENTS`, `LOCAL_PRODUCTION_TEST`, `AKBANK_API_URL`,
`AKBANK_GATEWAY_URL` (yalnız yerel deneme), `ADMIN_PASSWORD` (yalnız ilk kurulumda, bilgisayarınızda).
`PAYMENT_PROVIDER=stub` canlıda site açılmaz (test sağlayıcısı her ödemeyi başarılı sayar).

5. Yayınla. Her `main` push'unda Hostinger yeniden derler.

**Site açılmazsa:** Uygulama, eksik ya da tehlikeli ayarla bilerek açılmaz. Çalışma günlüğünde (runtime logs)
`[ayar] HATA: ...` satırları neyin eksik olduğunu yazar (ör. zayıf `NEXTAUTH_SECRET`, `http` adres). Düzeltip
yeniden başlatın. `[ayar] UYARI` satırları siteyi durdurmaz (ör. e-posta ya da Akbank bilgisi henüz yok).

## 5. Alan adı ve HTTPS

hPanel → alan adını uygulamaya bağlayın, ücretsiz SSL'i açın ve HTTP'yi HTTPS'e yönlendirin.
Site adresi değişirse `NEXTAUTH_URL` ve `NEXT_PUBLIC_APP_URL`'i güncelleyip **yeniden derleyin**
(`NEXT_PUBLIC_APP_URL` derleme anında koda gömülür).

## 6. Zamanlanmış iş (hPanel → Advanced → Cron Jobs)

Hostinger Node.js uygulamasını ziyaretçi yokken durdurabilir; arka planda zamanlayıcıya güvenilmez. Şu işler
5 dakikada bir bu adres çağrılarak yapılır: ödeme sayfasında kalmış kart ödemelerinin bankaya sorulması, süresi
dolan ödenmemiş siparişlerin iptali (stok geri döner), havale hatırlatması, gönderilemeyen e-postaların yeniden
denenmesi.

Yeni cron görevi → **5 dakikada bir** (`*/5 * * * *`) → özel komut:

```bash
curl -fsS -m 60 -H "Authorization: Bearer CRON_SECRET_DEGERI" https://alanadiniz.com/api/cron/run
```

- `CRON_SECRET_DEGERI` yerine 4. adımdaki değeri yazın.
- Hostinger cron'unda `curl` kullanılabildiği doğrulanmadı. Kullanılamıyorsa ücretsiz bir dış servis
  (ör. cron-job.org) aynı adresi `https://alanadiniz.com/api/cron/run?key=CRON_SECRET_DEGERI` biçimiyle 5 dakikada
  bir çağırabilir (anahtar adreste olduğu için yalnız güvendiğiniz serviste kullanın).
- Çalıştığını görmek: adresi tarayıcıda `?key=...` ile açın → `{"ok":true,...}` döner.

## 7. Yayın sonrası kontrol

1. `https://alanadiniz.com/api/health` → `{"status":"ok","db":"ok", ... "checks":{"strictMode":true,"utf8mb4":true,"readCommittedSafe":true}}`.
   - `readCommittedSafe: false`: veritabanının ikili günlüğü STATEMENT biçiminde. Bu biçimde MariaDB, sipariş
     ve ödeme işlemlerinin kullandığı yalıtım düzeyinde (READ COMMITTED) yazmayı reddeder (hata 1665 —
     yerelde denendi): **sipariş alınamaz.** Hostinger desteğinden biçimin MIXED ya da ROW yapılmasını
     isteyin; olmazsa haber verin (kod tarafında başka çözüm gerekir). Varsayılan MariaDB ayarı (MIXED) sorunsuz.
   - `"degraded"` ve `strictMode: false`: veritabanı "katı mod"da değil — sığmayan veri hata vermek yerine
     sessizce kesilebilir. Hostinger desteğine sorun; düzelene kadar yayına almayın.
   - `utf8mb4: false`: veritabanı Türkçe karakter/emoji için doğru karakter setinde açılmamış; veritabanını
     utf8mb4 ile yeniden açın (henüz sipariş yokken).
2. `/admin/giris` → yönetici girişi → **Panel**: "Yayın ve banka incelemesi kontrol listesi"ndeki maddeleri
   tamamlayın (işletme bilgileri, IBAN, e-posta, cron, kargo tarifesi, KDV, yasal metinler).
3. Admin → **E-postalar** → "Deneme e-postası gönder": gelen kutunuza (gereksiz klasörüne de bakın) gelmeli.
4. Ana sayfa, kategori, ürün, arama, sepet, ödeme sayfası açılıyor mu; ürün fotoğrafları görünüyor mu
   (Admin → Ürünler → ürün → Fotoğraflar ile yenileri eklenir).
5. Havale ile deneme siparişi verin → teyit e-postası (sözleşmelerle) ve sipariş sayfasında IBAN görünüyor mu →
   admin'den iptal edin (stok geri gelir, müşteriye iptal e-postası gider).
6. Akbank sanal POS bilgileri gelince: docs/AKBANK_TEST.md.

## 7b. Banka sunumu (sanal POS başvurusu — demo ödeme)

Sanal POS bilgileri girilmeden kartla ödeme, bankanın güvenli ödeme sayfasının **demo kopyasıyla** baştan sona
gösterilebilir. Gerçek para çekilmez; kart bilgileri tarayıcıdan çıkmaz, hiçbir yere gönderilmez. Demo **yalnız
yönetici oturumunda** çalışır: müşteriler bu sırada kartı “yakında” görür.

1. `/admin/giris` → kullanıcı adınız ve şifrenizle girin. Aynı tarayıcıda siteye geçin.
2. Ürünü sepete ekleyin → ödeme → iletişim ve teslimat bilgileri → ödeme yöntemi **Kredi / Banka Kartı (DEMO)**
   → sözleşmeyi onaylayın → **Siparişi onayla ve öde**.
3. Demo banka sayfası açılır: **Test kartıyla doldur** (ya da geçerli biçimde herhangi bir kart numarası) →
   **Ödemeyi onayla**.
4. Ekranın üstünde telefona gelmiş gibi **SMS** görünür. 6 haneli kodu yazıp **Onayla** deyin. Yanlış kodda hak
   azalır; 3 yanlışta ödeme reddedilir ve müşteri ödeme adımına döner (bankalardaki gibi). **Vazgeç** de aynı yere
   döndürür.
5. “Siparişiniz alındı” sayfası gelir. Admin → **Siparişler**: sipariş **Ödendi** olarak düşer, üstünde “Demo
   ödeme: gerçek para alınmadı” uyarısı ve ödeme olayları (kod gönderildi / yanlış kod / onay) görünür.
6. Sunumdan sonra demo siparişini kapatın: sipariş → İade formu → yöntem “Diğer”, sebep “demo ödeme”, “siparişi
   kapat” işaretli → **İadeyi kaydet** (stok geri gelir; demo ödemeler ciroya sayılmaz).

Akbank bilgileri hPanel'e girildiği anda demo kendiliğinden kapanır, kart bankanın gerçek (önce test) sayfasına
gider. Sunumu gerçek alan adında, `https://` (SSL açık) adresle yapın.

## 8. Yedek

- Business ve üstü paketlerde Hostinger dosyaları ve veritabanlarını günlük yedekler (hPanel → Files →
  Backups). Kaç gün saklandığını panelden kontrol edin.
- **Gerçek sipariş almadan önce bir kez geri yüklemeyi deneyin** (Restore → Database only). Yedeğin
  çalıştığından ancak böyle emin olunur.
- Ek güvence: düzenli olarak bir veritabanı yedeğini indirip başka bir yerde saklayın. Ürün fotoğrafları da
  veritabanındadır (yedeğe dahil).

## 9. Güncellemeler ve migration

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
- Cron çağrısı kurulmazsa: kart ödemesi tamamlanıp tarayıcı siteye dönmediğinde sipariş ancak admin "Akbank'tan
  sorgula" ile ya da müşteri sayfayı açınca güncellenir; süresi dolan siparişler sayfa ziyaretlerinde temizlenir;
  gönderilemeyen e-postalar yeniden denenmez.
- E-posta gönderim sınırı aşılırsa e-postalar kuyrukta bekler ve sonra yeniden denenir; admin → E-postalar'da
  görünür.
