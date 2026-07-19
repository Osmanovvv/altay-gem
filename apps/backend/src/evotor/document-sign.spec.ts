import { describe, expect, it } from 'bun:test';
import { documentStockSign } from './parse';

/**
 * Знак влияния документа Эвотора на остаток реплики (проверено по схеме
 * definitions.yaml + гайду синхронизации, 2026-07-13).
 * Дельта-типы: количество позиции всегда положительное, направление задаёт ТИП.
 * Не-дельта (INVENTORY=абсолют, REVALUATION=цена) и неподтверждённые
 * (BUY/BUYBACK/CORRECTION) → 0: обрабатываются отдельно / отдаются на сверку.
 */
describe('documentStockSign', () => {
  it('продажа SELL уменьшает остаток (−1)', () => {
    expect(documentStockSign('SELL')).toBe(-1);
  });
  it('возврат покупателя PAYBACK увеличивает остаток (+1)', () => {
    expect(documentStockSign('PAYBACK')).toBe(1);
  });
  it('приёмка ACCEPT увеличивает остаток (+1)', () => {
    expect(documentStockSign('ACCEPT')).toBe(1);
  });
  it('списание WRITE_OFF уменьшает остаток (−1)', () => {
    expect(documentStockSign('WRITE_OFF')).toBe(-1);
  });
  it('возврат ПОСТАВЩИКУ RETURN уменьшает остаток (−1) — НЕ путать с PAYBACK', () => {
    expect(documentStockSign('RETURN')).toBe(-1);
    // Критично: два разных «возврата» — противоположный знак.
    expect(documentStockSign('RETURN')).not.toBe(documentStockSign('PAYBACK'));
  });
  it('инвентаризация INVENTORY — не дельта (0): абсолютная замена, обрабатывается отдельно', () => {
    expect(documentStockSign('INVENTORY')).toBe(0);
  });
  it('переоценка REVALUATION — не двигает остаток (0)', () => {
    expect(documentStockSign('REVALUATION')).toBe(0);
  });
  it('неподтверждённые/неизвестные типы → 0 (не применяем к остатку)', () => {
    expect(documentStockSign('BUY')).toBe(0);
    expect(documentStockSign('BUYBACK')).toBe(0);
    expect(documentStockSign('CORRECTION')).toBe(0);
    expect(documentStockSign('OPEN_SESSION')).toBe(0);
    expect(documentStockSign('')).toBe(0);
    expect(documentStockSign('ЧТО_ТО_НОВОЕ')).toBe(0);
  });
});
