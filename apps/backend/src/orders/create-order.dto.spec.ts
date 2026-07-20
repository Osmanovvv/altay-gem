import 'reflect-metadata';
import { describe, expect, it } from 'bun:test';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateOrderDto } from './dto/create-order.dto';

/**
 * E-mail обязателен при онлайн-оплате (Этап 3): фискальный чек «Чеки от
 * ЮKassa» доставляется ТОЛЬКО на электронную почту («Отправка чека в смс
 * недоступна» — доки ЮKassa). Без e-mail критерий приёмки «покупатель
 * получает чек» невыполним. Для офлайн-оплаты (самовывоз) e-mail остаётся
 * необязательным — чек пробивает касса магазина.
 */
async function errorsOf(payload: Record<string, unknown>): Promise<string[]> {
  const dto = plainToInstance(CreateOrderDto, payload);
  const errors = await validate(dto);
  return errors.map((e) => e.property);
}

const base = {
  name: 'Иван Петров',
  phone: '+7 (999) 000-11-22',
  deliveryMethod: 'pickup_leningradskaya',
  paymentMethod: 'online',
  items: [{ id: 'med-gornyj', quantity: 1 }],
};

describe('CreateOrderDto: e-mail при онлайн-оплате', () => {
  it('онлайн-оплата БЕЗ e-mail → отклоняется (чек уходит только на почту)', async () => {
    expect(await errorsOf({ ...base })).toContain('email');
  });

  it('онлайн-оплата с корректным e-mail → проходит', async () => {
    expect(await errorsOf({ ...base, email: 'buyer@mail.ru' })).toEqual([]);
  });

  it('онлайн-оплата с кривым e-mail → отклоняется', async () => {
    expect(await errorsOf({ ...base, email: 'не-почта' })).toContain('email');
  });

  it('самовывоз с оплатой на месте БЕЗ e-mail → проходит (чек бьёт касса)', async () => {
    expect(
      await errorsOf({ ...base, paymentMethod: 'cash_on_pickup' }),
    ).toEqual([]);
  });

  it('офлайн-оплата с кривым e-mail → отклоняется (формат проверяем всегда)', async () => {
    expect(
      await errorsOf({
        ...base,
        paymentMethod: 'card_on_pickup',
        email: 'не-почта',
      }),
    ).toContain('email');
  });

  it('пустая строка e-mail при онлайн-оплате → отклоняется (не считается контактом)', async () => {
    expect(await errorsOf({ ...base, email: '' })).toContain('email');
  });
});
