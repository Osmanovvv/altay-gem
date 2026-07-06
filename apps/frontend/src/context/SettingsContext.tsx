import { createContext, useContext, type ReactNode } from "react";
import type { ApiSettings } from "@/lib/api";

/**
 * Публичные настройки сайта из админки (ТЗ 6.1, 7.2): контакты, точки,
 * соцсети, тарифы. Загружаются один раз в корневом роуте; null — если
 * бэкенд недоступен (компоненты используют фолбэки).
 */
const SettingsContext = createContext<ApiSettings | null>(null);

export function SettingsProvider({
  value,
  children,
}: {
  value: ApiSettings | null;
  children: ReactNode;
}) {
  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): ApiSettings | null {
  return useContext(SettingsContext);
}
