"use client";

/**
 * Müşterinin siparişle ilgili işlemleri:
 * - ödenmemiş siparişi hemen iptal etme (stok geri döner),
 * - ödenmiş/hazırlanan siparişte iptal isteği,
 * - kargolanmış/teslim edilmiş siparişte iade (cayma) bildirimi.
 * Talep kaydedilir, işletmeye e-posta gider, müşteriye "talebiniz alındı" e-postası gider.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import styles from "./order.module.css";

interface Props {
  reference: string;
  canCancelNow: boolean;
  canRequestCancel: boolean;
  canRequestReturn: boolean;
  openRequests: Array<{ type: "CANCEL" | "RETURN"; createdAt: string }>;
}

const dateTr = (iso: string) =>
  new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Istanbul" }).format(new Date(iso));

export default function OrderRequests({ reference, canCancelNow, canRequestCancel, canRequestReturn, openRequests }: Props) {
  const router = useRouter();
  const [mode, setMode] = useState<"CANCEL" | "RETURN" | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  const openCancel = openRequests.find((r) => r.type === "CANCEL");
  const openReturn = openRequests.find((r) => r.type === "RETURN");

  if (!canCancelNow && !canRequestCancel && !canRequestReturn && openRequests.length === 0) return null;

  const cancelNow = async () => {
    if (!window.confirm("Siparişiniz iptal edilsin mi? Bu işlem geri alınamaz.")) return;
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(reference)}/cancel`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setStatus({ kind: "error", text: data?.error ?? "İptal edilemedi." });
        return;
      }
      router.refresh();
    } catch {
      setStatus({ kind: "error", text: "Bağlantı sorunu oluştu. Tekrar deneyin." });
    } finally {
      setBusy(false);
    }
  };

  const sendRequest = async () => {
    if (!mode) return;
    setBusy(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(reference)}/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: mode, message }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setStatus({ kind: "error", text: data?.error ?? "Gönderilemedi." });
        return;
      }
      setMode(null);
      setMessage("");
      setStatus({
        kind: "ok",
        text:
          mode === "RETURN"
            ? "İade bildiriminiz bize ulaştı. Size e-postayla iade kodunu ve gönderim bilgisini ileteceğiz."
            : "İptal isteğiniz bize ulaştı. Sonucu e-postayla bildireceğiz.",
      });
      router.refresh();
    } catch {
      setStatus({ kind: "error", text: "Bağlantı sorunu oluştu. Tekrar deneyin." });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className={styles.card} aria-labelledby="requests-title">
      <h2 id="requests-title" className={styles.cardTitle}>
        İade / iptal
      </h2>

      {openCancel && (
        <p className={styles.noteBox}>İptal isteğiniz {dateTr(openCancel.createdAt)} tarihinde bize ulaştı; değerlendiriyoruz.</p>
      )}
      {openReturn && (
        <p className={styles.noteBox}>İade bildiriminiz {dateTr(openReturn.createdAt)} tarihinde bize ulaştı; size e-postayla dönüş yapacağız.</p>
      )}

      {canCancelNow && (
        <div className={styles.requestRow}>
          <p className={styles.muted}>Ödemesi yapılmamış siparişinizi hemen iptal edebilirsiniz; ayrılan ürünler serbest kalır.</p>
          <button type="button" className={styles.secondaryBtn} onClick={cancelNow} disabled={busy}>
            Siparişi iptal et
          </button>
        </div>
      )}

      {!mode && (canRequestCancel || canRequestReturn) && (
        <div className={styles.requestRow}>
          <p className={styles.muted}>
            {canRequestReturn
              ? "Teslimattan itibaren 14 gün içinde cayma hakkınızı kullanabilirsiniz (ambalajı açılmış gıda ürünleri hariç). Hasarlı ya da eksik ürünü de buradan bildirin."
              : "Siparişiniz henüz kargoya verilmediyse iptal edip ödemenizin tamamını iade ederiz."}
          </p>
          {canRequestCancel && !openCancel && (
            <button type="button" className={styles.secondaryBtn} onClick={() => setMode("CANCEL")}>
              İptal isteği gönder
            </button>
          )}
          {canRequestReturn && !openReturn && (
            <button type="button" className={styles.secondaryBtn} onClick={() => setMode("RETURN")}>
              İade / cayma bildirimi
            </button>
          )}
        </div>
      )}

      {mode && (
        <div className={styles.requestForm}>
          <label className={styles.label} htmlFor="request-message">
            {mode === "RETURN" ? "Hangi ürün(ler) ve sebep (isteğe bağlı)" : "İptal sebebi (isteğe bağlı)"}
          </label>
          <textarea
            id="request-message"
            className={styles.textarea}
            rows={3}
            maxLength={2000}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder={mode === "RETURN" ? "ör. 1 L zeytinyağı, ambalajı açılmadı; hasarlı geldi…" : ""}
          />
          <div className={styles.formActions}>
            <button type="button" className={styles.textBtn} onClick={() => setMode(null)} disabled={busy}>
              Vazgeç
            </button>
            <button type="button" className={styles.primaryBtn} onClick={sendRequest} disabled={busy}>
              {busy ? "Gönderiliyor…" : mode === "RETURN" ? "Bildirimi gönder" : "İsteği gönder"}
            </button>
          </div>
        </div>
      )}

      {status && (
        <p className={status.kind === "ok" ? styles.okText : styles.errorText} role={status.kind === "error" ? "alert" : "status"}>
          {status.text}
        </p>
      )}
    </section>
  );
}
