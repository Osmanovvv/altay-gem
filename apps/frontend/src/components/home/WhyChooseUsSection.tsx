import { motion } from "framer-motion";
import { MapPinned, PackageCheck, ShieldCheck, Truck } from "lucide-react";

const REASONS = [
  {
    icon: ShieldCheck,
    title: "Проверенное происхождение",
    text: "Работаем с понятными хозяйствами и не смешиваем партии без контроля качества.",
  },
  {
    icon: PackageCheck,
    title: "Собираем под задачу",
    text: "Подскажем мёд к чаю, набор для партнёров или продукты для ежедневного рациона.",
  },
  {
    icon: MapPinned,
    title: "Два магазина",
    text: "Можно прийти, попробовать, сравнить сорта и забрать заказ в удобной части города.",
  },
  {
    icon: Truck,
    title: "Доставка по России",
    text: "Упаковываем стекло, сыры и наборы так, чтобы они спокойно доехали до получателя.",
  },
];

export function WhyChooseUsSection() {
  return (
    <section
      aria-labelledby="why-title"
      style={{ backgroundColor: "#fffdf7", padding: "80px 0" }}
    >
      <div className="mx-auto max-w-7xl px-4 md:px-8">
        <div className="mb-10 max-w-2xl">
          <span
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 13,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              color: "var(--color-accent-dark)",
            }}
          >
            Почему выбирают нас
          </span>
          <h2
            id="why-title"
            className="mt-3 text-4xl md:text-5xl"
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 600,
              color: "var(--color-accent)",
              lineHeight: 1.05,
            }}
          >
            Натуральные продукты без случайного выбора
          </h2>
        </div>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-4">
          {REASONS.map((reason, index) => {
            const Icon = reason.icon;
            return (
              <motion.article
                key={reason.title}
                initial={{ opacity: 0, y: 18 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-70px" }}
                transition={{ duration: 0.45, delay: index * 0.06 }}
                className="h-full rounded-2xl border p-6"
                style={{
                  borderColor: "rgba(200,150,62,0.18)",
                  backgroundColor: "var(--color-bg-cream)",
                }}
              >
                <div
                  className="flex items-center justify-center rounded-full"
                  style={{
                    width: 50,
                    height: 50,
                    backgroundColor: "rgba(200,150,62,0.14)",
                    color: "var(--color-accent-dark)",
                  }}
                >
                  <Icon size={24} strokeWidth={1.75} />
                </div>
                <h3
                  className="mt-5"
                  style={{
                    fontFamily: "var(--font-body)",
                    fontWeight: 600,
                    fontSize: 18,
                    lineHeight: 1.25,
                    color: "var(--color-text)",
                  }}
                >
                  {reason.title}
                </h3>
                <p
                  className="mt-3"
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: 14,
                    lineHeight: 1.55,
                    color: "var(--color-text-muted)",
                  }}
                >
                  {reason.text}
                </p>
              </motion.article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export default WhyChooseUsSection;
