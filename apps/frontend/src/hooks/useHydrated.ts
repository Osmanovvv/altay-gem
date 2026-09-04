import { useEffect, useState } from "react";

/**
 * false на сервере и на первом клиентском рендере, true — после гидратации.
 *
 * Нужен, чтобы въездные анимации не гасили SSR-разметку: см. lib/entrance.ts,
 * где описано, почему сервер отдавал каталог невидимым. Значение обязано
 * совпадать на сервере и в первом рендере клиента, иначе React ругается на
 * расхождение разметки — поэтому именно useState(false) + useEffect, а не
 * проверка typeof window прямо в теле компонента.
 */
export function useHydrated(): boolean {
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);
  return hydrated;
}
