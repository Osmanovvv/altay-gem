import { createFileRoute } from "@tanstack/react-router";

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
  return (
    <Layout>
      <HeroSection />
      <AboutHoneyTeaser />
      <WhyChooseUsSection />
      <CategoriesGrid />
      <AboutStorySection />
      <BestsellersCarousel />
      <PromoBanner />
      <FindUsSection />
    </Layout>
  );
}
