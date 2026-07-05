import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { Clock, Leaf, MapPin, Phone, ShieldCheck, Truck } from "lucide-react";

import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { PageHero } from "@/components/info/PageHero";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "О компании - Жемчужина Алтая" },
      {
        name: "description",
        content:
          "Жемчужина Алтая - натуральные продукты с Алтая с 2018 года. Два магазина в Новосибирске и прямые поставки от фермерских хозяйств.",
      },
      { property: "og:title", content: "О компании - Жемчужина Алтая" },
      {
        property: "og:description",
        content:
          "История магазина, наши преимущества и адреса в Новосибирске.",
      },
    ],
  }),
  component: AboutPage,
});

const ADVANTAGES = [
  {
    icon: Truck,
    title: "Прямые поставки",
    text: "Работаем без посредников с фермерскими хозяйствами «Алтайская деревня» и «Шлегель». Свежесть и честная цена.",
  },
  {
    icon: ShieldCheck,
    title: "Контроль качества",
    text: "Каждая партия проходит проверку: сертификаты, лабораторные анализы и наша личная дегустация.",
  },
  {
    icon: Leaf,
    title: "Натуральный состав",
    text: "Никаких консервантов, красителей и ароматизаторов - только то, что собрано и сделано на Алтае.",
  },
];

const SHOPS = [
  {
    name: "Левый берег",
    address: "г. Новосибирск, ул. Ватутина, 89",
    phone: "+7 (383) 200-12-12",
    hours: "Ежедневно, 09:00 - 21:00",
  },
  {
    name: "Правый берег",
    address: "г. Новосибирск, ул. Кирова, 27",
    phone: "+7 (383) 200-45-45",
    hours: "Ежедневно, 10:00 - 21:00",
  },
];

function AboutPage() {
  return (
    <div style={{ backgroundColor: "var(--color-bg-cream)", minHeight: "100vh" }}>
      <Header />
      <PageHero
        eyebrow="О нас"
        title="О компании"
        subtitle="Натуральные продукты Алтая с 2018 года. Два магазина в Новосибирске и доставка по всей России."
      />

      <main>
        {/* Our story */}
        <Section>
          <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
            <div>
              <SectionEyebrow>История</SectionEyebrow>
              <SectionTitle>Наша история</SectionTitle>
              <div
                className="mt-5 flex flex-col gap-4"
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: 16,
                  lineHeight: 1.65,
                  color: "var(--color-text-muted)",
                }}
              >
                <p>
                  «Жемчужина Алтая» работает с 2018 года. Начали с одной точки на
                  левом берегу Новосибирска и небольшого ассортимента мёда и
                  травяных сборов, привезённых напрямую из горных пасек.
                </p>
                <p>
                  Сегодня у нас два магазина в Новосибирске и более 2000
                  наименований: мёд, чаи, сыры, мясные деликатесы, косметика,
                  бальзамы и пантовая продукция. Все товары - от двух
                  проверенных фермерских хозяйств: «Алтайская деревня» и
                  «Шлегель».
                </p>
                <p>
                  Мы лично знакомы с каждым производителем, бываем на пасеках и
                  в сыроварнях, и отвечаем за качество всего, что стоит на наших
                  полках.
                </p>
              </div>
            </div>

            <Placeholder
              aspect="4 / 5"
              gradient="linear-gradient(160deg, #2d4a37 0%, #1a2a20 70%, #0d1812 100%)"
              label="Алтай · 2018"
            />
          </div>
        </Section>

        {/* Advantages */}
        <Section variant="muted">
          <SectionEyebrow center>Почему мы</SectionEyebrow>
          <SectionTitle center>Наши преимущества</SectionTitle>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {ADVANTAGES.map((a, i) => (
              <motion.div
                key={a.title}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-50px" }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
                style={{
                  backgroundColor: "#fffdf7",
                  border: "1px solid rgba(31,26,14,0.06)",
                  borderRadius: 20,
                  padding: 28,
                  boxShadow: "var(--shadow-card)",
                }}
              >
                <div
                  className="inline-flex items-center justify-center rounded-2xl"
                  style={{
                    width: 52,
                    height: 52,
                    backgroundColor: "rgba(59,110,74,0.1)",
                    color: "#3b6e4a",
                  }}
                >
                  <a.icon size={24} />
                </div>
                <h3
                  className="mt-5"
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 22,
                    fontWeight: 600,
                    color: "var(--color-bg-dark)",
                  }}
                >
                  {a.title}
                </h3>
                <p
                  className="mt-2"
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: 14.5,
                    lineHeight: 1.55,
                    color: "var(--color-text-muted)",
                  }}
                >
                  {a.text}
                </p>
              </motion.div>
            ))}
          </div>
        </Section>

        {/* Shops */}
        <Section>
          <SectionEyebrow>Где найти</SectionEyebrow>
          <SectionTitle>Наши магазины</SectionTitle>
          <div className="mt-8 grid gap-5 md:grid-cols-2">
            {SHOPS.map((s) => (
              <div
                key={s.name}
                style={{
                  backgroundColor: "var(--color-bg-dark)",
                  color: "var(--color-text-on-dark)",
                  borderRadius: 20,
                  padding: 28,
                  boxShadow: "var(--shadow-card)",
                }}
              >
                <div className="flex items-start gap-4">
                  <div
                    className="inline-flex items-center justify-center rounded-2xl shrink-0"
                    style={{
                      width: 48,
                      height: 48,
                      backgroundColor: "rgba(232,180,79,0.18)",
                      color: "var(--color-accent)",
                    }}
                  >
                    <MapPin size={22} />
                  </div>
                  <div>
                    <span
                      style={{
                        fontFamily: "var(--font-body)",
                        fontSize: 12,
                        fontWeight: 600,
                        letterSpacing: "0.16em",
                        textTransform: "uppercase",
                        color: "var(--color-accent)",
                      }}
                    >
                      Магазин
                    </span>
                    <h3
                      className="mt-1"
                      style={{
                        fontFamily: "var(--font-display)",
                        fontSize: 26,
                        fontWeight: 600,
                        lineHeight: 1.1,
                      }}
                    >
                      {s.name}
                    </h3>
                  </div>
                </div>
                <ul
                  className="mt-5 flex flex-col gap-2.5"
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: 15,
                    color: "rgba(255,253,247,0.82)",
                  }}
                >
                  <ShopLine icon={<MapPin size={16} />}>{s.address}</ShopLine>
                  <ShopLine icon={<Phone size={16} />}>
                    <a href={`tel:${s.phone.replace(/\D/g, "")}`} style={{ color: "inherit" }}>
                      {s.phone}
                    </a>
                  </ShopLine>
                  <ShopLine icon={<Clock size={16} />}>{s.hours}</ShopLine>
                </ul>
              </div>
            ))}
          </div>

          <div className="mt-10 flex justify-center">
            <Link
              to="/catalog"
              className="inline-flex items-center gap-2 rounded-full"
              style={{
                backgroundColor: "var(--color-accent)",
                color: "var(--color-bg-dark)",
                fontFamily: "var(--font-body)",
                fontWeight: 700,
                fontSize: 14,
                padding: "14px 28px",
                textDecoration: "none",
              }}
            >
              Перейти в каталог
            </Link>
          </div>
        </Section>
      </main>

      <Footer />
    </div>
  );
}

