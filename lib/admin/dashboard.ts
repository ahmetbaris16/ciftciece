/**
 * Admin gösterge paneli: bekleyen işler (rozetler), özet sayılar ve yayın / banka incelemesi kontrol listesi.
 * Yalnız okuma. Kontrol listesi kodun bildiği durumları gösterir; bilmediklerini (SSL, ETBİS, hukukçu kontrolü)
 * "elle kontrol" olarak listeler — yapılmış gibi göstermez.
 */

import { prisma } from "@/lib/db/prisma";
import { USE_DB } from "@/lib/data/source";
import { getBusinessInfo } from "@/lib/business/business.repository";
import { missingBusinessFields } from "@/lib/business/info";
import { getPaymentSettings } from "@/lib/payment/settings.repository";
import { isBankTransferReady } from "@/lib/payment/methods";
import { isTestProvider, paymentProviderStatus } from "@/lib/payment/provider";
import { emailMode } from "@/lib/email/config";
import { getShippingSettings } from "@/lib/shipping/shipping.repository";
import { lastCronRun } from "@/lib/cron/heartbeat";

const dateTimeTr = (d: Date) =>
  new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Istanbul" }).format(d);

export interface AdminBadges {
  /** Ödeme tarafında karar bekleyen (Dikkat) */
  attention: number;
  /** Havale bekleyen siparişler */
  pendingTransfers: number;
  /** Hazırlanıp kargolanacak (ödendi / hazırlanıyor / kapıda ödeme) */
  toShip: number;
  /** Açık müşteri talepleri (iptal/iade) */
  openRequests: number;
  /** Okunmamış iletişim mesajları */
  newMessages: number;
  /** Gönderilemeyen e-postalar */
  failedEmails: number;
}

const EMPTY: AdminBadges = {
  attention: 0,
  pendingTransfers: 0,
  toShip: 0,
  openRequests: 0,
  newMessages: 0,
  failedEmails: 0,
};

export async function getAdminBadges(): Promise<AdminBadges> {
  if (!USE_DB) return EMPTY;
  const [attention, pendingTransfers, toShip, openRequests, newMessages, failedEmails] = await Promise.all([
    prisma.order.count({ where: { needsAttention: true } }),
    prisma.order.count({ where: { status: "PENDING", paymentMethod: "BANK_TRANSFER" } }),
    prisma.order.count({
      where: { status: { in: ["PAID", "PROCESSING"] }, needsAttention: false, requests: { none: { type: "CANCEL", status: "OPEN" } } },
    }),
    prisma.customerRequest.count({ where: { status: "OPEN" } }),
    prisma.contactMessage.count({ where: { status: "NEW" } }),
    prisma.emailMessage.count({ where: { status: "FAILED" } }),
  ]);
  return { attention, pendingTransfers, toShip, openRequests, newMessages, failedEmails };
}

export interface DashboardStats {
  todayOrders: number;
  /** Bu ay alınan ödemeler (banka/havale onayı, kapıda tahsilat); test ödemeleri hariç */
  monthRevenueKurus: number;
  monthPaidOrders: number;
  /** Bu ay girilen iade kayıtları */
  monthRefundKurus: number;
  shipped: number;
  lowStock: Array<{ productName: string; variantName: string; quantity: number }>;
}

/** İstanbul saatine göre bugünün ve ayın başlangıcı (UTC Date) */
function istanbulStarts(now = new Date()): { today: Date; month: Date } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(now)
    .split("-");
  const [y, m, d] = parts.map(Number);
  // İstanbul UTC+3 (yaz saati yok)
  return { today: new Date(Date.UTC(y, m - 1, d, -3)), month: new Date(Date.UTC(y, m - 1, 1, -3)) };
}

