import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight, SlidersHorizontal, X } from "lucide-react";

import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import {
  CatalogSidebar,
  DEFAULT_FILTERS,
  type CatalogFilterState,
} from "@/components/catalog/CatalogSidebar";
import { CatalogFilters, type SortKey } from "@/components/catalog/CatalogFilters";
import { ProductGrid } from "@/components/catalog/ProductGrid";
import type { Product } from "@/data/products";

import { useCart } from "@/context/CartContext";
import {
  fetchCatalog,
  fetchCategories,
  toCategory,
  toProduct,
  type CatalogQuery,
} from "@/lib/api";

const SORT_MAP: Record<SortKey, CatalogQuery["sort"]> = {
  "price-asc": "price_asc",
  "price-desc": "price_desc",
  "name-asc": "name",
};

export const Route = createFileRoute("/catalog")({
  validateSearch: (search: Record<string, unknown>): { category?: string } => ({
    category: typeof search.category === "string" ? search.category : undefined,
  }),
  // SSR: первая страница каталога и категории приходят с сервера
  loaderDeps: ({ search }) => ({ category: search.category }),
  loader: async ({ deps }) => {
    const [catalog, categories] = await Promise.all([
      fetchCatalog({ category: deps.category, sort: "price_asc" }),
      fetchCategories(),
    ]);
    return { catalog, categories: categories.map(toCategory) };
  },
  head: () => ({
    meta: [
      { title: "Каталог продукции - Жемчужина Алтая" },
      {
        name: "description",
        content:
          "Натуральные продукты с Алтая: мёд, чаи, сыры, мясные деликатесы, косметика, бальзамы, пантогематоген и подарочные наборы. Доставка по России.",
      },
      { property: "og:title", content: "Каталог продукции - Жемчужина Алтая" },
      {
        property: "og:description",
        content:
          "Каталог натуральной алтайской продукции: 2000+ наименований от проверенных хозяйств.",
      },
    ],
  }),
  component: CatalogPage,
});

