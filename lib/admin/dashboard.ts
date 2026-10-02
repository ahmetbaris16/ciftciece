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
import { paymentProviderStatus } from "@/lib/payment/provider";
import { emailMode } from "@/lib/email/config";
import { getShippingSettings } from "@/lib/shipping/shipping.repository";

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
  /** Onay bekleyen ürün değerlendirmeleri */
  pendingReviews: number;
}

const EMPTY: AdminBadges = {
  attention: 0,
  pendingTransfers: 0,
  toShip: 0,
  openRequests: 0,
  newMessages: 0,
  failedEmails: 0,
  pendingReviews: 0,
};

export async function getAdminBadges(): Promise<AdminBadges> {
  if (!USE_DB) return EMPTY;
  const [attention, pendingTransfers, toShip, openRequests, newMessages, failedEmails, pendingReviews] = await Promise.all([
    prisma.order.count({ where: { needsAttention: true } }),
    prisma.order.count({ where: { status: "PENDING", paymentMethod: "BANK_TRANSFER" } }),
    prisma.order.count({ where: { status: { in: ["PAID", "PROCESSING"] }, needsAttention: false } }),
    prisma.customerRequest.count({ where: { status: "OPEN" } }),
    prisma.contactMessage.count({ where: { status: "NEW" } }),
    prisma.emailMessage.count({ where: { status: "FAILED" } }),
    prisma.productReview.count({ where: { status: "PENDING" } }),
  ]);
  return { attention, pendingTransfers, toShip, openRequests, newMessages, failedEmails, pendingReviews };
}

export interface DashboardStats {
  todayOrders: number;
  monthRevenueKurus: number;
  monthPaidOrders: number;
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
  if (!USE_DB) return { todayOrders: 0, monthRevenueKurus: 0, monthPaidOrders: 0, shipped: 0, lowStock: [] };
  const { today, month } = istanbulStarts();
  const paidStatuses = ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"] as const;
  const [todayOrders, monthAgg, shipped, low] = await Promise.all([
    prisma.order.count({ where: { createdAt: { gte: today }, status: { not: "CANCELLED" } } }),
    prisma.order.aggregate({
      where: { createdAt: { gte: month }, status: { in: [...paidStatuses] } },
      _sum: { totalKurus: true },
      _count: { _all: true },
    }),
    prisma.order.count({ where: { status: "SHIPPED" } }),
    prisma.inventory.findMany({
      where: { quantity: { lte: 3 }, variant: { isAvailable: true, product: { isPublished: true } } },
      orderBy: { quantity: "asc" },
      take: 8,
      select: { quantity: true, variant: { select: { name: true, product: { select: { name: true } } } } },
    }),
  ]);
  return {
    todayOrders,
    monthRevenueKurus: monthAgg._sum.totalKurus ?? 0,
    monthPaidOrders: monthAgg._count._all,
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
}

/** Yayın ve banka (sanal POS) incelemesi kontrol listesi */
export async function getLaunchChecklist(): Promise<CheckItem[]> {
  const [business, payment, shipping] = await Promise.all([getBusinessInfo(), getPaymentSettings(), getShippingSettings()]);
  const missing = missingBusinessFields(business);
  const provider = paymentProviderStatus();
  const mail = emailMode();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const unpricedVat = USE_DB
    ? await prisma.product.count({ where: { isPublished: true, vatRateBps: null } })
    : 0;
  // Ücret hesaplanabilmesi için tarife, en az bir koli ve paket ölçüleri gerekir (lib/shipping/quote)
  const hasTariff = shipping.tariff.bands.length > 0 && shipping.boxes.length > 0 && Object.keys(shipping.packaging).length > 0;

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
      state: provider.mode === "live" ? "ok" : "todo",
      detail:
        provider.mode === "live"
          ? "Canlı: kartla ödeme alınıyor."
          : provider.mode === "test"
            ? "Test ortamı: kartı yalnız siz görürsünüz. Denemeler bitince canlıya geçin."
            : "Sanal POS bağlı değil; kart seçeneği “yakında” görünüyor.",
      href: "/admin/ayarlar#odeme",
    },
    {
      label: "E-posta gönderimi",
      state: mail === "smtp" ? "ok" : "todo",
      detail:
        mail === "smtp"
          ? "Hostinger e-postası bağlı; sipariş e-postaları gidiyor. Ayarlar → E-postalar'dan deneme gönderebilirsiniz."
          : "SMTP ayarları girilmedi: sipariş e-postaları kuyrukta bekliyor (yasal sipariş teyidi gitmiyor).",
      href: "/admin/epostalar",
    },
    {
      label: "Zamanlanmış iş (cron)",
      state: (process.env.CRON_SECRET?.trim().length ?? 0) >= 24 ? "manual" : "todo",
      detail:
        (process.env.CRON_SECRET?.trim().length ?? 0) >= 24
          ? "Anahtar tanımlı. hPanel → Cron Jobs'ta 5 dakikalık görevin kurulduğunu kontrol edin."
          : "CRON_SECRET tanımlı değil: süresi dolan siparişler ve e-posta yeniden denemeleri yalnız site trafiğiyle çalışır.",
    },
    {
      label: "Kargo tarifesi",
      state: hasTariff ? "ok" : "todo",
      detail: hasTariff
        ? "Tarife, koli ve paket ölçüleri girildi; kargo ücreti siparişte hesaplanıyor."
        : "Tarife, koli ya da paket ölçüleri eksik: ücreti hesaplanamayan sipariş alıcı ödemeli gidiyor (teslimatta ödenir).",
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
      state: appUrl.startsWith("https://") ? "ok" : "manual",
      detail: appUrl.startsWith("https://")
        ? `${appUrl} — tarayıcıda kilit simgesini kontrol edin.`
        : "Canlı alan adı ve SSL Hostinger'da açılınca burada görünür.",
    },
    {
      label: "Yasal metinler ve ETBİS",
      state: "manual",
      detail:
        "Sözleşme, KVKK ve iade metinleri sitede. Bir hukukçuya/mali müşavire okutun; ETBİS kaydını yapın (işletmenin yükümlülüğü).",
    },
  ];
  return items;
}
