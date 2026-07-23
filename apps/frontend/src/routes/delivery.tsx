import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { AlertTriangle, CreditCard, MapPin, RotateCcw, Store, Truck } from "lucide-react";

import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { PageHero } from "@/components/info/PageHero";
import { useSettings } from "@/context/SettingsContext";

export const Route = createFileRoute("/delivery")({
  head: () => ({
    meta: [
      { title: "Доставка и оплата - Жемчужина Алтая" },
      {
        name: "description",
        content:
          "Способы доставки: самовывоз в Новосибирске, курьер по городу, СДЭК и Почта России. Сроки, стоимость и условия возврата.",
      },
      { property: "og:title", content: "Доставка - Жемчужина Алтая" },
      {
        property: "og:description",
        content: "Самовывоз, курьер по Новосибирску и доставка по России.",
      },
    ],
  }),
  component: DeliveryPage,
});

const formatPrice = (v: number) => `${v.toLocaleString("ru-RU")} ₽`;

// Шаги оформления (ТЗ 6.9) — соответствуют реальному чекауту витрины
const ORDER_STEPS = [
  {
    title: "Соберите корзину",
    text: "Выберите товары в каталоге; весовые продукты добавляются порциями по 100 г.",
  },
  {
    title: "Оформите заказ",
    text: "Укажите контакты, способ получения и оплаты — доставку посчитаем сразу, до оплаты.",
  },
  {
    title: "Подтверждение",
    text: "После оформления откроется страница заказа с номером, составом и статусом.",
  },
  {
    title: "Получение",
    text: "Заберите заказ в магазине или дождитесь курьера; по России отправим СДЭК или Почтой.",
  },
];

// Способы оплаты (ТЗ 6.9): МИР, СБП, наличные/карта при получении
const PAY_METHODS = [
  "Карта МИР онлайн",
  "СБП (оплата по QR)",
  "Наличными при получении",
  "Картой при получении",
];
const formatWeight = (g: number) =>
  g % 1000 === 0 ? `${g / 1000} кг` : `${(g / 1000).toLocaleString("ru-RU")} кг`;

// Фолбэки на случай недоступного бэкенда; рабочие цифры приходят из админки
const FALLBACK_DELIVERY = {
  courierNskPriceRub: 300,
  freeDeliveryThresholdRub: 3000,
  russiaWeightTiers: [] as Array<{ weightUpToG: number; priceRub: number }>,
  termsText: null as string | null,
};

