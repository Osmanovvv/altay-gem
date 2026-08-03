/**
 * Приём выгрузки Эвотора через админку (вместо ручного scp на сервер).
 *
 * Ночная сверка читает из каталога файлы строго вида `<storeId>.xlsx`, поэтому
 * имя файла на диске собираем МЫ из storeId, а присланное клиентом имя в путь
 * не попадает: иначе «../../../etc/cron.d/evil.xlsx» писался бы куда угодно.
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `<STOREID>.xlsx` — как ожидает ReconcileService. Бросает на не-UUID. */
export function reconcileFileName(storeId: string): string {
  const id = (storeId ?? '').trim();
  if (!UUID_RE.test(id)) {
    throw new Error(
      `storeId должен быть UUID магазина Эвотора, получено «${storeId}»`,
    );
  }
  // Выгрузки исторически лежат в верхнем регистре; PostgreSQL сравнивает uuid
  // регистронезависимо, так что для БД разницы нет — важна единая форма имени.
  return `${id.toUpperCase()}.xlsx`;
}

/**
 * Похоже ли загруженное на выгрузку Excel. Тип от браузера бывает
 * `application/octet-stream` (частый случай при загрузке из Windows), поэтому
 * решает расширение, а тип лишь отсекает заведомо чужие форматы.
 */
export function isXlsxUpload(originalName: string, mimetype: string): boolean {
  const name = (originalName ?? '').trim().toLowerCase();
  if (!name.endsWith('.xlsx')) return false;
  const type = (mimetype ?? '').toLowerCase();
  const allowed = [
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/octet-stream',
    'application/zip', // xlsx — это zip-контейнер, иногда так и определяется
    '',
  ];
  return allowed.includes(type);
}
