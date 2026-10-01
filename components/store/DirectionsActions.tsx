"use client";

/**
 * "Yol Tarifi Al" + "Google Haritalar'da Aç" düğme grubu.
 *
 * Sorun: Google'a yalnızca varış noktası verilirse başlangıcı Google seçer. Tarayıcı google.com'a konum
 * izni vermemişse Google konumu IP'den tahmin eder ve tarif alakasız bir yerden çıkar (kullanıcı yaşadı).
 * Çözüm: konumu bu sayfada tarayıcıdan (Geolocation API) isteyip origin=enlem,boylam olarak veririz.
 * - Konum kaba bulunduysa (±1,5 km'den kötü, ör. IP tahmini) otomatik açılmaz; müşteriye sorulur.
 * - İzin yok / bulunamadı / zaman aşımı: sebep açıkça yazılır, başlangıç adresi yazdırılır (sessiz yedek yok).
 * - Tarayıcı yeni sekmeyi engellerse bağlantı görünür kalır.
 * - JS kapalıyken ya da Ctrl/orta tıkta <a> eski (yalnız varışlı) bağlantı olarak çalışır.
 * Konum yalnızca açılan Google Haritalar bağlantısına konur; sunucumuza gönderilmez, saklanmaz.
 */

import { useEffect, useId, useRef, useState, type FormEvent, type MouseEvent } from "react";
import { STORE, buildDirectionsUrl } from "@/lib/config/store";
import styles from "./DirectionsActions.module.css";

/** Bundan kötü doğruluk "yaklaşık konum" sayılır (Wi-Fi/GPS tipik olarak < 100 m, IP tahmini km'ler) */
const APPROX_LIMIT_M = 1500;

type State =
  | { kind: "idle" }
  | { kind: "locating" }
  | { kind: "opened"; url: string; accuracy: number; blocked: boolean }
  | { kind: "approx"; url: string; accuracy: number }
  | { kind: "error"; message: string };

interface Props {
  groupClassName?: string;
  primaryClassName?: string;
  secondaryClassName?: string;
  /** Harita yüklenemediğinde gösterilen yedek kutuda ikonlar gizlenir */
  showIcon?: boolean;
}

function formatAccuracy(m: number): string {
  return m >= 1000 ? `±${(m / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} km` : `±${Math.round(m)} m`;
}

function errorMessage(err: GeolocationPositionError): string {
  switch (err.code) {
    case err.PERMISSION_DENIED:
      return "Konum izni verilmedi. İzin vermek için adres çubuğundaki konum simgesine tıklayabilir ya da nereden geleceğinizi aşağıya yazabilirsiniz.";
    case err.POSITION_UNAVAILABLE:
      return "Cihazınız konumunuzu belirleyemedi (bilgisayarda konum servisleri kapalı olabilir). Nereden geleceğinizi aşağıya yazın.";
    case err.TIMEOUT:
      return "Konumunuz zamanında alınamadı. Tekrar deneyin ya da nereden geleceğinizi aşağıya yazın.";
    default:
      return "Konumunuz alınamadı. Nereden geleceğinizi aşağıya yazın.";
  }
}

/** Yeni sekmede açar; tarayıcı engellerse false döner (window.open null verir). */
function openInNewTab(url: string): boolean {
  const w = window.open(url, "_blank");
  if (!w) return false;
  try {
    w.opener = null;
  } catch {
    // farklı kaynak: opener zaten erişilemez
  }
  return true;
}

