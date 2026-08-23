/**
 * Правила мини-приложения MAX (ТЗ р.13).
 *
 * Мини-апп — «второй канал продаж на том же бэкенде и API»: каталог, остатки,
 * цены, акции и промокоды берутся оттуда же, что и на сайте. Отличий от
 * веб-витрины ровно три, и они собраны здесь:
 *   1) навигация нижней панелью вкладок,
 *   2) выделение приоритетных категорий на витрине (на сайте не применяется),
 *   3) пометка источника заказа, чтобы владелец видел, откуда пришёл заказ.
 */
import type { ApiCategory } from "./api";

export interface MaxTab {
  /** Подпись на панели. Порядок вкладок задан ТЗ. */
  label: string;
  to: string;
  /** Точное совпадение пути (для витрины, иначе она «активна» везде). */
  exact?: boolean;
  /** Показывать ли на вкладке счётчик товаров в корзине. */
  showsCartCount?: boolean;
}

export const MAX_TABS: MaxTab[] = [
  { label: "Витрина", to: "/max", exact: true },
  { label: "Каталог", to: "/max/catalog" },
  { label: "Корзина", to: "/max/cart", showsCartCount: true },
  { label: "Заказ", to: "/max/order" },
];

/** Категория с признаком приоритета: бэкенд его отдаёт, сайт игнорирует. */
export type MaxCategory = ApiCategory & { priorityInMax?: boolean };

/**
 * Порядок категорий на витрине мини-аппа: сначала отмеченные флагом
 * «Приоритет в MAX», затем остальные; внутри групп — порядок из админки.
 * Не мутирует вход: этот же массив рендерит каталог.
 */
export function highlightCategories<T extends MaxCategory>(categories: readonly T[]): T[] {
  const bySort = (a: T, b: T) => a.sortOrder - b.sortOrder;
  const priority = categories.filter((c) => c.priorityInMax === true).slice().sort(bySort);
  const rest = categories.filter((c) => c.priorityInMax !== true).slice().sort(bySort);
  return [...priority, ...rest];
}

/**
 * Заголовки заказа из мини-аппа. Бэкенд читает X-Source и пишет источник в
 * заказ (orders.controller.ts), поэтому в админке видно, что заказ из MAX.
 */
export function maxOrderHeaders(): Record<string, string> {
  return { "X-Source": "max" };
}

/** Страница относится к мини-аппу (нужно, чтобы панель вкладок не попала на сайт). */
export function isMaxPath(pathname: string): boolean {
  return pathname === "/max" || pathname.startsWith("/max/");
}
