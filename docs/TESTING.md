# Testler

Testler Node'un yerleşik test çalıştırıcısıyla (`node:test`) ve projede zaten kurulu olan `tsx` ile
çalışır. Yeni paket gerekmez. Eşzamanlılık ve transaction testleri **gerçek MariaDB** üzerinde,
geliştirme veritabanından **ayrı bir test veritabanında** çalışır (SQLite ya da mock yok).

Canlı ortam Hostinger web hosting'dir; Hostinger'ın veritabanı MariaDB'dir (MySQL uyumlu). Yerelde de
**aynı sürüm** (11.8) kullanılır ki testler canlıdaki davranışı ölçsün.

## Yerel MariaDB (bir kez)

Konteyner `ciftciece-mariadb`, yalnız bu bilgisayardan erişilir (`127.0.0.1:3316`). 3306 ve 3307
bu bilgisayarda başka MySQL sunucularınca (XAMPP vb.) kullanıldığı için farklı port seçildi.

```bash
docker run -d --name ciftciece-mariadb --restart unless-stopped \
  -p 127.0.0.1:3316:3306 -v ciftciece-mariadb-data:/var/lib/mysql \
  -e MARIADB_ROOT_PASSWORD=<rastgele> -e MARIADB_DATABASE=ciftciece \
  -e MARIADB_USER=ciftciece -e MARIADB_PASSWORD=<rastgele> \
  mariadb:11.8 --character-set-server=utf8mb4 --collation-server=utf8mb4_unicode_ci \
  --default-time-zone=+03:00
```

- `--default-time-zone=+03:00`: sunucu saati bilerek UTC dışında. Canlı sunucunun saat dilimi
  bilinmediği için, tarih değerlerinin veritabanı saatine bağlı olmadığı testlerde de denenir.
- Yerel kullanıcıya test veritabanını ve Prisma'nın geçici "shadow" veritabanını açabilmesi için
  geniş yetki verilir (**yalnız yerelde**; canlıda gerekmez, orada yalnız `migrate deploy` çalışır):

  ```bash
  docker exec ciftciece-mariadb mariadb -uroot -p<root-şifresi> -e "GRANT ALL PRIVILEGES ON *.* TO 'ciftciece'@'%'; FLUSH PRIVILEGES;"
  ```

- `.env` içinde: `DATABASE_URL="mysql://ciftciece:<şifre>@127.0.0.1:3316/ciftciece"`

Sonraki açılışlarda `harbi/Docker Baslat.bat` konteyneri başlatır ve hazır olmasını bekler.
Eski PostgreSQL konteyneri (`ciftciece-postgres`) silinmedi; yalnız `docker-baslat.ps1 -Postgres` ile açılır.

## Kurulum (bir kez, yeni migration eklenince tekrar)

1. Veritabanı konteynerini açın: `harbi/Docker Baslat.bat`.
2. Geliştirme veritabanına migration'ları uygulayın ve kataloğu yükleyin:

   ```bash
   npx prisma migrate deploy
   npm run db:sync-catalog -- --apply --prices
   ```

3. Test veritabanını hazırlayın:

   ```bash
   npm run test:db
   ```

   Bu komut aynı MariaDB sunucusunda `ciftciece_test` veritabanını yoksa oluşturur (utf8mb4) ve tüm
   migration'ları `prisma migrate deploy` ile uygular. Hiçbir şey silmez; tekrar çalıştırmak
   güvenlidir (yalnız eksik migration'lar uygulanır). Yeni bir migration eklendiğinde testlerden
   önce yeniden çalıştırın.

## Çalıştırma

```bash
npm test
```

Test dosyaları `tests/**/*.test.ts`. Dosyalar sırayla çalışır (`--test-concurrency=1`), çünkü hepsi
aynı test veritabanını kullanır.

## Test veritabanı adresi ve korumalar

- Adres `TEST_DATABASE_URL` ortam değişkeninden okunur. Tanımlı değilse `.env` içindeki
  `DATABASE_URL`'in veritabanı adına `_test` eklenir (`ciftciece` → `ciftciece_test`).
- Veritabanı adı `_test` ile bitmiyorsa ya da sunucu yerel değilse (`localhost`, `127.0.0.1`, `::1`)
  testler hiç başlamaz. Ayrıca her test dosyası bağlandığı veritabanının adını yeniden kontrol eder.
- Testler her testten önce `_prisma_migrations` dışındaki **tüm tabloları boşaltır** (yabancı anahtar
  denetimi o işlem süresince kapatılarak `DELETE`). Bu yüzden bu korumalar kaldırılmamalı.
- Ayar `tests/helpers/env.ts` içinde yapılır ve uygulama modüllerinden önce yüklenir
  (`node --import`).

## Ödeme sağlayıcısı testlerde

Testler gerçek iyzico'ya istek göndermez. `tests/helpers/env.ts` sağlayıcıyı sahte anahtarlı
iyzico olarak ayarlar (`test-api-key` / `test-secret-key`); HTTP çağrılarını
`tests/helpers/fake-iyzico.ts` yakalar ve iyzico'nun dokümandaki yanıt biçimini taklit eder.
Yakalanmayan bir dış istek testi hatayla düşürür. Bu testler bizim kodumuzun mantığını doğrular;
iyzico'nun gerçek davranışını doğrulamaz. Gerçek sandbox ile uçtan uca deneme:
`docs/IYZICO_SANDBOX_TEST.md`.

## Bilinen gürültü

Transaction ortasında hata taklidi yapan testler (örn. `withFailingInserts`) test veritabanına
geçici bir tetikleyici (`SIGNAL SQLSTATE '45000'`) ekler ve bilerek DB hatası üretir. Prisma bu hatayı
`prisma:error` olarak konsola yazar; test yine de geçer. Tetikleyici test bitince kaldırılır.

## Yerel production derlemesi

`npm run build` önce `prisma generate` çalıştırır (Hostinger'da Prisma istemcisi böyle üretilir). Windows'ta
geliştirme sunucusu (`Siteyi Ac.bat`, 3100) açıkken Prisma motor dosyası kilitli olduğundan bu adım `EPERM`
ile düşer: derlemeden önce o pencereyi kapatın. Yerel production denemesinde sunucuyu
`LOCAL_PRODUCTION_TEST=1` ile başlatın (aksi hâlde ayar denetimi localhost adresini reddeder;
`lib/config/runtime-check.ts`).

## Sorun giderme

- `Can't reach database server at 127.0.0.1:3316`: Docker ya da konteyner kapalı → `Docker Baslat.bat`.
- `The table ... does not exist`: test veritabanında yeni migration yok → `npm run test:db`.
- `Test veritabanının adı "_test" ile bitmeli`: `TEST_DATABASE_URL` yanlış ayarlanmış.
- `Access denied ... to database 'ciftciece_test'`: yerel kullanıcıya yukarıdaki yetki verilmemiş.
