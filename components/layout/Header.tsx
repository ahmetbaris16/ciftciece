"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useEffect, useCallback, useRef } from "react";
import styles from "./Header.module.css";
import CartIcon from "@/components/ui/CartIcon";
import SearchBar from "@/components/ui/SearchBar";
import { STORE } from "@/lib/config/store";
import { useCart } from "@/lib/cart/CartContext";
import { useSession } from "next-auth/react";
import AccountMenu from "./AccountMenu";

const NAV_LINKS = [
  { label: "Zeytinyağı", href: "/kategori/zeytinyagi" },
  { label: "Zeytin", href: "/kategori/zeytin" },
  { label: "Kahvaltılık", href: "/kategori/kahvaltilik" },
  { label: "Turşu", href: "/kategori/tursu" },
  { label: "Kestane Şekeri", href: "/kategori/kestane-sekeri" },
  { label: "Sirke & İçecek", href: "/kategori/sirke-icecek" },
  { label: "Sabun", href: "/kategori/sabun" },
  { label: "Tüm Ürünler", href: "/urunler" },
];

export default function Header() {
  const { cart, isHydrated } = useCart();
  const cartCount = isHydrated ? cart.itemCount : 0;
  const { data: session, status: sessionStatus } = useSession();
  const isCustomer =
    sessionStatus === "authenticated" && (session?.user as { role?: string } | undefined)?.role === "CUSTOMER";

  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);

  // Gerçek başlık yüksekliğini --header-h olarak yayınla (boşluk, hero, yapışkan paneller, #bağlantılar kullanır)
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const root = document.documentElement;
    const update = () => root.style.setProperty("--header-h", `${Math.ceil(el.getBoundingClientRect().height)}px`);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const handleScroll = useCallback(() => {
    setIsScrolled(window.scrollY > 8);
  }, []);

  useEffect(() => {
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  // Close mobile menu on route change / resize
  useEffect(() => {
    const close = () => setMobileMenuOpen(false);
    window.addEventListener("resize", close);
    return () => window.removeEventListener("resize", close);
  }, []);

  // Prevent body scroll when mobile menu open
  useEffect(() => {
    if (mobileMenuOpen || searchOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [mobileMenuOpen, searchOpen]);

  return (
    <>
      <header
        ref={headerRef}
        className={`${styles.header} ${isScrolled ? styles.scrolled : ""}`}
        role="banner"
      >
        <div className={styles.utilityBar}>
          <div className={styles.utilityInner}>
            <span className={styles.utilityText}>
              <span className={styles.utilityPlace}>Orhangazi Zeytinciler Çarşısı — </span>
              Her gün {STORE.hours.monday.open}–{STORE.hours.monday.close}
            </span>
            <a
              href={`tel:${STORE.contact.phone}`}
              className={styles.utilityPhone}
              aria-label="Telefon numarasını ara"
            >
              {STORE.contact.phoneFormatted}
            </a>
          </div>
        </div>

        <div className={styles.mainBar}>
          <div className={styles.mainInner}>
            {/* ---- MOBILE: Hamburger ---- */}
            <button
              className={`${styles.hamburger} mobile-only`}
              aria-label={mobileMenuOpen ? "Menüyü kapat" : "Menüyü aç"}
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-nav"
              onClick={() => setMobileMenuOpen((v) => !v)}
            >
              <span className={`${styles.hamburgerLine} ${mobileMenuOpen ? styles.open : ""}`} />
              <span className={`${styles.hamburgerLine} ${mobileMenuOpen ? styles.open : ""}`} />
              <span className={`${styles.hamburgerLine} ${mobileMenuOpen ? styles.open : ""}`} />
            </button>

            {/* ---- LOGO ---- */}
            <Link href="/" className={styles.logo} aria-label={`${STORE.name} — Ana Sayfa`}>
              <Image
                src="/images/brand/logo-dark-mark.png"
                alt="Çiftçi Ece"
                width={619}
                height={242}
                loading="eager"
                fetchPriority="high"
                sizes="150px"
                className={styles.logoImg}
              />
            </Link>

            {/* ---- DESKTOP: Search ---- */}
            <div className={`${styles.searchWrap} desktop-only`}>
              <SearchBar />
            </div>

            {/* ---- RIGHT ACTIONS ---- */}
            <div className={styles.actions}>
              {/* Mobile search toggle */}
              <button
                className={`${styles.actionBtn} mobile-only`}
                aria-label="Aramayı aç"
                onClick={() => setSearchOpen(true)}
              >
                <SearchIcon />
              </button>

              {/* Account — girişsiz: Giriş Yap / Üye Ol, girişli: Hesabım */}
              <div className="desktop-only">
                <AccountMenu />
              </div>

              {/* Cart */}
              <Link
                href="/sepet"
                className={styles.cartBtn}
                aria-label={`Sepet${cartCount > 0 ? `, ${cartCount} ürün` : ""}`}
              >
                <CartIcon />
                {cartCount > 0 && (
                  <span className={styles.cartBadge} aria-hidden="true">
                    {cartCount > 99 ? "99+" : cartCount}
                  </span>
                )}
              </Link>
            </div>
          </div>
        </div>

        {/* ---- DESKTOP: Category Nav ---- */}
        <nav
          className={`${styles.categoryNav} desktop-only`}
          aria-label="Kategori navigasyonu"
        >
          <div className={styles.categoryInner}>
            <ul className={styles.categoryList} role="list">
              {NAV_LINKS.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className={styles.categoryLink}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </nav>
      </header>

      {/* ---- MOBILE: Full-screen nav overlay ---- */}
      <div
        id="mobile-nav"
        className={`${styles.mobileNav} ${mobileMenuOpen ? styles.mobileNavOpen : ""}`}
        aria-hidden={!mobileMenuOpen}
        role="dialog"
        aria-label="Mobil navigasyon menüsü"
      >
        <nav aria-label="Mobil menü">
          <ul className={styles.mobileNavList} role="list">
            {NAV_LINKS.map((link, i) => (
              <li
                key={link.href}
                className={styles.mobileNavItem}
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <Link
                  href={link.href}
                  className={styles.mobileNavLink}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {link.label}
                </Link>
              </li>
            ))}
            <li className={styles.mobileNavDivider} />
            {isCustomer ? (
              <li className={styles.mobileNavItem}>
                <Link
                  href="/hesabim"
                  className={styles.mobileNavLink}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  Hesabım
                </Link>
              </li>
            ) : (
              <>
                <li className={styles.mobileNavItem}>
                  <Link
                    href="/giris"
                    className={styles.mobileNavLink}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Giriş Yap
                  </Link>
                </li>
                <li className={styles.mobileNavItem}>
                  <Link
                    href="/uye-ol"
                    className={styles.mobileNavLink}
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    Üye Ol
                  </Link>
                </li>
              </>
            )}
            <li className={styles.mobileNavItem}>
              <Link
                href="/magaza"
                className={styles.mobileNavLink}
                onClick={() => setMobileMenuOpen(false)}
              >
                Mağazamız
              </Link>
            </li>
          </ul>
        </nav>
        <div className={styles.mobileNavFooter}>
          <p className={styles.mobileNavAddress}>
            Muradiye, Zeytinciler Çarşısı<br />
            16800 Orhangazi / Bursa
          </p>
        </div>
      </div>

      {/* Mobile nav backdrop */}
      {mobileMenuOpen && (
        <div
          className={styles.backdrop}
          aria-hidden="true"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* ---- MOBILE: Full-screen search ---- */}
      {searchOpen && (
        <div className={styles.mobileSearch} role="dialog" aria-label="Arama">
          <div className={styles.mobileSearchInner}>
            <SearchBar autoFocus onClose={() => setSearchOpen(false)} />
            <button
              className={styles.mobileSearchClose}
              onClick={() => setSearchOpen(false)}
              aria-label="Aramayı kapat"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Header spacer — prevents content from hiding behind sticky header */}
      <div className={styles.spacer} aria-hidden="true" />
    </>
  );
}

// ---- SVG Icons ----
function SearchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}
