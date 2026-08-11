import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, useState, type ComponentType, type ReactNode } from "react";

// CSS подключается ссылкой, а НЕ встраивается в HTML. Встраивание (?inline)
// пробовали 11.08.2026, чтобы убрать 430 мс ожидания таблицы стилей, — стало
// хуже: __root.tsx исполняется и на клиенте, поэтому те же 90 КБ текста Vite
// положил ЕЩЁ И в стартовый js-бандл (93,7 → 109,3 КБ сжато). Экономия одного
// запроса не окупает лишние 15 КБ кода, который браузер должен разобрать до
// гидрации. Вернуть встраивание можно только через серверный модуль.
import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { CartProvider } from "@/context/CartContext";
import { SettingsProvider } from "@/context/SettingsContext";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { fetchCategories, fetchSettings, type ApiCategory, type ApiSettings } from "@/lib/api";

/**
 * Всплывающие уведомления (sonner) грузятся ПОСЛЕ гидрации, а не вместе с
 * витриной. Контейнер до первого уведомления не рисует ничего, но библиотека
 * (~12 КБ сжато) лежала в стартовом бандле и удлиняла гидрацию — а на LCP
 * главной сейчас влияет именно она: первый экран проявляется, когда отработал
 * JS. Уведомления возникают только по действию покупателя (оформление заказа,
 * копирование промокода) — к этому моменту контейнер давно смонтирован.
 */
function DeferredToaster() {
  const [Toaster, setToaster] = useState<ComponentType<Record<string, unknown>> | null>(null);
  useEffect(() => {
    let alive = true;
    void import("sonner").then((m) => {
      if (alive) setToaster(() => m.Toaster as ComponentType<Record<string, unknown>>);
    });
    return () => {
      alive = false;
    };
  }, []);
  if (!Toaster) return null;
  return <Toaster position="top-center" richColors closeButton />;
}

function NotFoundComponent() {
  // Глобальные шапка и подвал обязательны на ВСЕХ страницах, включая 404
  // (ТЗ:104). notFound рендерится внутри RootComponent → провайдеры доступны.
  return (
    <>
      <Header />
      <main
        className="flex items-center justify-center px-4"
        style={{ background: "var(--color-bg-cream)", minHeight: "70vh", paddingTop: 96 }}
      >
        <div className="max-w-md py-16 text-center">
          <h1
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 72,
              fontWeight: 600,
              color: "var(--color-accent-dark)",
              lineHeight: 1,
            }}
          >
            404
          </h1>
          <h2 className="mt-4 text-xl font-semibold" style={{ color: "var(--color-text)" }}>
            Страница не найдена
          </h2>
          <p className="mt-2 text-sm" style={{ color: "var(--color-text-muted)" }}>
            Такой страницы нет или она была перемещена.
          </p>
          <div className="mt-6">
            <Link
              to="/"
              className="inline-flex items-center justify-center rounded-full px-6 py-3 text-sm font-semibold transition-transform hover:-translate-y-0.5"
              style={{ backgroundColor: "var(--color-accent)", color: "var(--color-bg-dark)" }}
            >
              На главную
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Страница не загрузилась
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Что-то пошло не так на нашей стороне. Попробуйте обновить страницу или вернуться на
          главную.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Попробовать ещё раз
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            На главную
          </a>
        </div>
      </div>
    </div>
  );
}

// Контекст роутера пуст: react-query из проекта убран (см. router.tsx).
export const Route = createRootRouteWithContext<object>()({
  // Настройки сайта (контакты, точки, подвал) и категории (ссылки подвала) —
  // из админки (ТЗ 6.1); бэкенд недоступен -> null/[], компоненты — фолбэки.
  loader: async (): Promise<{
    settings: ApiSettings | null;
    categories: ApiCategory[];
  }> => {
    const [settings, categories] = await Promise.all([
      fetchSettings().catch(() => null),
      fetchCategories().catch(() => [] as ApiCategory[]),
    ]);
    return { settings, categories };
  },
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Жемчужина Алтая - Натуральные продукты с Алтая" },
      {
        name: "description",
        content:
          "Натуральный мед, деликатесы из марала, травяные чаи и косметика. Два магазина в Новосибирске, доставка по России.",
      },
      { property: "og:title", content: "Жемчужина Алтая - Натуральные продукты с Алтая" },
      {
        property: "og:description",
        content:
          "Натуральный мед, деликатесы из марала, травяные чаи и косметика. Два магазина в Новосибирске, доставка по России.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Жемчужина Алтая - Натуральные продукты с Алтая" },
      {
        name: "twitter:description",
        content:
          "Натуральный мед, деликатесы из марала, травяные чаи и косметика. Два магазина в Новосибирске, доставка по России.",
      },
      // Абсолютный URL обязателен для OG-скрейперов; боевой домен заказчика.
      {
        property: "og:image",
        content: "https://ecomarket-altai.ru/img/stock/u-1464822759023-fed622ff2c3b.jpg",
      },
      {
        name: "twitter:image",
        content: "https://ecomarket-altai.ru/img/stock/u-1464822759023-fed622ff2c3b.jpg",
      },
    ],
    links: [
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "stylesheet", href: appCss },
      // Шрифты НЕ предзагружаем. Пробовали 11.08.2026 (три кириллических
      // начертания первого экрана) — на замере стало хуже: страница упирается
      // не в цепочку запросов, а в ширину канала (мобильный профиль PageSpeed
      // — медленный 4G), и 43 КБ шрифтов с высоким приоритетом отбирали его у
      // css и js, отодвигая первую отрисовку и гидрацию. У @fontsource стоит
      // font-display: swap, поэтому текст рисуется сразу запасным шрифтом и
      // ждать эти файлы всё равно не нужно.
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { settings, categories } = Route.useLoaderData();

  return (
    <SettingsProvider value={settings} categories={categories}>
      <CartProvider>
        {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
        <Outlet />
        <DeferredToaster />
      </CartProvider>
    </SettingsProvider>
  );
}
