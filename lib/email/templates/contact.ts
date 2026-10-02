/**
 * İletişim formundan gelen mesaja işletmenin yanıtı (yönetim panelinden). Müşterinin mesajı altta alıntılanır;
 * müşteri yanıtlarsa yanıt işletmenin e-posta adresine gider.
 */

import type { BusinessInfo } from "@/lib/business/info";
import { emailFooter } from "../brand";
import { divider, paragraph, renderEmail } from "../layout";
import type { RenderedEmail } from "./account";

export function contactReplyEmail(opts: {
  business: BusinessInfo;
  name: string;
  subjectLine: string;
  reply: string;
  original: string;
  receivedAt: string;
}): RenderedEmail {
  const firstName = opts.name.trim().split(/\s+/)[0] ?? "";
  const { html, text } = renderEmail({
    brandName: opts.business.tradeName,
    preheader: opts.reply.slice(0, 120),
    title: opts.subjectLine,
    blocks: [
      paragraph(firstName ? `Merhaba ${firstName},` : "Merhaba,"),
      paragraph(opts.reply),
      divider(),
      paragraph(`${opts.receivedAt} tarihli mesajınız:`, { muted: true, small: true }),
      paragraph(opts.original, { muted: true, small: true }),
    ],
    footer: emailFooter(opts.business, "Bu e-postayı sitemizdeki iletişim formundan yazdığınız mesaj üzerine aldınız."),
  });
  return { subject: `Re: ${opts.subjectLine}`, html, text };
}
