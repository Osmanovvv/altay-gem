import { createFileRoute } from "@tanstack/react-router";

import { fetchCategories, fetchHome, toCategory, toProduct } from "@/lib/api";

import { Layout } from "@/components/layout/Layout";
import { AboutHoneyTeaser } from "@/components/home/AboutHoneyTeaser";
import { AboutStorySection } from "@/components/home/AboutStorySection";
import { BestsellersCarousel } from "@/components/home/BestsellersCarousel";
import { CategoriesGrid } from "@/components/home/CategoriesGrid";
import { FindUsSection } from "@/components/home/FindUsSection";
import { HeroSection } from "@/components/home/HeroSection";
import { PromoBanner } from "@/components/home/PromoBanner";
import { WhyChooseUsSection } from "@/components/home/WhyChooseUsSection";

export const Route = createFileRoute("/")({
  loader: async () => {
    const [home, categories] = await Promise.all([fetchHome(), fetchCategories()]);
    return { home, categories: categories.map(toCategory) };
  },
  head: () => ({
    meta: [
      { title: "Жемчужина Алтая - натуральная продукция с Алтая" },
      {
        name: "description",
        content:
          "Свой алтайский мёд, продукты пчеловодства, травяные чаи, деликатесы и подарочные наборы. Два магазина в Новосибирске, доставка по России.",
      },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const { home, categories } = Route.useLoaderData();
  return (
    <Layout>
      <HeroSection
        product={home.hero ? toProduct(home.hero) : null}
        photoUrl={home.hero?.photos?.[0] ?? null}
        trust={home.trust}
      />
      <AboutHoneyTeaser section={home.sections.apiary} />
      <WhyChooseUsSection advantages={home.sections.advantages} />
      <CategoriesGrid categories={categories} />
      <AboutStorySection section={home.sections.history} />
      <BestsellersCarousel items={home.hits} />
      <PromoBanner banners={home.banners} />
      <FindUsSection />
    </Layout>
  );
}
