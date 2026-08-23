import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Search, X } from "lucide-react";

import { MaxProductRow } from "@/components/max/MaxProductRow";
import { fetchCatalog, fetchCategories, toProduct } from "@/lib/api";
import { highlightCategories } from "@/lib/max-app";

interface CatalogSearch {
  category?: string;
  q?: string;
}

/**
 * Каталог мини-аппа (ТЗ р.13): фильтр по категориям + поиск.
 * Фильтрация серверная — тот же /catalog, что у сайта, чтобы остатки, цены и
 * правило «нет в наличии» считались в одном месте.
 */
export const Route = createFileRoute("/max/catalog")({
  validateSearch: (search: Record<string, unknown>): CatalogSearch => ({
    category: typeof search.category === "string" ? search.category : undefined,
    q: typeof search.q === "string" ? search.q : undefined,
  }),
  loaderDeps: ({ search }) => ({ category: search.category, q: search.q }),
  loader: async ({ deps }) => {
    const [catalog, categories] = await Promise.all([
      fetchCatalog({ category: deps.category, q: deps.q, perPage: 48, sort: "price_asc" }),
      fetchCategories(),
    ]);
    return { catalog, categories: highlightCategories(categories) };
  },
  component: MaxCatalog,
});

function MaxCatalog() {
  const initial = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate();

  const [data, setData] = useState(initial.catalog);
  const [query, setQuery] = useState(search.q ?? "");
  const firstRender = useRef(true);

  // Смена категории идёт через навигацию: загрузчик приносит новый список, но
  // локальное состояние об этом не знает и продолжает рисовать старый (баг
  // отловлен живой проверкой: адрес и заголовок менялись, товары — нет).
  // Синхронизируем состояние с данными загрузчика.
  useEffect(() => {
    setData(initial.catalog);
  }, [initial.catalog]);

  // Поиск с задержкой: без неё каждый символ уходит запросом на сервер.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const t = window.setTimeout(() => {
      fetchCatalog({
        category: search.category,
        q: query || undefined,
        perPage: 48,
        sort: "price_asc",
      })
        .then(setData)
        .catch(() => {
          /* сеть моргнула — оставляем прежний список, а не пустой экран */
        });
    }, 300);
    return () => window.clearTimeout(t);
  }, [query, search.category]);

  const products = useMemo(() => data.items.map(toProduct), [data]);
  const activeCategory = initial.categories.find((c) => c.slug === search.category);

  const setCategory = (slug?: string) => {
    void navigate({ to: "/max/catalog", search: { category: slug, q: query || undefined } });
  };

  return (
    <div className="px-4 pb-6 pt-4">
      <h1
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 24,
          fontWeight: 600,
          color: "var(--color-text)",
        }}
      >
        {activeCategory ? activeCategory.name : "Каталог"}
      </h1>

      <div className="relative mt-3">
        <Search
          size={16}
          style={{
            position: "absolute",
            left: 14,
            top: "50%",
            transform: "translateY(-50%)",
            color: "var(--color-text-muted)",
          }}
        />
        <input
          type="text"
          inputMode="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Поиск по каталогу"
          aria-label="Поиск по каталогу"
          className="w-full rounded-full border outline-none transition-colors focus:border-[color:var(--color-accent)]"
          style={{
            borderColor: "rgba(31,26,14,0.15)",
            backgroundColor: "#fff",
            fontFamily: "var(--font-body)",
            fontSize: 15,
            minHeight: 44,
            padding: "0 40px 0 38px",
          }}
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Очистить поиск"
            className="absolute inline-flex items-center justify-center rounded-full"
            style={{
              right: 6,
              top: "50%",
              transform: "translateY(-50%)",
              width: 32,
              height: 32,
              color: "var(--color-text-muted)",
            }}
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Категории лентой: на узком экране список фильтров сбоку не помещается */}
      <div
        className="mt-3 flex gap-2 overflow-x-auto pb-1"
        style={{ scrollbarWidth: "none", marginInline: -16, paddingInline: 16 }}
      >
        <Chip active={!search.category} onClick={() => setCategory(undefined)}>
          Все
        </Chip>
        {initial.categories.map((c) => (
          <Chip
            key={c.slug}
            active={search.category === c.slug}
            onClick={() => setCategory(c.slug)}
          >
            {c.name}
          </Chip>
        ))}
      </div>

      <p
        className="mt-3"
        style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--color-text-muted)" }}
      >
        Найдено товаров: {data.pagination.total}
      </p>

      {products.length === 0 ? (
        <div
          className="mt-4 rounded-2xl px-5 py-10 text-center"
          style={{ backgroundColor: "#fffdf7", border: "1px dashed rgba(31,26,14,0.15)" }}
        >
          <p
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 18,
              fontWeight: 600,
              color: "var(--color-text)",
            }}
          >
            Ничего не найдено
          </p>
          <p
            className="mt-1"
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 13,
              color: "var(--color-text-muted)",
            }}
          >
            Попробуйте изменить запрос или выбрать другую категорию
          </p>
        </div>
      ) : (
        <div className="mt-3 flex flex-col gap-3">
          {products.map((p) => (
            <MaxProductRow key={p.id} product={p} />
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 rounded-full border transition-colors"
      style={{
        borderColor: active ? "var(--color-accent)" : "rgba(31,26,14,0.15)",
        backgroundColor: active ? "var(--color-accent)" : "#fffdf7",
        color: active ? "var(--color-bg-dark)" : "var(--color-text)",
        fontFamily: "var(--font-body)",
        fontSize: 13,
        fontWeight: 600,
        padding: "0 14px",
        minHeight: 36,
      }}
    >
      {children}
    </button>
  );
}
