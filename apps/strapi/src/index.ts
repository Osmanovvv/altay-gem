import type { Core } from '@strapi/strapi';
import { errors } from '@strapi/utils';
import path from 'node:path';

interface HeroLifecycleEvent {
  result?: { id?: number; heroProduct?: boolean };
}

interface BridgeClient {
  request: (method: string, path: string, body?: unknown) => Promise<unknown>;
}

/**
 * Ленивый мост к админ-API бэкенда (тот же клиент, что у плагина «Заказы»).
 * ЛЮБОЙ сбой (нет файла в dist, нет env) деградирует в null с warn-логом —
 * валидация uuid и событийная инвалидация выключаются, но Strapi ЖИВЁТ:
 * require на верхнем уровне однажды уронил прод в крэш-луп (dist-сборка не
 * копирует .js плагина → путь резолвим от корня приложения, не от dist).
 */
let bridge: BridgeClient | null | undefined;
function getBridge(strapi: Core.Strapi): BridgeClient | null {
  if (bridge !== undefined) return bridge;
  bridge = null;
  const password = process.env.ORDERS_ADMIN_PASSWORD || '';
  if (!password) return bridge;
  try {
    const fromRoot = path.resolve(
      process.cwd(),
      'src/plugins/orders/server/lib/backend-client',
    );
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require(fromRoot) as {
      createBackendClient: (opts: {
        apiUrl: string;
        password: string;
        timeoutMs?: number;
      }) => BridgeClient;
    };
    bridge = mod.createBackendClient({
      apiUrl: process.env.ORDERS_API_URL || 'http://127.0.0.1:3002/api/v1',
      password,
      timeoutMs: 5000,
    });
  } catch (e) {
    strapi.log.warn(
      `[bridge] мост к бэкенду не загрузился: ${(e as Error).message} — ` +
        'валидация evotor_uuid и событийная инвалидация кеша выключены',
    );
  }
  return bridge;
}

/**
 * Событийная инвалидация кеша каталога бэкенда (ТЗ р.9: «инвалидация при…
 * публикациях Strapi»): правка товара/категории видна на витрине сразу,
 * а не через TTL 60 с. Fire-and-forget: недоступный бэкенд не должен
 * блокировать работу контент-менеджера.
 */
function invalidateCatalogCache(strapi: Core.Strapi): void {
  getBridge(strapi)
    ?.request('POST', '/admin/cache/invalidate')
    .catch((e: Error) =>
      strapi.log.warn(`[cache] инвалидация каталога не дошла: ${e.message}`),
    );
}

/**
 * Валидация evotor_uuid против реплики Эвотора при сохранении товара
 * (ТЗ 7.2: связь с импортированным каталогом; опечатка не должна МОЛЧА
 * прятать товар с витрины). Несуществующий uuid — понятная ошибка в админке.
 * Сетевой сбой моста — fail-open (сохранение не блокируем), с warn-логом.
 */
async function assertEvotorUuidExists(
  strapi: Core.Strapi,
  data: { evotorUuid?: string } | undefined,
): Promise<void> {
  const uuid = data?.evotorUuid?.trim();
  const client = getBridge(strapi);
  if (!uuid || !client) return;
  try {
    await client.request(
      'GET',
      `/admin/replica/products/${encodeURIComponent(uuid)}`,
    );
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 404) {
      throw new errors.ApplicationError(
        `Товар с evotor_uuid «${uuid}» не найден в реплике Эвотора. ` +
          'Проверьте uuid: скопируйте его из выгрузки номенклатуры (колонка uuid).',
      );
    }
    strapi.log.warn(
      `[product] реплика недоступна, evotor_uuid не проверен: ${(e as Error).message}`,
    );
  }
}

/** Снять флаг heroProduct со всех товаров, кроме только что отмеченного. */
async function unsetOtherHeroes(
  strapi: Core.Strapi,
  event: HeroLifecycleEvent,
): Promise<void> {
  const { result } = event;
  if (!result?.id || !result.heroProduct) return;
  await strapi.db.query('api::product.product').updateMany({
    where: { id: { $ne: result.id }, heroProduct: true },
    data: { heroProduct: false },
  });
}

/**
 * Bootstrap: роль «Editor» (контент-менеджер заказчика) получает права
 * CRUD на все прикладные модели (api::*). В Strapi права на новые
 * content-types ролям автоматически не выдаются — без этого контент-менеджер
 * видит модели, но не может править (ТЗ 7.1). Аддитивно и идемпотентно:
 * добавляются только недостающие права, системные настройки не затрагиваются.
 */
export default {
  register(): void {},

  async bootstrap({ strapi }: { strapi: Core.Strapi }): Promise<void> {
    // Товар-хит главной — единственный (ТЗ 7.2): при установке флага
    // heroProduct снимаем его со всех остальных товаров.
    strapi.db.lifecycles.subscribe({
      models: ['api::product.product'],
      async afterCreate(event) {
        await unsetOtherHeroes(strapi, event);
      },
      async afterUpdate(event) {
        await unsetOtherHeroes(strapi, event);
      },
    });

    // Валидация связи с репликой Эвотора ДО сохранения товара (ТЗ 7.2).
    strapi.db.lifecycles.subscribe({
      models: ['api::product.product'],
      async beforeCreate(event) {
        await assertEvotorUuidExists(
          strapi,
          event.params?.data as { evotorUuid?: string } | undefined,
        );
      },
      async beforeUpdate(event) {
        await assertEvotorUuidExists(
          strapi,
          event.params?.data as { evotorUuid?: string } | undefined,
        );
      },
    });

    // Кеш каталога бэкенда сбрасывается СОБЫТИЕМ публикации (ТЗ р.9),
    // а не только TTL: товар и категория формируют карточки витрины.
    strapi.db.lifecycles.subscribe({
      models: ['api::product.product', 'api::category.category'],
      afterCreate() {
        invalidateCatalogCache(strapi);
      },
      afterUpdate() {
        invalidateCatalogCache(strapi);
      },
      afterDelete() {
        invalidateCatalogCache(strapi);
      },
    });

    const editor = await strapi.db
      .query('admin::role')
      .findOne({ where: { code: 'strapi-editor' } });
    if (!editor) {
      strapi.log.warn(
        '[bootstrap] роль Editor не найдена — пропуск выдачи прав',
      );
      return;
    }

    const actions = ['create', 'read', 'update', 'delete'].map(
      (a) => `plugin::content-manager.explorer.${a}`,
    );
    const contentTypes = strapi.contentTypes as unknown as Record<
      string,
      { attributes: Record<string, unknown> }
    >;
    const uids = Object.keys(contentTypes).filter((u) =>
      u.startsWith('api::'),
    );

    const permissionService = strapi.service('admin::permission');
    const existing: Array<{ action: string; subject: string | null }> =
      await permissionService.findMany({
        where: { role: { id: editor.id } },
      });
    const have = new Set(
      existing.map((p) => `${p.action}|${p.subject ?? ''}`),
    );

    const toAdd: Array<Record<string, unknown>> = [];
    for (const uid of uids) {
      const fields = Object.keys(contentTypes[uid].attributes);
      for (const action of actions) {
        if (!have.has(`${action}|${uid}`)) {
          toAdd.push({
            action,
            subject: uid,
            properties: { fields },
            conditions: [],
            role: editor.id,
          });
        }
      }
    }

    if (toAdd.length > 0) {
      await permissionService.createMany(toAdd);
      strapi.log.info(
        `[bootstrap] роли Editor выдано прав на контент: ${toAdd.length}`,
      );
    }
  },
};
