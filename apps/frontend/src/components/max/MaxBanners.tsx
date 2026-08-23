import { Link } from "@tanstack/react-router";
import type { ApiBanner } from "@/lib/api";

/**
 * Баннеры акций на витрине мини-аппа (ТЗ р.13). Горизонтальная лента со
 * снап-прокруткой — на узком экране это привычнее каруселей со стрелками,
 * которые пальцем не нажать. Данные те же, что на сайте (/home).
 */
export function MaxBanners({ banners }: { banners: ApiBanner[] }) {
  const list = banners.filter((b) => b.link !== null);
  if (list.length === 0) return null;

  return (
    <div
      className="mt-4 flex gap-3 overflow-x-auto pb-1"
      style={{ scrollSnapType: "x mandatory", scrollbarWidth: "none", marginInline: -16, paddingInline: 16 }}
    >
      {list.map((b, i) => {
        const to = b.link!.type === "promo" ? "/max/catalog" : "/max/catalog";
        return (
          <Link
            key={`${b.title}-${i}`}
            to={to}
            search={b.link!.type === "category" ? { category: b.link!.slug } : undefined}
            className="relative flex shrink-0 flex-col justify-end overflow-hidden"
            style={{
              width: "86%",
              maxWidth: 330,
              minHeight: 150,
              borderRadius: 18,
              padding: 14,
              textDecoration: "none",
              scrollSnapAlign: "start",
              backgroundColor: "var(--color-bg-dark)",
              backgroundImage: b.image ? `url(${b.image})` : undefined,
              backgroundSize: "cover",
              backgroundPosition: "center",
              boxShadow: "var(--shadow-card)",
            }}
          >
            <span
              aria-hidden
              className="absolute inset-0"
              style={{
                background: "linear-gradient(to top, rgba(13,24,18,0.88), rgba(13,24,18,0.15) 72%)",
              }}
            />
            {b.badge && (
              <span
                className="relative mb-1 self-start rounded-full px-2 py-0.5"
                style={{
                  backgroundColor: "var(--color-accent)",
                  color: "var(--color-bg-dark)",
                  fontFamily: "var(--font-body)",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                }}
              >
                {b.badge}
              </span>
            )}
            <span
              className="relative"
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 20,
                fontWeight: 600,
                color: "var(--color-accent-light)",
                lineHeight: 1.15,
              }}
            >
              {b.title}
            </span>
            {b.description && (
              <span
                className="relative mt-0.5 line-clamp-2"
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: 12,
                  color: "rgba(245,239,224,0.85)",
                }}
              >
                {b.description}
              </span>
            )}
          </Link>
        );
      })}
    </div>
  );
}

export default MaxBanners;
