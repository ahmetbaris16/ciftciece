"use client";

/**
 * Misafir sipariş takibi — sipariş referans koduyla /siparis/[ref] sayfasını açar.
 */

import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import styles from "./Auth.module.css";

export default function OrderTracker() {
  const router = useRouter();
  const id = useId();
  const [ref, setRef] = useState("");
  const [error, setError] = useState("");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = ref.trim().replace(/^#/, "");
    if (!trimmed) {
      setError("Sipariş referans kodunuzu girin.");
      return;
    }
    setError("");
    router.push(`/siparis/${encodeURIComponent(trimmed)}`);
  };

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <div className={styles.field}>
        <label htmlFor={`${id}-ref`} className={styles.label}>
          Sipariş referans kodu
        </label>
        <input
          id={`${id}-ref`}
          className={styles.input}
          value={ref}
          onChange={(e) => {
            setRef(e.target.value);
            setError("");
          }}
          placeholder="Örn. cm1abc2def3ghi…"
          autoComplete="off"
          spellCheck={false}
          aria-invalid={!!error || undefined}
          aria-describedby={error ? `${id}-ref-error` : `${id}-ref-hint`}
        />
        {error ? (
          <p id={`${id}-ref-error`} className={styles.fieldError}>
            {error}
          </p>
        ) : (
          <p id={`${id}-ref-hint`} className={styles.hint}>
            Kod, sipariş onay sayfasında ve size gönderilen onay mesajında &quot;Sipariş No&quot; olarak yer alır.
          </p>
        )}
      </div>
      <button type="submit" className={styles.submit}>
        Sipariş Durumunu Sorgula
      </button>
    </form>
  );
}