export default function DirectionsActions({
  groupClassName,
  primaryClassName = "btn btn--primary",
  secondaryClassName = "btn btn--ghost",
  showIcon = true,
}: Props) {
  const [state, setState] = useState<State>({ kind: "idle" });
  const [showForm, setShowForm] = useState(false);
  const [origin, setOrigin] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();

  const formVisible = showForm || state.kind === "error" || state.kind === "approx";

  // Hata çıktığında adres alanına odaklan (klavye/ekran okuyucu kullanıcısı nerede olduğunu bilsin)
  useEffect(() => {
    if (state.kind === "error") inputRef.current?.focus();
  }, [state]);

  const onDirectionsClick = (e: MouseEvent<HTMLAnchorElement>) => {
    // Ctrl/Cmd/Shift/orta tık: tarayıcının kendi bağlantı davranışı (yalnız varışlı bağlantı)
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
    e.preventDefault();
    locate();
  };

  const locate = () => {
    if (!("geolocation" in navigator) || !window.isSecureContext) {
      setState({
        kind: "error",
        message: "Tarayıcınız konum paylaşımını desteklemiyor. Nereden geleceğinizi aşağıya yazın.",
      });
      return;
    }

    setState({ kind: "locating" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude, accuracy } = pos.coords;
        const url = buildDirectionsUrl(`${latitude.toFixed(6)},${longitude.toFixed(6)}`);
        if (accuracy > APPROX_LIMIT_M) {
          setState({ kind: "approx", url, accuracy });
          return;
        }
        setState({ kind: "opened", url, accuracy, blocked: !openInNewTab(url) });
      },
      (err) => setState({ kind: "error", message: errorMessage(err) }),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  };

  const submitOrigin = (e: FormEvent) => {
    e.preventDefault();
    const value = origin.trim();
    if (value.length < 3) {
      inputRef.current?.focus();
      return;
    }
    const url = buildDirectionsUrl(value);
    setState({ kind: "opened", url, accuracy: -1, blocked: !openInNewTab(url) });
  };

  const locating = state.kind === "locating";

  return (
    <div className={groupClassName}>
      <a
        href={STORE.address.directionsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={primaryClassName}
        onClick={onDirectionsClick}
        aria-busy={locating || undefined}
        aria-label={locating ? "Konumunuz alınıyor" : "Bulunduğunuz yerden mağazaya yol tarifi al"}
      >
        {showIcon && <DirectionsIcon />}
        {locating ? "Konumunuz alınıyor…" : "Yol Tarifi Al"}
      </a>
      <a
        href={STORE.address.googleMapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className={secondaryClassName}
      >
        Google Haritalar&apos;da Aç
      </a>

      {(state.kind !== "idle" || formVisible) && (
        <div className={styles.panel}>
          <div role="status" aria-live="polite" className={styles.status}>
            {state.kind === "locating" && (
              <p className={styles.muted}>Tarayıcınız konum izni isteyebilir; izin verdiğinizde tarif açılır.</p>
            )}

            {state.kind === "opened" && (
              <p className={state.blocked ? styles.warn : styles.ok}>
                {state.blocked ? (
                  <>
                    Tarayıcınız yeni sekmeyi engelledi.{" "}
                    <a href={state.url} target="_blank" rel="noopener noreferrer" className={styles.inlineLink}>
                      Yol tarifini açın →
                    </a>
                  </>
                ) : (
                  <>
                    {state.accuracy >= 0
                      ? `Konumunuz (${formatAccuracy(state.accuracy)}) başlangıç olarak kullanıldı; Google Haritalar yeni sekmede açıldı.`
                      : "Yazdığınız adres başlangıç olarak kullanıldı; Google Haritalar yeni sekmede açıldı."}{" "}
                    <a href={state.url} target="_blank" rel="noopener noreferrer" className={styles.inlineLink}>
                      Tekrar aç
                    </a>
                  </>
                )}
              </p>
            )}

            {state.kind === "approx" && (
              <p className={styles.warn}>
                Konumunuz yalnızca yaklaşık bulunabildi ({formatAccuracy(state.accuracy)}); başlangıç yanlış çıkabilir.{" "}
                <a
                  href={state.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={styles.inlineLink}
                  onClick={() => setState({ kind: "opened", url: state.url, accuracy: state.accuracy, blocked: false })}
                >
                  Yine de bu konumla aç
                </a>{" "}
                ya da nereden geleceğinizi yazın.
              </p>
            )}

            {state.kind === "error" && <p className={styles.error}>{state.message}</p>}
          </div>

          {formVisible ? (
            <form className={styles.form} onSubmit={submitOrigin}>
              <label htmlFor={inputId} className={styles.label}>
                Nereden geleceksiniz?
              </label>
              <div className={styles.row}>
                <input
                  ref={inputRef}
                  id={inputId}
                  type="text"
                  className={styles.input}
                  value={origin}
                  onChange={(e) => setOrigin(e.target.value)}
                  placeholder="Örn. Bursa Terminali ya da mahalle, ilçe"
                  autoComplete="street-address"
                  enterKeyHint="go"
                />
                <button type="submit" className={styles.submit}>
                  Tarifi aç
                </button>
              </div>
              {state.kind === "error" && (
                <button type="button" className={styles.retry} onClick={locate}>
                  Konumumu tekrar dene
                </button>
              )}
            </form>
          ) : (
            state.kind === "opened" && (
              <button type="button" className={styles.retry} onClick={() => setShowForm(true)}>
                Başka bir yerden mi geleceksiniz?
              </button>
            )
          )}

          <p className={styles.privacy}>
            Konumunuz yalnızca Google Haritalar&apos;a başlangıç noktası olarak iletilir; bizde saklanmaz.
          </p>
        </div>
      )}
    </div>
  );
}

function DirectionsIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <polygon points="3 11 22 2 13 21 11 13 3 11" />
    </svg>
  );
}
