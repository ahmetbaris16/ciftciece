/**
 * Eski "Yorumlar" sayfası: kaldırıldı. Ürün değerlendirmelerini yalnız ürünü satın alan müşteriler yazar ve hemen
 * yayınlanır (onay yok); uygunsuz yorum ürün sayfasındaki "Yayından kaldır" düğmesiyle kaldırılır (yalnız yöneticiye
 * görünür). Eski bağlantılar ve e-postalar için panele yönlendirir.
 */

import { redirect } from "next/navigation";

export default function AdminYorumlarPage() {
  redirect("/admin");
}
