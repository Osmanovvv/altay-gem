import type { Core } from '@strapi/strapi';

/**
 * Подсказки под полями в форме админки (запрос ПМ: «за что отвечает поле»).
 *
 * Почему не в schema.json: ключ `config.metadatas` там читается, но
 * ПРОИГРЫВАЕТ значению из БД (в `strapi_core_store_settings` у существующих
 * полей уже лежит `description: ""`, и merge оставляет пустую строку), плюс
 * Content-Type Builder молча стирает `config` при любой правке типа через
 * админку. Поэтому пишем конфигурацию Content Manager явно на bootstrap —
 * идемпотентно и переживая передеплой.
 *
 * Тексты держим здесь же, рядом с кодом: это тот же текст, что в документе
 * «ИНСТРУКЦИЯ — админка (для контент-менеджера).md».
 */

type FieldHint = { label?: string; description?: string };
type ModelHints = Record<string, FieldHint>;

export const CONTENT_TYPE_HINTS: Record<string, ModelHints> = {
  'api::product.product': {
    adminName: {
      label: 'Название (из Эвотора)',
      description:
        'Служебное имя для поиска в списке. На витрине показывается название из Эвотора.',
    },
    evotorUuid: {
      label: 'Код товара в Эвоторе',
      description:
        'Связь с кассой: по нему подтягиваются цена и остаток. НЕ МЕНЯТЬ — товар потеряет остаток и пропадёт с витрины.',
    },
    slug: {
      label: 'Адрес страницы',
      description:
        'Адрес товара на сайте латиницей. Менять не стоит: старые ссылки перестанут работать.',
    },
    visible: {
      label: 'Показывать на сайте',
      description: 'Снимите галочку, чтобы убрать товар с витрины (из системы он не удалится).',
    },
    category: {
      label: 'Категория',
      description:
        'Обязательно для показа: без категории товар на витрину не попадёт.',
    },
    subcategory: {
      label: 'Подкатегория',
      description: 'Текстом, например «Твёрдые сыры». Используется фильтром в каталоге.',
    },
    photos: {
      label: 'Фотографии',
      description: 'Первая фотография — главная, она видна в каталоге.',
    },
    shortDescription: {
      label: 'Краткое описание',
      description:
        'Серый текст под названием в каталоге. Видно 2 строки, дальше — троеточие.',
    },
    fullDescription: {
      label: 'Полное описание',
      description: 'Текст на странице товара, можно с форматированием.',
    },
    characteristics: {
      label: 'Характеристики',
      description: 'Пары «название — значение»: состав, срок годности, производитель.',
    },
    isHit: { label: 'Хит', description: 'Плашка «Хит» на карточке товара.' },
    isNew: { label: 'Новинка', description: 'Плашка «Новинка» на карточке товара.' },
    isPerishable: {
      label: 'Скоропортящийся',
      description:
        'Такой товар нельзя отправить по России: остаются самовывоз и курьер по Новосибирску.',
    },
    oldPriceRub: {
      label: 'Старая цена, ₽',
      description:
        'Перечёркнутая цена и процент скидки. Показывается, ТОЛЬКО пока больше текущей: подняли цену в Эвоторе выше — скидка сама исчезнет. Для ВЕСОВЫХ указывайте цену за порцию (за 100 г), а не за килограмм. Указывайте цену, которая действительно стояла раньше.',
    },
    portionMassG: {
      label: 'Масса порции, г',
      description:
        'Только для весовых товаров: сайт продаёт их порциями (например, сыр по 100 г).',
    },
    deliveryWeightG: {
      label: 'Вес для доставки, г',
      description:
        'ОБЯЗАТЕЛЬНО для штучных товаров, которые едут по России: по нему считается стоимость доставки. Весовым (кг) не нужен — им берётся масса порции. Характеристика «вес/объём» на расчёт НЕ влияет, это разные поля. Не заполнить нельзя: без веса сайт откажется считать доставку по России и покупатель этот товар туда не закажет.',
    },
    heroProduct: {
      label: 'Товар дня на главной',
      description:
        'Крупный блок на главной. Может быть только один: при установке снимется у остальных.',
    },
  },

  'api::category.category': {
    name: { label: 'Название', description: 'Название категории на сайте.' },
    slug: { label: 'Адрес страницы', description: 'Адрес категории латиницей.' },
    description: { label: 'Описание', description: 'Текст вверху страницы категории.' },
    photo: { label: 'Картинка', description: 'Плитка категории на главной странице.' },
    sortOrder: {
      label: 'Порядок',
      description: 'Чем меньше число, тем выше категория в списке.',
    },
    subcategories: {
      label: 'Подкатегории',
      description: 'Список для фильтра слева в каталоге.',
    },
    priorityInMax: {
      label: 'Приоритет в MAX',
      description: 'Показывать категорию выше в мини-приложении MAX.',
    },
    products: {
      label: 'Товары',
      description: 'Обычно проще указывать категорию в карточке товара.',
    },
  },

  'api::promocode.promocode': {
    code: {
      label: 'Код',
      description: 'То, что вводит покупатель в корзине (например, ALTAI10). Регистр не важен.',
    },
    discountType: { label: 'Тип скидки', description: 'Сейчас поддерживается только процент.' },
    discountPercent: { label: 'Скидка, %', description: 'От 1 до 100.' },
    categoryRestriction: {
      label: 'Категории (пусто = на всё)',
      description:
        'ОСТАВЬТЕ ПУСТЫМ — скидка на всю корзину. Выберите категории — скидка только на товары этих категорий.',
    },
    validFrom: { label: 'Действует с', description: 'Пусто — без ограничения.' },
    validTo: { label: 'Действует по', description: 'Пусто — без ограничения.' },
    usageLimit: {
      label: 'Лимит применений',
      description: 'Сколько раз всего можно использовать код. Пусто — без ограничения.',
    },
    active: {
      label: 'Активен',
      description: 'Снимите галочку — код перестанет работать сразу.',
    },
  },

  'api::promo.promo': {
    title: { label: 'Заголовок', description: 'Название акции на сайте.' },
    slug: { label: 'Адрес страницы', description: 'Адрес страницы акции латиницей.' },
    description: { label: 'Краткое описание', description: 'Текст в списке акций.' },
    detailText: { label: 'Полный текст', description: 'Текст на странице акции.' },
    conditions: {
      label: 'Условия',
      description:
        'ТОЛЬКО ТЕКСТ для покупателя — сайт эти условия не проверяет. Скидку считает промокод: процент и категория. Не пишите здесь «от 3000 ₽» и «бесплатная доставка» — код сработает всё равно. Годится: «Скидка 10% на мёд», «До 31 декабря».',
    },
    promocode: {
      label: 'Промокод',
      description: 'Код, который увидит покупатель на странице акции. Скидку задаёт сам промокод.',
    },
    category: {
      label: 'Категории акции',
      description:
        'Можно выбрать несколько. Кнопка «В каталог» на странице акции ведёт в первую из них.',
    },
    products: {
      label: 'Товары акции',
      description: 'Конкретные товары — можно выбрать несколько.',
    },
    validFrom: { label: 'Показывать с', description: 'Пусто — сразу.' },
    validTo: { label: 'Показывать по', description: 'Пусто — бессрочно.' },
    image: { label: 'Картинка', description: 'Используется на странице акции и в баннере.' },
    active: { label: 'Активна', description: 'Снимите галочку — акция скроется с сайта.' },
  },

  'api::banner.banner': {
    title: { label: 'Заголовок', description: 'Крупный текст на баннере.' },
    badge: { label: 'Плашка', description: 'Маленькая надпись над заголовком: «Новинка», «−20%».' },
    description: { label: 'Описание', description: 'Текст под заголовком.' },
    buttonText: { label: 'Надпись на кнопке', description: 'По умолчанию — «Подробнее».' },
    image: {
      label: 'Картинка',
      description: 'Фон баннера. Горизонтальная, лучше от 1600 px по ширине.',
    },
    linkPromo: { label: 'Ведёт на акцию', description: 'Куда переходит покупатель по баннеру.' },
    linkCategory: {
      label: 'Или на категорию',
      description: 'Используется, если акция не выбрана.',
    },
    sortOrder: { label: 'Порядок', description: 'Меньше число — раньше в карусели.' },
    active: { label: 'Показывать', description: 'Выключатель баннера.' },
    showFrom: { label: 'Показывать с', description: 'Баннер появится сам в эту дату.' },
    showTo: { label: 'Показывать по', description: 'Баннер сам исчезнет после этой даты.' },
  },

  'api::review.review': {
    author: { label: 'Автор', description: 'Имя, которое увидят на сайте.' },
    date: { label: 'Дата отзыва', description: 'Показывается на карточке отзыва.' },
    rating: { label: 'Оценка', description: 'От 1 до 5 — рисуется звёздочками.' },
    text: { label: 'Текст отзыва', description: 'Сам отзыв.' },
    source: { label: 'Источник', description: 'Показывается плашкой: 2ГИС / Яндекс / другое.' },
    visible: {
      label: 'Показывать',
      description: 'Средний рейтинг на сайте считается только по видимым отзывам.',
    },
  },

  'api::site-setting.site-setting': {
    apiarySection: { label: 'Блок «О пасеке»', description: 'Секция на главной странице.' },
    historySection: { label: 'Блок «История»', description: 'Секция на главной странице.' },
    advantages: { label: 'Преимущества', description: 'Плитки «почему мы» на главной.' },
    contacts: {
      label: 'Контакты',
      description: 'Телефон и e-mail. Пустой телефон — кнопка «Позвонить» просто не показывается.',
    },
    storePoints: {
      label: 'Магазины',
      description:
        'Адреса, часы работы, ссылки на карты. Отсюда берутся плашки на главной и в «О нас».',
    },
    socialLinks: { label: 'Соцсети', description: 'Ссылки в подвале сайта.' },
    requisites: { label: 'Реквизиты', description: 'ИНН, ОГРНИП — показываются в подвале.' },
    privacyPolicy: {
      label: 'Политика обработки ПД',
      description: 'Текст страницы /privacy. Обязателен для приёма заказов.',
    },
    reviewYandexUrl: {
      label: 'Ссылка «Оставить отзыв в Яндексе»',
      description: 'Пусто — кнопка ведёт на поиск магазина в Яндекс.Картах.',
    },
    review2gisUrl: {
      label: 'Ссылка «Оставить отзыв в 2ГИС»',
      description: 'Пусто — кнопка ведёт на поиск магазина в 2ГИС.',
    },
    yandexReviewsWidgetUrl: {
      label: 'Виджет отзывов Яндекса',
      description: 'Ссылка на виджет, если нужно встроить его на страницу отзывов.',
    },
    trust: { label: 'Строка доверия', description: 'Полоса под шапкой сайта.' },
  },

  'api::delivery-tariff.delivery-tariff': {
    courierNskPriceRub: {
      label: 'Курьер по Новосибирску, ₽',
      description: 'Стоимость доставки курьером по городу.',
    },
    freeDeliveryThresholdRub: {
      label: 'Бесплатно от суммы, ₽',
      description: 'От этой суммы заказа курьер по городу бесплатный.',
    },
    russiaWeightTiers: {
      label: 'Тарифы по России (вес → цена)',
      description:
        'На сайте цифры не публикуются, но по ним считается стоимость при оформлении заказа.',
    },
    termsText: { label: 'Условия доставки', description: 'Текст на странице «Доставка».' },
  },
};

