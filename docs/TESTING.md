# Testler

Testler Node'un yerleşik test çalıştırıcısıyla (`node:test`) ve projede zaten kurulu olan `tsx` ile
çalışır. Yeni paket gerekmez. Eşzamanlılık ve transaction testleri **gerçek PostgreSQL** üzerinde,
geliştirme veritabanından **ayrı bir test veritabanında** çalışır (SQLite ya da mock yok).

## Kurulum (bir kez, yeni migration eklenince tekrar)

1. Veritabanı konteynerini açın: `harbi/Docker Baslat.bat` (konteyner `ciftciece-postgres`, `localhost:5433`).
2. Test veritabanını hazırlayın:

   ```bash
   npm run test:db
   ```

   Bu komut aynı PostgreSQL sunucusunda `ciftciece_test` veritabanını yoksa oluşturur ve tüm
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
- Testler her testten önce `_prisma_migrations` dışındaki **tüm tabloları boşaltır** (TRUNCATE).
  Bu yüzden bu korumalar kaldırılmamalı.
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
geçici bir tetikleyici ekler ve bilerek DB hatası üretir. Prisma bu hatayı `prisma:error` olarak
konsola yazar; test yine de geçer. Tetikleyici test bitince kaldırılır.

## Sorun giderme

- `Can't reach database server at localhost:5433`: Docker ya da konteyner kapalı → `Docker Baslat.bat`.
- `relation ... does not exist`: test veritabanında yeni migration yok → `npm run test:db`.
- `Test veritabanının adı "_test" ile bitmeli`: `TEST_DATABASE_URL` yanlış ayarlanmış.
