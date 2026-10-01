"use client";

import { useRef, useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import styles from "./SearchBar.module.css";
import type { Product } from "@/types";

interface SearchBarProps {
  autoFocus?: boolean;
  onClose?: () => void;
}

type SearchApiResult = Product;

export default function SearchBar({ autoFocus, onClose }: SearchBarProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<SearchApiResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (autoFocus) {
      inputRef.current?.focus();
    }
  }, [autoFocus]);

  // Debounced search
  const fetchSuggestions = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`);
      if (!res.ok) return;
      const data = await res.json() as { results: SearchApiResult[] };
      setSuggestions(data.results?.slice(0, 5) ?? []);
      setIsOpen(true);
    } catch {
      // Network hatası — sessizce devam
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    setSelectedIndex(-1);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(val), 280);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    setIsOpen(false);
    onClose?.();
    router.push(`/arama?q=${encodeURIComponent(trimmed)}`);
  };

  const handleSelect = (slug: string) => {
    setIsOpen(false);
    setQuery("");
    onClose?.();
    router.push(`/urun/${slug}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, -1));
    } else if (e.key === "Enter" && selectedIndex >= 0) {
      e.preventDefault();
      const selected = suggestions[selectedIndex];
      if (selected) handleSelect(selected.slug);
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  };

  const handleBlur = () => {
    // Delay to allow click on suggestion
    setTimeout(() => setIsOpen(false), 150);
  };

  return (
    <div className={styles.wrap}>
      <form
        role="search"
        className={styles.form}
        onSubmit={handleSubmit}
        aria-label="Ürün ara"
      >
        <div className={styles.inputWrap}>
          <span className={styles.icon} aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.35-4.35" />
            </svg>
          </span>
          <input
            ref={inputRef}
            id="site-search"
            name="q"
            type="search"
            className={styles.input}
            placeholder="Ürün ara… zeytin, zeytinyağı, turşu"
            value={query}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            autoComplete="off"
            spellCheck="false"
            role="combobox"
            aria-label="Ürün arama kutusu"
            aria-autocomplete="list"
            aria-expanded={isOpen}
            aria-controls={isOpen ? "search-suggestions" : undefined}
          />
          {query && (
            <button
              type="button"
              className={styles.clearBtn}
              onClick={() => {
                setQuery("");
                setSuggestions([]);
                setIsOpen(false);
                inputRef.current?.focus();
              }}
              aria-label="Aramayı temizle"
            >
              ✕
            </button>
          )}
        </div>
      </form>

      {/* Dropdown */}
      {isOpen && suggestions.length > 0 && (
        <ul
          id="search-suggestions"
          className={styles.dropdown}
          role="listbox"
          aria-label="Arama önerileri"
        >
          {suggestions.map((product, i) => {
            const variant = product.variants[0];
            return (
              <li
                key={product.id}
                role="option"
                aria-selected={i === selectedIndex}
                className={`${styles.suggestion} ${i === selectedIndex ? styles.suggestionActive : ""}`}
                onMouseDown={() => handleSelect(product.slug)}
              >
                <span className={styles.suggestName}>{product.name}</span>
                {variant && variant.priceKurus > 0 && (
                  <span className={styles.suggestPrice}>
                    {(variant.priceKurus / 100).toLocaleString("tr-TR", { style: "currency", currency: "TRY", minimumFractionDigits: 2 })}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
