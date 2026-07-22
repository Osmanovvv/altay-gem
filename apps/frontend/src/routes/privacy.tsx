import { createFileRoute } from "@tanstack/react-router";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { PageHero } from "@/components/info/PageHero";
import { useSettings } from "@/context/SettingsContext";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Политика конфиденциальности — Жемчужина Алтая" },
      {
        name: "description",
        content:
          "Политика обработки персональных данных интернет-магазина «Жемчужина Алтая» (152-ФЗ).",
      },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  const settings = useSettings();
  const text = settings?.privacyPolicy?.trim();
  const phone = settings?.contacts?.phone?.trim();
  const email = settings?.contacts?.email?.trim();
  return (
    <>
      <Header />
      <main style={{ background: "var(--color-bg-cream)" }}>
        <PageHero
          eyebrow="Правовая информация"
          title="Политика конфиденциальности"
          subtitle="Обработка персональных данных в соответствии с 152-ФЗ."
        />
        <section className="mx-auto w-full max-w-3xl px-4 py-14 md:px-8 md:py-20">
          {text ? (
            <div
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 16,
                lineHeight: 1.7,
                color: "var(--color-text)",
                whiteSpace: "pre-line",
              }}
            >
              {text}
            </div>
          ) : (
            <div
              className="rounded-2xl"
              style={{
                background: "rgba(31,26,14,0.04)",
                padding: "28px 24px",
                fontFamily: "var(--font-body)",
                fontSize: 16,
                lineHeight: 1.7,
                color: "var(--color-text)",
              }}
            >
              <p>Текст политики обработки персональных данных готовится к публикации.</p>
              {(phone || email) && (
                <p className="mt-3" style={{ color: "var(--color-text-muted)" }}>
                  По вопросам обработки ваших персональных данных свяжитесь с нами:{" "}
                  {phone && (
                    <a
                      href={`tel:${phone.replace(/[^+\d]/g, "")}`}
                      style={{ color: "var(--color-accent-dark)" }}
                    >
                      {phone}
                    </a>
                  )}
                  {phone && email ? " · " : ""}
                  {email && (
                    <a href={`mailto:${email}`} style={{ color: "var(--color-accent-dark)" }}>
                      {email}
                    </a>
                  )}
                </p>
              )}
            </div>
          )}
        </section>
      </main>
      <Footer />
    </>
  );
}
