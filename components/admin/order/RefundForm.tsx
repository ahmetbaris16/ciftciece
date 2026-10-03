"use client";

/**
 * İade kaydı (R-07). Site para göndermez: para bankadan (kart iadesi) ya da havaleyle iade edildikten SONRA
 * buraya kaydedilir. Kayıt silinemez; müşteriye iade e-postası gider. Tam iadede sipariş kendiliğinden kapanır
 * (kargolanmamış → iptal, kargolanmış → iade edildi); kısmi iadede sipariş sürer.
 */

import { useState } from "react";
import { formatPrice } from "@/types";
import { parseTlInput } from "@/lib/payment/money";
import { useAdminRequest } from "./useAdminRequest";
import f from "./forms.module.css";

type Method = "CARD_PROVIDER" | "BANK_TRANSFER" | "CASH" | "OTHER";

const METHODS: Array<{ id: Method; label: string }> = [
  { id: "CARD_PROVIDER", label: "Karta iade (banka sanal POS panelinden)" },
  { id: "BANK_TRANSFER", label: "Havale/EFT ile iade" },
  { id: "CASH", label: "Elden iade" },
  { id: "OTHER", label: "Diğer" },
];

const tlText = (kurus: number) => {
  const rest = kurus % 100;
  return `${(kurus - rest) / 100}${rest ? `,${String(rest).padStart(2, "0")}` : ""}`;
};

export default function RefundForm({
  orderId,
  remainingKurus,
  paymentMethod,
  shipped,
}: {
  orderId: string;
  remainingKurus: number;
  paymentMethod: "CARD" | "BANK_TRANSFER" | "CASH_ON_DELIVERY";
  shipped: boolean;
}) {
  const { busy, error, done, send, setError } = useAdminRequest();
  const [amount, setAmount] = useState(tlText(remainingKurus));
  const [method, setMethod] = useState<Method>(paymentMethod === "CARD" ? "CARD_PROVIDER" : "BANK_TRANSFER");
  const [reference, setReference] = useState("");
  const [reason, setReason] = useState("");
  const [restock, setRestock] = useState(false);

  const kurus = parseTlInput(amount);
  const full = kurus === remainingKurus;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (kurus === null || kurus <= 0) {
      setError("Tutarı kontrol edin (ör. 239,90).");
      return;
    }
    if (kurus > remainingKurus) {
      setError(`En fazla ${formatPrice(remainingKurus)} iade kaydı girilebilir.`);
      return;
    }
    if (reason.trim().length < 3) {
      setError("İade sebebini yazın.");
      return;
    }
    const question =
      `${formatPrice(kurus)} iade kaydı girilecek.\n\n` +
      "Parayı bankadan ya da havaleyle iade ettiniz mi? Bu kayıt silinemez; müşteriye iade e-postası gider." +
      (full
        ? `\n\nTam iade: sipariş ${shipped ? "“iade edildi”" : "“iptal edildi”"} olarak kapanacak, başka işlem yapılamayacak.`
        : "\n\nKısmi iade: sipariş devam edecek.");
    if (!window.confirm(question)) return;
    const ok = await send(
      `/api/admin/orders/${orderId}/refund`,
      {
        amountKurus: kurus,
        method,
        reference: reference.trim() || null,
        reason: reason.trim(),
        restock: shipped && full ? restock : undefined,
      },
      { success: "İade kaydedildi." }
    );
    if (ok) {
      setReason("");
      setReference("");
    }
  };

  return (
    <form className={f.form} onSubmit={submit} noValidate>
      <p className={f.hint}>
        Önce parayı iade edin (kart: Akbank sanal POS panelinden iade; havale: müşterinin IBAN&apos;ına), sonra buraya kaydedin. İade
        edilebilir: <strong>{formatPrice(remainingKurus)}</strong>.
      </p>
      <div className={f.row}>
        <label className={f.field}>
          <span className={f.label}>Tutar (TL)</span>
          <input className={f.input} value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" />
        </label>
        <label className={f.field}>
          <span className={f.label}>Nasıl iade edildi</span>
          <select className={f.select} value={method} onChange={(e) => setMethod(e.target.value as Method)}>
            {METHODS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
        <label className={f.field}>
          <span className={f.label}>İşlem / dekont no (isteğe bağlı)</span>
          <input className={f.input} value={reference} onChange={(e) => setReference(e.target.value)} maxLength={120} />
        </label>
      </div>
      <label className={f.field}>
        <span className={f.label}>Sebep (müşteriye gösterilmez)</span>
        <input
          className={f.input}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={2000}
          placeholder="ör. müşteri cayma hakkını kullandı / ürün hasarlı geldi / test ödemesi"
        />
      </label>
      {full ? (
        <p className={f.hint}>
          Tam iade: sipariş {shipped ? "“iade edildi”" : "“iptal edildi” (ayrılan stok geri eklenir)"} olarak kapanır; sonra
          hazırlama, kargo ya da teslim işlemi yapılamaz.
        </p>
      ) : (
        <p className={f.hint}>Kısmi iade: sipariş devam eder (ör. eksik/hasarlı ürün bedeli).</p>
      )}
      {shipped && full && (
        <label className={f.check}>
          <input type="checkbox" checked={restock} onChange={(e) => setRestock(e.target.checked)} />
          <span>Geri gelen ürünler satılabilir durumda — stoğa ekle</span>
        </label>
      )}
      <div className={f.actions}>
        <button type="submit" className={f.primary} disabled={busy}>
          {busy ? "Kaydediliyor…" : "İadeyi kaydet"}
        </button>
        {error && <p className={f.error}>{error}</p>}
        {done && <p className={f.ok}>{done}</p>}
      </div>
    </form>
  );
}
