import { describe, expect, test } from 'bun:test';
import { newcomers, recipientsFor, type Recipient } from './recipients';

const r = (over: Partial<Recipient>): Recipient => ({
  chatId: '100',
  name: 'Без имени',
  orders: false,
  alerts: false,
  enabled: true,
  ...over,
});

describe('кому уходит уведомление', () => {
  test('заказы — только подписанным на заказы', () => {
    const list = [
      r({ chatId: '1', name: 'Магазин', orders: true }),
      r({ chatId: '2', name: 'Техподдержка', alerts: true }),
    ];
    expect(recipientsFor('order', list, {})).toEqual(['1']);
  });

  test('оповещения — только подписанным на оповещения', () => {
    const list = [
      r({ chatId: '1', name: 'Магазин', orders: true }),
      r({ chatId: '2', name: 'Техподдержка', alerts: true }),
    ];
    expect(recipientsFor('alert', list, {})).toEqual(['2']);
  });

  test('подписанный на оба вида получает оба', () => {
    const list = [r({ chatId: '1', orders: true, alerts: true })];
    expect(recipientsFor('order', list, {})).toEqual(['1']);
    expect(recipientsFor('alert', list, {})).toEqual(['1']);
  });

  test('выключенный не получает ничего', () => {
    const list = [r({ chatId: '1', orders: true, alerts: true, enabled: false })];
    expect(recipientsFor('order', list, {})).toEqual([]);
    expect(recipientsFor('alert', list, {})).toEqual([]);
  });

  test('пустой или пробельный chat id пропускается, а не шлётся в никуда', () => {
    const list = [
      r({ chatId: '', orders: true }),
      r({ chatId: '   ', orders: true }),
      r({ chatId: ' 7 ', orders: true }),
    ];
    expect(recipientsFor('order', list, {})).toEqual(['7']);
  });

  test('один и тот же чат дважды — сообщение уходит один раз', () => {
    const list = [
      r({ chatId: '5', name: 'Марина', orders: true }),
      r({ chatId: '5', name: 'Она же, вторая запись', orders: true }),
    ];
    expect(recipientsFor('order', list, {})).toEqual(['5']);
  });
});

describe('аварийный канал из настроек сервера', () => {
  /**
   * Главное правило раздела. Технические оповещения существуют, чтобы сообщить
   * «что-то сломалось». Если их получатели живут ТОЛЬКО в админке, то при
   * падении самой админки или случайном удалении записей мы не получим именно
   * то сообщение, которое об этом и говорит. Тишина неотличима от «всё хорошо».
   * Поэтому адрес из настроек сервера получает оповещения ВСЕГДА.
   */
  test('оповещения уходят на аварийный адрес всегда, даже при пустом списке', () => {
    expect(recipientsFor('alert', [], { alertChatId: '99' })).toEqual(['99']);
  });

  test('аварийный адрес добавляется к списку, а не заменяет его', () => {
    const list = [r({ chatId: '2', alerts: true })];
    expect(recipientsFor('alert', list, { alertChatId: '99' }).sort()).toEqual(['2', '99']);
  });

  test('аварийный адрес уже есть в списке — не задваивается', () => {
    const list = [r({ chatId: '99', alerts: true })];
    expect(recipientsFor('alert', list, { alertChatId: '99' })).toEqual(['99']);
  });

  /**
   * У заказов правило другое: пока получатели не заведены, заказ обязан
   * доехать хоть куда-то — иначе магазин его просто не увидит. Но как только
   * в списке появился хоть один подписчик на заказы, список и есть источник
   * правды: заказчица управляет им сама, и навязанный адрес ей мешал бы.
   */
  test('заказы: список пуст — падаем на адрес магазина из настроек', () => {
    expect(recipientsFor('order', [], { adminChatId: '1' })).toEqual(['1']);
  });

  test('заказы: в списке есть подписчик — адрес из настроек не добавляется', () => {
    const list = [r({ chatId: '2', orders: true })];
    expect(recipientsFor('order', list, { adminChatId: '1' })).toEqual(['2']);
  });

  test('список есть, но на заказы никто не подписан — тоже падаем на настройки', () => {
    const list = [r({ chatId: '2', alerts: true })];
    expect(recipientsFor('order', list, { adminChatId: '1' })).toEqual(['1']);
  });

  test('ничего не настроено — пустой список, а не падение', () => {
    expect(recipientsFor('order', [], {})).toEqual([]);
    expect(recipientsFor('alert', [], {})).toEqual([]);
  });
});

describe('кого поприветствовать проверочным сообщением', () => {
  /**
   * Проверочное сообщение решает главную беду настройки «руками»: неверный
   * номер чата или бот, не добавленный в группу, обнаруживаются не через
   * неделю на первом заказе, а сразу.
   *
   * Но у него есть очевидная ловушка: после каждого перезапуска сервера
   * приветствовать снова ВЕСЬ список — это спам. Поэтому первое чтение списка
   * считается «знакомством»: запоминаем состав молча, а здороваемся только с
   * теми, кто появился ПОСЛЕ него.
   */
  test('первое чтение после запуска — молчим, только запоминаем', () => {
    expect(newcomers(null, ['1', '2', '3'])).toEqual([]);
  });

  test('появился новый — здороваемся только с ним', () => {
    expect(newcomers(new Set(['1', '2']), ['1', '2', '3'])).toEqual(['3']);
  });

  test('состав не менялся — никого не беспокоим', () => {
    expect(newcomers(new Set(['1', '2']), ['2', '1'])).toEqual([]);
  });

  test('кого-то убрали — это не повод здороваться с оставшимися', () => {
    expect(newcomers(new Set(['1', '2', '3']), ['1'])).toEqual([]);
  });

  test('добавили сразу нескольких — поздороваемся с каждым', () => {
    expect(newcomers(new Set(['1']), ['1', '4', '5']).sort()).toEqual(['4', '5']);
  });
});
