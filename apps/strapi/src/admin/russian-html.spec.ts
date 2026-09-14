import { describe, expect, test } from 'bun:test';
import { russianNoTranslate } from './russian-html';

// Ровно то, что отдаёт Strapi 5 (DefaultDocument через renderToStaticMarkup).
const STRAPI_HTML =
  '<!DOCTYPE html><html lang="en"><head><meta charSet="utf-8"/><title>Strapi Admin</title></head><body><div id="strapi"></div></body></html>';

describe('панель управления по-русски и без перевода браузером', () => {
  /**
   * Ради этого всё и написано. Chrome переводил английскую панель на лету
   * (колонка «slug» стала «Слизень»), подменял узлы в DOM, и на
   * «Редактировать» React падал с «removeChild ... not a child of this node».
   * Контент-менеджер не смогла добавить ни одной фотографии.
   */
  test('html получает lang=ru и запрет перевода', () => {
    const out = russianNoTranslate(STRAPI_HTML);
    expect(out).toContain('<html lang="ru" translate="no" class="notranslate">');
    expect(out).not.toContain('lang="en"');
  });

  test('в head — мета notranslate для Google', () => {
    const out = russianNoTranslate(STRAPI_HTML);
    expect(out).toContain('<meta name="google" content="notranslate"/>');
  });

  test('русский становится языком по умолчанию, но выбор в профиле остаётся', () => {
    const out = russianNoTranslate(STRAPI_HTML);
    // getItem(...) || setItem(...) — пишем ТОЛЬКО когда ещё не выбрано
    expect(out).toMatch(/getItem\('strapi-admin-language'\)\s*\|\|\s*localStorage\.setItem\('strapi-admin-language','ru'\)/);
  });

  test('скрипт стоит раньше приложения — иначе Strapi успеет прочитать пустоту', () => {
    const out = russianNoTranslate(STRAPI_HTML);
    expect(out.indexOf('strapi-admin-language')).toBeLessThan(out.indexOf('<div id="strapi">'));
  });

  test('остальная разметка не тронута', () => {
    const out = russianNoTranslate(STRAPI_HTML);
    expect(out).toContain('<meta charSet="utf-8"/>');
    expect(out).toContain('<div id="strapi"></div>');
    expect(out.startsWith('<!DOCTYPE html>')).toBe(true);
  });

  /** Если Strapi однажды сменит шаблон — лучше упасть на сборке, чем тихо отдать английский. */
  test('незнакомый шаблон — ошибка, а не молчание', () => {
    expect(() => russianNoTranslate('<html><body></body></html>')).toThrow(/lang/);
  });
});
