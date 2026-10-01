/**
 * Production sunucusu açılış denetimi — yalnız Node.js çalışma ortamında (instrumentation.ts içe aktarır).
 * Hata varsa sebebi loga yazar ve süreci durdurur. Yalnız hata fırlatmak yetmiyor: Next sunucusu ayakta
 * kalıp her isteğe 500 dönüyor, barındırma panelinde "çalışıyor" görünüyordu (denendi).
 * Derleme sırasında (next build) çalışmaz: derleme ortamında çalışma zamanı ayarları eksik olabilir.
 */

import { checkProductionConfig } from "./runtime-check";

export function runStartupCheck(env: NodeJS.ProcessEnv = process.env) {
  if (env.NODE_ENV !== "production") return;
  if (env.NEXT_PHASE === "phase-production-build") return;

  // NEXT_PUBLIC_APP_URL derleme anında koda gömülür (aşağıdaki `process.env.NEXT_PUBLIC_APP_URL` derlemede
  // metne çevrilir); uygulamanın kullandığı adres budur. Ortamdaki değer derlemeden sonra değiştiyse
  // ödeme dönüşü ve bağlantılar eski adrese gider: yeniden derlemek gerekir.
  const builtAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const runtimeAppUrl = env.NEXT_PUBLIC_APP_URL;
  const { errors, warnings } = checkProductionConfig({ ...env, NEXT_PUBLIC_APP_URL: builtAppUrl ?? runtimeAppUrl });
  if (builtAppUrl && runtimeAppUrl && builtAppUrl !== runtimeAppUrl) {
    errors.push(
      `NEXT_PUBLIC_APP_URL derlemeden sonra değişmiş (kodda ${builtAppUrl}, ortamda ${runtimeAppUrl}): yeniden derleyin.`
    );
  }

  for (const w of warnings) console.warn(`[ayar] UYARI: ${w}`);
  if (errors.length > 0) {
    for (const e of errors) console.error(`[ayar] HATA: ${e}`);
    console.error(`[ayar] Yayın ayarları eksik ya da hatalı (${errors.length} hata) — sunucu durduruluyor.`);
    process.exit(1);
  }
}
