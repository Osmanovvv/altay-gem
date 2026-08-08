import { describe, expect, it } from 'bun:test';
import { parseGoodsExportRow } from './import-goods';
import { cloudProductToRow } from './cloud-goods';

/**
 * Чтение номенклатуры и остатков напрямую из Облака Эвотора — замена файлу
 * выгрузки. Чтобы не заводить второй путь применения со своими багами,
 * товар из облака приводится к ТЕМ ЖЕ колонкам, что и строка xlsx, и дальше
 * идёт через уже проверенные parseGoodsExportRow → reconcileStore.
 *
 * Форма товара облака (snake_case) взята из справочника Cloud API V2 и из
 * EvotorApiProduct: id, name, price, cost_price, quantity, code,
 * article_number, barcodes, measure_name, type, allow_to_sell, parent_id.
 */
describe('cloudProductToRow', () => {
  const P = {
    id: 'c5f72831-aa24-4e0e-ab81-0c27401c9280',
    name: 'Мёд горный 2026',
    price: 650,
    cost_price: 420.5,
    quantity: 22.154,
    code: '865',
    article_number: '4607068350021',
    barcodes: ['4607068350021', '2000000000060'],
    measure_name: 'кг',
    type: 'NORMAL',
    allow_to_sell: true,
    parent_id: '1ddea16b-971b-4ee5-8798-1b29a7aa2e27',
  };

  it('товар облака проходит через файловый парсер и даёт те же поля', () => {
    const p = parseGoodsExportRow(cloudProductToRow(P));
    expect(p).not.toBeNull();
    expect(p!.uuid).toBe(P.id);
    expect(p!.name).toBe('Мёд горный 2026');
    expect(p!.priceKopecks).toBe(65000);
    expect(p!.costPriceKopecks).toBe(42050);
    expect(p!.quantity).toBe(22.154);
    expect(p!.measure).toBe('кг');
    expect(p!.article).toBe('4607068350021');
    expect(p!.code).toBe('865');
    expect(p!.allowToSell).toBe(true);
    expect(p!.groupUuid).toBe(P.parent_id);
    // Ключ матчинга магазинов должен считаться так же, как из файла:
    // первый штрихкод.
    expect(p!.matchKey).toBe('4607068350021');
  });

  it('маркированный тип распознаётся так же, как из файла', () => {
    const p = parseGoodsExportRow(
      cloudProductToRow({ ...P, type: 'DAIRY_MARKED' }),
    );
    expect(p!.isMarked).toBe(true);
  });

  it('группа (SERVICE/GROUP) в реплику не попадает', () => {
    // У групп в облаке нет цены и остатка, а есть признак группы.
    expect(parseGoodsExportRow(cloudProductToRow({ ...P, group: true }))).toBeNull();
  });

  it('отсутствующие поля не превращаются в нули — остаток и цена остаются пустыми', () => {
    const p = parseGoodsExportRow(
      cloudProductToRow({ id: P.id, name: 'Без цены' }),
    );
    expect(p!.priceKopecks).toBeNull();
    expect(p!.quantity).toBeNull(); // не 0! иначе сверка обнулила бы остаток
    expect(p!.barcodes).toEqual([]);
  });

  it('отрицательный остаток из облака сохраняется как есть', () => {
    const p = parseGoodsExportRow(cloudProductToRow({ ...P, quantity: -3 }));
    expect(p!.quantity).toBe(-3);
  });

  it('товар без id или имени отбрасывается, не роняя разбор', () => {
    expect(parseGoodsExportRow(cloudProductToRow({ name: 'без id' }))).toBeNull();
    expect(parseGoodsExportRow(cloudProductToRow({ id: P.id }))).toBeNull();
  });

  it('в raw кладём исходный товар облака — для отладки и будущих полей', () => {
    const row = cloudProductToRow(P);
    expect(row['raw_cloud']).toEqual(P);
  });
});
