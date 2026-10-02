/**
 * Demo banka ödeme sayfası — /demo-odeme/<ödeme denemesi>
 *
 * Sanal POS bağlanana kadar bankanın güvenli ödeme sayfasının (3D Secure) demo kopyası: kart bilgileri → telefona gelen
 * 6 haneli kod → sonuç → mağazaya dönüş. Gerçek para çekilmez; kart bilgileri tarayıcıdan çıkmaz. Mağaza başlığı
 * yoktur (gerçekte bu adım bankanın sitesindedir). Yalnız demo kipinde ve canlı sunucuda yönetici girişiyle açılır;
 * kurallar lib/payment/demo.ts.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { USE_DB } from "@/lib/data/source";
import { DEMO_CODE_TTL_MS, DEMO_MAX_WRONG, DEMO_RESEND_MS, loadDemoSession, type DemoSession } from "@/lib/payment/demo";
import DemoBankClient from "./DemoBankClient";
import styles from "./demo-odeme.module.css";

export const metadata: Metadata = {
  title: "Güvenli ödeme (demo)",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function DemoOdemePage({ params }: { params: Promise<{ attempt: string }> }) {
  const { attempt } = await params;
  const session: DemoSession = USE_DB
    ? await loadDemoSession(attempt)
    : { ok: false, reason: "not_found", message: "Veritabanı bağlı değil: demo ödeme yapılamaz." };

  return (
    <div className={styles.page}>
      {session.ok ? (
        <DemoBankClient
          attemptId={session.attemptId}
          merchant={session.merchant}
          reference={session.reference}
          amountKurus={session.amountKurus}
          phoneHint={session.phoneHint}
          rules={{ codeTtlMs: DEMO_CODE_TTL_MS, resendMs: DEMO_RESEND_MS, maxWrong: DEMO_MAX_WRONG }}
        />
      ) : (
        <main className={styles.sheet} aria-labelledby="demo-closed-title">
          <header className={styles.bar}>
            <span className={styles.barTitle}>
              <LockGlyph /> 3-D Secure · Güvenli ödeme
            </span>
            <span className={styles.stamp}>DEMO</span>
          </header>
          <section className={styles.body}>
            <h1 id="demo-closed-title" className={styles.h1}>
              {session.reason === "decided" ? "Ödeme sonuçlandı" : "Bu ödeme sayfası açılamıyor"}
            </h1>
            <p className={styles.lead}>{session.message}</p>
            <div className={styles.actions}>
              {session.backHref ? (
                <a className={styles.primary} href={session.backHref}>
                  {session.reason === "decided" ? "Mağazaya dön" : "Siparişe git"}
                </a>
              ) : (
                <Link className={styles.primary} href="/">
                  Mağazaya dön
                </Link>
              )}
            </div>
          </section>
        </main>
      )}
    </div>
  );
}

function LockGlyph() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}
