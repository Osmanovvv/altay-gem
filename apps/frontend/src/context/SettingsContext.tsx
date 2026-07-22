import { createContext, useContext, type ReactNode } from "react";
import type { ApiCategory, ApiSettings } from "@/lib/api";

/**
 * Публичные настройки сайта из админки (ТЗ 6.1, 7.2): контакты, точки,
 * соцсети, тарифы; плюс дерево категорий для подвала. Загружаются один раз
 * в корневом роуте; null/[] — если бэкенд недоступен (компоненты используют
 * фолбэки).
 */
const SettingsContext = createContext<ApiSettings | null>(null);
const CategoriesContext = createContext<ApiCategory[]>([]);

export function SettingsProvider({
  value,
  categories = [],
  children,
}: {
  value: ApiSettings | null;
  categories?: ApiCategory[];
  children: ReactNode;
}) {
  return (
    <SettingsContext.Provider value={value}>
      <CategoriesContext.Provider value={categories}>{children}</CategoriesContext.Provider>
    </SettingsContext.Provider>
  );
}

export function useSettings(): ApiSettings | null {
  return useContext(SettingsContext);
}

/** Категории каталога для глобальных элементов (подвал — ТЗ 6.1). */
export function useCategories(): ApiCategory[] {
  return useContext(CategoriesContext);
}