export async function getDashboardStats(): Promise<DashboardStats> {
  if (!USE_DB) return { todayOrders: 0, monthRevenueKurus: 0, monthPaidOrders: 0, monthRefundKurus: 0, shipped: 0, lowStock: [] };
  const { today, month } = istanbulStarts();
  // Ciro sipariş durumundan değil, alınmış ödemeden sayılır: kapıda ödemeli sipariş teslimde tahsil edilene kadar
  // ödenmiş sayılmaz; bankanın test ortamındaki ödemeler gerçek para değildir.
  const [todayOrders, paidAttempts, refunds, shipped, low] = await Promise.all([
    prisma.order.count({ where: { createdAt: { gte: today }, status: { not: "CANCELLED" } } }),
    prisma.paymentAttempt.findMany({
      where: { status: "SUCCEEDED", verifiedAt: { gte: month } },
      select: { provider: true, amountKurus: true, paidAmountKurus: true, chargedAmountKurus: true },
    }),
    prisma.refund.findMany({
      where: { createdAt: { gte: month } },
      select: { amountKurus: true, order: { select: { paymentAttempts: { where: { status: "SUCCEEDED" }, select: { provider: true } } } } },
    }),
    prisma.order.count({ where: { status: "SHIPPED" } }),
    prisma.inventory.findMany({
      where: { quantity: { lte: 3 }, variant: { isAvailable: true, product: { isPublished: true } } },
      orderBy: { quantity: "asc" },
      take: 8,
      select: { quantity: true, variant: { select: { name: true, product: { select: { name: true } } } } },
    }),
  ]);
  const real = paidAttempts.filter((a) => !isTestProvider(a.provider));
  return {
    todayOrders,
    monthRevenueKurus: real.reduce((sum, a) => sum + (a.chargedAmountKurus ?? a.paidAmountKurus ?? a.amountKurus), 0),
    monthPaidOrders: real.length,
    // Test ortamında ödenmiş siparişin "iadesi" gerçek para değildir
    monthRefundKurus: refunds
      .filter((r) => r.order.paymentAttempts.some((a) => !isTestProvider(a.provider)))
      .reduce((sum, r) => sum + r.amountKurus, 0),
    shipped,
    lowStock: low.map((l) => ({ productName: l.variant.product.name, variantName: l.variant.name, quantity: l.quantity })),
  };
}

export type CheckState = "ok" | "todo" | "manual";

export interface CheckItem {
  label: string;
  state: CheckState;
  detail: string;
  href?: string;
  /** Sunucu/hosting ya da banka tarafında yapılan iş: Panel'de değil, Ayarlar'daki yayın öncesi listede görünür */
  technical?: boolean;
}

