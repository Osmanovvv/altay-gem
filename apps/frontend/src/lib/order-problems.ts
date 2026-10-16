/**
 * Разбор отказа в оформлении заказа по позициям (ORDER_VALIDATION: цена в
 * кассе изменилась, товара не хватает, товар снят с продажи).
 *
 * Мини-апп MAX показывал только общий текст «Некоторые позиции корзины
 * изменились» — без названия и новой цены, и покупатель не понимал, что
 * делать (найдено 16.10.2026). Формулировки — те же, что у сайта
 * (routes/checkout.tsx, там они пока встроены в обработчик).
 */

interface OrderProblem {
  id?: string;
  reason?: string;
  availableQty?: number;
  actualPriceRub?: number;
}

function problems(details: unknown): OrderProblem[] {
  if (!Array.isArray(details)) return [];
  return details.filter((d): d is OrderProblem => typeof d === "object" && d !== null);
}

/** Строки для покупателя: «Название»: что случилось. */
export function orderProblemLines(details: unknown, nameOf: (id?: string) => string): string[] {
  return problems(details)
    .map((d) => {
      if (d.reason === "out_of_stock")
        return `«${nameOf(d.id)}»: доступно только ${d.availableQty ?? 0}`;
      if (d.reason === "price_changed")
        return `«${nameOf(d.id)}»: цена изменилась (теперь ${d.actualPriceRub} ₽)`;
      if (d.reason === "unknown_item") return `«${nameOf(d.id)}»: товар недоступен`;
      return d.reason ?? "";
    })
    .filter(Boolean);
}

/** Новые цены, которые сервер назвал при отказе, — чтобы обновить корзину. */
export function priceUpdates(details: unknown): Array<{ id: string; priceRub: number }> {
  return problems(details).flatMap((d) =>
    d.reason === "price_changed" &&
    typeof d.id === "string" &&
    typeof d.actualPriceRub === "number" &&
    Number.isFinite(d.actualPriceRub)
      ? [{ id: d.id, priceRub: d.actualPriceRub }]
      : [],
  );
}
