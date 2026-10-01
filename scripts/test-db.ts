/**
 * Test veritabanını hazırlar: yoksa oluşturur, migration'ları uygular (`prisma migrate deploy`).
 *
 *   npm run test:db
 *
 * Veritabanı, geliştirme veritabanıyla AYNI PostgreSQL sunucusunda (Docker: ciftciece-postgres,
 * localhost:5433) ama ayrı bir veritabanıdır: ciftciece_test. Adres tests/helpers/test-database-url.ts
 * kurallarıyla bulunur (adı "_test" ile bitmeyen ya da yerel olmayan bir veritabanına dokunulmaz).
 * Hiçbir şey silinmez; tekrar çalıştırmak güvenlidir (yalnız eksik migration'lar uygulanır).
 */

import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { resolveTestDatabaseUrl, testDatabaseName } from "../tests/helpers/test-database-url";

const root = path.resolve(__dirname, "..");
const envFile = path.join(root, ".env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

async function main() {
  const testUrl = resolveTestDatabaseUrl(process.env);
  const dbName = testDatabaseName(testUrl);

  // Aynı sunucudaki bakım veritabanına ("postgres") bağlanıp test veritabanı yoksa oluştur
  const adminUrl = new URL(testUrl);
  adminUrl.pathname = "/postgres";
  adminUrl.search = "";
  const admin = new PrismaClient({ datasourceUrl: adminUrl.toString() });
  try {
    const rows = await admin.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (SELECT 1 FROM pg_database WHERE datname = ${dbName}) AS "exists"`;
    if (rows[0]?.exists) {
      console.log(`Test veritabanı var: ${dbName}`);
    } else {
      // CREATE DATABASE parametre almaz; ad yukarıda "_test" kuralıyla doğrulandı, yine de tırnaklanır
      await admin.$executeRawUnsafe(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);
      console.log(`Test veritabanı oluşturuldu: ${dbName}`);
    }
  } finally {
    await admin.$disconnect();
  }

  const prismaCli = path.join(root, "node_modules", "prisma", "build", "index.js");
  const result = spawnSync(process.execPath, [prismaCli, "migrate", "deploy"], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: testUrl },
  });
  if (result.status !== 0) {
    throw new Error(`prisma migrate deploy başarısız (çıkış kodu ${result.status}).`);
  }
  console.log("Test veritabanı hazır.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
