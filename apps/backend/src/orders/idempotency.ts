/**
 * Идемпотентность создания заказа (ТЗ р.9), схема «сначала захвати ключ».
 *
 * Порядок в сервисе: INSERT заглушки (responseBody=null) с onConflictDoNothing
 * ДО транзакции заказа. Вставилась — мы владельцы. Нет — по существующей
 * строке решает idempotencyDecision. Это закрывает гонку старой схемы
 * (SELECT → транзакция → INSERT в конце), где два параллельных одинаковых
 * POST создавали два заказа и два резерва.
 */

export type IdempotencyOutcome =
  | 'owner' //       строки не было — мы захватили ключ, создаём заказ
  | 'replay' //      ответ уже сохранён — вернуть его без создания
  | 'conflict' //    тот же ключ с другим телом запроса — 409
  | 'in_progress' // параллельный запрос ещё держит заглушку — 409, повторить
  | 'reclaim'; //    владелец заглушки упал — перезахватить атомарным UPDATE

export interface ExistingKey {
  requestHash: string;
  responseBody: unknown;
  createdAt: Date;
}

export function idempotencyDecision(
  existing: ExistingKey | undefined,
  requestHash: string,
  nowMs: number,
  staleMs: number,
): IdempotencyOutcome {
  if (!existing) return 'owner';
  // Чужое тело с нашим ключом — ошибка клиента независимо от готовности ответа.
  if (existing.requestHash !== requestHash) return 'conflict';
  if (existing.responseBody !== null && existing.responseBody !== undefined)
    return 'replay';
  // Заглушка: свежая — обрабатывается параллельно; протухшая — владелец упал
  // до записи ответа (иначе ключ навсегда отвечал бы «обрабатывается»).
  return nowMs - existing.createdAt.getTime() > staleMs
    ? 'reclaim'
    : 'in_progress';
}
