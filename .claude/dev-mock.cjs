const path = require("node:path");
const root = path.resolve(__dirname, "..");
process.chdir(root);
// DATABASE_URL boş → lib/data/source.ts veritabanı yerine prisma/catalog.ts'ten mock veri kullanır
process.env.DATABASE_URL = "";
process.env.NEXT_TELEMETRY_DISABLED = "1";
// -H 127.0.0.1: yalnızca bu bilgisayardan erişilir (ağa açılmaz, güvenlik duvarı sormaz)
process.argv = [process.argv[0], "next", "dev", "-p", "3100", "-H", "127.0.0.1"];
require(path.join(root, "node_modules", "next", "dist", "bin", "next"));
