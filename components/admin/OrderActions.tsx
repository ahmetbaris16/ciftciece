"use client";

/**
 * Admin — sipariş durum düğmeleri. Yalnız geçerli sonraki adımlar gösterilir (order.repository ile aynı kurallar).
 * - Havale bekleyen siparişte "Havale ödemesi alındı" = PENDING → PAID (ödeme kaydı da tamamlanır).
 * - Kargoya verme takip numarasıyla ayrı formdan (ShipForm) yapılır.
 * - Ödemesi alınmış sipariş iade kaydı girilmeden iptal/iade yapılamaz (R-07): bu düğmeler yalnız ödeme yoksa ya
 *   da tamamı iade kaydına geçmişse görünür; normal yol iade kaydıdır (tam iade siparişi kendiliğinden kapatır).
 * - Parası tamamen iade edilmiş ya da müşterisi iptal istemiş sipariş ilerletilmez (hazırlanıyor/teslim edildi yok).
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

type Status = "PENDING" | "PAID" | "PROCESSING" | "SHIPPED" | "DELIVERED" | "CANCELLED" | "REFUNDED";
type Method = "CARD" | "BANK_TRANSFER" | "CASH_ON_DELIVERY";

const NEXT: Record<Status, Status[]> = {
  PENDING: ["PAID", "CANCELLED"],
  PAID: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["CANCELLED"],
  SHIPPED: ["DELIVERED", "CANCELLED", "REFUNDED"],
  DELIVERED: ["REFUNDED"],
  CANCELLED: [],
  REFUNDED: [],
};

function label(to: Status, from: Status, method: Method): string {
  switch (to) {
    case "PAID":
      return "Havale ödemesi alındı";
    case "PROCESSING":
      return "Hazırlanıyor";
    case "DELIVERED":
      return method === "CASH_ON_DELIVERY" ? "Teslim edildi (kapıda ödeme alındı)" : "Teslim edildi";
    case "CANCELLED":
      return from === "SHIPPED" ? "İptal et (gönderi geri döndü)" : "İptal et";
    case "REFUNDED":
      return "İade edildi olarak kapat";
    default:
      return to;
  }
}

function confirmText(to: Status, from: Status, method: Method): string | null {
  if (to === "PAID") return "Havale/EFT tutarı hesabınıza geçti mi? Onaylarsanız sipariş “ödendi” olur ve müşteriye e-posta gider.";
  if (to === "CANCELLED")
    return from === "SHIPPED"
      ? "Gönderi size geri döndü mü? Sipariş iptal edilir, ürünler stoğa geri eklenir ve müşteriye e-posta gider."
      : "Sipariş iptal edilsin mi? Ayrılan stok geri eklenir ve müşteriye e-posta gider.";
  if (to === "DELIVERED" && method === "CASH_ON_DELIVERY")
    return "Kargo teslim etti ve kapıda ödemeyi tahsil etti mi? Ödeme alınmış olarak kaydedilir.";
  if (to === "REFUNDED") return "Sipariş “iade edildi” olarak kapatılsın mı?";
  return null;
}

export default function OrderActions({
  orderId,
  status,
  method,
  paidKurus,
  refundedKurus,
  openCancelRequest,
}: {
  orderId: string;
  status: Status;
  method: Method;
  paidKurus: number;
  refundedKurus: number;
  openCancelRequest: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const settled = paidKurus === 0 || refundedKurus >= paidKurus;
  const fullyRefunded = paidKurus > 0 && refundedKurus >= paidKurus;
  const options = NEXT[status].filter((to) => {
    // Kartla ödenmemiş sipariş elle "ödendi" yapılmaz: kart ödemesi yalnız banka onayıyla işlenir
    if (to === "PAID") return status === "PENDING" && method === "BANK_TRANSFER";
    if (to === "PROCESSING") return !fullyRefunded && !openCancelRequest;
    if (to === "DELIVERED") return !fullyRefunded;
    if (to === "CANCELLED") return settled;
    if (to === "REFUNDED") return paidKurus > 0 && settled;
    return true;
  });

  // Hata, düğmeler kalktıktan sonra da görünsün (409'da sayfa yenilenir; sipariş bu arada kapanmış olabilir)
  if (options.length === 0 && !error) return null;

  const go = async (to: Status) => {
    const question = confirmText(to, status, method);
    if (question && !window.confirm(question)) return;
    setBusy(to);
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: to }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Güncellenemedi.");
        if (res.status === 409) router.refresh();
        return;
      }
      router.refresh();
    } catch {
      setError("Bağlantı hatası. Tekrar deneyin.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center" }}>
      {options.map((to) => {
        const negative = to === "CANCELLED" || to === "REFUNDED";
        return (
          <button
            key={to}
            type="button"
            onClick={() => go(to)}
            disabled={busy !== null}
            style={{
              padding: "0.55rem 0.95rem",
              borderRadius: 8,
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: "pointer",
              border: negative ? "1px solid rgba(243,160,160,0.45)" : 0,
              background: negative ? "transparent" : "#c4d68e",
              color: negative ? "#f3a0a0" : "#15180f",
              opacity: busy && busy !== to ? 0.5 : 1,
            }}
          >
            {busy === to ? "…" : label(to, status, method)}
          </button>
        );
      })}
      {error && <span style={{ color: "#f3a0a0", fontSize: "0.8125rem" }}>{error}</span>}
    </div>
  );
}