function ShopLine({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <li className="flex items-center gap-3">
      <span style={{ color: "var(--color-accent)" }}>{icon}</span>
      <span>{children}</span>
    </li>
  );
}

function Section({
  variant = "default",
  children,
}: {
  variant?: "default" | "muted";
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        backgroundColor:
          variant === "muted" ? "#f3ece0" : "var(--color-bg-cream)",
        padding: "72px 0",
      }}
    >
      <div className="mx-auto max-w-6xl px-4 md:px-8">{children}</div>
    </section>
  );
}

function SectionEyebrow({
  center,
  children,
}: {
  center?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={center ? "text-center" : ""}>
      <span
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 12,
          fontWeight: 600,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          color: "var(--color-accent-dark)",
        }}
      >
        {children}
      </span>
    </div>
  );
}

function SectionTitle({
  center,
  children,
}: {
  center?: boolean;
  children: React.ReactNode;
}) {
  return (
    <h2
      className={`mt-2 text-3xl md:text-4xl ${center ? "text-center" : ""}`}
      style={{
        fontFamily: "var(--font-display)",
        fontWeight: 600,
        color: "var(--color-bg-dark)",
        letterSpacing: "-0.01em",
        lineHeight: 1.1,
      }}
    >
      {children}
    </h2>
  );
}

function Placeholder({
  aspect = "4 / 3",
  gradient,
  label,
}: {
  aspect?: string;
  gradient: string;
  label?: string;
}) {
  return (
    <div
      className="relative w-full overflow-hidden"
      style={{
        aspectRatio: aspect,
        borderRadius: 24,
        background: gradient,
        boxShadow: "var(--shadow-elevated)",
      }}
    >
      <svg
        aria-hidden
        viewBox="0 0 400 500"
        preserveAspectRatio="none"
        className="absolute inset-0 h-full w-full opacity-25"
      >
        <path
          d="M0,360 C80,300 140,330 200,290 C260,250 320,300 400,260 L400,500 L0,500 Z"
          fill="#1a2a20"
        />
        <path
          d="M0,400 C100,360 180,380 260,350 C320,330 360,360 400,340 L400,500 L0,500 Z"
          fill="#0d1812"
        />
        <path
          d="M0,200 C100,170 200,220 300,180 C340,165 380,180 400,170"
          stroke="#e8b44f"
          strokeOpacity="0.35"
          strokeWidth="1"
          fill="none"
        />
        <path
          d="M0,240 C100,210 200,260 300,220 C340,205 380,220 400,210"
          stroke="#e8b44f"
          strokeOpacity="0.2"
          strokeWidth="1"
          fill="none"
        />
      </svg>
      {label && (
        <span
          className="absolute"
          style={{
            left: 20,
            bottom: 18,
            fontFamily: "var(--font-body)",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            color: "rgba(255,253,247,0.7)",
          }}
        >
          {label}
        </span>
      )}
    </div>
  );
}
