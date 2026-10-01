"use client";

/**
 * İletişim formu — /api/contact. Gönderilince işletmeye e-posta gider ve admin → Mesajlar'da görünür.
 */

import { useState } from "react";
import Link from "next/link";
import { CONTACT_SUBJECTS } from "@/lib/contact/subjects";
import styles from "@/app/(shop)/iletisim/page.module.css";

type Field = "name" | "email" | "phone" | "subject" | "orderReference" | "message";

export default function ContactForm({ defaultSubject, defaultOrder }: { defaultSubject?: string; defaultOrder?: string }) {
  const [values, setValues] = useState<Record<Field, string>>({
    name: "",
    email: "",
    phone: "",
    subject: CONTACT_SUBJECTS.includes(defaultSubject as (typeof CONTACT_SUBJECTS)[number]) ? (defaultSubject as string) : "",
    orderReference: defaultOrder ?? "",
    message: "",
  });
  const [website, setWebsite] = useState("");
  const [error, setError] = useState<{ text: string; field: Field | null } | null>(null);
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");

  const set = (f: Field) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setValues((v) => ({ ...v, [f]: e.target.value }));
    if (error?.field === f) setError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (state === "sending") return;
    setError(null);
    if (values.name.trim().length < 2) return setError({ text: "Adınızı yazın.", field: "name" });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(values.email.trim())) {
      return setError({ text: "Geçerli bir e-posta adresi yazın.", field: "email" });
    }
    if (!values.subject) return setError({ text: "Bir konu seçin.", field: "subject" });
    if (values.message.trim().length < 10) return setError({ text: "Mesajınız en az 10 karakter olmalı.", field: "message" });

    setState("sending");
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, website }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setState("idle");
        return setError({ text: data?.error ?? "Mesaj gönderilemedi.", field: (data?.field as Field) ?? null });
      }
      setState("sent");
    } catch {
      setState("idle");
      setError({ text: "Bağlantı hatası. İnternetinizi kontrol edip tekrar deneyin.", field: null });
    }
  };

  if (state === "sent") {
    return (
      <div className={styles.sent} role="status">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
        <h3>Mesajınız bize ulaştı</h3>
        <p>
          En kısa sürede <strong>{values.email}</strong> adresine yanıt vereceğiz. Acil bir durum için telefon ya da WhatsApp
          daha hızlıdır.
        </p>
      </div>
    );
  }

  const invalid = (f: Field) => error?.field === f;

  return (
    <form className={styles.form} onSubmit={submit} noValidate>
      <div className={styles.grid}>
        <label className={styles.field}>
          <span>Ad soyad</span>
          <input value={values.name} onChange={set("name")} autoComplete="name" maxLength={120} aria-invalid={invalid("name")} />
        </label>
        <label className={styles.field}>
          <span>E-posta</span>
          <input type="email" value={values.email} onChange={set("email")} autoComplete="email" maxLength={254} aria-invalid={invalid("email")} />
        </label>
        <label className={styles.field}>
          <span>
            Telefon <em>(isteğe bağlı)</em>
          </span>
          <input type="tel" inputMode="tel" value={values.phone} onChange={set("phone")} autoComplete="tel" maxLength={30} />
        </label>
        <label className={styles.field}>
          <span>Konu</span>
          <select value={values.subject} onChange={set("subject")} aria-invalid={invalid("subject")}>
            <option value="">Seçin</option>
            {CONTACT_SUBJECTS.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className={`${styles.field} ${styles.full}`}>
          <span>
            Sipariş numarası <em>(varsa)</em>
          </span>
          <input value={values.orderReference} onChange={set("orderReference")} maxLength={60} placeholder="Sipariş e-postanızda yazar" />
        </label>
        <label className={`${styles.field} ${styles.full}`}>
          <span>Mesajınız</span>
          <textarea rows={6} value={values.message} onChange={set("message")} maxLength={4000} aria-invalid={invalid("message")} />
        </label>
        {/* Tuzak alanı: ekranda görünmez, insanlar doldurmaz */}
        <label className={styles.hp} aria-hidden="true">
          Web siteniz
          <input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
        </label>
      </div>
      <p className={styles.privacy}>
        Bilgileriniz yalnız mesajınızı yanıtlamak için kullanılır (<Link href="/kvkk">KVKK Aydınlatma Metni</Link>).
      </p>
      {error && (
        <p className={styles.error} role="alert">
          {error.text}
        </p>
      )}
      <button type="submit" className={styles.submit} disabled={state === "sending"}>
        {state === "sending" ? "Gönderiliyor…" : "Mesajı gönder"}
      </button>
    </form>
  );
}
