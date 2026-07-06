import { motion } from "framer-motion";
import { Calendar, MapPin, Store } from "lucide-react";
import { HOME_ASSETS } from "@/data/homeAssets";
import { useSettings } from "@/context/SettingsContext";

// Фолбэк на случай недоступного бэкенда; рабочие адреса — из админки
const FALLBACK_STORES = [
  {
    title: "Жемчужина Алтая",
    address: "ул. Ленинградская 75/2",
    note: "Ежедневно 9:00–20:00",
  },
  {
    title: "Натуральные продукты",
    address: "ул. Титова 32",
    note: "Ежедневно 9:00–20:00",
  },
];

interface AboutStorySectionProps {
  section?: { title?: string; text?: string } | null;
}

export function AboutStorySection({ section }: AboutStorySectionProps) {
  const settings = useSettings();
  const STORES = settings?.storePoints?.length
    ? settings.storePoints.map((p) => ({
        title: p.name,
        address: p.address,
        note: p.hours ?? "",
      }))
    : FALLBACK_STORES;
  return (
    <section
      id="about"
      aria-labelledby="about-story-title"
      style={{ backgroundColor: "var(--color-bg-cream)", padding: "88px 0" }}
    >
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-12 px-4 md:px-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-16">
        <motion.div
          initial={{ opacity: 0, y: 22 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.55 }}
          className="grid grid-cols-2 gap-4"
        >
          <div
            className="relative overflow-hidden rounded-2xl"
            style={{
              minHeight: 420,
              boxShadow: "var(--shadow-card)",
            }}
          >
            <img
              src={HOME_ASSETS.altaiPanorama.src}
              alt={HOME_ASSETS.altaiPanorama.alt}
              width={900}
              height={1200}
              loading="lazy"
              decoding="async"
              className="absolute inset-0 h-full w-full object-cover"
            />
          </div>
          <div className="grid gap-4">
            <div
              className="relative overflow-hidden rounded-2xl"
              style={{
                minHeight: 200,
                boxShadow: "var(--shadow-card)",
              }}
            >
              <img
                src={HOME_ASSETS.storeShelf.src}
                alt={HOME_ASSETS.storeShelf.alt}
                width={700}
                height={420}
                loading="lazy"
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover"
              />
            </div>
            <div
              className="relative overflow-hidden rounded-2xl"
              style={{
                minHeight: 200,
                boxShadow: "var(--shadow-card)",
              }}
            >
              <img
                src={HOME_ASSETS.honeyJars.src}
                alt="Банки собственного мёда на полке магазина"
                width={700}
                height={420}
                loading="lazy"
                decoding="async"
                className="absolute inset-0 h-full w-full object-cover"
              />
            </div>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 22 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.55, delay: 0.08 }}
        >
          <span
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 13,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--color-accent-dark)",
            }}
          >
            История и магазины
          </span>
          <h2
            id="about-story-title"
            className="mt-3 text-4xl md:text-5xl"
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 600,
              color: "var(--color-accent)",
              lineHeight: 1.05,
            }}
          >
            {section?.title ?? "Алтайские продукты, которые можно попробовать лично"}
          </h2>
          <p
            className="mt-5"
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 16,
              lineHeight: 1.7,
              color: "var(--color-text)",
            }}
          >
            {section?.text ??
              "С 2018 года мы собираем линейку натуральных продуктов из Алтая: мёд, чаи, сыры, деликатесы, бальзамы и косметику от проверенных партнёров."}
          </p>

          <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {STORES.map((store) => (
              <article
                key={store.title}
                className="rounded-2xl border p-5"
                style={{
                  borderColor: "rgba(200,150,62,0.22)",
                  backgroundColor: "#fffdf7",
                }}
              >
                <Store size={22} style={{ color: "var(--color-accent-dark)" }} />
                <h3
                  className="mt-4"
                  style={{
                    fontFamily: "var(--font-body)",
                    fontWeight: 600,
                    fontSize: 17,
                    color: "var(--color-text)",
                  }}
                >
                  {store.title}
                </h3>
                <p
                  className="mt-2 flex items-center gap-2"
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: 14,
                    color: "var(--color-text)",
                  }}
                >
                  <MapPin size={15} />
                  {store.address}
                </p>
                <p
                  className="mt-2 flex items-center gap-2"
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: 13,
                    color: "var(--color-text-muted)",
                  }}
                >
                  <Calendar size={15} />
                  {store.note}
                </p>
              </article>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}

export default AboutStorySection;
