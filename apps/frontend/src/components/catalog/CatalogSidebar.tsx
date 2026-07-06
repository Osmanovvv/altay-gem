import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronDown, RotateCcw } from "lucide-react";
import type { FrontCategory } from "@/lib/api";

export interface CatalogFilterState {
  category: string | null; // category id
  subcategory: string | null;
  priceMin: string;
  priceMax: string;
  inStockOnly: boolean;
}

export const DEFAULT_FILTERS: CatalogFilterState = {
  category: null,
  subcategory: null,
  priceMin: "",
  priceMax: "",
  inStockOnly: false,
};

interface CatalogSidebarProps {
  filters: CatalogFilterState;
  onChange: (next: CatalogFilterState) => void;
  /** Категории с количеством товаров — приходят из API (/categories). */
  categories: FrontCategory[];
}

export function CatalogSidebar({ filters, onChange, categories }: CatalogSidebarProps) {
  const [openCat, setOpenCat] = useState<string | null>(filters.category);

  const toggleCat = (id: string) => {
    const isActive = filters.category === id;
    setOpenCat((cur) => (cur === id ? null : id));
    // Повторный клик по уже выбранной категории снимает фильтр — раньше
    // категория "залипала" навсегда, пока не жали "Сбросить фильтры".
    onChange({ ...filters, category: isActive ? null : id, subcategory: null });
  };

  const reset = () => {
    setOpenCat(null);
    onChange(DEFAULT_FILTERS);
  };

  return (
    <aside
      className="w-full"
      style={{
        backgroundColor: "#fffdf7",
        borderRadius: 20,
        padding: 20,
        border: "1px solid rgba(31,26,14,0.06)",
        boxShadow: "var(--shadow-card)",
      }}
    >
      <h3
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 22,
          fontWeight: 600,
          color: "var(--color-text)",
          marginBottom: 12,
        }}
      >
        Категории
      </h3>

      <ul className="flex flex-col">
        {categories.map((cat) => {
          const isOpen = openCat === cat.id;
          const isActive = filters.category === cat.id && !filters.subcategory;
          const count = cat.count;
          return (
            <li key={cat.id}>
              <button
                type="button"
                onClick={() => toggleCat(cat.id)}
                className="flex w-full items-center justify-between rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-black/5"
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: 14,
                  fontWeight: isActive ? 600 : 500,
                  color: isActive
                    ? "var(--color-accent-dark)"
                    : "var(--color-text)",
                  minHeight: 44,
                }}
              >
                <span className="flex items-center gap-2">
                  {cat.name}
                  <span
                    style={{
                      fontSize: 12,
                      color: "var(--color-text-muted)",
                      fontWeight: 500,
                    }}
                  >
                    ({count})
                  </span>
                </span>
                <ChevronDown
                  size={16}
                  style={{
                    transition: "transform 200ms",
                    transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
                    color: "var(--color-text-muted)",
                  }}
                />
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.ul
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden pl-3"
                  >
                    {cat.subcategories.map((sub) => {
                      const isSubActive =
                        filters.category === cat.id &&
                        filters.subcategory === sub;
                      return (
                        <li key={sub}>
                          <button
                            type="button"
                            onClick={() =>
                              onChange({
                                ...filters,
                                category: cat.id,
                                subcategory: isSubActive ? null : sub,
                              })
                            }
                            className="block w-full rounded-md px-3 py-2 text-left transition-colors hover:bg-black/5"
                            style={{
                              fontFamily: "var(--font-body)",
                              fontSize: 13,
                              fontWeight: isSubActive ? 600 : 500,
                              color: isSubActive
                                ? "var(--color-accent-dark)"
                                : "var(--color-text-muted)",
                            }}
                          >
                            {sub}
                          </button>
                        </li>
                      );
                    })}
                  </motion.ul>
                )}
              </AnimatePresence>
            </li>
          );
        })}
      </ul>

      <hr style={{ borderColor: "rgba(31,26,14,0.08)", margin: "20px 0" }} />

      {/* Price */}
      <h4
        style={{
          fontFamily: "var(--font-body)",
          fontWeight: 600,
          fontSize: 14,
          color: "var(--color-text)",
          marginBottom: 10,
        }}
      >
        Цена, ₽
      </h4>
      <div className="flex items-center gap-2">
        <input
          type="number"
          inputMode="numeric"
          placeholder="от"
          value={filters.priceMin}
          onChange={(e) => onChange({ ...filters, priceMin: e.target.value })}
          className="w-full rounded-md border px-3 py-2 outline-none transition-colors focus:border-[color:var(--color-accent)]"
          style={{
            borderColor: "rgba(31,26,14,0.15)",
            fontFamily: "var(--font-body)",
            fontSize: 14,
            backgroundColor: "#fff",
          }}
        />
        <span style={{ color: "var(--color-text-muted)" }}>-</span>
        <input
          type="number"
          inputMode="numeric"
          placeholder="до"
          value={filters.priceMax}
          onChange={(e) => onChange({ ...filters, priceMax: e.target.value })}
          className="w-full rounded-md border px-3 py-2 outline-none transition-colors focus:border-[color:var(--color-accent)]"
          style={{
            borderColor: "rgba(31,26,14,0.15)",
            fontFamily: "var(--font-body)",
            fontSize: 14,
            backgroundColor: "#fff",
          }}
        />
      </div>

      <label
        className="mt-5 flex cursor-pointer items-center gap-3"
        style={{ minHeight: 44 }}
      >
        <input
          type="checkbox"
          checked={filters.inStockOnly}
          onChange={(e) =>
            onChange({ ...filters, inStockOnly: e.target.checked })
          }
          className="h-4 w-4 cursor-pointer accent-[color:var(--color-accent)]"
        />
        <span
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 14,
            color: "var(--color-text)",
          }}
        >
          Только в наличии
        </span>
      </label>

      <button
        type="button"
        onClick={reset}
        className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full border transition-colors"
        style={{
          borderColor: "var(--color-accent)",
          color: "var(--color-accent-dark)",
          fontFamily: "var(--font-body)",
          fontWeight: 600,
          fontSize: 14,
          padding: "12px 18px",
          minHeight: 44,
          backgroundColor: "transparent",
        }}
      >
        <RotateCcw size={16} />
        Сбросить фильтры
      </button>
    </aside>
  );
}

export default CatalogSidebar;
