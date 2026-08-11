import type { Core } from '@strapi/strapi';
import { errors } from '@strapi/utils';
import path from 'node:path';

import { applyFieldHints } from './field-hints';
import { imageTargets, type UploadFileResult } from './upload-image-targets';
import { oldPriceProblem } from './validate-old-price';

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
interface ProductData {
  evotorUuid?: string;
  oldPriceRub?: number | string | null;
  portionMassG?: number | string | null;
}

interface ReplicaProduct {
  name?: string;
  priceRub?: number;
  isWeight?: boolean;
}

async function assertEvotorUuidExists(
  strapi: Core.Strapi,
  data: ProductData | undefined,
): Promise<void> {
  const uuid = data?.evotorUuid?.trim();
  const client = getBridge(strapi);
  if (!uuid || !client) return;
  // Массу порции передаём, чтобы бэкенд вернул цену ТОЙ ЖЕ порции, что увидит
  // покупатель, — сравнивать старую цену с ценой за килограмм бессмысленно.
  const portion = Number(data?.portionMassG);
  const query = Number.isFinite(portion) ? `?portionMassG=${portion}` : '';
  let product: ReplicaProduct;
  try {
    product = (await client.request(
      'GET',
      `/admin/replica/products/${encodeURIComponent(uuid)}${query}`,
    )) as ReplicaProduct;
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
    return;
  }
  // Сюда доходим только с живым ответом моста: проверка цены не должна
  // блокировать сохранение из-за сетевого сбоя (то же fail-open, что у uuid).
  const problem = oldPriceProblem(data ?? {}, product);
  if (problem) throw new errors.ApplicationError(problem);
}

/**
 * Сгенерировать .avif и .webp рядом с загруженным изображением и всеми его
 * форматами (thumbnail/small/medium/large). nginx выбирает формат по Accept:
 * avif → webp → исходный jpg/png (см. conf.d/altai-perf.conf на сервере).
 * Ленивый require('sharp') и полный try/catch: сбой оптимизации никогда не
 * должен ронять загрузку файла в админке.
 *
 * Качество подобрано по замеру всей витрины (PSNR к оригиналу ≥ 38 дБ —
 * граница, за которой разница на фотографии глазом не ловится): avif 52,
 * webp 80. effort у avif занижен против разовой пакетной пережимки: обработчик
 * ждут в админке, а выигрыш последних ступеней — единицы процентов.
 */
async function genImageVariants(
  strapi: Core.Strapi,
  result: UploadFileResult | undefined,
): Promise<void> {
  const names = imageTargets(result);
  if (names.length === 0) return;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sharp = require('sharp') as typeof import('sharp');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const path = require('node:path') as typeof import('node:path');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('node:fs') as typeof import('node:fs');
    const dir = path.join(process.cwd(), 'public', 'uploads');

    for (const name of names) {
      const src = path.join(dir, name);
      if (!fs.existsSync(src)) continue;
      if (!fs.existsSync(src + '.avif')) {
        await sharp(src)
          .avif({ quality: 52, effort: 4, chromaSubsampling: '4:4:4' })
          .toFile(src + '.avif');
      }
      if (!fs.existsSync(src + '.webp')) {
        await sharp(src).webp({ quality: 80, effort: 5 }).toFile(src + '.webp');
      }
    }
  } catch (e) {
    strapi.log.warn(`[upload] avif/webp не сгенерированы: ${(e as Error).message}`);
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
          event.params?.data as ProductData | undefined,
        );
      },
      async beforeUpdate(event) {
        await assertEvotorUuidExists(
          strapi,
          event.params?.data as ProductData | undefined,
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

    // AVIF/WebP для загруженных картинок товаров (perf 11.08.2026). nginx
    // отдаёт лёгкий формат по заголовку Accept — но файл должен существовать.
    // Strapi по умолчанию генерит только jpg/png форматы (thumbnail/small/
    // medium/large); здесь рядом с каждым кладём .avif (−~60% веса) и .webp
    // (запасной для Safari до 16). Для БУДУЩИХ товаров: загрузил фото —
    // облегчённые версии появились сами. Fail-safe: ошибка не ломает загрузку.
    strapi.db.lifecycles.subscribe({
      models: ['plugin::upload.file'],
      async afterCreate(event) {
        await genImageVariants(strapi, event.result);
      },
      async afterUpdate(event) {
        await genImageVariants(strapi, event.result);
      },
    });

    // Подсказки под полями формы (запрос ПМ). Пишутся ПОСЛЕ bootstrap'а
    // плагинов — content-manager к этому моменту уже засинхронил конфигурацию,
    // иначе наши тексты затёрло бы дефолтами.
    await applyFieldHints(strapi);

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
