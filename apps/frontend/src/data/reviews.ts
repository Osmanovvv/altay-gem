/**
 * Тип отзыва витрины. Данные приходят из API (/api/v1/reviews,
 * см. src/lib/api.ts: toReviews) — моки удалены при ревизии этапа 1.
 */
export interface Review {
  id: string;
  name: string;
  date: string;
  text: string;
  source: "Яндекс" | "2ГИС";
  rating: number;
}
