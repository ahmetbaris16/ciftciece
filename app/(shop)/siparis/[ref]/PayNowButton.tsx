"use client";

/**
 * Ödemesi tamamlanmamış kart siparişi için "Ödemeyi tamamla": aynı siparişe yeni ödeme denemesi açar ve bankanın
 * güvenli ödeme sayfasına geçer. Yeni sipariş açılmaz (stok ikinci kez düşmez). Sunucu önce açık denemeleri
 * bankaya sorar: ödeme zaten alındıysa yeni form açılmaz.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./order.module.css";

export default function PayNowButton({ orderId, amountText }: { orderId: string; amountText: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pay = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/payment/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        if (data?.code === "ALREADY_PAID" || data?.code === "REVIEW") {
          router.refresh();
          return;
        }
        setError(data?.error ?? "Ödeme başlatılamadı. Lütfen tekrar deneyin.");
        setBusy(false);
        return;
      }
      if (data?.form?.action) {
        const form = document.createElement("form");
        form.method = "POST";
        form.action = data.form.action;
        form.style.display = "none";
        for (const [name, value] of Object.entries(data.form.fields as Record<string, string>)) {
          const input = document.createElement("input");
          input.type = "hidden";
          input.name = name;
          input.value = value;
          form.appendChild(input);
        }
        document.body.appendChild(form);
        form.submit();
      } else if (data?.redirectUrl) {
        window.location.assign(data.redirectUrl);
      } else {
        router.refresh();
      }
    } catch {
      setError("Bağlantı sorunu oluştu. İnternetinizi kontrol edip tekrar deneyin.");
      setBusy(false);
    }
  };

  return (
    <div className={styles.payNow}>
      <button type="button" className={styles.primaryBtn} onClick={pay} disabled={busy}>
        {busy ? "Bankaya yönlendiriliyor…" : `Ödemeyi tamamla — ${amountText}`}
      </button>
      {error && (
        <p className={styles.errorText} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