/** Yayın ve banka (sanal POS) incelemesi kontrol listesi */
export async function getLaunchChecklist(): Promise<CheckItem[]> {
  const [business, payment, shipping, cron] = await Promise.all([
    getBusinessInfo(),
    getPaymentSettings(),
    getShippingSettings(),
    USE_DB ? lastCronRun().catch(() => null) : Promise.resolve(null),
  ]);
  const cronKey = (process.env.CRON_SECRET?.trim().length ?? 0) >= 24;
  const cronAgeMin = cron ? Math.floor((Date.now() - cron.at.getTime()) / 60_000) : null;
  const cronFresh = cronAgeMin !== null && cronAgeMin <= 15;
  const missing = missingBusinessFields(business);
  const provider = paymentProviderStatus();
  const mail = emailMode();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const unpricedVat = USE_DB
    ? await prisma.product.count({ where: { isPublished: true, vatRateBps: null } })
    : 0;
  const hasShippingFee = shipping.feeKurus !== null;

  const items: CheckItem[] = [
    {
      label: "İşletme (satıcı) bilgileri",
      state: missing.length === 0 ? "ok" : "todo",
      detail: missing.length === 0 ? "Unvan, vergi ve iletişim bilgileri tamam." : `Eksik: ${missing.join(", ")}.`,
      href: "/admin/ayarlar#isletme",
    },
    {
      label: "Havale/EFT hesabı",
      state: isBankTransferReady(payment.bankTransfer) ? "ok" : "todo",
      detail: isBankTransferReady(payment.bankTransfer)
        ? "IBAN, banka ve hesap sahibi girildi; müşteriye havale seçeneği görünüyor."
        : "IBAN girilmeden havale seçeneği görünmez. Sanal POS gelene kadar siparişler havale ile alınır.",
      href: "/admin/ayarlar#odeme",
    },
    {
      label: "Kartla ödeme (Akbank sanal POS)",
      technical: true,
      state: provider.mode === "live" ? "ok" : "todo",
      detail:
        provider.mode === "live"
          ? "Canlı: kartla ödeme alınıyor."
          : provider.mode === "test"
            ? "Test ortamı: kartı yalnız siz görürsünüz. Denemeler bitince canlıya geçin."
            : provider.mode === "demo"
              ? "Sanal POS bağlı değil: müşteriler kartı “yakında” görür. Siz (yönetici girişiyle) kartla ödemeyi banka sayfasının demo kopyasıyla baştan sona gösterebilirsiniz."
              : "Kartla ödeme kapalı: ödeme sağlayıcısı ayarı (PAYMENT_PROVIDER) geçersiz.",
      href: "/admin/ayarlar#odeme",
    },
    {
      label: "E-posta gönderimi",
      state: mail === "smtp" ? "ok" : "todo",
      detail:
        mail === "smtp"
          ? "Hostinger e-postası bağlı; sipariş e-postaları gidiyor."
          : "E-posta (SMTP) bilgileri hosting'e girilmedi: sipariş e-postaları müşterilere gitmiyor.",
      href: "/admin/ayarlar#eposta",
    },
    {
      label: "Zamanlanmış iş (cron)",
      technical: true,
      state: cronKey && cronFresh ? "ok" : "todo",
      detail: !cronKey
        ? "CRON_SECRET tanımlı değil: süresi dolan siparişler ve e-posta yeniden denemeleri yalnız site trafiğiyle çalışır."
        : cronFresh
          ? `Çalışıyor: son çalışma ${cronAgeMin === 0 ? "az önce" : `${cronAgeMin} dk önce`}${cron?.ok ? "" : " (bir iş hata verdi; çalışma günlüğüne bakın)"}.`
          : cron
            ? `Son çalışma ${dateTimeTr(cron.at)}: 15 dakikadan eski. hPanel → Cron Jobs'taki 5 dakikalık görevi kontrol edin.`
            : "Henüz hiç çalışmadı: hPanel → Cron Jobs'ta 5 dakikalık görevi kurun (docs/YAYIN.md).",
    },
    {
      label: "Kargo ücreti",
      state: hasShippingFee ? "ok" : "todo",
      detail: hasShippingFee
        ? "Sabit kargo ücreti girildi."
        : "Kargo ücreti girilmedi: siparişler alıcı ödemeli gidiyor (müşteri kargoyu teslimatta öder).",
      href: "/admin/ayarlar#kargo",
    },
    {
      label: "Ürün KDV oranları",
      state: unpricedVat === 0 ? "ok" : "todo",
      detail: unpricedVat === 0 ? "Yayındaki tüm ürünlerde KDV oranı var." : `${unpricedVat} yayındaki üründe KDV oranı girilmemiş.`,
      href: "/admin/urunler",
    },
    {
      label: "Site adresi ve SSL",
      technical: true,
      state: appUrl.startsWith("https://") ? "ok" : "manual",
      detail: appUrl.startsWith("https://")
        ? `${appUrl} — tarayıcıda kilit simgesini kontrol edin.`
        : "Canlı alan adı ve SSL Hostinger'da açılınca burada görünür.",
    },
    {
      label: "Yasal metinler ve ETBİS",
      technical: true,
      state: "manual",
      detail:
        "Sözleşme, KVKK ve iade metinleri sitede. Bir hukukçuya/mali müşavire okutun; ETBİS kaydını yapın (işletmenin yükümlülüğü).",
    },
  ];
  return items;
}
