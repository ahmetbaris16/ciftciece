"use client";

/** Admin ürün formları: KDV oranı elle yazılır; sık oranlar tek tıkla doldurulur. */

import { VAT_INPUT_RULE, VAT_RATE_CHOICES, parseVatPercent } from "@/lib/catalog/vat";

interface Props {
  value: string;
  onChange: (value: string) => void;
}

export default function VatRateField({ value, onChange }: Props) {
  const invalid = !parseVatPercent(value).ok;
  const current = value.replace(/%/g, "").trim();

  return (
    <div style={s.field}>
      <label htmlFor="vat-rate" style={s.label}>KDV oranı</label>
      <div style={s.row}>
        <div style={s.inputWrap}>
          <span style={s.prefix} aria-hidden="true">%</span>
          <input
            id="vat-rate"
            style={{ ...s.input, ...(invalid ? s.invalid : {}) }}
            inputMode="numeric"
            autoComplete="off"
            maxLength={5}
            placeholder="Girilmemiş"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-invalid={invalid}
            aria-describedby="vat-rate-help"
          />
        </div>
        {VAT_RATE_CHOICES.map((r) => {
          const on = current === String(r);
          return (
            <button key={r} type="button" style={{ ...s.chip, ...(on ? s.chipOn : {}) }} aria-pressed={on} onClick={() => onChange(String(r))}>
              %{r}
            </button>
          );
        })}
      </div>
      <span id="vat-rate-help" style={invalid ? s.error : s.hint}>
        {invalid ? VAT_INPUT_RULE : "Oranı yazın ya da hazır oranlardan seçin. Boş bırakırsanız “girilmemiş” kaydedilir."}
      </span>
    </div>
  );
}

const s: Record<string, React.CSSProperties> = {
  field: { display: "flex", flexDirection: "column", gap: "0.375rem", marginBottom: "0.75rem", minWidth: 0 },
  label: { fontSize: "0.8125rem", fontWeight: 500, color: "rgba(232,228,217,0.7)" },
  row: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.5rem" },
  inputWrap: { position: "relative", width: "8.5rem" },
  prefix: { position: "absolute", left: "0.75rem", top: "50%", transform: "translateY(-50%)", color: "rgba(232,228,217,0.5)", fontSize: "0.875rem", pointerEvents: "none" },
  input: { width: "100%", boxSizing: "border-box", padding: "0.625rem 0.75rem 0.625rem 1.75rem", background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "6px", color: "#e8e4d9", fontSize: "0.875rem" },
  invalid: { borderColor: "rgba(239,68,68,0.8)" },
  chip: { padding: "0.45rem 0.7rem", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: "999px", color: "rgba(232,228,217,0.8)", fontSize: "0.8125rem", cursor: "pointer" },
  chipOn: { background: "rgba(143,163,78,0.22)", borderColor: "rgba(143,163,78,0.6)", color: "#d6e4a6" },
  hint: { fontSize: "0.75rem", color: "rgba(232,228,217,0.45)" },
  error: { fontSize: "0.75rem", color: "#fca5a5" },
};
