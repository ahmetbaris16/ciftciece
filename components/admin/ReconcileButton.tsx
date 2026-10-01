"use client";

/**
 * Admin — "iyzico'dan sorgula": siparişin kart ödeme denemelerini sağlayıcıya sorar, doğrulamayı
 * uygular ve gerekiyorsa durumu düzeltir (sunucu: lib/payment/reconcile.ts). Sonuç burada gösterilir;
 * sayfa yenilenir (durum, denemeler, olaylar). Kim/ne zaman çalıştırdığı sunucuda kaydedilir.
 */

import { useRouter } from "next/navigation";
import { useState } from "react";

interface AttemptResult {
  attemptId: string;
  createdAt: string;
  statusBefore: string;
  statusAfter: string;
  outcome: string;
  text: string;
  error?: string;
  reasons?: string[];
  provider?: Record<string, unknown>;
}

interface Result {
  message: string;
  attempts: AttemptResult[];
}

const show = (v: unknown) => (v === undefined || v === null || v === "" ? "—" : String(v));

export default function ReconcileButton({ orderId, label }: { orderId: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/reconcile`, { method: "POST" });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Sorgu tamamlanamadı.");
        return;
      }
      setResult(data as Result);
      router.refresh();
    } catch {
      setError("Bağlantı hatası. Tekrar deneyin.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ marginTop: "0.75rem" }}>
      <button
        type="button"
        onClick={run}
        disabled={busy}
        style={{
          padding: "0.5rem 0.875rem",
          borderRadius: 8,
          fontSize: "0.8125rem",
          fontWeight: 600,
          border: "1px solid rgba(196,214,142,0.5)",
          background: "transparent",
          color: "#c4d68e",
          opacity: busy ? 0.6 : 1,
        }}
      >
        {busy ? "Sorgulanıyor…" : label}
      </button>
      {error && <p style={{ color: "#f3a0a0", fontSize: "0.8125rem", margin: "0.5rem 0 0" }}>{error}</p>}
      {result && (
        <div style={{ marginTop: "0.75rem", fontSize: "0.8125rem", color: "rgba(232,228,217,0.75)" }} role="status">
          <p style={{ margin: "0 0 0.5rem", color: "#e8e4d9", fontWeight: 600 }}>{result.message}</p>
          {result.attempts.map((a, i) => (
            <div key={a.attemptId} style={{ padding: "0.375rem 0", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
              <p style={{ margin: 0 }}>
                Deneme {i + 1}: {a.text}
                {a.statusBefore !== a.statusAfter && <> ({a.statusBefore} → {a.statusAfter})</>}
              </p>
              {a.provider && (
                <p style={{ margin: 0, color: "rgba(232,228,217,0.5)" }}>
                  Sağlayıcı: durum {show(a.provider.paymentStatus ?? a.provider.status)} · ödeme no {show(a.provider.paymentId)} · sepet{" "}
                  {show(a.provider.price)} · çekilen {show(a.provider.paidPrice)} {show(a.provider.currency)} · taksit{" "}
                  {show(a.provider.installment)} · fraud {show(a.provider.fraudStatus)}
                  {a.provider.errorCode ? <> · hata {show(a.provider.errorCode)} {show(a.provider.errorMessage)}</> : null}
                </p>
              )}
              {a.reasons && a.reasons.length > 0 && <p style={{ margin: 0, color: "#fb923c" }}>{a.reasons.join("; ")}</p>}
              {a.error && <p style={{ margin: 0, color: "#f3a0a0" }}>{a.error}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
