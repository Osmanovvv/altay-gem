import { motion } from "framer-motion";
import { ArrowRight, ShoppingBag, Sparkles } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { HOME_ASSETS } from "@/data/homeAssets";
import type { Product } from "@/data/products";

export interface HeroTrust {
  yandexRating?: number;
  gisRating?: number;
  note?: string;
}

interface HeroSectionProps {
  /** Товар-хит первого экрана (из админки, /home.hero). */
  product: Product | null;
  photoUrl?: string | null;
  trust: HeroTrust | null;
}

export function HeroSection({ product, photoUrl, trust }: HeroSectionProps) {
  const featuredProduct = product;

  const titleLines = ["Настоящие продукты", "Алтая"];

  return (
    <section
      className="relative isolate flex items-center overflow-hidden"
      style={{
        minHeight: "90vh",
        background:
          "linear-gradient(160deg, var(--color-bg-dark) 0%, #0d1812 100%)",
      }}
    >
      <img
        src={HOME_ASSETS.altaiHero.src}
        alt={HOME_ASSETS.altaiHero.alt}
        width={1920}
        height={1080}
        fetchPriority="high"
        decoding="async"
        className="absolute inset-0 h-full w-full object-cover"
        style={{ objectPosition: "center 42%" }}
      />
      <div
        aria-hidden
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(105deg, rgba(8,18,12,0.9) 0%, rgba(8,18,12,0.72) 48%, rgba(8,18,12,0.32) 100%)," +
            "linear-gradient(180deg, rgba(13,24,18,0.18) 0%, rgba(13,24,18,0.82) 100%)",
        }}
      />

      {/* Content */}
      <div className="relative z-10 mx-auto grid w-full max-w-7xl items-center gap-10 px-4 py-24 md:px-8 md:py-32 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div>
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="inline-flex items-center gap-2 rounded-full border px-4 py-1.5"
            style={{
              borderColor: "rgba(200,150,62,0.4)",
              backgroundColor: "rgba(200,150,62,0.08)",
              color: "var(--color-accent-light)",
              fontFamily: "var(--font-body)",
              fontSize: 13,
              letterSpacing: "0.08em",
            }}
          >
            <Sparkles size={14} />
            <span style={{ textTransform: "uppercase" }}>С душой Алтая</span>
          </motion.div>

          <h1
            className="mt-6 text-5xl md:text-7xl"
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 600,
              color: "var(--color-accent-light)",
              lineHeight: 1.02,
              letterSpacing: "-0.01em",
              maxWidth: "16ch",
            }}
          >
            {titleLines.map((line, i) => (
              <motion.span
                key={line}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.15 + i * 0.2, ease: "easeOut" }}
                style={{ display: "block" }}
              >
                {line}
              </motion.span>
            ))}
          </h1>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
            className="mt-6 text-lg md:text-xl"
            style={{
              fontFamily: "var(--font-body)",
              color: "#c8bfa8",
              maxWidth: 560,
              lineHeight: 1.6,
            }}
          >
            Свой алтайский мёд, продукты пчеловодства, чаи, сыры, деликатесы и
            натуральная косметика от проверенных производителей.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.8 }}
            className="mt-10 flex flex-wrap items-center gap-4"
          >
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Link
                to="/catalog"
                className="inline-flex items-center gap-2 rounded-full px-7 py-4 transition-colors"
                style={{
                  backgroundColor: "var(--color-accent)",
                  color: "var(--color-bg-dark)",
                  fontFamily: "var(--font-body)",
                  fontWeight: 600,
                  fontSize: 16,
                  minHeight: 44,
                }}
              >
                В каталог
                <ArrowRight size={18} />
              </Link>
            </motion.div>

            <motion.div
              whileHover={{ scale: 1.02, backgroundColor: "rgba(200,150,62,0.1)" }}
              whileTap={{ scale: 0.98 }}
            >
              <Link
                to="/promo"
                className="inline-flex items-center rounded-full border px-7 py-4 transition-colors"
                style={{
                  borderColor: "var(--color-accent)",
                  color: "var(--color-accent-light)",
                  fontFamily: "var(--font-body)",
                  fontWeight: 600,
                  fontSize: 16,
                  minHeight: 44,
                  backgroundColor: "transparent",
                }}
              >
                Акции
              </Link>
            </motion.div>
          </motion.div>

          {/* Trust line — социальное доказательство из утверждённого ТЗ */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 1.0 }}
            className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2"
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 14,
              color: "#c8bfa8",
            }}
          >
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden style={{ color: "var(--color-accent-light)" }}>★</span>
              {trust?.yandexRating ?? 4.9} Яндекс.Карты · {trust?.gisRating ?? 4.8} 2ГИС
            </span>
            <span aria-hidden style={{ opacity: 0.4 }}>|</span>
            <span>Собственная пасека</span>
            <span aria-hidden style={{ opacity: 0.4 }}>|</span>
            <span>{trust?.note ?? "Два магазина в Новосибирске"}</span>
          </motion.div>
        </div>

        {featuredProduct && (
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.9, ease: "easeOut" }}
            className="w-full max-w-sm justify-self-start lg:justify-self-end"
          >
            <Link
              to="/product/$slug"
              params={{ slug: featuredProduct.id }}
              aria-label={`Открыть товар: ${featuredProduct.name}`}
              className="group block overflow-hidden rounded-2xl outline-none transition-transform focus-visible:ring-2 focus-visible:ring-[color:var(--color-accent-light)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-bg-dark)]"
              style={{
                backgroundColor: "rgba(255,253,247,0.94)",
                border: "1px solid rgba(232,180,79,0.24)",
                boxShadow: "0 24px 70px rgba(0,0,0,0.28)",
              }}
            >
              <div
                className="relative overflow-hidden"
                style={{
                  aspectRatio: "16 / 10",
                  background: featuredProduct.image,
                }}
              >
                <img
                  src={photoUrl ?? HOME_ASSETS.honeyJars.src}
                  alt={featuredProduct.name}
                  width={720}
                  height={480}
                  loading="eager"
                  decoding="async"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <span
                  aria-hidden
                  className="absolute inset-0"
                  style={{
                    background:
                      "linear-gradient(to top, rgba(13,24,18,0.46), transparent 64%)",
                  }}
                />
                <span
                  className="absolute left-4 top-4 rounded-full px-3 py-1"
                  style={{
                    backgroundColor: "var(--color-accent)",
                    color: "var(--color-bg-dark)",
                    fontFamily: "var(--font-body)",
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                >
                  Хит продаж
                </span>
              </div>
              <div className="p-5">
                <span
                  style={{
                    color: "var(--color-accent-dark)",
                    fontFamily: "var(--font-body)",
                    fontSize: 12,
                    fontWeight: 600,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                  }}
                >
                  Собственная пасека
                </span>
                <h2
                  className="mt-2"
                  style={{
                    color: "var(--color-text)",
                    fontFamily: "var(--font-display)",
                    fontSize: 28,
                    fontWeight: 600,
                    lineHeight: 1.06,
                  }}
                >
                  {featuredProduct.name}
                </h2>
                <p
                  className="mt-2"
                  style={{
                    color: "var(--color-text-muted)",
                    fontFamily: "var(--font-body)",
                    fontSize: 14,
                    lineHeight: 1.45,
                  }}
                >
                  {featuredProduct.shortDescription}
                </p>
                <div className="mt-5 flex items-center justify-between gap-4">
                  <span
                    style={{
                      color: "var(--color-accent)",
                      fontFamily: "var(--font-body)",
                        fontVariantNumeric: "tabular-nums",
                      fontSize: 30,
                      fontWeight: 700,
                      lineHeight: 1,
                    }}
                  >
                    {featuredProduct.price.toLocaleString("ru-RU")} ₽
                  </span>
                  <span
                    className="inline-flex items-center gap-2 rounded-full px-4 py-2"
                    style={{
                      backgroundColor: "var(--color-bg-dark)",
                      color: "var(--color-accent-light)",
                      fontFamily: "var(--font-body)",
                      fontSize: 13,
                      fontWeight: 600,
                      minHeight: 40,
                    }}
                  >
                    <ShoppingBag size={15} />
                    Смотреть
                  </span>
                </div>
              </div>
            </Link>
          </motion.div>
        )}
      </div>

      {/* Topographic divider */}
      <svg
        aria-hidden
        viewBox="0 0 1440 80"
        preserveAspectRatio="none"
        className="absolute inset-x-0 bottom-0 w-full"
        style={{ height: 60, color: "#2d5a3f" }}
      >
        <path
          d="M0 50 C 120 20, 240 80, 360 50 C 480 20, 600 80, 720 50 C 840 20, 960 80, 1080 50 C 1200 20, 1320 80, 1440 50"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          opacity="0.6"
        />
        <path
          d="M0 65 C 120 35, 240 95, 360 65 C 480 35, 600 95, 720 65 C 840 35, 960 95, 1080 65 C 1200 35, 1320 95, 1440 65"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          opacity="0.35"
        />
      </svg>
    </section>
  );
}

export default HeroSection;
