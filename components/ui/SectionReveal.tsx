"use client";

/**
 * SectionReveal
 *
 * IntersectionObserver ile scroll-triggered giriş animasyonu.
 * Çocuk elementi görünür alana girince .visible class ekler.
 * prefers-reduced-motion: anında görünür yapar.
 */

import { useEffect, useRef } from "react";
import styles from "./SectionReveal.module.css";

interface SectionRevealProps {
  children: React.ReactNode;
  className?: string;
  /** Animasyon tipi */
  variant?: "fade-up" | "fade-in" | "fade-left" | "fade-right";
  /** Gecikme (ms) — birden fazla element için stagger */
  delay?: number;
  /** Threshold 0-1 */
  threshold?: number;
  as?: React.ElementType;
}

export default function SectionReveal({
  children,
  className = "",
  variant = "fade-up",
  delay = 0,
  threshold = 0.12,
  as: Tag = "div",
}: SectionRevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // prefers-reduced-motion → anında göster
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.classList.add(styles.visible);
      return;
    }

    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setTimeout(() => {
            el.classList.add(styles.visible);
          }, delay);
          obs.disconnect();
        }
      },
      { threshold }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [delay, threshold]);

  return (
    <Tag
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ref={ref as any}
      className={`${styles.reveal} ${styles[variant]} ${className}`}
    >
      {children}
    </Tag>
  );
}
