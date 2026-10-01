/**
 * Test süreci ortamı — `node --import` ile UYGULAMA MODÜLLERİNDEN ÖNCE yüklenir.
 *
 * DATABASE_URL burada test veritabanına çevrilir; Prisma istemcisi ilk kez oluşturulduğunda
 * bu adresi okur. Ödeme sağlayıcısı sahte anahtarlı iyzico'dur: gerçek iyzico'ya istek gitmez,
 * HTTP çağrıları tests/helpers/fake-iyzico.ts tarafından yakalanır (yakalanmayan çağrı hata verir).
 */

import { resolveTestDatabaseUrl } from "./test-database-url";

process.env.DATABASE_URL = resolveTestDatabaseUrl(process.env);

process.env.PAYMENT_PROVIDER = "iyzico";
process.env.IYZICO_API_KEY = "test-api-key";
process.env.IYZICO_SECRET_KEY = "test-secret-key";
process.env.IYZICO_BASE_URL = "https://sandbox-api.iyzipay.com";
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
delete process.env.ALLOW_STUB_PAYMENTS;