function DeliveryPage() {
  const settings = useSettings();
  const delivery = settings?.delivery ?? FALLBACK_DELIVERY;
  const courierRub = delivery.courierNskPriceRub ?? 300;
  const freeFromRub = delivery.freeDeliveryThresholdRub;

  const methods = [
    {
      icon: Store,
      title: "Самовывоз",
      badge: "Бесплатно",
      text: "Заберите заказ в одном из двух магазинов в Новосибирске. Резерв на 48 часов после подтверждения. Без предоплаты.",
    },
    {
      icon: MapPin,
      title: "Курьером по Новосибирску",
      badge: `${formatPrice(courierRub)}`,
      text: "Доставим в день заказа при оформлении до 14:00 или на следующий день. Подходит для скоропортящихся товаров - сыров и охлаждённых продуктов.",
    },
    {
      icon: Truck,
      title: "Доставка по России",
      badge: "СДЭК / Почта",
      text: "Отправляем СДЭК или Почтой России в день оплаты. Только товары длительного хранения: мёд, чаи, бальзамы, косметика, пантовая продукция.",
    },
  ];

  // Тарифная таблица. Публичные цифры СДЭК по весу НЕ показываем (правка ПМ:
  // тарифы перевозчика меняются) — точная стоимость по-прежнему считается
  // бэкендом по сетке из админки и показывается в сводке чекаута до оплаты.
  const rates: Array<{ label: string; note: string; price: string }> = [
    { label: "Новосибирск, самовывоз", note: "в день заказа", price: "Бесплатно" },
    {
      label: "Новосибирск, курьер",
      note: "1-2 дня",
      price: freeFromRub
        ? `${formatPrice(courierRub)}, от ${formatPrice(freeFromRub)} - бесплатно`
        : formatPrice(courierRub),
    },
    {
      label: "По России",
      note: "СДЭК / Почта России, 3-10 дней",
      price: "по весу заказа — покажем при оформлении",
    },
  ];
  return (
    <div style={{ backgroundColor: "var(--color-bg-cream)", minHeight: "100vh" }}>
      <Header />
      <PageHero
        eyebrow="Сервис"
        title="Доставка и оплата"
        subtitle="Привезём напрямую от алтайских хозяйств до вашей двери: курьером по Новосибирску или транспортной компанией по всей России."
        bgColor="#2a1f0f"
        accent="var(--color-accent)"
      />

      <main>
        {/* Methods */}
        <Section>
          <SectionEyebrow>Как доставляем</SectionEyebrow>
          <SectionTitle>Способы доставки</SectionTitle>
          <div className="mt-10 grid gap-5 md:grid-cols-3">
            {methods.map((m, i) => (
              <motion.article
                key={m.title}
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
                  display: "flex",
                  flexDirection: "column",
                  gap: 14,
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <div
                    className="inline-flex items-center justify-center rounded-2xl"
                    style={{
                      width: 52,
                      height: 52,
                      backgroundColor: "rgba(232,180,79,0.18)",
                      color: "var(--color-accent-dark)",
                    }}
                  >
                    <m.icon size={24} />
                  </div>
                  <span
                    style={{
                      fontFamily: "var(--font-body)",
                      fontSize: 11,
                      fontWeight: 700,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      padding: "5px 10px",
                      borderRadius: 999,
                      backgroundColor: "rgba(59,110,74,0.12)",
                      color: "#3b6e4a",
                    }}
                  >
                    {m.badge}
                  </span>
                </div>
                <h3
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 22,
                    fontWeight: 600,
                    color: "var(--color-bg-dark)",
                    lineHeight: 1.15,
                  }}
                >
                  {m.title}
                </h3>
                <p
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: 14.5,
                    lineHeight: 1.55,
                    color: "var(--color-text-muted)",
                  }}
                >
                  {m.text}
                </p>
              </motion.article>
            ))}
          </div>
        </Section>

        {/* Rates */}
        <Section variant="muted">
          <SectionEyebrow>Стоимость и сроки</SectionEyebrow>
          <SectionTitle>Тарифы по регионам</SectionTitle>
          <p
            className="mt-3 max-w-2xl"
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 15,
              color: "var(--color-text-muted)",
              lineHeight: 1.55,
            }}
          >
            {delivery.termsText ??
              `Финальная стоимость зависит от веса заказа и считается автоматически при оформлении.${
                freeFromRub
                  ? ` Бесплатная доставка по Новосибирску при заказе от ${formatPrice(freeFromRub)}.`
                  : ""
              }`}
          </p>

          <div
            className="mt-8 overflow-hidden"
            style={{
              backgroundColor: "#fffdf7",
              border: "1px solid rgba(31,26,14,0.06)",
              borderRadius: 20,
              boxShadow: "var(--shadow-card)",
            }}
          >
            <table className="w-full text-left" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ backgroundColor: "rgba(31,26,14,0.04)" }}>
                  <Th>Способ / вес</Th>
                  <Th>Срок</Th>
                  <Th align="right">Стоимость</Th>
                </tr>
              </thead>
              <tbody>
                {rates.map((r, i) => (
                  <tr
                    key={r.label}
                    style={{
                      borderTop: i === 0 ? "none" : "1px solid rgba(31,26,14,0.06)",
                    }}
                  >
                    <Td bold>{r.label}</Td>
                    <Td muted>{r.note}</Td>
                    <Td align="right" accent>
                      {r.price}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        {/* Как заказать + способы оплаты (ТЗ 6.9) */}
        <Section>
          <SectionEyebrow>Просто и по шагам</SectionEyebrow>
          <SectionTitle>Как заказать</SectionTitle>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {ORDER_STEPS.map((s, i) => (
              <div
                key={s.title}
                style={{
                  backgroundColor: "#fffdf7",
                  border: "1px solid rgba(31,26,14,0.06)",
                  borderRadius: 20,
                  padding: 24,
                  boxShadow: "var(--shadow-card)",
                }}
              >
                <span
                  className="inline-flex items-center justify-center rounded-full"
                  style={{
                    width: 40,
                    height: 40,
                    backgroundColor: "rgba(232,180,79,0.18)",
                    color: "var(--color-accent-dark)",
                    fontFamily: "var(--font-display)",
                    fontSize: 18,
                    fontWeight: 600,
                  }}
                >
                  {i + 1}
                </span>
                <h3
                  className="mt-4"
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 19,
                    fontWeight: 600,
                    color: "var(--color-bg-dark)",
                    lineHeight: 1.2,
                  }}
                >
                  {s.title}
                </h3>
                <p
                  className="mt-2"
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: 14,
                    lineHeight: 1.55,
                    color: "var(--color-text-muted)",
                  }}
                >
                  {s.text}
                </p>
              </div>
            ))}
          </div>

          <div id="payment" style={{ scrollMarginTop: 96 }} className="mt-12">
            <SectionEyebrow>Оплата</SectionEyebrow>
            <SectionTitle>Способы оплаты</SectionTitle>
            <div className="mt-6 flex flex-wrap gap-3">
              {PAY_METHODS.map((m) => (
                <span
                  key={m}
                  className="inline-flex items-center gap-2 rounded-full"
                  style={{
                    backgroundColor: "#fffdf7",
                    border: "1px solid rgba(31,26,14,0.1)",
                    fontFamily: "var(--font-body)",
                    fontSize: 14,
                    fontWeight: 600,
                    color: "var(--color-text)",
                    padding: "11px 18px",
                  }}
                >
                  <CreditCard size={16} style={{ color: "var(--color-accent-dark)" }} />
                  {m}
                </span>
              ))}
            </div>
            <p
              className="mt-4 max-w-2xl"
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 14,
                lineHeight: 1.55,
                color: "var(--color-text-muted)",
              }}
            >
              Онлайн-оплата проходит на защищённой платёжной странице; чек приходит на e-mail или
              телефон. Оплата наличными и картой при получении доступна для самовывоза.
            </p>
          </div>
        </Section>

        {/* Perishable + return */}
        <Section variant="muted">
          <div className="grid gap-5 md:grid-cols-2">
            <InfoCard
              tone="warning"
              icon={<AlertTriangle size={22} />}
              title="Скоропортящиеся товары"
            >
              <p>
                Сыры, охлаждённые мясные деликатесы и другие скоропортящиеся позиции доставляются
                только по Новосибирску - курьером в охлаждённой упаковке.
              </p>
              <p>
                Отправка такими товарами в другие регионы невозможна: при оформлении заказа варианты
                доставки по России для них будут недоступны.
              </p>
            </InfoCard>
            <InfoCard
              id="returns"
              tone="default"
              icon={<RotateCcw size={22} />}
              title="Возврат и обмен"
            >
              <p>
                Если товар не подошёл - сообщите нам в течение 7 дней после получения. Заменим или
                вернём деньги тем же способом, которым была произведена оплата.
              </p>
              <p>
                Продовольственные товары надлежащего качества возврату не подлежат - такие правила
                Роспотребнадзора.
              </p>
            </InfoCard>
          </div>

          <div className="mt-12 flex flex-wrap items-center justify-center gap-3 text-center">
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
            <Link
              to="/about"
              className="inline-flex items-center gap-2 rounded-full"
              style={{
                border: "1px solid rgba(31,26,14,0.18)",
                color: "var(--color-text)",
                fontFamily: "var(--font-body)",
                fontWeight: 600,
                fontSize: 14,
                padding: "14px 28px",
                textDecoration: "none",
              }}
            >
              О компании
            </Link>
          </div>
        </Section>
      </main>

      <Footer />
    </div>
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
        backgroundColor: variant === "muted" ? "#f3ece0" : "var(--color-bg-cream)",
        padding: "72px 0",
      }}
    >
      <div className="mx-auto max-w-6xl px-4 md:px-8">{children}</div>
    </section>
  );
}

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
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
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      className="mt-2 text-3xl md:text-4xl"
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

