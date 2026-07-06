import { useEffect, useMemo, useRef, useState } from "react";
import {
  Link,
  createFileRoute,
  useNavigate,
} from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { Package, Search, X } from "lucide-react";

import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ProductGrid } from "@/components/catalog/ProductGrid";
import type { Product } from "@/data/products";
import { fetchCatalog, fetchCategories, toCategory, toProduct } from "@/lib/api";

interface SearchParams {
  q: string;
  cat: string | undefined;
}

export const Route = createFileRoute("/search")({
  validateSearch: (raw: Record<string, unknown>): Partial<SearchParams> => ({
    q: typeof raw.q === "string" ? raw.q : "",
    cat: typeof raw.cat === "string" && raw.cat && raw.cat !== "null" ? raw.cat : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Поиск - Жемчужина Алтая" },
      {
        name: "description",
        content: "Поиск по каталогу натуральных продуктов с Алтая.",
      },
    ],
  }),
  loader: async () => ({
    categories: (await fetchCategories()).map(toCategory),
  }),
  component: SearchPage,
});

function declension(n: number, forms: [string, string, string]) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return forms[1];
  return forms[2];
}

function SearchPage() {
  const { q = "", cat } = Route.useSearch();
  const navigate = useNavigate({ from: "/search" });

  const [input, setInput] = useState(q);
  const [debounced, setDebounced] = useState(q);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Autofocus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // If URL q changes externally (back/forward), sync input
  useEffect(() => {
    setInput(q);
    setDebounced(q);
  }, [q]);

  // Debounce input -> debounced (300ms)
  useEffect(() => {
    const id = window.setTimeout(() => setDebounced(input), 300);
    return () => window.clearTimeout(id);
  }, [input]);

  // Push debounced value to URL (only when it differs from current q)
  useEffect(() => {
    if (debounced === q) return;
    navigate({
      search: (prev: Partial<SearchParams>) => ({ ...prev, q: debounced }),
      replace: true,
    });
  }, [debounced, q, navigate]);

  const { categories } = Route.useLoaderData();
  // Поиск выполняется на бэкенде (ТЗ 6.9)
  const [results, setResults] = useState<Product[]>([]);
  useEffect(() => {
    let cancelled = false;
    fetchCatalog({
      q: debounced.trim() || undefined,
      category: cat ?? undefined,
      perPage: 48,
    })
      .then((res) => {
        if (!cancelled) setResults(res.items.map(toProduct));
      })
      .catch(() => {
        if (!cancelled) setResults([]);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced, cat]);

  const setCat = (id: string | null) => {
    void id;
    navigate({
      search: (prev: Partial<SearchParams>) => ({ ...prev, cat: id ?? undefined }),
      replace: true,
    });
  };

  const clearInput = () => {
    setInput("");
    setDebounced("");
    navigate({ search: (prev: Partial<SearchParams>) => ({ ...prev, q: "" }), replace: true });
    inputRef.current?.focus();
  };

  const onAdd = (p: Product) => {
    setToast(`«${p.name}» добавлено в корзину`);
    window.setTimeout(() => setToast(null), 2200);
  };

  const count = results.length;
  const word = declension(count, ["товар", "товара", "товаров"]);

  return (
    <div style={{ backgroundColor: "var(--color-bg-cream)", minHeight: "100vh" }}>
      <Header />

      <main className="pt-20 pb-24 md:pt-28">
        <div className="mx-auto max-w-7xl px-4 md:px-8">
          {/* Heading */}
          <div className="flex flex-col items-center text-center">
            <span
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 12,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "var(--color-accent-dark)",
              }}
            >
              Поиск
            </span>
            <h1
              className="mt-3 text-4xl md:text-5xl"
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 600,
                color: "var(--color-bg-dark)",
                lineHeight: 1.05,
              }}
            >
              Что вы ищете?
            </h1>

            {/* Search input */}
            <div
              className="relative mt-6 w-full"
              style={{ maxWidth: 600 }}
            >
              <Search
                size={20}
                className="pointer-events-none absolute top-1/2 left-5 -translate-y-1/2"
                style={{ color: "var(--color-text-muted)" }}
              />
              <input
                ref={inputRef}
                type="search"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Поиск по 2000+ товаров..."
                aria-label="Поисковая строка"
                className="w-full rounded-full outline-none transition-shadow focus:shadow-lg"
                style={{
                  height: 60,
                  padding: "0 56px 0 52px",
                  fontFamily: "var(--font-body)",
                  fontSize: 16,
                  color: "var(--color-text)",
                  backgroundColor: "#fffdf7",
                  border: "1px solid rgba(31,26,14,0.1)",
                  boxShadow: "var(--shadow-card)",
                }}
              />
              {input && (
                <button
                  type="button"
                  aria-label="Очистить"
                  onClick={clearInput}
                  className="absolute top-1/2 right-3 inline-flex -translate-y-1/2 items-center justify-center rounded-full transition-colors hover:bg-black/5"
                  style={{ width: 40, height: 40, color: "var(--color-text-muted)" }}
                >
                  <X size={18} />
                </button>
              )}
            </div>

            {/* Category chips */}
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              <Chip
                label="Все категории"
                active={cat === null}
                onClick={() => setCat(null)}
                index={0}
              />
              {categories.map((c, i) => (
                <Chip
                  key={c.id}
                  label={c.name}
                  active={cat === c.id}
                  onClick={() => setCat(cat === c.id ? null : c.id)}
                  index={i + 1}
                />
              ))}
            </div>

            {/* Counter */}
            <p
              className="mt-6"
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 14,
                color: "var(--color-text-muted)",
              }}
            >
              {debounced.trim() ? (
                <>
                  Найдено <strong style={{ color: "var(--color-text)" }}>{count}</strong>{" "}
                  {word} по запросу «<span style={{ color: "var(--color-text)" }}>{debounced.trim()}</span>»
                </>
              ) : (
                <>
                  Всего в каталоге{" "}
                  <strong style={{ color: "var(--color-text)" }}>{count}</strong> {word}
                </>
              )}
            </p>
          </div>

          {/* Results */}
          <div className="mt-10">
            {count === 0 ? (
              <EmptyState />
            ) : (
              <motion.div
                key={`${debounced}-${cat ?? "all"}`}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, ease: "easeOut" }}
              >
                <ProductGrid products={results} onAdd={onAdd} />
              </motion.div>
            )}
          </div>
        </div>
      </main>

      <Footer />

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.25 }}
            className="fixed bottom-6 left-1/2 z-50 -translate-x-1/2"
            style={{
              backgroundColor: "var(--color-bg-dark)",
              color: "var(--color-text-on-dark)",
              fontFamily: "var(--font-body)",
              fontSize: 14,
              fontWeight: 500,
              padding: "12px 20px",
              borderRadius: 999,
              boxShadow: "var(--shadow-elevated)",
              maxWidth: "calc(100% - 32px)",
            }}
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Chip({
  label,
  active,
  onClick,
  index,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  index: number;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.04 }}
      whileTap={{ scale: 0.97 }}
      className="rounded-full transition-colors"
      style={{
        fontFamily: "var(--font-body)",
        fontSize: 13,
        fontWeight: 600,
        padding: "8px 14px",
        minHeight: 36,
        backgroundColor: active
          ? "var(--color-accent)"
          : "rgba(31,26,14,0.05)",
        color: active ? "var(--color-bg-dark)" : "var(--color-text)",
        border: active
          ? "1px solid var(--color-accent)"
          : "1px solid rgba(31,26,14,0.08)",
      }}
    >
      {label}
    </motion.button>
  );
}

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35 }}
      className="mx-auto flex max-w-md flex-col items-center text-center"
      style={{
        backgroundColor: "#fffdf7",
        border: "1px dashed rgba(31,26,14,0.15)",
        borderRadius: 24,
        padding: "48px 24px",
      }}
    >
      <div
        className="inline-flex items-center justify-center rounded-full"
        style={{
          width: 72,
          height: 72,
          backgroundColor: "rgba(200,150,62,0.12)",
          color: "var(--color-accent-dark)",
        }}
      >
        <Package size={32} />
      </div>
      <h3
        className="mt-5"
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 26,
          fontWeight: 600,
          color: "var(--color-bg-dark)",
        }}
      >
        Ничего не найдено
      </h3>
      <p
        className="mt-2"
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 14,
          color: "var(--color-text-muted)",
          lineHeight: 1.5,
        }}
      >
        Попробуйте изменить запрос или перейти в каталог - там собрано всё, чем мы гордимся.
      </p>
      <Link
        to="/catalog"
        className="mt-5 inline-flex items-center gap-2 rounded-full"
        style={{
          backgroundColor: "var(--color-accent)",
          color: "var(--color-bg-dark)",
          fontFamily: "var(--font-body)",
          fontWeight: 700,
          fontSize: 14,
          padding: "12px 22px",
          textDecoration: "none",
        }}
      >
        В каталог
      </Link>
    </motion.div>
  );
}
