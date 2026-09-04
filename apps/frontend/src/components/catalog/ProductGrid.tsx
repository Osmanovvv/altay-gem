import { AnimatePresence, motion } from "framer-motion";
import { Link } from "@tanstack/react-router";
import type { Product } from "@/data/products";
import { ProductCard } from "./ProductCard";
import { entranceInitial } from "@/lib/entrance";
import { useHydrated } from "@/hooks/useHydrated";

interface ProductGridProps {
  products: Product[];
  onAdd?: (p: Product) => void;
}

export function ProductGrid({ products, onAdd }: ProductGridProps) {
  const hydrated = useHydrated();
  // Единая сетка — 3 карточки в ряд на десктопе, без переключателя вида.
  const cols = "grid-cols-2 md:grid-cols-3";

  if (products.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center rounded-2xl py-16 text-center"
        style={{
          backgroundColor: "#fffdf7",
          border: "1px dashed rgba(31,26,14,0.15)",
        }}
      >
        <p
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 22,
            fontWeight: 600,
            color: "var(--color-text)",
          }}
        >
          Ничего не найдено
        </p>
        <p
          className="mt-2"
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 14,
            color: "var(--color-text-muted)",
          }}
        >
          Попробуйте сбросить фильтры или выбрать другую категорию.
        </p>
      </div>
    );
  }

  return (
    <div className={`grid gap-4 md:gap-5 ${cols}`}>
      <AnimatePresence mode="popLayout">
        {products.map((p, i) => (
          <motion.div
            key={p.id}
            layout
            // На первой отрисовке анимации нет: framer-motion иначе сериализует
            // opacity:0 в SSR-разметку и каталог приезжает невидимым
            // (см. lib/entrance.ts). Лесенку по delay тоже держим только после
            // гидратации — на первом экране она добавляла до 320 мс пустоты.
            initial={entranceInitial(hydrated, 16)}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{
              duration: 0.35,
              delay: hydrated ? Math.min(i, 8) * 0.04 : 0,
              ease: "easeOut",
            }}
          >
            <Link
              to="/product/$slug"
              params={{ slug: p.id }}
              style={{ textDecoration: "none", color: "inherit", display: "block" }}
            >
              <ProductCard product={p} onAdd={onAdd} />
            </Link>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export default ProductGrid;
