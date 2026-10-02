// Yerel site — VERİTABANLI (siparişler, yönetim paneli, demo kart ödemesi çalışır). harbi/Siteyi Ac.bat kullanır.
// Veritabanı .env'deki DATABASE_URL'dir (Docker: ciftciece-mariadb, 127.0.0.1:3316; harbi/docker-baslat.ps1 açar).
// Site adresi 3100'e sabitlenir: .env'deki NEXT_PUBLIC_APP_URL / NEXTAUTH_URL başka porttaysa ödeme dönüşü ve oturum
// yanlış adrese giderdi (.env dosyası mevcut ortam değişkenlerini ezmez).
const path = require("node:path");
const root = path.resolve(__dirname, "..");
process.chdir(root);
process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3100";
process.env.NEXTAUTH_URL = "http://localhost:3100";
process.env.NEXT_TELEMETRY_DISABLED = "1";
// -H 127.0.0.1: yalnızca bu bilgisayardan erişilir (ağa açılmaz, güvenlik duvarı sormaz)
process.argv = [process.argv[0], "next", "dev", "-p", "3100", "-H", "127.0.0.1"];
require(path.join(root, "node_modules", "next", "dist", "bin", "next"));
