import type { Core } from '@strapi/strapi';

const config: Core.Config.Middlewares = [
  'strapi::logger',
  'strapi::errors',
  'strapi::security',
  'strapi::cors',
  // 'strapi::poweredBy' убран: заголовок X-Powered-By: Strapi называл стек
  // в каждом ответе — вместе с секретным путём панели это бессмысленно.
  'strapi::query',
  'strapi::body',
  'strapi::session',
  'strapi::favicon',
  'strapi::public',
];

export default config;
