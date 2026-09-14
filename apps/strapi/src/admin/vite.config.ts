import { mergeConfig, type Plugin, type ResolvedConfig, type UserConfig } from 'vite';
import { RUSSIAN_DEFAULT_SCRIPT, russianNoTranslate } from './russian-html';

/**
 * Strapi эмитит index.html как ассет внутри своего generateBundle (см.
 * @strapi/strapi/dist/src/node/vite/plugins.js), минуя HTML-конвейер Vite —
 * transformIndexHtml до него не доходит. Поэтому перехватываем на том же
 * этапе: пользовательские плагины идут после встроенных, и ассет уже лежит
 * в bundle. Само преобразование — в russian-html.ts, оно под тестом.
 *
 * Скрипт языка кладём отдельным файлом рядом с бандлом: CSP панели —
 * script-src 'self', инлайн она блокирует. Адрес строим от config.base —
 * это ADMIN_PATH, зашитый в сборку.
 */
const SCRIPT_FILE = 'admin-ru-default.js';

let base = '/';

const russianAdmin: Plugin = {
  name: 'altai-admin-russian-no-translate',
  apply: 'build',
  configResolved(config: ResolvedConfig) {
    base = config.base;
  },
  generateBundle(_options, bundle) {
    const index = bundle['index.html'];
    if (!index || index.type !== 'asset') {
      throw new Error('index.html не найден в сборке панели — Strapi сменил способ сборки');
    }
    this.emitFile({ type: 'asset', fileName: SCRIPT_FILE, source: RUSSIAN_DEFAULT_SCRIPT });
    const src = `${base.replace(/\/+$/, '')}/${SCRIPT_FILE}`;
    index.source = russianNoTranslate(String(index.source), src);
  },
};

export default (config: UserConfig) => mergeConfig(config, { plugins: [russianAdmin] });
