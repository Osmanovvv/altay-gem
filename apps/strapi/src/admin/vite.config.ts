import { mergeConfig, type Plugin, type UserConfig } from 'vite';
import { russianNoTranslate } from './russian-html';

/**
 * Strapi эмитит index.html как ассет внутри своего generateBundle (см.
 * @strapi/strapi/dist/src/node/vite/plugins.js), минуя HTML-конвейер Vite —
 * transformIndexHtml до него не доходит. Поэтому перехватываем на том же
 * этапе: пользовательские плагины идут после встроенных, и ассет уже лежит
 * в bundle. Само преобразование — в russian-html.ts, оно под тестом.
 */
const russianAdmin: Plugin = {
  name: 'altai-admin-russian-no-translate',
  apply: 'build',
  generateBundle(_options, bundle) {
    const index = bundle['index.html'];
    if (!index || index.type !== 'asset') {
      throw new Error('index.html не найден в сборке панели — Strapi сменил способ сборки');
    }
    index.source = russianNoTranslate(String(index.source));
  },
};

export default (config: UserConfig) => mergeConfig(config, { plugins: [russianAdmin] });
