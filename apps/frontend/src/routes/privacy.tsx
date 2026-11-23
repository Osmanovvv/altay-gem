import { createFileRoute } from "@tanstack/react-router";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { PageHero } from "@/components/info/PageHero";
import { PrivacyPolicyContent } from "@/components/PrivacyPolicyContent";

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
          <PrivacyPolicyContent />
        </section>
      </main>
      <Footer />
    </>
  );
}
