import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

/**
 * Контекст роутера пуст намеренно. Раньше здесь создавался QueryClient и весь
 * сайт оборачивался в QueryClientProvider — при том, что ни одного useQuery в
 * проекте нет: данные приходят через loader'ы TanStack Router. Библиотека
 * тянулась в стартовый бандл (~10 КБ сжато) и удлиняла гидрацию, ничего не
 * делая. Убрана 11.08.2026. Если когда-нибудь понадобится react-query —
 * вернуть сюда client и в провайдер в __root.tsx.
 */
export const getRouter = () => {
  const router = createRouter({
    routeTree,
    context: {},
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
