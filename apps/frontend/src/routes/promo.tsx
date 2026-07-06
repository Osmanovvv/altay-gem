import { createFileRoute, Link } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";

import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { PageHero } from "@/components/info/PageHero";
import { fetchPromos, promoIcon, toPromo } from "@/lib/api";

export const Route = createFileRoute("/promo")({
  head: () => ({
    meta: [
      { title: "Акции и скидки - Жемчужина Алтая" },
      {
        name: "description",
        content:
          "Актуальные акции магазина Жемчужина Алтая: скидки на мёд, подарочные наборы, бесплатная доставка и новинки сезона.",
      },
      { property: "og:title", content: "Акции и скидки - Жемчужина Алтая" },
      {
        property: "og:description",
        content: "Все актуальные акции и промокоды магазина.",
      },
    ],
  }),
  loader: async () => ({
    promos: (await fetchPromos()).map((p, i) => toPromo(p, i)),
  }),
  component: PromoIndexPage,
});

function PromoIndexPage() {
  const { promos } = Route.useLoaderData();
  return (
    <>
      <Header />
      <main style={{ background: "var(--color-bg-cream)" }}>
        <PageHero
          eyebrow="Выгодно"
          title="Акции и скидки"
          subtitle="Сезонные предложения, промокоды и подарочные наборы. Обновляем каждую неделю - заглядывайте чаще."
          bgColor="#8a5a1a"
          accent="#e8b44f"
        />

        <section className="mx-auto w-full max-w-6xl px-4 py-16 md:px-8 md:py-24">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {promos.map((promo, i) => {
              const Icon = promoIcon(i);
              return (
                <motion.div
                  key={promo.id}
                  initial={{ opacity: 0, y: 24 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-80px" }}
                  transition={{ duration: 0.5, delay: i * 0.06 }}
                  whileHover={{ y: -6 }}
                  className="group relative overflow-hidden rounded-3xl"
                  style={{
                    background: promo.bgColor,
                    color: promo.accentColor,
                    minHeight: 360,
                    boxShadow:
                      "0 10px 30px -12px rgba(20,15,5,0.35)",
                    transition: "box-shadow 0.4s ease",
                  }}
                >
                  <div
                    aria-hidden
                    className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
                    style={{
                      boxShadow:
                        "0 30px 60px -20px rgba(232,180,79,0.55), inset 0 0 0 1px rgba(255,255,255,0.18)",
                    }}
                  />
                  <div className="relative z-10 flex h-full flex-col justify-between p-7 md:p-8">
                    <div className="flex items-start justify-between gap-3">
                      <div
                        className="inline-flex items-center justify-center rounded-2xl"
                        style={{
                          width: 52,
                          height: 52,
                          background: "rgba(255,255,255,0.14)",
                          backdropFilter: "blur(8px)",
                        }}
                      >
                        <Icon size={24} />
                      </div>
                      {promo.badge && (
                        <span
                          className="inline-flex items-center rounded-full px-3 py-1"
                          style={{
                            background: "rgba(0,0,0,0.28)",
                            fontFamily: "var(--font-body)",
                            fontSize: 12,
                            fontWeight: 600,
                            letterSpacing: "0.04em",
                          }}
                        >
                          {promo.badge}
                        </span>
                      )}
                    </div>

                    <div className="mt-10">
                      <h2
                        style={{
                          fontFamily: "var(--font-display)",
                          fontWeight: 500,
                          fontSize: 28,
                          lineHeight: 1.05,
                        }}
                      >
                        {promo.title}
                      </h2>
                      <p
                        className="mt-3"
                        style={{
                          fontFamily: "var(--font-body)",
                          fontSize: 15,
                          lineHeight: 1.55,
                          opacity: 0.9,
                        }}
                      >
                        {promo.description}
                      </p>
                      {promo.validUntil && (
                        <p
                          className="mt-3"
                          style={{
                            fontFamily: "var(--font-body)",
                            fontSize: 12,
                            letterSpacing: "0.14em",
                            textTransform: "uppercase",
                            opacity: 0.75,
                          }}
                        >
                          {promo.validUntil}
                        </p>
                      )}

                      <Link
                        to="/promo/$slug"
                        params={{ slug: promo.id }}
                        className="mt-6 inline-flex items-center gap-2 rounded-full px-5 py-3 transition-transform hover:translate-x-1"
                        style={{
                          background: "rgba(0,0,0,0.32)",
                          color: promo.accentColor,
                          fontFamily: "var(--font-body)",
                          fontSize: 14,
                          fontWeight: 600,
                          textDecoration: "none",
                        }}
                      >
                        Подробнее
                        <ArrowRight size={16} />
                      </Link>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
