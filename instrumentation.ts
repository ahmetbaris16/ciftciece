/**
 * Sunucu açılışı (Next.js instrumentation): production'da yayın ayarları denetlenir; eksik ya da
 * tehlikeli ayarla süreç durur (lib/config/startup-check.ts, kurallar lib/config/runtime-check.ts).
 * Node'a özel kod yalnız Node.js çalışma ortamında içe aktarılır (Edge derlemesine girmez).
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { runStartupCheck } = await import("@/lib/config/startup-check");
    runStartupCheck();
  }
}
