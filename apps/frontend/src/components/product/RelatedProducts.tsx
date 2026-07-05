import { useRef } from "react";
import { Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { PRODUCTS, type Product } from "@/data/products";
import { ProductCard } from "@/components/catalog/ProductCard";

interface RelatedProductsProps {
  category: string;
  excludeId: string;
  onAdd?: (p: Product) => void;
}

export function RelatedProducts({ category, excludeId, onAdd }: RelatedProductsProps) {
  const items = PRODUCTS.filter(
    (p) => p.category === category && p.id !== excludeId,
  ).slice(0, 6);

  const trackRef = useRef<HTMLDivElement | null>(null);

  if (items.length === 0) return null;

  const scrollBy = (dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
  };

  return (
    <section className="mt-16 md:mt-20">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <span
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 12,
              fontWeight: 600,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--color-accent-dark)",
            }}
          >
            Похожие товары
          </span>
          <h2
            className="text-3xl md:text-4xl"
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 600,
              color: "var(--color-bg-dark)",
              lineHeight: 1.05,
            }}
          >
            С этим товаром покупают
          </h2>
        </div>

        <div className="hidden gap-2 md:flex">
          <button
            type="button"
            aria-label="Назад"
            onClick={() => scrollBy(-1)}
            className="inline-flex items-center justify-center rounded-full border transition-colors hover:bg-black/5"
            style={{
              width: 44,
              height: 44,
              borderColor: "rgba(31,26,14,0.15)",
              color: "var(--color-text)",
              backgroundColor: "#fffdf7",
            }}
          >
            <ChevronLeft size={18} />
          </button>
          <button
            type="button"
            aria-label="Вперёд"
            onClick={() => scrollBy(1)}
            className="inline-flex items-center justify-center rounded-full border transition-colors hover:bg-black/5"
            style={{
              width: 44,
              height: 44,
              borderColor: "rgba(31,26,14,0.15)",
              color: "var(--color-text)",
              backgroundColor: "#fffdf7",
            }}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      </div>

      <motion.div
        ref={trackRef}
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.5 }}
        className="mt-6 grid auto-cols-[minmax(220px,1fr)] grid-flow-col gap-4 overflow-x-auto pb-4 md:auto-cols-[minmax(260px,1fr)]"
        style={{
          scrollSnapType: "x mandatory",
          scrollbarWidth: "thin",
        }}
      >
        {items.map((p) => (
          <div key={p.id} style={{ scrollSnapAlign: "start" }}>
            <Link
              to="/product/$slug"
              params={{ slug: p.id }}
              className="block"
              style={{ textDecoration: "none" }}
            >
              <ProductCard product={p} onAdd={onAdd} />
            </Link>
          </div>
        ))}
      </motion.div>
    </section>
  );
}

export default RelatedProducts;
