import { motion } from "framer-motion";
import { Link } from "@tanstack/react-router";
import { iconFor, type FrontCategory } from "@/lib/api";

interface CategoriesGridProps {
  categories: FrontCategory[];
}

export function CategoriesGrid({ categories }: CategoriesGridProps) {
  return (
    <section
      id="catalog"
      style={{
        backgroundColor: "var(--color-bg-cream)",
        padding: "80px 0",
      }}
    >
      <div className="mx-auto max-w-7xl px-4 md:px-8">
        <div className="mb-12 flex flex-col items-start gap-3 md:mb-16">
          <span
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 13,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--color-accent-dark)",
            }}
          >
            Категории
          </span>
          <h2
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
          </h2>
          <p
            style={{
              fontFamily: "var(--font-body)",
              color: "var(--color-text-muted)",
              fontSize: 16,
              maxWidth: 520,
            }}
          >
            Выберите направление - от мёда и трав до фермерских сыров и косметики.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 md:gap-5 lg:grid-cols-4 lg:gap-6">
          {categories.map((cat, idx) => {
            const Icon = iconFor(cat.slug);
            return (
              <motion.div
                key={cat.id}
                initial={{ opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-80px" }}
                transition={{
                  duration: 0.5,
                  delay: idx * 0.1,
                  ease: "easeOut",
                }}
                whileHover={{ y: -4 }}
                className="category-card group relative overflow-hidden"
                style={{
                  minHeight: 200,
                  background: cat.gradient,
                  borderRadius: "var(--radius-lg)",
                  boxShadow: "var(--shadow-card)",
                  color: "var(--color-text-on-dark)",
                  transition: "var(--transition-smooth)",
                  textDecoration: "none",
                }}
              >
                <Link
                  to="/catalog"
                  search={{ category: cat.id }}
                  className="relative flex h-full min-h-[200px] flex-col justify-between p-5 md:p-6"
                  style={{
                    color: "var(--color-text-on-dark)",
                    textDecoration: "none",
                  }}
                >
                  <img
                    src={cat.image}
                    alt={cat.imageAlt}
                    width={900}
                    height={540}
                    loading="lazy"
                    decoding="async"
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                  <span
                    aria-hidden
                    className="pointer-events-none absolute inset-0"
                    style={{
                      background:
                        "linear-gradient(to top, rgba(8,16,12,0.9) 0%, rgba(8,16,12,0.52) 52%, rgba(8,16,12,0.18) 100%), radial-gradient(120% 80% at 100% 0%, rgba(255,255,255,0.14), transparent 55%)",
                    }}
                  />

                  <div className="relative flex items-start justify-between">
                    <div
                      className="cat-icon flex items-center justify-center rounded-full"
                      style={{
                        width: 52,
                        height: 52,
                        backgroundColor: "rgba(255,255,255,0.14)",
                        backdropFilter: "blur(6px)",
                        transition: "var(--transition-smooth)",
                      }}
                    >
                      <Icon size={26} strokeWidth={1.75} />
                    </div>
                  </div>

                  <div className="relative mt-6">
                    <h3
                      style={{
                        fontFamily: "var(--font-body)",
                        fontWeight: 600,
                        fontSize: 18,
                        lineHeight: 1.2,
                        color: "var(--color-text-on-dark)",
                      }}
                    >
                      {cat.name}
                    </h3>
                    <p
                      className="mt-1.5"
                      style={{
                        fontFamily: "var(--font-body)",
                        fontSize: 12.5,
                        lineHeight: 1.45,
                        color: "rgba(245,239,224,0.78)",
                      }}
                    >
                      {cat.description}
                    </p>

                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {cat.subcategories.map((s) => (
                        <span
                          key={s}
                          style={{
                            fontFamily: "var(--font-body)",
                            fontSize: 11,
                            fontWeight: 500,
                            padding: "4px 9px",
                            borderRadius: 999,
                            backgroundColor: "rgba(255,255,255,0.14)",
                            color: "var(--color-text-on-dark)",
                            backdropFilter: "blur(4px)",
                          }}
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>

        <div className="mt-10 flex justify-center">
          <Link
            to="/catalog"
            className="inline-flex items-center rounded-full transition-colors"
            style={{
              backgroundColor: "var(--color-accent)",
              color: "var(--color-bg-dark)",
              fontFamily: "var(--font-body)",
              fontWeight: 600,
              fontSize: 15,
              padding: "13px 24px",
              minHeight: 44,
            }}
          >
            Смотреть каталог
          </Link>
        </div>
      </div>

      <style>{`
        .category-card:hover {
          box-shadow: var(--shadow-elevated);
        }
        .category-card:hover .cat-icon {
          transform: scale(1.1);
          background-color: rgba(255,255,255,0.22);
        }
      `}</style>
    </section>
  );
}

export default CategoriesGrid;
