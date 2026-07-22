import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

export type SortKey = "price-asc" | "price-desc" | "name-asc";

interface CatalogFiltersProps {
  count: number;
  sort: SortKey;
  onSortChange: (s: SortKey) => void;
}

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "price-asc", label: "Цена: по возрастанию" },
  { value: "price-desc", label: "Цена: по убыванию" },
  { value: "name-asc", label: "По названию" },
];

export function CatalogFilters({ count, sort, onSortChange }: CatalogFiltersProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const current = SORT_OPTIONS.find((o) => o.value === sort) ?? SORT_OPTIONS[0];

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div
      className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      style={{
        backgroundColor: "#fffdf7",
        borderRadius: 16,
        padding: "12px 16px",
        border: "1px solid rgba(31,26,14,0.06)",
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 14,
          color: "var(--color-text-muted)",
        }}
      >
        Найдено товаров:{" "}
        <span style={{ color: "var(--color-text)", fontWeight: 600 }}>{count}</span>
      </span>

      <div ref={rootRef} className="relative">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
          className="inline-flex items-center gap-2 rounded-full border transition-colors"
          style={{
            borderColor: open ? "var(--color-accent)" : "rgba(31,26,14,0.15)",
            fontFamily: "var(--font-body)",
            fontSize: 14,
            fontWeight: 500,
            color: "var(--color-text)",
            backgroundColor: "#fff",
            minHeight: 44,
            padding: "0 16px",
          }}
        >
          {current.label}
          <ChevronDown
            size={16}
            style={{
              color: "var(--color-text-muted)",
              transition: "transform 200ms",
              transform: open ? "rotate(180deg)" : "rotate(0deg)",
            }}
          />
        </button>

        {open && (
          <ul
            role="listbox"
            className="absolute right-0 z-20 mt-2 overflow-hidden"
            style={{
              minWidth: 220,
              backgroundColor: "#fffdf7",
              borderRadius: 14,
              border: "1px solid rgba(31,26,14,0.08)",
              boxShadow: "var(--shadow-elevated)",
              padding: 6,
            }}
          >
            {SORT_OPTIONS.map((o) => {
              const active = o.value === sort;
              return (
                <li key={o.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={active}
                    onClick={() => {
                      onSortChange(o.value);
                      setOpen(false);
                    }}
                    className="flex w-full items-center justify-between gap-3 rounded-lg text-left transition-colors hover:bg-black/5"
                    style={{
                      padding: "10px 12px",
                      minHeight: 40,
                      fontFamily: "var(--font-body)",
                      fontSize: 14,
                      fontWeight: active ? 600 : 500,
                      color: active ? "var(--color-accent-dark)" : "var(--color-text)",
                    }}
                  >
                    {o.label}
                    {active && <Check size={15} style={{ color: "var(--color-accent)" }} />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

export default CatalogFilters;
