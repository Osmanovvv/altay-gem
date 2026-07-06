/**
 * Тип акции витрины. Данные приходят из API (/api/v1/promos,
 * см. src/lib/api.ts: toPromo -> FrontPromo) — моки удалены на шаге 9.
 */
import type { LucideIcon } from "lucide-react";

export interface Promo {
  id: string;
  title: string;
  description: string;
  ctaText: string;
  ctaLink: string;
  bgColor: string;
  accentColor: string;
  icon: LucideIcon;
  image: string;
  imageAlt: string;
  badge?: string;
  /** Абзацы подробного описания на странице акции. */
  details?: string[];
  /** Список условий (буллеты). */
  terms?: string[];
  /** Промокод, показанный на странице акции. */
  promoCode?: string;
  /** Процент скидки по промокоду (информационно). */
  discountPercent?: number;
  /** Слаг связанной категории каталога. */
  categoryFilter?: string;
  /** Слаги товаров-участников акции. */
  productIds?: string[];
  /** Срок действия, например «до 30 июня 2026». */
  validUntil?: string;
}
