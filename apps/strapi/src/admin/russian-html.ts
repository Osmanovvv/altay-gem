/**
 * Панель управления: русский по умолчанию и запрет перевода браузером.
 *
 * Strapi берёт язык интерфейса из localStorage, а если там пусто — ставит
 * английский и `<html lang="en">`. Chrome на русской системе видит
 * английскую страницу и переводит её на лету, подменяя текстовые узлы в DOM.
 * React считает эти узлы своими, и на первом же переходе («Редактировать»
 * у товара) панель падает с «Failed to execute 'removeChild' on 'Node'».
 * Так контент-менеджер не смогла добавить ни одной фотографии.
 *
 * Включить русский в app.tsx недостаточно: до первого переключения языка в
 * профиле страница остаётся английской. Поэтому три слоя:
 *   1) скрипт до загрузки приложения кладёт в localStorage русский, если
 *      язык ещё не выбран — переключить в профиле по-прежнему можно;
 *   2) `<html lang="ru" translate="no" class="notranslate">` — стандартный
 *      атрибут HTML и класс, который понимает Google;
 *   3) `<meta name="google" content="notranslate">` — запрет для страницы.
 * Переводить панель нечего: она и так по-русски.
 */
const LANGUAGE_KEY = 'strapi-admin-language';

export function russianNoTranslate(html: string): string {
  const withLang = html.replace(
    /<html\b([^>]*)\slang="[^"]*"/,
    '<html$1 lang="ru" translate="no" class="notranslate"',
  );
  if (withLang === html) {
    throw new Error(
      'Шаблон панели Strapi не содержит <html lang="…"> — проверьте russian-html.ts',
    );
  }
  const defaultRussian =
    `<script>try{localStorage.getItem('${LANGUAGE_KEY}')||` +
    `localStorage.setItem('${LANGUAGE_KEY}','ru')}catch(e){}</script>`;
  return withLang.replace(
    /<head>/,
    `<head><meta name="google" content="notranslate"/>${defaultRussian}`,
  );
}
