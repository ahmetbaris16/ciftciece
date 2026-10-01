/**
 * Sunucu açılışı (Next.js instrumentation): production'da ayarlar denetlenir; hata varsa sebebi loga
 * yazılır ve süreç durur (lib/config/runtime-check.ts). Yalnız hata fırlatmak yetmiyor: Next sunucusu
 * ayakta kalıp her isteğe 500 dönüyor, barındırma panelinde "çalışıyor" görünüyordu (denendi).
 * Derleme sırasında (next build) çalışmaz: derleme ortamında çalışma zamanı ayarları eksik olabilir.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { checkProductionConfig } = await import("@/lib/config/runtime-check");
  const { errors, warnings } = checkProductionConfig(process.env);
  for (const w of warnings) console.warn(`[ayar] UYARI: ${w}`);
  if (errors.length > 0) {
    for (const e of errors) console.error(`[ayar] HATA: ${e}`);
    console.error(`[ayar] Yayın ayarları eksik ya da hatalı (${errors.length} hata) — sunucu durduruluyor.`);
    process.exit(1);
  }
}
