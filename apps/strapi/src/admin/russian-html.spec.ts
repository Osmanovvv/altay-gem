import { describe, expect, test } from 'bun:test';
import { RUSSIAN_DEFAULT_SCRIPT, russianNoTranslate } from './russian-html';

// Ровно то, что отдаёт Strapi 5 (DefaultDocument через renderToStaticMarkup).
const STRAPI_HTML =
  '<!DOCTYPE html><html lang="en"><head><meta charSet="utf-8"/><title>Strapi Admin</title></head>' +
  '<body><div id="strapi"></div><script type="module" src="/manage-abc/strapi-XYZ.js"></script></body></html>';
const SCRIPT_SRC = '/manage-abc/admin-ru-default.js';

describe('панель управления по-русски и без перевода браузером', () => {
  /**
   * Ради этого всё и написано. Chrome переводил английскую панель на лету
   * (колонка «slug» стала «Слизень»), подменял узлы в DOM, и на
   * «Редактировать» React падал с «removeChild ... not a child of this node».
   * Контент-менеджер не смогла добавить ни одной фотографии.
   */
  test('html получает lang=ru и запрет перевода', () => {
    const out = russianNoTranslate(STRAPI_HTML, SCRIPT_SRC);
    expect(out).toContain('<html lang="ru" translate="no" class="notranslate">');
    expect(out).not.toContain('lang="en"');
  });

  test('в head — мета notranslate для Google', () => {
    const out = russianNoTranslate(STRAPI_HTML, SCRIPT_SRC);
    expect(out).toContain('<meta name="google" content="notranslate"/>');
  });

  /**
   * CSP панели — script-src 'self': инлайн-скрипт браузер молча блокирует
   * (проверено на боевом: «Executing inline script violates ... CSP»).
   * Поэтому скрипт лежит отдельным файлом в сборке и подключается по src.
   */
  test('скрипт языка подключается внешним файлом, а не инлайном', () => {
    const out = russianNoTranslate(STRAPI_HTML, SCRIPT_SRC);
    expect(out).toContain(`<script src="${SCRIPT_SRC}"></script>`);
    expect(out).not.toContain('localStorage');
  });

  test('скрипт стоит раньше приложения — иначе Strapi успеет прочитать пустоту', () => {
    const out = russianNoTranslate(STRAPI_HTML, SCRIPT_SRC);
    expect(out.indexOf('admin-ru-default.js')).toBeLessThan(out.indexOf('<div id="strapi">'));
  });

  test('сам скрипт: русский по умолчанию, но выбор в профиле остаётся', () => {
    // getItem(...) || setItem(...) — пишем ТОЛЬКО когда ещё не выбрано
    expect(RUSSIAN_DEFAULT_SCRIPT).toMatch(
      /getItem\('strapi-admin-language'\)\s*\|\|\s*localStorage\.setItem\('strapi-admin-language','ru'\)/,
    );
    // приватный режим не должен ронять панель
    expect(RUSSIAN_DEFAULT_SCRIPT).toMatch(/try\{.*\}catch/);
  });

  test('остальная разметка не тронута', () => {
    const out = russianNoTranslate(STRAPI_HTML, SCRIPT_SRC);
    expect(out).toContain('<meta charSet="utf-8"/>');
    expect(out).toContain('<div id="strapi"></div>');
    expect(out).toContain('src="/manage-abc/strapi-XYZ.js"');
    expect(out.startsWith('<!DOCTYPE html>')).toBe(true);
  });

  /** Если Strapi однажды сменит шаблон — лучше упасть на сборке, чем тихо отдать английский. */
  test('незнакомый шаблон — ошибка, а не молчание', () => {
    expect(() => russianNoTranslate('<html><body></body></html>', SCRIPT_SRC)).toThrow(/lang/);
  });
});
