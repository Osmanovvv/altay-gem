/**
 * Один повтор при сетевом сбое.
 *
 * Появилось по живому случаю: уведомление о добавлении получателя не дошло —
 * запрос к Telegram не ушёл вообще («fetch failed»), разовый сбой сети. Повторить
 * было некому: человек уже числился добавленным и второй раз «новичком» не
 * становился. Одно сообщение — один шанс, и он сгорел.
 *
 * Повторяем ТОЛЬКО транспортный сбой, то есть когда запрос не дошёл и функция
 * бросила исключение. Ответ сервера — даже отказ вроде «чат не найден» —
 * значение, а не исключение: неверный номер повтором не вылечишь, а нагрузку и
 * шум в логах удвоишь.
 */

export interface RetryOptions {
  /** Пауза перед повтором. */
  delayMs?: number;
  /** Подменяется в тестах, чтобы не ждать по-настоящему. */
  sleep?: (ms: number) => Promise<void>;
}

const wait = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export async function withTransportRetry<T>(
  attempt: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const delayMs = options.delayMs ?? 2000;
  const sleep = options.sleep ?? wait;
  try {
    return await attempt();
  } catch {
    await sleep(delayMs);
    return attempt();
  }
}
