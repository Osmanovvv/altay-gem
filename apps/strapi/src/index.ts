import type { Core } from '@strapi/strapi';

interface HeroLifecycleEvent {
  result?: { id?: number; heroProduct?: boolean };
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
