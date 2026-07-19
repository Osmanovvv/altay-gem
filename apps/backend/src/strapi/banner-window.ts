/**
 * Окно показа баннера (ТЗ р.7: showFrom/showTo). Чистая функция — фильтр
 * поверх выборки Strapi (active=true), чтобы просроченный баннер не висел
 * на главной, а запланированный не выехал раньше срока.
 */

/** Дата-день без времени: конец интервала — конец этого дня, не полночь. */
const DAY_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

function parseEdge(v: unknown, endOfDay: boolean): number | null {
  if (typeof v !== 'string' || v.trim() === '') return null;
  const ms = Date.parse(v);
  if (Number.isNaN(ms)) return null; // битую дату трактуем как «нет границы»
  return endOfDay && DAY_ONLY.test(v) ? ms + DAY_MS - 1 : ms;
}

export function bannerIsLive(
  b: { showFrom?: unknown; showTo?: unknown },
  nowMs: number,
): boolean {
  const from = parseEdge(b.showFrom, false);
  const to = parseEdge(b.showTo, true);
  if (from !== null && nowMs < from) return false;
  if (to !== null && nowMs > to) return false;
  return true;
}
