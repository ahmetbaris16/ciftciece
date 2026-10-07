"use client";

/**
 * Üye olmadan verilmiş siparişin değerlendirme kodu: müşteri kodunu kaybettiyse ya da başka bir cihazdan yazmak
 * istiyorsa yeni kod üretilir (eski kod ve verilmiş izin geçersiz olur).
 */

import { useAdminRequest } from "./useAdminRequest";
import f from "./forms.module.css";

export default function ReviewCodeActions({ orderId }: { orderId: string }) {
  const { busy, error, done, send } = useAdminRequest();
  return (
    <div className={f.actions}>
      <button
        type="button"
        className={f.secondary}
        disabled={busy}
        onClick={() => {
          if (!window.confirm("Yeni değerlendirme kodu oluşturulsun mu? Eski kod artık çalışmaz; kodu kullanan cihazın izni de biter.")) return;
          void send(`/api/admin/orders/${orderId}/review-code`, {}, { success: "Yeni kod oluşturuldu. Müşteriye iletin." });
        }}
      >
        {busy ? "Oluşturuluyor…" : "Yeni kod oluştur"}
      </button>
      {error && <p className={f.error}>{error}</p>}
      {done && <p className={f.ok}>{done}</p>}
    </div>
  );
}
