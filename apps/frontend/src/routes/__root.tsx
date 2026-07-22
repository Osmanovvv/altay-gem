import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { CartProvider } from "@/context/CartContext";
import { SettingsProvider } from "@/context/SettingsContext";
import { fetchCategories, fetchSettings, type ApiCategory, type ApiSettings } from "@/lib/api";
import { Toaster } from "sonner";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Страница не найдена</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Такой страницы нет или она была перемещена.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            На главную
          </Link>
        </div>
      </div>
    </div>
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

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
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
  const { queryClient } = Route.useRouteContext();
  const { settings, categories } = Route.useLoaderData();

  return (
    <QueryClientProvider client={queryClient}>
      <SettingsProvider value={settings} categories={categories}>
        <CartProvider>
          {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
          <Outlet />
          <Toaster position="top-center" richColors closeButton />
        </CartProvider>
      </SettingsProvider>
    </QueryClientProvider>
  );
}
