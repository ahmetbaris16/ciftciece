/**
 * Test veritabanı adresi — geliştirme veritabanından AYRI, aynı Docker PostgreSQL'de.
 *
 * Öncelik: TEST_DATABASE_URL; yoksa DATABASE_URL'deki veritabanı adına "_test" eklenir
 * (ciftciece → ciftciece_test). Testler tabloları sildiği için iki koruma vardır:
 *  - veritabanı adı "_test" ile bitmeli,
 *  - sunucu yerel olmalı (localhost / 127.0.0.1 / ::1).
 * Biri tutmazsa hata fırlatılır; testler hiçbir zaman geliştirme ya da canlı veritabanına bağlanmaz.
 */

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function resolveTestDatabaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  const explicit = env.TEST_DATABASE_URL?.trim();
  let url: URL;
  if (explicit) {
    url = new URL(explicit);
  } else {
    const base = env.DATABASE_URL?.trim();
    if (!base) {
      throw new Error("TEST_DATABASE_URL ya da DATABASE_URL tanımlı değil (ciftciece/.env).");
    }
    url = new URL(base);
    const dbName = decodeURIComponent(url.pathname.replace(/^\//, ""));
    if (!dbName) throw new Error("DATABASE_URL içinde veritabanı adı yok.");
    url.pathname = `/${encodeURIComponent(dbName.endsWith("_test") ? dbName : `${dbName}_test`)}`;
  }
  assertSafeTestUrl(url);
  return url.toString();
}

export function testDatabaseName(urlString: string): string {
  return decodeURIComponent(new URL(urlString).pathname.replace(/^\//, ""));
}

function assertSafeTestUrl(url: URL) {
  const dbName = decodeURIComponent(url.pathname.replace(/^\//, ""));
  if (!dbName.endsWith("_test")) {
    throw new Error(`Test veritabanının adı "_test" ile bitmeli (şu an: "${dbName}").`);
  }
  if (!LOCAL_HOSTS.has(url.hostname)) {
    throw new Error(`Testler yalnız yerel veritabanında çalışır (şu an: ${url.hostname}).`);
  }
}
