/**
 * Типы товара витрины. Данные приходят из API (/api/v1, см. src/lib/api.ts) —
 * статические моки удалены при переводе витрины на бэкенд (этап 1, шаг 7).
 */

/** Бейджи приходят с сервера готовыми строками: «Хит», «Новинка», «-N%». */
export type Badge = string;

export interface Product {
  id: string; // slug товара (публичный идентификатор, URL карточки)
  name: string;
  category: string; // slug категории
  categoryName: string; // отображаемое имя категории (корзина, карточки)
  subcategory: string;
  price: number; // руб.; для весовых — цена за порцию
  oldPrice: number | null;
  unit: string; // «шт» | «порция 100 г»
  inStock: boolean;
  isPerishable: boolean;
  badges: Badge[];
  image: string; // CSS background: фото поверх градиента либо градиент
  shortDescription: string;
}
