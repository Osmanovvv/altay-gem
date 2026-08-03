import { describe, expect, test } from 'bun:test';
import { isXlsxUpload, reconcileFileName } from './reconcile-upload';

/**
 * Загрузка выгрузки Эвотора через админку (вместо scp руками).
 * Имя файла на диске задаём МЫ из storeId — принятое от клиента имя в путь
 * не попадает: иначе «../../etc/passwd.xlsx» писал бы куда угодно.
 */
describe('reconcileFileName', () => {
  const STORE = '20190416-67ab-402e-80e8-194b143cce8f';

  test('имя файла собирается из storeId, регистр приводится к верхнему', () => {
    expect(reconcileFileName(STORE)).toBe(
      '20190416-67AB-402E-80E8-194B143CCE8F.xlsx',
    );
  });

  test('уже верхний регистр не ломается', () => {
    expect(reconcileFileName(STORE.toUpperCase())).toBe(
      '20190416-67AB-402E-80E8-194B143CCE8F.xlsx',
    );
  });

  test('не-UUID отвергается (в т.ч. попытки выйти из каталога)', () => {
    for (const bad of [
      '../../etc/passwd',
      'not-a-uuid',
      '',
      '20190416-67ab-402e-80e8-194b143cce8f/../evil',
      '20190416-67ab-402e-80e8-194b143cce8f.xlsx',
    ]) {
      expect(() => reconcileFileName(bad)).toThrow();
    }
  });
});

describe('isXlsxUpload', () => {
  const XLSX_MIME =
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

  test('принимает .xlsx с корректным типом', () => {
    expect(isXlsxUpload('20190416.xlsx', XLSX_MIME)).toBe(true);
    expect(isXlsxUpload('Выгрузка Титова.XLSX', XLSX_MIME)).toBe(true);
  });

  test('принимает .xlsx, если браузер не проставил тип', () => {
    expect(isXlsxUpload('export.xlsx', 'application/octet-stream')).toBe(true);
  });

  test('отвергает не-xlsx', () => {
    expect(isXlsxUpload('export.csv', 'text/csv')).toBe(false);
    expect(isXlsxUpload('export.xls', 'application/vnd.ms-excel')).toBe(false);
    expect(isXlsxUpload('shell.sh', 'application/x-sh')).toBe(false);
    expect(isXlsxUpload('', XLSX_MIME)).toBe(false);
  });
});
