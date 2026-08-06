import type { Core } from '@strapi/strapi';

const config: Core.Config.Middlewares = [
  'strapi::logger',
  'strapi::errors',
  'strapi::security',
  'strapi::cors',
  // 'strapi::poweredBy' убран: заголовок X-Powered-By: Strapi называл стек
  // в каждом ответе — вместе с секретным путём панели это бессмысленно.
  'strapi::query',
  {
    // Выгрузка загружается через админку JSON-ом в base64 (см. плагин orders):
    // xlsx на 350 КБ превращается примерно в 470 КБ, а каталог со временем
    // растёт. Дефолтный лимит JSON-тела впритык, поэтому задаём явно.
    name: 'strapi::body',
    config: { jsonLimit: '5mb', formLimit: '5mb', textLimit: '5mb' },
  },
  'strapi::session',
  'strapi::favicon',
  'strapi::public',
];

export default config;
