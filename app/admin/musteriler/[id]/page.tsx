/**
 * Admin — Müşteri sayfası: iletişim, üyelik (şifre yenileme bağlantısı), tutarlar, siparişler, iptal/iade talepleri,
 * teslimat adresleri, kurumsal fatura bilgileri, ürün değerlendirmeleri, iletişim mesajları, müşteriye giden
 * e-postalar. Adreste e-posta yazmaz: üyede hesap kimliği, misafirde siparişlerinden birinin kimliği kullanılır.
 */

import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireAdmin } from "@/lib/auth/session";
import AdminShell from "@/components/admin/AdminShell";
import ResetLinkButton from "@/components/admin/customer/ResetLinkButton";
import { loadAdminCustomer, type CustomerOrderRow } from "@/lib/admin/customers";
import { formatPrice } from "@/types";
import { PAYMENT_METHOD_LABELS } from "@/lib/payment/methods";
import { formatPhoneTr } from "@/lib/business/info";
import rows_ from "@/components/admin/AdminRows.module.css";
import s from "./customer.module.css";

export const dynamic = "force-dynamic";

const STATUS: Record<string, { label: string; color: string }> = {
  PENDING: { label: "Ödeme bekliyor", color: "#facc15" },
  PAID: { label: "Ödendi", color: "#4ade80" },
  PROCESSING: { label: "Hazırlanıyor", color: "#60a5fa" },
  SHIPPED: { label: "Kargoda", color: "#a78bfa" },
  DELIVERED: { label: "Teslim edildi", color: "#34d399" },
  CANCELLED: { label: "İptal edildi", color: "#f87171" },
  REFUNDED: { label: "İade edildi", color: "#fb923c" },
};

const REQUEST_TYPE: Record<string, string> = { CANCEL: "İptal isteği", RETURN: "İade (cayma) bildirimi" };

const REQUEST_STATUS: Record<string, { label: string; color: string }> = {
  OPEN: { label: "Karar bekliyor", color: "#9ec5f0" },
  RESOLVED: { label: "Sonuçlandı", color: "#9fd39f" },
  REJECTED: { label: "Reddedildi", color: "#f3a0a0" },
};

// PENDING: eski kurallarla yazılmış, yayında olmayan (değerlendirmeler artık yazılınca yayınlanır)
const REVIEW_STATUS: Record<string, { label: string; color: string }> = {
  PENDING: { label: "Yayında değil", color: "rgba(232,228,217,0.5)" },
  APPROVED: { label: "Yayında", color: "#9fd39f" },
  REJECTED: { label: "Yayından kaldırıldı", color: "rgba(232,228,217,0.5)" },
};

const MESSAGE_STATUS: Record<string, { label: string; color: string }> = {
  NEW: { label: "Yeni", color: "#e8c07a" },
  READ: { label: "Okundu", color: "#9ec5f0" },
  ANSWERED: { label: "Yanıtlandı", color: "#9fd39f" },
  ARCHIVED: { label: "Arşiv", color: "rgba(232,228,217,0.5)" },
};

const LINK_STATE: Record<string, string> = {
  used: "kullanıldı",
  expired: "kullanılmadı, süresi doldu",
  valid: "geçerli, henüz kullanılmadı",
};

