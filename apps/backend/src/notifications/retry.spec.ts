import { describe, expect, test } from 'bun:test';
import { withTransportRetry } from './retry';

const noSleep = async (): Promise<void> => {};

describe('повтор отправки при сетевом сбое', () => {
  test('получилось с первого раза — второй попытки нет', async () => {
    let calls = 0;
    const res = await withTransportRetry(
      async () => {
        calls++;
        return 'ок';
      },
      { sleep: noSleep },
    );
    expect(res).toBe('ок');
    expect(calls).toBe(1);
  });

  /**
   * Ради этого всё и написано. Уведомление о добавлении получателя уже
   * потерялось так однажды: запрос не ушёл из-за разового сетевого сбоя, а
   * повторять было некому — человек числится добавленным и второй раз
   * «новичком» не станет.
   */
  test('сеть моргнула — повторяем и доводим до конца', async () => {
    let calls = 0;
    const res = await withTransportRetry(
      async () => {
        calls++;
        if (calls === 1) throw new Error('fetch failed');
        return 'ок';
      },
      { sleep: noSleep },
    );
    expect(res).toBe('ок');
    expect(calls).toBe(2);
  });

  test('сеть лежит совсем — сдаёмся после повтора и отдаём ошибку наверх', async () => {
    let calls = 0;
    await expect(
      withTransportRetry(
        async () => {
          calls++;
          throw new Error('fetch failed');
        },
        { sleep: noSleep },
      ),
    ).rejects.toThrow('fetch failed');
    expect(calls).toBe(2);
  });

  /**
   * Ответ сервера — не сетевой сбой. «Чат не найден» повтором не лечится:
   * номер неверен, и второй запрос лишь удвоит нагрузку и шум в логах.
   * Такой ответ возвращается как значение, а не исключение, — и не повторяется.
   */
  test('сервер ответил отказом — это не сбой сети, не повторяем', async () => {
    let calls = 0;
    const res = await withTransportRetry(
      async () => {
        calls++;
        return { status: 400, description: 'chat not found' };
      },
      { sleep: noSleep },
    );
    expect(res).toEqual({ status: 400, description: 'chat not found' });
    expect(calls).toBe(1);
  });

  test('перед повтором выдерживается пауза', async () => {
    const waited: number[] = [];
    let calls = 0;
    await withTransportRetry(
      async () => {
        calls++;
        if (calls === 1) throw new Error('fetch failed');
        return 'ок';
      },
      {
        delayMs: 1500,
        sleep: async (ms) => {
          waited.push(ms);
        },
      },
    );
    expect(waited).toEqual([1500]);
  });
});
