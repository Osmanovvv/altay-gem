import { Link, createFileRoute } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

import { MaxProductRow } from "@/components/max/MaxProductRow";
import { MaxBanners } from "@/components/max/MaxBanners";
import { fetchCategories, fetchHome, toProduct } from "@/lib/api";
import { highlightCategories } from "@/lib/max-app";

/**
 * Витрина мини-аппа (ТЗ р.13): баннеры акций + выделенные категории.
 * Выделение управляется флагом «Приоритет в MAX» у категории — на сайте оно
 * не применяется, это единственное отличие содержимого от веб-витрины.
 */
export const Route = createFileRoute("/max/")({
  loader: async () => {
    const [home, categories] = await Promise.all([fetchHome(), fetchCategories()]);
    return { home, categories: highlightCategories(categories) };
  },
  component: MaxHome,
});

function MaxHome() {
  const { home, categories } = Route.useLoaderData();
  const hits = home.hits.map(toProduct);
  const priority = categories.filter((c) => c.priorityInMax === true);
  const rest = categories.filter((c) => c.priorityInMax !== true);

  return (
    <div className="px-4 pb-6 pt-4">
      <h1
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 26,
          fontWeight: 600,
          color: "var(--color-text)",
          lineHeight: 1.1,
        }}
      >
        Жемчужина Алтая
      </h1>
      <p
        className="mt-1"
        style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--color-text-muted)" }}
      >
        Натуральные продукты с Алтая
      </p>

      <MaxBanners banners={home.banners} />

      {priority.length > 0 && (
        <CategoryBlock title="Рекомендуем" items={priority} highlighted />
      )}
      <CategoryBlock title={priority.length > 0 ? "Все категории" : "Категории"} items={rest} />

      {hits.length > 0 && (
        <section className="mt-7">
          <SectionHead title="Хиты продаж" to="/max/catalog" />
          <div className="mt-3 flex flex-col gap-3">
            {hits.map((p) => (
              <MaxProductRow key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function SectionHead({ title, to }: { title: string; to: string }) {
  return (
    <div className="flex items-baseline justify-between">
      <h2
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 20,
          fontWeight: 600,
          color: "var(--color-text)",
        }}
      >
        {title}
      </h2>
      <Link
        to={to}
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 13,
          fontWeight: 600,
          color: "var(--color-accent-dark)",
          textDecoration: "none",
        }}
      >
        Все
      </Link>
    </div>
  );
}

function CategoryBlock({
  title,
  items,
  highlighted = false,
}: {
  title: string;
  items: Array<{ slug: string; name: string; photo: string | null; productCount: number }>;
  highlighted?: boolean;
}) {
  if (items.length === 0) return null;
  return (
    <section className="mt-7">
      <h2
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 20,
          fontWeight: 600,
          color: "var(--color-text)",
        }}
      >
        {title}
      </h2>
      <div className="mt-3 grid grid-cols-2 gap-3">
        {items.map((c) => (
          <Link
            key={c.slug}
            to="/max/catalog"
            search={{ category: c.slug }}
            className="relative flex flex-col justify-end overflow-hidden"
            style={{
              minHeight: highlighted ? 132 : 104,
              borderRadius: 16,
              padding: 12,
              textDecoration: "none",
              backgroundColor: "var(--color-bg-dark)",
              backgroundImage: c.photo ? `url(${c.photo})` : undefined,
              backgroundSize: "cover",
              backgroundPosition: "center",
              border: highlighted ? "1px solid rgba(200,150,62,0.45)" : "1px solid rgba(31,26,14,0.06)",
              boxShadow: "var(--shadow-card)",
            }}
          >
            <span
              aria-hidden
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(to top, rgba(13,24,18,0.86), rgba(13,24,18,0.18) 70%)",
              }}
            />
            <span
              className="relative inline-flex items-center gap-1"
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 14,
                fontWeight: 700,
                color: "var(--color-text-on-dark)",
                lineHeight: 1.2,
              }}
            >
              {c.name}
              <ChevronRight size={14} />
            </span>
            <span
              className="relative"
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 11,
                color: "rgba(245,239,224,0.75)",
              }}
            >
              {c.productCount} товаров
            </span>
          </Link>
        ))}
      </div>
    </section>
  );
}
