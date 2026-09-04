/**
 * Какие номера страниц показывать под каталогом.
 *
 * Пока каталог помещался на одну-две страницы, кнопки рисовались подряд и это
 * работало. После загрузки товаров страниц стало 49 — и внизу появилось поле из
 * 49 кружков во весь экран телефона: похоже на календарь, а не на переход по
 * страницам.
 *
 * Показываем края, окрестности текущей и многоточия вместо пропусков. Список
 * получается не длиннее семи позиций при любом количестве страниц, поэтому
 * умещается в строку даже на узком экране.
 */

/** Метка пропуска. Отдельный символ, а не число — чтобы не спутать с номером. */
export const GAP = "…" as const;

export type PageItem = number | typeof GAP;

export function pageItems(current: number, total: number): PageItem[] {
  if (!Number.isFinite(total) || total < 1) return [];

  const last = Math.floor(total);
  const cur = Math.min(Math.max(Math.floor(current) || 1, 1), last);

  // До семи страниц прятать нечего: они и так умещаются в строку, а многоточие
  // вместо двух-трёх номеров только отнимает у покупателя переходы.
  if (last <= 7) return Array.from({ length: last }, (_, i) => i + 1);

  const wanted = new Set<number>([1, last, cur - 1, cur, cur + 1]);
  // По краям окно смещаем внутрь, иначе на первой и последней странице
  // соседей видно вдвое меньше, чем в середине.
  if (cur <= 2) wanted.add(3);
  if (cur >= last - 1) wanted.add(last - 2);

  const nums = [...wanted].filter((n) => n >= 1 && n <= last).sort((a, b) => a - b);

  const out: PageItem[] = [];
  for (let i = 0; i < nums.length; i++) {
    if (i > 0) {
      const hole = nums[i] - nums[i - 1];
      // Многоточие вместо ОДНОЙ страницы бессмысленно: места занимает столько
      // же, а нажать нельзя. Такой пропуск раскрываем.
      if (hole === 2) out.push(nums[i] - 1);
      else if (hole > 2) out.push(GAP);
    }
    out.push(nums[i]);
  }
  return out;
}
