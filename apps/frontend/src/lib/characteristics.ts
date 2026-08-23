/**
 * Характеристики товара: технические ключи Strapi -> подписи для покупателя.
 *
 * Список общий для сайта и мини-аппа MAX. Держать его в двух экранах нельзя:
 * на карточке мини-аппа уже вылезал сырой ключ «storage» ровно потому, что
 * перевод жил только в веб-версии. Неизвестные ключи не показываем —
 * в модели контента могут появиться служебные поля.
 */
const LABELS: Array<[key: string, label: string]> = [
  ["weightVolume", "Вес/Объём"],
  ["composition", "Состав"],
  ["manufacturer", "Производитель"],
  ["shelfLife", "Срок годности"],
  ["storage", "Условия хранения"],
];

/**
 * Пары «подпись — значение» в стабильном порядке (порядок задан здесь, а не
 * порядком ключей в ответе API: он может меняться и переставлять строки).
 */
export function readableCharacteristics(
  characteristics: Record<string, string | null> | undefined | null,
): Array<[string, string]> {
  if (!characteristics) return [];
  const out: Array<[string, string]> = [];
  for (const [key, label] of LABELS) {
    const value = characteristics[key];
    if (typeof value === "string" && value.trim() !== "") out.push([label, value]);
  }
  return out;
}
