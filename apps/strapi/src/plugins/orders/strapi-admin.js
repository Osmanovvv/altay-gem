// Этот файл обрабатывается только сборщиком админки (Vite) как ESM:
// сгенерированный entry делает `import orders from '.../strapi-admin'`.
// CommonJS (`module.exports = require(...)`) здесь падает в браузере —
// поэтому ESM re-export.
export { default } from './admin/src/index';
