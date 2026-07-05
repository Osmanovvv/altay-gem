import { motion } from "framer-motion";
import { ArrowRight, BadgeCheck, Flower2, Hexagon, Leaf } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { HOME_ASSETS } from "@/data/homeAssets";

const TEASER_FACTS = [
  { icon: Hexagon, label: "Собственная пасека в предгорьях Алтая" },
  { icon: Flower2, label: "Мёд с разнотравья, липы, гречихи и донника" },
  { icon: Leaf, label: "Перга, прополис, воск и травяные сборы" },
];

export function AboutHoneyTeaser() {
  return (
    <section
      aria-labelledby="about-honey-title"
      style={{ backgroundColor: "var(--color-bg-cream)", padding: "88px 0 72px" }}
    >
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-10 px-4 md:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
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
            О нас
          </span>
          <h2
            id="about-honey-title"
            className="mt-3 text-4xl md:text-5xl"
            style={{
              fontFamily: "var(--font-display)",
              fontWeight: 600,
              color: "var(--color-accent)",
              lineHeight: 1.05,
            }}
          >
            Своя пасека, свой мёд и продукты пчеловодства
          </h2>
          <p
            className="mt-5"
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 17,
              lineHeight: 1.65,
              color: "var(--color-text)",
              maxWidth: 620,
            }}
          >
            Мы работаем не только как магазин: часть мёда и пчелопродуктов
            привозим с собственной пасеки. Поэтому знаем сезон, место сбора и
            вкус каждой партии, а покупателям можем честно подсказать сорт под
            чай, подарок или домашнюю аптечку.
          </p>

          <div className="mt-8 grid gap-4">
            {TEASER_FACTS.map((fact, index) => {
              const Icon = fact.icon;
              return (
                <motion.div
                  key={fact.label}
                  initial={{ opacity: 0, x: -12 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ duration: 0.4, delay: index * 0.08 }}
                  className="flex items-start gap-3"
                >
                  <span
                    className="mt-0.5 inline-flex shrink-0 items-center justify-center rounded-full"
                    style={{
                      width: 34,
                      height: 34,
                      backgroundColor: "rgba(200,150,62,0.14)",
                      color: "var(--color-accent-dark)",
                    }}
                  >
                    <Icon size={18} strokeWidth={1.8} />
                  </span>
                  <span
                    style={{
                      fontFamily: "var(--font-body)",
                      fontSize: 15,
                      lineHeight: 1.55,
                      color: "var(--color-text)",
                    }}
                  >
                    {fact.label}
                  </span>
                </motion.div>
              );
            })}
          </div>

          <Link
            to="/catalog"
            className="mt-9 inline-flex items-center gap-2 rounded-full transition-colors"
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
            Смотреть каталог
            <ArrowRight size={17} />
          </Link>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.65 }}
          className="relative overflow-hidden"
          style={{
            minHeight: 420,
            borderRadius: 18,
            boxShadow: "var(--shadow-card)",
          }}
        >
          <img
            src={HOME_ASSETS.apiaryFrame.src}
            alt={HOME_ASSETS.apiaryFrame.alt}
            width={1200}
            height={800}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <div
            aria-hidden
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(180deg, rgba(15,30,24,0.08), rgba(15,30,24,0.48))",
            }}
          />
          <div
            className="absolute bottom-5 left-5 right-5 flex items-center gap-3 rounded-2xl p-4"
            style={{
              backgroundColor: "rgba(255,253,247,0.92)",
              backdropFilter: "blur(8px)",
              color: "var(--color-text)",
            }}
          >
            <BadgeCheck size={22} style={{ color: "var(--color-accent-dark)", flexShrink: 0 }} />
            <p
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 14,
                lineHeight: 1.45,
                margin: 0,
              }}
            >
              Отбираем партии вручную и храним мёд в условиях, где он сохраняет
              аромат, плотность и природную пользу.
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

export default AboutHoneyTeaser;
