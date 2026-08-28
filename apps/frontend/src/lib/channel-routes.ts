/**
 * Куда ведут ссылки в зависимости от канала — сайт или мини-приложение MAX.
 *
 * Главную мини-аппа собирают ТЕ ЖЕ секции, что и главную сайта (герой,
 * категории, хиты, акции). Внутри у них ссылки на «/catalog» и «/product/...».
 * Если оставить их как есть, покупатель, нажав на категорию внутри MAX,
 * уходит на обычный сайт: пропадает нижняя панель вкладок и вернуться в
 * приложение нечем.
 *
 * Возвращаем именно литералы, а не собранную строку: так `to` у Link остаётся
 * типизированным, и несуществующий маршрут не пройдёт проверку типов.
 */

export type Channel = "site" | "max";

export function catalogTo(channel: Channel): "/catalog" | "/max/catalog" {
  return channel === "max" ? "/max/catalog" : "/catalog";
}

export function productTo(channel: Channel): "/product/$slug" | "/max/product/$slug" {
  return channel === "max" ? "/max/product/$slug" : "/product/$slug";
}

/**
 * Своей страницы акций у мини-аппа пока нет, поэтому «Акции» ведут в каталог.
 * Замена осознанная и закреплена тестом: появится /max/promo — тест упадёт.
 */
export function promoTo(channel: Channel): "/promo" | "/max/catalog" {
  return channel === "max" ? "/max/catalog" : "/promo";
}

/**
 * Полный список переходов — по нему тест проверяет общее правило: в канале max
 * ни одна ссылка не выходит за пределы /max. Добавили новый переход — впишите
 * сюда, иначе он останется без этой проверки.
 */
export const CHANNEL_LINKS: Array<(c: Channel) => string> = [catalogTo, productTo, promoTo];

/** Ссылка баннера из админки: либо на акцию, либо на категорию каталога. */
export type BannerLink = { type: "promo" | "category"; slug: string } | null;

export type BannerLinkProps =
  | { to: "/promo/$slug"; params: { slug: string } }
  | { to: "/catalog"; search: { category?: string } }
  | { to: "/max/catalog"; search: { category?: string } };

/**
 * Куда ведёт баннер промо-карусели. Вынесено отдельно от простых переходов,
 * потому что тут не только адрес: у страницы акции параметр в пути, а у
 * каталога — фильтр в строке запроса, и перепутать их нельзя.
 *
 * В мини-аппе своей страницы акции нет, поэтому такой баннер ведёт в каталог.
 * Раньше он уводил на «/promo/...» — то есть из приложения прямо на сайт.
 */
export function bannerLinkProps(channel: Channel, link: BannerLink): BannerLinkProps {
  if (channel === "max") {
    return {
      to: "/max/catalog",
      search: link?.type === "category" ? { category: link.slug } : {},
    };
  }
  if (link?.type === "promo") {
    return { to: "/promo/$slug", params: { slug: link.slug } };
  }
  return { to: "/catalog", search: link ? { category: link.slug } : {} };
}