function CatalogPage() {
  const search = Route.useSearch();
  const initial = Route.useLoaderData();
  const categories = initial.categories;

  const [filters, setFilters] = useState<CatalogFilterState>(() => ({
    ...DEFAULT_FILTERS,
    category: search.category ?? null,
  }));
  const [sort, setSort] = useState<SortKey>("price-asc");
  const [page, setPage] = useState(1);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // данные с сервера: фильтрация/сортировка/пагинация — на бэкенде (ТЗ 6.3)
  const [data, setData] = useState(initial.catalog);
  const firstRender = useRef(true);

  // Переход с баннера акции/плитки категории на уже открытый каталог
  // (без полного размонтирования роута) — синкаем фильтр с URL.
  useEffect(() => {
    setFilters((f) => ({ ...f, category: search.category ?? null, subcategory: null }));
    setPage(1);
  }, [search.category]);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return; // первая отрисовка — данные уже пришли из loader (SSR)
    }
    const controller = new AbortController();
    const t = window.setTimeout(() => {
      fetchCatalog({
        category: filters.category ?? undefined,
        subcategory: filters.subcategory ?? undefined,
        priceMin: filters.priceMin ? Number(filters.priceMin) : undefined,
        priceMax: filters.priceMax ? Number(filters.priceMax) : undefined,
        inStock: filters.inStockOnly || undefined,
        sort: SORT_MAP[sort],
        page,
      })
        .then((res) => {
          if (!controller.signal.aborted) setData(res);
        })
        .catch(() => {
          /* сеть моргнула — оставляем предыдущие данные */
        });
    }, 250); // дебаунс для полей цены
    return () => {
      controller.abort();
      window.clearTimeout(t);
    };
  }, [filters, sort, page]);

  const pageItems = useMemo(() => data.items.map(toProduct), [data]);
  const pages = data.pagination.pageCount;
  const safePage = Math.min(page, pages);
  const totalCount = data.pagination.total;

  const updateFilters = (next: CatalogFilterState) => {
    setFilters(next);
    setPage(1);
  };

  const { addToCart } = useCart();
  const onAdd = (p: Product) => {
    addToCart(p);
    setToast(`«${p.name}» добавлено в корзину`);
    window.setTimeout(() => setToast(null), 2200);
  };

  const activeCategory = categories.find((c) => c.id === filters.category);

  return (
    <div
      id="top"
      style={{
        backgroundColor: "var(--color-bg-cream)",
        minHeight: "100vh",
      }}
    >
      <Header />

      <main className="pt-20 md:pt-24">
        <div className="mx-auto max-w-7xl px-4 md:px-8">
          {/* Breadcrumbs */}
          <nav
            aria-label="breadcrumb"
            className="flex flex-wrap items-center gap-1.5"
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 13,
              color: "var(--color-text-muted)",
            }}
          >
            <Link to="/" className="transition-colors hover:text-[color:var(--color-text)]">
              Главная
            </Link>
            <ChevronRight size={14} />
            <Link to="/catalog" className="transition-colors hover:text-[color:var(--color-text)]">
              Каталог
            </Link>
            {activeCategory && (
              <>
                <ChevronRight size={14} />
                <span style={{ color: "var(--color-text)" }}>
                  {activeCategory.name}
                </span>
              </>
            )}
            {filters.subcategory && (
              <>
                <ChevronRight size={14} />
                <span style={{ color: "var(--color-accent-dark)", fontWeight: 600 }}>
                  {filters.subcategory}
                </span>
              </>
            )}
          </nav>

          <div className="mt-6 flex flex-col gap-3 md:mt-8">
            <span
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 13,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
                color: "var(--color-accent-dark)",
              }}
            >
              Каталог
            </span>
            <h1
              className="text-4xl md:text-5xl"
              style={{
                fontFamily: "var(--font-display)",
                fontWeight: 600,
                color: "var(--color-accent)",
                lineHeight: 1.05,
                letterSpacing: "-0.01em",
              }}
            >
              Каталог продукции
            </h1>
          </div>

          {/* Mobile filters trigger */}
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="mt-6 inline-flex items-center gap-2 rounded-full border lg:hidden"
            style={{
              borderColor: "var(--color-accent)",
              color: "var(--color-accent-dark)",
              fontFamily: "var(--font-body)",
              fontWeight: 600,
              fontSize: 14,
              padding: "10px 18px",
              minHeight: 44,
              backgroundColor: "#fffdf7",
            }}
          >
            <SlidersHorizontal size={16} />
            Фильтры
          </button>

          <div className="mt-6 grid grid-cols-1 gap-6 pb-24 lg:grid-cols-[280px_1fr] lg:gap-8">
            {/* Sidebar desktop */}
            <div className="hidden lg:block">
              <div className="sticky top-24">
                <CatalogSidebar filters={filters} onChange={updateFilters} categories={categories} />
              </div>
            </div>

            {/* Main */}
            <div className="flex min-w-0 flex-col gap-5">
              <CatalogFilters
                count={totalCount}
                sort={sort}
                onSortChange={setSort}
              />

              <ProductGrid products={pageItems} onAdd={onAdd} />

              {pages > 1 && (
                <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                  {Array.from({ length: pages }).map((_, i) => {
                    const n = i + 1;
                    const active = n === safePage;
                    return (
                      <button
                        key={n}
                        type="button"
                        onClick={() => {
                          setPage(n);
                          window.scrollTo({ top: 200, behavior: "smooth" });
                        }}
                        className="inline-flex items-center justify-center rounded-full transition-colors"
                        style={{
                          minWidth: 44,
                          height: 44,
                          padding: "0 14px",
                          fontFamily: "var(--font-body)",
                          fontWeight: 600,
                          fontSize: 14,
                          backgroundColor: active
                            ? "var(--color-accent)"
                            : "transparent",
                          color: active
                            ? "var(--color-bg-dark)"
                            : "var(--color-text)",
                          border: active
                            ? "1px solid var(--color-accent)"
                            : "1px solid rgba(31,26,14,0.12)",
                        }}
                      >
                        {n}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      <Footer />

      {/* Mobile drawer */}
      <AnimatePresence>
        {drawerOpen && (
          <>
            <motion.div
              key="overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setDrawerOpen(false)}
              className="fixed inset-0 z-40 bg-black/50 lg:hidden"
            />
            <motion.aside
              key="drawer"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ type: "tween", ease: "easeOut", duration: 0.28 }}
              className="fixed top-0 left-0 z-50 flex h-full w-[90%] max-w-sm flex-col overflow-y-auto lg:hidden"
              style={{ backgroundColor: "var(--color-bg-cream)" }}
            >
              <div className="flex items-center justify-between px-4 py-4">
                <span
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 22,
                    fontWeight: 600,
                    color: "var(--color-text)",
                  }}
                >
                  Фильтры
                </span>
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="inline-flex items-center justify-center rounded-full hover:bg-black/5"
                  style={{ width: 44, height: 44, color: "var(--color-text)" }}
                  aria-label="Закрыть"
                >
                  <X size={22} />
                </button>
              </div>
              <div className="px-4 pb-8">
                <CatalogSidebar filters={filters} onChange={updateFilters} categories={categories} />
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Toast */}
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
