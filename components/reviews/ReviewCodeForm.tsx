"use client";

/**
 * Değerlendirme kodu girişi (üye olmadan verilmiş sipariş): paketteki fişte ve teslim e-postasında yazan tek
 * kullanımlık kod. Doğruysa bu tarayıcıya değerlendirme izni verilir ve siparişin "Ürünleri değerlendirin" bölümü
 * açılır (sipariş sayfasındaysa sayfa yenilenir, /degerlendir sayfasındaysa siparişe gidilir).
 */

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import styles from "@/components/account/Auth.module.css";

/** Yazarken: büyük harf, yalnız harf/rakam, 4. karakterden sonra tire ("7K2M-Q9XA") */
function formatInput(value: string): string {
  const raw = value.toUpperCase().replace(/[^0-9A-Z]/g, "").slice(0, 8);
  return raw.length > 4 ? `${raw.slice(0, 4)}-${raw.slice(4)}` : raw;
}

export default function ReviewCodeForm({ orderRef, compact = false }: { orderRef?: string; compact?: boolean }) {
  const router = useRouter();
  const id = useId();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (code.replace(/-/g, "").length !== 8) {
      setError("Kod 8 karakterdir (ör. 7K2M-Q9XA).");
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/reviews/code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, ...(orderRef ? { orderRef } : {}) }),
      });
      const data = (await res.json().catch(() => null)) as { reference?: string; error?: string } | null;
      if (!res.ok || !data?.reference) {
        setError(data?.error ?? "Kod şu anda doğrulanamadı. Biraz sonra tekrar deneyin.");
        return;
      }
      if (orderRef) router.refresh();
      else router.push(`/siparis/${encodeURIComponent(data.reference)}#degerlendir`);
    } catch {
      setError("Bağlantı sorunu oluştu. İnternetinizi kontrol edip tekrar deneyin.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className={styles.form} style={compact ? { marginTop: "var(--space-4)" } : undefined} onSubmit={submit} noValidate>
      <div className={styles.field}>
        <label htmlFor={`${id}-code`} className={styles.label}>
          Değerlendirme kodu
        </label>
        <input
          id={`${id}-code`}
          className={styles.input}
          value={code}
          onChange={(e) => {
            setCode(formatInput(e.target.value));
            setError(null);
          }}
          placeholder="ör. 7K2M-Q9XA"
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          inputMode="text"
          maxLength={9}
          style={{ letterSpacing: "0.12em", fontVariantNumeric: "tabular-nums" }}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? `${id}-code-error` : `${id}-code-hint`}
        />
        {error ? (
          <p id={`${id}-code-error`} className={styles.fieldError} role="alert">
            {error}
          </p>
        ) : (
          <p id={`${id}-code-hint`} className={styles.hint}>
            Paketinizdeki sipariş fişinin altında ve “Siparişiniz teslim edildi” e-postasında yazar. Kod tek
            kullanımlıktır: kullandığınız cihazdan değerlendirmenizi yazıp sonradan düzenleyebilirsiniz.
          </p>
        )}
      </div>
      <button type="submit" className={styles.submit} disabled={busy}>
        {busy ? "Kontrol ediliyor…" : "Kodu onayla"}
      </button>
    </form>
  );
}
