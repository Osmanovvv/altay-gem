import type { Core } from '@strapi/strapi';

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Server => ({
  host: env('HOST', '0.0.0.0'),
  port: env.int('PORT', 1337),
  // За nginx без этого Koa считает клиентом сам прокси (127.0.0.1), и лимит
  // попыток входа складывает ВСЕХ в одну корзину: чужой перебор пароля
  // выбивал бы 429 настоящему администратору. Доверять X-Forwarded-For
  // безопасно: порт 1337 наружу закрыт, заголовок ставит только наш nginx.
  proxy: { koa: true },
  app: {
    keys: env.array('APP_KEYS')!,
  },
  webhooks: {
    populateRelations: env.bool('WEBHOOKS_POPULATE_RELATIONS', false),
  },
});

export default config;