const dateTr = (d: Date) => new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeZone: "Europe/Istanbul" }).format(d);
const dateTimeTr = (d: Date) =>
  new Intl.DateTimeFormat("tr-TR", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Istanbul" }).format(d);

/** Türkiye cep telefonu (+905XXXXXXXXX) → WhatsApp sohbet bağlantısı */
const whatsappLink = (phone: string) => (/^\+905\d{9}$/.test(phone) ? `https://wa.me/${phone.slice(1)}` : null);

const excerpt = (text: string, max = 220) => (text.length > max ? `${text.slice(0, max).trimEnd()}…` : text);

function orderStatus(o: CustomerOrderRow) {
  if (o.status === "PENDING" && o.paymentMethod === "BANK_TRANSFER") return { label: "Havale bekleniyor", color: "#facc15" };
  return STATUS[o.status] ?? { label: o.status, color: "#999" };
}

const pill = (color: string) => ({ background: `${color}22`, color });

interface Props {
  params: Promise<{ id: string }>;
}

export default async function AdminMusteriDetay({ params }: Props) {
  const user = await requireAdmin();
  const { id } = await params;
  const found = await loadAdminCustomer(id);
  if (!found) notFound();
  if (found.kind === "redirect") redirect(`/admin/musteriler/${found.key}`);
  const c = found.customer;
  const { stats } = c;
  const openRequests = c.requests.filter((r) => r.status === "OPEN");
  const pastRequests = c.requests.filter((r) => r.status !== "OPEN");
  const shownOrders = c.orders.slice(0, 100);
  const refundedOrders = c.orders.filter((o) => !o.testPayment && o.refundedKurus > 0).length;

  return (
    <AdminShell user={user} activeSection="musteriler">
      <div className={s.page}>
        <Link href="/admin/musteriler" className={s.back}>
          ‹ Müşteriler
        </Link>

        <header className={s.head}>
          <div className={s.identity}>
            <h1 className={s.title}>{c.name ?? c.email}</h1>
            <p className={s.meta}>
              {c.email}
              {c.phones[0] ? ` · ${formatPhoneTr(c.phones[0])}` : ""}
            </p>
          </div>
          <div className={s.badges}>
            {c.kind === "member" ? (
              <span className={s.badge} data-tone="member">
                Üye
              </span>
            ) : (
              <span className={s.badge}>Misafir</span>
            )}
            {c.staff && (
              <span className={s.badge} data-tone="staff">
                Yönetici hesabı
              </span>
            )}
          </div>
        </header>

        <div className={s.summary}>
          <div className={s.stats}>
            <div className={s.stat}>
              <span className={s.statLabel}>Sipariş</span>
              <strong className={s.statValue}>{stats.orders}</strong>
              <span className={s.statSub}>
                {stats.orders === 0 ? "henüz yok" : stats.openOrders > 0 ? `${stats.openOrders} tanesi sürüyor` : "süren sipariş yok"}
              </span>
            </div>
            <div className={s.stat}>
              <span className={s.statLabel}>Net alışveriş</span>
              <strong className={s.statValue}>{formatPrice(stats.netKurus)}</strong>
              <span className={s.statSub}>alınan ödeme {formatPrice(stats.receivedKurus)}</span>
            </div>
            <div className={s.stat}>
              <span className={s.statLabel}>İade edilen</span>
              <strong className={s.statValue}>{formatPrice(stats.refundedKurus)}</strong>
              <span className={s.statSub}>{refundedOrders > 0 ? `${refundedOrders} siparişte` : "iade yok"}</span>
            </div>
            <div className={s.stat}>
              <span className={s.statLabel}>Son sipariş</span>
              <strong className={s.statValue}>{stats.lastOrderAt ? dateTr(stats.lastOrderAt) : "—"}</strong>
              {stats.firstOrderAt && <span className={s.statSub}>ilk sipariş {dateTr(stats.firstOrderAt)}</span>}
            </div>
          </div>
          {stats.testKurus > 0 && (
            <p className={s.note}>
              Demo/test ödemeleri ({formatPrice(stats.testKurus)}) tutarlara dahil değil: bu ödemelerde gerçek para alınmadı.
            </p>
          )}
        </div>

        {openRequests.length > 0 && (
          <section className={`${s.card} ${s.request}`}>
            <h2 className={s.h2}>{openRequests.length === 1 ? "Karar bekleyen talep" : `Karar bekleyen ${openRequests.length} talep`}</h2>
            <ul className={s.list}>
              {openRequests.map((r) => (
                <li key={r.id} className={s.item}>
                  <p className={s.text}>
                    {REQUEST_TYPE[r.type]} · <Link href={`/admin/siparisler/${r.orderId}`}>#{r.orderReference}</Link>
                    <span className={s.muted}> · {dateTimeTr(r.createdAt)}</span>
                  </p>
                  <p className={s.muted} style={{ whiteSpace: "pre-wrap" }}>
                    {excerpt(r.message)}
                  </p>
                </li>
              ))}
            </ul>
            <p className={s.hint}>Kararı siparişin sayfasında verin: talep kartında “kabul et” ve “reddet” seçenekleri var.</p>
          </section>
        )}

        <div className={s.grid}>
          <div className={s.main}>
            <section className={s.card}>
              <h2 className={s.h2}>Siparişler</h2>
              {c.orders.length === 0 ? (
                <p className={s.muted}>Henüz sipariş vermedi.</p>
              ) : (
                <ul className={rows_.list}>
                  {shownOrders.map((o) => {
                    const st = orderStatus(o);
                    const closed = o.status === "CANCELLED" || o.status === "REFUNDED";
                    const partialRefund = !closed && o.refundedKurus > 0 && o.refundedKurus < o.receivedKurus;
                    return (
                      <li key={o.id}>
                        <Link href={`/admin/siparisler/${o.id}`} className={rows_.row}>
                          <span className={rows_.main}>
                            <span className={s.ref}>#{o.reference}</span>
                            <span className={rows_.meta}>
                              {dateTimeTr(o.createdAt)}
                              {o.items ? ` · ${excerpt(o.items, 90)}` : ""}
                            </span>
                          </span>
                          <span className={rows_.amount}>
                            <strong>{formatPrice(o.totalKurus)}</strong>
                            <span className={rows_.meta}>
                              {PAYMENT_METHOD_LABELS[o.paymentMethod as keyof typeof PAYMENT_METHOD_LABELS] ?? o.paymentMethod}
                            </span>
                          </span>
                          <span className={rows_.side}>
                            <span className={rows_.pill} style={pill(st.color)}>
                              {st.label}
                            </span>
                            {o.needsAttention && (
                              <span className={rows_.pill} style={pill("#fb923c")}>
                                Dikkat
                              </span>
                            )}
                            {o.openRequests > 0 && (
                              <span className={rows_.pill} style={pill("#9ec5f0")}>
                                Talep
                              </span>
                            )}
                            {partialRefund && (
                              <span className={rows_.pill} style={pill("#fb923c")}>
                                Kısmi iade
                              </span>
                            )}
                            {o.testPayment && (
                              <span className={rows_.pill} style={pill("#a8a29e")} title="Demo/test ödemesi: gerçek para alınmadı.">
                                Demo ödeme
                              </span>
                            )}
                            {c.kind === "member" && !o.viaAccount && (
                              <span
                                className={rows_.pill}
                                style={pill("#a8a29e")}
                                title="Üye girişi yapılmadan verildi; müşterinin Hesabım sayfasında görünmez."
                              >
                                Misafir siparişi
                              </span>
                            )}
                            {o.otherEmail && (
                              <span className={rows_.pill} style={pill("#a8a29e")} title={`Siparişteki e-posta: ${o.otherEmail}`}>
                                Farklı e-posta
                              </span>
                            )}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
              {c.orders.length > shownOrders.length && <p className={s.more}>Son {shownOrders.length} sipariş gösteriliyor.</p>}
            </section>

            {pastRequests.length > 0 && (
              <section className={s.card}>
                <h2 className={s.h2}>Geçmiş talepler</h2>
                <ul className={s.list}>
                  {pastRequests.map((r) => {
                    const st = REQUEST_STATUS[r.status] ?? { label: r.status, color: "#999" };
                    return (
                      <li key={r.id} className={s.item}>
                        <div className={s.itemHead}>
                          <span style={{ color: st.color, fontWeight: 700 }}>{st.label}</span>
                          <span>{REQUEST_TYPE[r.type]}</span>
                          <span>
                            · <Link href={`/admin/siparisler/${r.orderId}`}>#{r.orderReference}</Link>
                          </span>
                          <span>· {dateTimeTr(r.createdAt)}</span>
                        </div>
                        <p className={s.text} style={{ whiteSpace: "pre-wrap" }}>
                          {excerpt(r.message)}
                        </p>
                        {r.resolutionNote && <p className={s.muted}>Not: {r.resolutionNote}</p>}
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {c.reviews.length > 0 && (
              <section className={s.card}>
                <h2 className={s.h2}>Ürün yorumları</h2>
                <ul className={s.list}>
                  {c.reviews.map((r) => {
                    const st = REVIEW_STATUS[r.status] ?? { label: r.status, color: "#999" };
                    return (
                      <li key={r.id} className={s.item}>
                        <div className={s.itemHead}>
                          <span className={s.stars} role="img" aria-label={`5 üzerinden ${r.rating} puan`}>
                            {"★".repeat(r.rating)}
                            {"☆".repeat(Math.max(0, 5 - r.rating))}
                          </span>
                          <span style={{ color: st.color, fontWeight: 700 }}>{st.label}</span>
                          <span>· {dateTr(r.createdAt)}</span>
                        </div>
                        <p className={s.text}>
                          <a href={`/urun/${r.productSlug}`} target="_blank" rel="noopener noreferrer">
                            {r.productName}
                          </a>
                          {r.title ? `: ${r.title}` : ""}
                        </p>
                        <p className={s.muted}>{excerpt(r.text)}</p>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

            {c.messages.length > 0 && (
              <section className={s.card}>
                <h2 className={s.h2}>İletişim formu mesajları</h2>
                <ul className={s.list}>
                  {c.messages.map((m) => {
                    const st = MESSAGE_STATUS[m.status] ?? { label: m.status, color: "#999" };
                    return (
                      <li key={m.id} className={s.item}>
                        <div className={s.itemHead}>
                          <span style={{ color: st.color, fontWeight: 700 }}>{st.label}</span>
                          <span>· {dateTimeTr(m.createdAt)}</span>
                          {m.orderReference && <span>· sipariş #{m.orderReference}</span>}
                        </div>
                        <p className={s.text}>
                          <Link href={`/admin/mesajlar?durum=tum#mesaj-${m.id}`}>{m.subject}</Link>
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}

          </div>

          <aside className={s.side}>
            <section className={s.card}>
              <h2 className={s.h2}>Üyelik</h2>
              {c.account ? (
                <>
                  <dl className={s.kv}>
                    <dt>Üye oldu</dt>
                    <dd>{dateTr(c.account.createdAt)}</dd>
                    <dt>Hesabında</dt>
                    <dd>{stats.accountOrders} sipariş</dd>
                    <dt>Şifre</dt>
                    <dd>{c.account.passwordResetAt ? `${dateTimeTr(c.account.passwordResetAt)} tarihinde yenilendi` : "üye olurken belirlendi"}</dd>
                    {c.account.lastResetLink && (
                      <>
                        <dt>Son bağlantı</dt>
                        <dd>
                          {dateTimeTr(c.account.lastResetLink.createdAt)} · {LINK_STATE[c.account.lastResetLink.state]}
                        </dd>
                      </>
                    )}
                  </dl>
                  {stats.guestOrders > 0 && (
                    <p className={s.muted} style={{ marginBottom: "0.75rem" }}>
                      {stats.guestOrders} siparişini üye girişi yapmadan verdi; bunlar müşterinin “Hesabım” sayfasında görünmez, e-postasındaki
                      bağlantıdan izlenir.
                    </p>
                  )}
                  <ResetLinkButton userId={c.account.id} email={c.email} />
                  <p className={s.hint}>
                    Müşteri giriş yapamıyorsa bağlantıyı gönderin: e-postasına gider, yeni şifreyi müşteri kendisi belirler. Şifreyi panelden
                    göremez ve değiştiremezsiniz.
                  </p>
                </>
              ) : (
                <>
                  <p className={s.text}>{c.staff ? "Yönetici hesabı." : "Üye değil."}</p>
                  {!c.staff && <p className={s.muted}>Siparişlerini e-postasındaki bağlantıdan ya da Sipariş Takip sayfasından izler.</p>}
                  {c.staff && (
                    <p className={s.hint}>
                      Bu e-posta yönetici hesabınıza ait. Mağazaya da bu e-posta ve yönetici şifrenizle girebilirsiniz; giriş yapmışken
                      verdiğiniz siparişler hesabınıza kaydedilir.
                    </p>
                  )}
                </>
              )}
              {c.otherAccounts.length > 0 && (
                <div className={s.hint}>
                  Bu e-postayla üye hesabından verilmiş siparişler başka müşteri sayfasında:
                  <ul className={s.list} style={{ marginTop: "0.35rem" }}>
                    {c.otherAccounts.map((a) => (
                      <li key={a.userId}>
                        <Link href={`/admin/musteriler/${a.userId}`}>{a.name ?? a.email}</Link> · {a.orders} sipariş
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            <section className={s.card}>
              <h2 className={s.h2}>İletişim</h2>
              <p className={s.text}>
                <a href={`mailto:${c.email}`}>{c.email}</a>
              </p>
              {c.phones.length === 0 ? (
                <p className={s.muted}>Telefon yok.</p>
              ) : (
                c.phones.map((p, i) => {
                  const wa = whatsappLink(p);
                  return (
                    <p key={p} className={i === 0 ? s.text : s.muted}>
                      <a href={`tel:${p}`}>{formatPhoneTr(p)}</a>
                      {wa && (
                        <>
                          {" "}
                          ·{" "}
                          <a href={wa} target="_blank" rel="noopener noreferrer">
                            WhatsApp
                          </a>
                        </>
                      )}
                    </p>
                  );
                })
              )}
              <p className={s.hint}>
                Bu bilgiler sipariş ve destek için kullanılır. Kampanya e-postası ya da SMS için müşterinin ayrıca açık onayı ve İYS kaydı
                gerekir.
              </p>
            </section>

            {c.addresses.length > 0 && (
              <section className={s.card}>
                <h2 className={s.h2}>Teslimat adresleri</h2>
                <ul className={s.list}>
                  {c.addresses.slice(0, 6).map((a) => (
                    <li key={`${a.address}|${a.district}|${a.city}`} className={s.item}>
                      {a.name && <p className={s.text}>{a.name}</p>}
                      <p className={s.text}>{a.address}</p>
                      <p className={s.muted}>
                        {a.district ? `${a.district} / ` : ""}
                        {a.city}
                        {a.postalCode ? ` ${a.postalCode}` : ""}
                      </p>
                      <p className={s.muted}>
                        {a.uses} sipariş · son {dateTr(a.lastUsedAt)}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {c.companies.length > 0 && (
              <section className={s.card}>
                <h2 className={s.h2}>Kurumsal fatura bilgileri</h2>
                <ul className={s.list}>
                  {c.companies.map((co) => (
                    <li key={`${co.taxNumber ?? ""}|${co.companyName}`} className={s.item}>
                      <p className={s.text}>{co.companyName}</p>
                      <p className={s.muted}>
                        {[co.taxOffice && `Vergi dairesi ${co.taxOffice}`, co.taxNumber && `Vergi no ${co.taxNumber}`].filter(Boolean).join(" · ")}
                      </p>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </aside>
        </div>
      </div>
    </AdminShell>
  );
}
