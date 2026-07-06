import { motion } from "framer-motion";
import { Clock, Mail, MapPin, Navigation, Phone } from "lucide-react";

import { useSettings } from "@/context/SettingsContext";

const FALLBACK_CONTACTS = [
  {
    title: "Жемчужина Алтая",
    address: "Новосибирск, ул. Ленинградская 75/2",
    hours: "Ежедневно 9:00–20:00",
  },
  {
    title: "Натуральные продукты",
    address: "Новосибирск, ул. Титова 32",
    hours: "Ежедневно 9:00–20:00",
  },
];

export function FindUsSection() {
  const settings = useSettings();
  const CONTACTS = settings?.storePoints?.length
    ? settings.storePoints.map((p) => ({
        title: p.name,
        address: p.address,
        hours: p.hours ?? "",
      }))
    : FALLBACK_CONTACTS;
  return (
    <section
      id="contacts"
      aria-labelledby="find-us-title"
      style={{ backgroundColor: "#fffdf7", padding: "88px 0" }}
    >
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-10 px-4 md:px-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-stretch">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.55 }}
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
            Как нас найти
          </span>
          <h2
            id="find-us-title"
            className="mt-3 text-4xl md:text-5xl"
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 600,
              color: "var(--color-accent)",
              lineHeight: 1.05,
            }}
          >
            Два магазина в Новосибирске и доставка по России
          </h2>

          <div className="mt-8 grid gap-4">
            {CONTACTS.map((contact) => (
              <article
                key={contact.title}
                className="rounded-2xl border p-5"
                style={{
                  borderColor: "rgba(200,150,62,0.22)",
                  backgroundColor: "var(--color-bg-cream)",
                }}
              >
                <h3
                  style={{
                    fontFamily: "var(--font-body)",
                    fontWeight: 600,
                    fontSize: 18,
                    color: "var(--color-text)",
                  }}
                >
                  {contact.title}
                </h3>
                <p
                  className="mt-3 flex items-start gap-2"
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: 14,
                    lineHeight: 1.5,
                    color: "var(--color-text)",
                  }}
                >
                  <MapPin size={17} style={{ color: "var(--color-accent-dark)", flexShrink: 0, marginTop: 2 }} />
                  {contact.address}
                </p>
                <p
                  className="mt-2 flex items-center gap-2"
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: 14,
                    color: "var(--color-text-muted)",
                  }}
                >
                  <Clock size={17} style={{ color: "var(--color-accent-dark)" }} />
                  {contact.hours}
                </p>
              </article>
            ))}
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
            <a
              href="tel:+73830000000"
              className="inline-flex items-center justify-center gap-2 rounded-full"
              style={{
                backgroundColor: "var(--color-accent)",
                color: "var(--color-bg-dark)",
                fontFamily: "var(--font-body)",
                fontWeight: 600,
                fontSize: 15,
                padding: "13px 22px",
                minHeight: 44,
              }}
            >
              <Phone size={17} />
              Позвонить
            </a>
            <a
              href="mailto:hello@altai-pearl.ru"
              className="inline-flex items-center justify-center gap-2 rounded-full border"
              style={{
                borderColor: "var(--color-accent)",
                color: "var(--color-accent-dark)",
                fontFamily: "var(--font-body)",
                fontWeight: 600,
                fontSize: 15,
                padding: "12px 22px",
                minHeight: 44,
              }}
            >
              <Mail size={17} />
              Написать
            </a>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="relative overflow-hidden rounded-2xl"
          style={{
            minHeight: 440,
            background:
              "linear-gradient(135deg, rgba(31,58,46,0.94), rgba(194,135,46,0.56)), url('/img/stock/u-1524661135-423995f22d0b.jpg')",
            backgroundPosition: "center",
            backgroundSize: "cover",
            boxShadow: "var(--shadow-card)",
          }}
        >
          <div
            className="absolute left-[16%] top-[30%] flex items-center gap-2 rounded-full px-4 py-3"
            style={{
              backgroundColor: "#fffdf7",
              color: "var(--color-text)",
              fontFamily: "var(--font-body)",
              fontSize: 13,
              fontWeight: 600,
              boxShadow: "0 16px 44px rgba(0,0,0,0.22)",
            }}
          >
            <Navigation size={16} style={{ color: "var(--color-accent-dark)" }} />
            Левый берег
          </div>
          <div
            className="absolute right-[12%] top-[58%] flex items-center gap-2 rounded-full px-4 py-3"
            style={{
              backgroundColor: "#fffdf7",
              color: "var(--color-text)",
              fontFamily: "var(--font-body)",
              fontSize: 13,
              fontWeight: 600,
              boxShadow: "0 16px 44px rgba(0,0,0,0.22)",
            }}
          >
            <Navigation size={16} style={{ color: "var(--color-accent-dark)" }} />
            Правый берег
          </div>
          <div
            className="absolute inset-x-6 bottom-6 flex flex-wrap items-center gap-3 rounded-2xl p-4"
            style={{
              backgroundColor: "rgba(255,253,247,0.93)",
              backdropFilter: "blur(8px)",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 14,
                fontWeight: 600,
                color: "var(--color-text)",
              }}
            >
              Построить маршрут:
            </span>
            <a
              href="https://yandex.ru/maps/65/novosibirsk/?text=%D0%9D%D0%BE%D0%B2%D0%BE%D1%81%D0%B8%D0%B1%D0%B8%D1%80%D1%81%D0%BA%2C%20%D0%92%D0%B0%D1%82%D1%83%D1%82%D0%B8%D0%BD%D0%B0%2089"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full px-4 transition-colors hover:opacity-85"
              style={{
                backgroundColor: "var(--color-bg-dark)",
                color: "var(--color-accent-light)",
                fontFamily: "var(--font-body)",
                fontSize: 13,
                fontWeight: 600,
                minHeight: 38,
              }}
            >
              Яндекс.Карты
            </a>
            <a
              href="https://2gis.ru/novosibirsk/search/%D0%92%D0%B0%D1%82%D1%83%D1%82%D0%B8%D0%BD%D0%B0%2089"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border px-4 transition-colors hover:bg-black/5"
              style={{
                borderColor: "rgba(31,26,14,0.2)",
                color: "var(--color-text)",
                fontFamily: "var(--font-body)",
                fontSize: 13,
                fontWeight: 600,
                minHeight: 38,
              }}
            >
              2ГИС
            </a>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

export default FindUsSection;
