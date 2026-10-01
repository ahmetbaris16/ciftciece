/**
 * Üyelik ve sistem e-postaları: şifre yenileme, ayar denemesi.
 */

import type { BusinessInfo } from "@/lib/business/info";
import { emailFooter } from "../brand";
import { button, notice, paragraph, renderEmail } from "../layout";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function passwordResetEmail(opts: {
  business: BusinessInfo;
  firstName: string;
  url: string;
  ttlMinutes: number;
}): RenderedEmail {
  const { business } = opts;
  const { html, text } = renderEmail({
    brandName: business.tradeName,
    preheader: "Şifrenizi yenilemek için bağlantınız hazır.",
    title: "Şifrenizi yenileyin",
    blocks: [
      paragraph(opts.firstName ? `Merhaba ${opts.firstName},` : "Merhaba,"),
      paragraph(
        `${business.tradeName} üyeliğiniz için şifre yenileme isteği aldık. Yeni şifrenizi belirlemek için aşağıdaki düğmeye tıklayın.`
      ),
      button("Yeni şifre belirle", opts.url),
      paragraph(`Bağlantı ${opts.ttlMinutes} dakika geçerlidir ve yalnız bir kez kullanılabilir.`, { muted: true, small: true }),
      notice("Bu isteği siz yapmadıysanız bu e-postayı yok sayın; şifreniz değişmez.", "info"),
    ],
    footer: emailFooter(business, "Bu e-postayı şifre yenileme isteğiniz üzerine aldınız."),
  });
  return { subject: `${business.tradeName} — şifre yenileme bağlantınız`, html, text };
}

/** Admin "Deneme e-postası gönder": ayarların çalıştığını gösterir */
export function testEmail(opts: { business: BusinessInfo; sentBy: string }): RenderedEmail {
  const { business } = opts;
  const { html, text } = renderEmail({
    brandName: business.tradeName,
    preheader: "E-posta ayarlarınız çalışıyor.",
    title: "E-posta ayarları çalışıyor",
    blocks: [
      paragraph("Bu bir deneme e-postasıdır. Bu e-postayı görüyorsanız sitenin e-posta gönderimi çalışıyor."),
      notice(
        "Gelen kutusu yerine gereksiz (spam) klasörüne düştüyse alan adınızın SPF/DKIM kayıtlarını kontrol edin (docs/YAYIN.md).",
        "info"
      ),
      paragraph(`Gönderen: ${opts.sentBy}`, { muted: true, small: true }),
    ],
    footer: emailFooter(business, "Bu e-posta yönetim panelinden deneme amacıyla gönderildi."),
  });
  return { subject: `${business.tradeName} — e-posta denemesi`, html, text };
}
