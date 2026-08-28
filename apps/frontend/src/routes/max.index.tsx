import { createFileRoute } from "@tanstack/react-router";

import { AboutHoneyTeaser } from "@/components/home/AboutHoneyTeaser";
import { AboutStorySection } from "@/components/home/AboutStorySection";
import { BestsellersCarousel } from "@/components/home/BestsellersCarousel";
import { CategoriesGrid } from "@/components/home/CategoriesGrid";
import { FindUsSection } from "@/components/home/FindUsSection";
import { HeroSection } from "@/components/home/HeroSection";
import { PromoBanner } from "@/components/home/PromoBanner";
import { WhyChooseUsSection } from "@/components/home/WhyChooseUsSection";
import { fetchCategories, fetchHome, toCategory, toProduct } from "@/lib/api";
import { highlightCategories } from "@/lib/max-app";

/**
 * Витрина мини-аппа (ТЗ р.13).
 *
 * Экран собран ИЗ ТЕХ ЖЕ секций, что и главная сайта, и в том же порядке —
 * покупатель должен видеть один и тот же магазин, а не его облегчённую копию.
 * Отличается только обёртка: вместо шапки и подвала сайта — нижняя панель
 * вкладок (см. max.tsx), потому что сверху уже интерфейс мессенджера.
 *
 * Ссылки внутри секций ведут в /max: канал объявлен в оболочке через
 * ChannelProvider, секции читают его сами (lib/channel-routes.ts).
 *
 * Про «Приоритет в MAX»: ТЗ р.13 разрешает выделять приоритетные категории
 * («допускается»), но раз вёрстка теперь общая с сайтом, отдельного блока для
 * них нет — флаг работает как ПОРЯДОК: приоритетные идут первыми в той же
 * сетке. Так настройка в админке продолжает влиять на витрину.
 */
export const Route = createFileRoute("/max/")({
  loader: async () => {
    const [home, categories] = await Promise.all([fetchHome(), fetchCategories()]);
    return { home, categories: highlightCategories(categories).map(toCategory) };
  },
  component: MaxHome,
});

function MaxHome() {
  const { home, categories } = Route.useLoaderData();
  return (
    <>
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
    </>
  );
}