function Th({ children, align }: { children: React.ReactNode; align?: "right" }) {
  return (
    <th
      style={{
        textAlign: align ?? "left",
        fontFamily: "var(--font-body)",
        fontSize: 12,
        fontWeight: 700,
        letterSpacing: "0.1em",
        textTransform: "uppercase",
        color: "var(--color-text-muted)",
        padding: "16px 20px",
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align,
  bold,
  muted,
  accent,
}: {
  children: React.ReactNode;
  align?: "right";
  bold?: boolean;
  muted?: boolean;
  accent?: boolean;
}) {
  return (
    <td
      style={{
        textAlign: align ?? "left",
        fontFamily: "var(--font-body)",
        fontSize: 15,
        fontWeight: bold || accent ? 600 : 500,
        color: accent
          ? "var(--color-accent-dark)"
          : muted
            ? "var(--color-text-muted)"
            : "var(--color-text)",
        padding: "16px 20px",
      }}
    >
      {children}
    </td>
  );
}

function InfoCard({
  tone,
  icon,
  title,
  children,
  id,
}: {
  tone: "default" | "warning";
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
  id?: string;
}) {
  const isWarn = tone === "warning";
  return (
    <article
      id={id}
      style={{
        scrollMarginTop: 96,
        backgroundColor: isWarn ? "rgba(232,180,79,0.14)" : "#fffdf7",
        border: `1px solid ${isWarn ? "rgba(232,180,79,0.45)" : "rgba(31,26,14,0.06)"}`,
        borderRadius: 20,
        padding: 28,
        boxShadow: isWarn ? "none" : "var(--shadow-card)",
      }}
    >
      <div className="flex items-center gap-3">
        <span
          className="inline-flex items-center justify-center rounded-2xl"
          style={{
            width: 48,
            height: 48,
            backgroundColor: isWarn ? "rgba(232,180,79,0.35)" : "rgba(59,110,74,0.12)",
            color: isWarn ? "var(--color-accent-dark)" : "#3b6e4a",
          }}
        >
          {icon}
        </span>
        <h3
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 22,
            fontWeight: 600,
            color: "var(--color-bg-dark)",
            lineHeight: 1.15,
          }}
        >
          {title}
        </h3>
      </div>
      <div
        className="mt-4 flex flex-col gap-3"
        style={{
          fontFamily: "var(--font-body)",
          fontSize: 15,
          lineHeight: 1.6,
          color: "var(--color-text-muted)",
        }}
      >
        {children}
      </div>
    </article>
  );
}