interface EditMeta {
  label?: string;
  description?: string;
  [k: string]: unknown;
}
interface FieldMeta {
  edit?: EditMeta;
  list?: Record<string, unknown>;
}
interface CmConfiguration {
  uid?: string;
  metadatas?: Record<string, FieldMeta>;
  [k: string]: unknown;
}
interface CmService {
  findConfiguration: (ct: { uid: string }) => Promise<CmConfiguration>;
  updateConfiguration: (
    ct: { uid: string },
    next: CmConfiguration,
  ) => Promise<CmConfiguration>;
}

/**
 * Проставляет подсказки в конфигурацию Content Manager.
 * Идемпотентно: если тексты уже совпадают — запись не делается.
 * Fail-open: любая ошибка логируется и НЕ роняет Strapi (подсказки —
 * приятная мелочь, из-за них админка падать не должна).
 */
export async function applyFieldHints(strapi: Core.Strapi): Promise<void> {
  let updated = 0;
  for (const [uid, hints] of Object.entries(CONTENT_TYPE_HINTS)) {
    try {
      const contentType = strapi.contentTypes[uid as never] as
        | { uid: string; attributes: Record<string, unknown> }
        | undefined;
      if (!contentType) {
        strapi.log.warn(`[hints] тип ${uid} не найден — пропуск`);
        continue;
      }
      const service = strapi
        .plugin('content-manager')
        .service('content-types') as unknown as CmService;

      const current = await service.findConfiguration({ uid });
      const metadatas: Record<string, FieldMeta> = { ...(current.metadatas ?? {}) };
      let changed = false;

      for (const [field, hint] of Object.entries(hints)) {
        // Поля могло не остаться в схеме (переименовали/удалили) — молча пропускаем:
        // неизвестный ключ в metadatas отбрасывается валидатором Strapi.
        // (Object.hasOwn недоступен при target'е Strapi — используем prototype-вызов.)
        if (!Object.prototype.hasOwnProperty.call(contentType.attributes, field))
          continue;
        const meta = metadatas[field];
        if (!meta?.edit) continue;
        const nextEdit: EditMeta = { ...meta.edit };
        if (hint.description !== undefined && nextEdit.description !== hint.description) {
          nextEdit.description = hint.description;
          changed = true;
        }
        if (hint.label !== undefined && nextEdit.label !== hint.label) {
          nextEdit.label = hint.label;
          changed = true;
        }
        metadatas[field] = { ...meta, edit: nextEdit };
      }

      if (!changed) continue;
      // uid в теле не передаём: сервис берёт его из первого аргумента.
      const { uid: _omit, ...rest } = current;
      await service.updateConfiguration({ uid }, { ...rest, metadatas });
      updated += 1;
    } catch (e) {
      strapi.log.warn(
        `[hints] подсказки для ${uid} не применились: ${(e as Error).message}`,
      );
    }
  }
  if (updated > 0) {
    strapi.log.info(`[hints] подсказки полей обновлены для моделей: ${updated}`);
  }
}
