import type { Core } from '@strapi/strapi';

const config = ({ env }: Core.Config.Shared.ConfigParams): Core.Config.Admin => ({
  // Путь панели управления. По умолчанию /admin; на проде вынесен на
  // «секретный» адрес (ADMIN_PATH), чтобы форму входа не находили сканеры.
  // ВАЖНО: значение зашивается в бандл при `strapi build`, поэтому переменная
  // должна быть одинаковой при СБОРКЕ и при ЗАПУСКЕ, иначе панель отдаст 404.
  // Служебные эндпоинты (/admin/login, /admin/init) остаются на /admin —
  // они прибиты в ядре Strapi и от этой настройки не зависят; реальная защита
  // входа — стойкий пароль + встроенный лимит попыток (rateLimit ниже).
  url: env('ADMIN_PATH', '/admin'),
  auth: {
    secret: env('ADMIN_JWT_SECRET')!,
  },
  // Лимит попыток входа: 5 за 5 минут на связку e-mail+IP (значения по
  // умолчанию Strapi; фиксируем явно, чтобы не уехали при обновлении).
  rateLimit: {
    enabled: true,
    interval: 5 * 60 * 1000, // окно в миллисекундах
    max: 5,
  },
  apiToken: {
    salt: env('API_TOKEN_SALT')!,
  },
  transfer: {
    token: {
      salt: env('TRANSFER_TOKEN_SALT')!,
    },
  },
  secrets: {
    encryptionKey: env('ENCRYPTION_KEY')!,
  },
  flags: {
    nps: env.bool('FLAG_NPS', true),
    promoteEE: env.bool('FLAG_PROMOTE_EE', true),
    docLinks: env.bool('FLAG_DOC_LINKS', true),
  },
});

export default config;
