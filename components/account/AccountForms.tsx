"use client";

/**
 * Hesabım → Hesap Bilgileri: ad/telefon güncelleme, şifre değiştirme ve çıkış.
 */

import { signOut, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useId, useState, type FormEvent } from "react";
import { formatTrPhoneInput, displayTrPhone } from "@/lib/validation/checkout";
import {
  ACCOUNT_MESSAGES,
  PasswordChangeSchema,
  ProfileSchema,
  accountFieldErrors,
  type AccountField,
} from "@/lib/validation/account";
import styles from "@/components/account/Auth.module.css";

type Errors = Partial<Record<AccountField, string>>;

export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className={className}
      disabled={busy}
      onClick={() => {
        setBusy(true);
        // Yönlendirmeyi biz yaparız: NextAuth'un döndürdüğü adres NEXTAUTH_URL'e göre kurulur;
        // o değer sitenin açıldığı adresten farklıysa (ör. yerelde 3000 ↔ 3100) çıkış yanlış yere gider.
        void signOut({ redirect: false }).finally(() => {
          router.push("/");
          router.refresh();
        });
      }}
    >
      {busy ? "Çıkış yapılıyor…" : "Çıkış Yap"}
    </button>
  );
}

export function ProfileForm({
  initial,
}: {
  initial: { firstName: string; lastName: string; phone: string | null; email: string };
}) {
  const router = useRouter();
  const { update } = useSession();
  const id = useId();
  const [values, setValues] = useState({
    firstName: initial.firstName,
    lastName: initial.lastName,
    phone: initial.phone ? displayTrPhone(initial.phone) : "",
  });
  const [errors, setErrors] = useState<Errors>({});
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setStatus(null);
    const parsed = ProfileSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(accountFieldErrors(parsed.error).fieldErrors);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/account/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setErrors(data?.fieldErrors ?? {});
        setStatus({ ok: false, text: data?.error ?? ACCOUNT_MESSAGES.unavailable });
        return;
      }
      setErrors({});
      setStatus({ ok: true, text: "Bilgileriniz kaydedildi." });
      await update({ name: `${parsed.data.firstName} ${parsed.data.lastName}` });
      router.refresh();
    } catch {
      setStatus({ ok: false, text: ACCOUNT_MESSAGES.unavailable });
    } finally {
      setBusy(false);
    }
  };

  const field = (key: "firstName" | "lastName" | "phone", label: string, extra: Record<string, unknown> = {}) => (
    <div className={styles.field}>
      <label htmlFor={`${id}-${key}`} className={styles.label}>
        {label}
      </label>
      <input
        id={`${id}-${key}`}
        className={styles.input}
        value={values[key]}
        onChange={(e) => {
          const v = key === "phone" ? formatTrPhoneInput(e.target.value) : e.target.value;
          setValues((s) => ({ ...s, [key]: v }));
          setErrors((er) => ({ ...er, [key]: undefined }));
        }}
        aria-invalid={errors[key] ? true : undefined}
        {...extra}
      />
      {errors[key] && <p className={styles.fieldError}>{errors[key]}</p>}
    </div>
  );

  return (
    <form className={styles.form} onSubmit={submit} noValidate style={{ marginTop: 0 }}>
      <div className={styles.row}>
        {field("firstName", "Ad", { autoComplete: "given-name" })}
        {field("lastName", "Soyad", { autoComplete: "family-name" })}
      </div>
      <div className={styles.field}>
        <label htmlFor={`${id}-email`} className={styles.label}>
          E-posta
        </label>
        <input id={`${id}-email`} className={styles.input} value={initial.email} readOnly aria-readonly="true" />
        <p className={styles.hint}>E-posta adresi giriş kimliğinizdir; değiştirmek için bize ulaşın.</p>
      </div>
      {field("phone", "Cep telefonu (isteğe bağlı)", {
        type: "tel",
        inputMode: "tel",
        autoComplete: "tel-national",
        placeholder: "05XX XXX XX XX",
      })}
      {status && (
        <p className={status.ok ? styles.formSuccess : styles.formError} role="status">
          {status.text}
        </p>
      )}
      <button type="submit" className={styles.submit} disabled={busy}>
        {busy ? "Kaydediliyor…" : "Bilgilerimi Kaydet"}
      </button>
    </form>
  );
}

export function PasswordForm() {
  const id = useId();
  const [values, setValues] = useState({ currentPassword: "", newPassword: "" });
  const [errors, setErrors] = useState<Errors>({});
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setStatus(null);
    const parsed = PasswordChangeSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(accountFieldErrors(parsed.error).fieldErrors);
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setErrors(data?.fieldErrors ?? {});
        setStatus({ ok: false, text: data?.error ?? ACCOUNT_MESSAGES.unavailable });
        return;
      }
      setErrors({});
      setValues({ currentPassword: "", newPassword: "" });
      setStatus({ ok: true, text: "Şifreniz değiştirildi." });
    } catch {
      setStatus({ ok: false, text: ACCOUNT_MESSAGES.unavailable });
    } finally {
      setBusy(false);
    }
  };

  const input = (key: "currentPassword" | "newPassword", label: string, autoComplete: string) => (
    <div className={styles.field}>
      <label htmlFor={`${id}-${key}`} className={styles.label}>
        {label}
      </label>
      <input
        id={`${id}-${key}`}
        type="password"
        className={styles.input}
        value={values[key]}
        onChange={(e) => {
          setValues((s) => ({ ...s, [key]: e.target.value }));
          setErrors((er) => ({ ...er, [key]: undefined }));
        }}
        autoComplete={autoComplete}
        aria-invalid={errors[key] ? true : undefined}
      />
      {errors[key] ? (
        <p className={styles.fieldError}>{errors[key]}</p>
      ) : key === "newPassword" ? (
        <p className={styles.hint}>En az 8 karakter; en az bir harf ve bir rakam.</p>
      ) : null}
    </div>
  );

  return (
    <form className={styles.form} onSubmit={submit} noValidate style={{ marginTop: 0 }}>
      {input("currentPassword", "Mevcut şifre", "current-password")}
      {input("newPassword", "Yeni şifre", "new-password")}
      {status && (
        <p className={status.ok ? styles.formSuccess : styles.formError} role="status">
          {status.text}
        </p>
      )}
      <button type="submit" className={styles.submit} disabled={busy}>
        {busy ? "Değiştiriliyor…" : "Şifremi Değiştir"}
      </button>
    </form>
  );
}
