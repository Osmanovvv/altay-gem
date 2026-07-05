import type { LucideIcon } from "lucide-react";
import { Gift, Sparkles, Truck, Cookie } from "lucide-react";
import { HOME_ASSETS } from "./homeAssets";

export interface Promo {
  id: string;
  title: string;
  description: string;
  ctaText: string;
  ctaLink: string;
  bgColor: string;
  accentColor: string;
  icon: LucideIcon;
  image: string;
  imageAlt: string;
  badge?: string;
  /** Long description shown on the promo detail page (paragraphs). */
  details?: string[];
  /** Conditions list (bullets). */
  terms?: string[];
  /** Promo code displayed in a prominent box. */
  promoCode?: string;
  /** Discount applied in the cart when promoCode is entered (percent off matching items). */
  discountPercent?: number;
  /** Linked catalog category id (matches src/data/categories.ts). */
  categoryFilter?: string;
  /** Product ids participating in the promo. */
  productIds?: string[];
  /** Validity label, e.g. "до 30 июня 2026". */
  validUntil?: string;
}

export const PROMOS: Promo[] = [
  {
    id: "honey-week",
    title: "Медовая неделя",
    description:
      "Скидка 15% на весь мёд по промокоду HONEY15. До конца недели.",
    ctaText: "За мёдом",
    ctaLink: "/catalog",
    bgColor: "linear-gradient(120deg, #8a5a1a 0%, #c8963e 100%)",
    accentColor: "#faf7f2",
    icon: Cookie,
    image: HOME_ASSETS.honeyJars.src,
    imageAlt: "Банки собственного мёда для акции Медовая неделя",
    badge: "Промокод HONEY15",
    promoCode: "HONEY15",
    discountPercent: 15,
    categoryFilter: "honey",
    validUntil: "до конца недели",
    details: [
      "Раз в сезон мы привозим свежий сбор мёда напрямую с пасек предгорий Алтая - и делимся им со скидкой 15% на весь раздел «Мёд».",
      "В акции участвуют все сорта: разнотравье, гречишный, акациевый и редкий мёд с пергой. Каждая банка проходит лабораторный контроль на чистоту и натуральность.",
      "Скидка применяется автоматически при вводе промокода в корзине.",
    ],
    terms: [
      "Скидка 15% на все товары категории «Мёд»",
      "Промокод действует один раз на пользователя",
      "Не суммируется с другими акциями",
      "Действует на самовывоз и доставку",
    ],
    productIds: ["p01", "p02", "p03", "p04"],
  },
  {
    id: "gift-sets",
    title: "Подарочные наборы",
    description:
      "Готовые наборы со скидкой 20% от 1500 ₽. Красивая упаковка в подарок.",
    ctaText: "Смотреть наборы",
    ctaLink: "/catalog",
    bgColor: "linear-gradient(120deg, #1f4a30 0%, #3b6e4a 100%)",
    accentColor: "#e8b44f",
    icon: Gift,
    image: HOME_ASSETS.gifts.src,
    imageAlt: "Подарочный набор с алтайским мёдом и травяным чаем",
    badge: "-20%",
    promoCode: "GIFT20",
    discountPercent: 20,
    categoryFilter: "gifts",
    validUntil: "до 30 июня 2026",
    details: [
      "Готовые подарочные наборы - самое простое решение, когда хочется удивить близких или коллег. Каждый собран вручную и упакован в фирменную крафт-коробку с лентой.",
      "В состав входят бестселлеры: мёд, травяные чаи, бальзамы, кедровые орехи. Можно дополнить открыткой с рукописным пожеланием.",
      "Скидка 20% действует на все наборы стоимостью от 1500 ₽.",
    ],
    terms: [
      "Скидка 20% на всю категорию «Подарочные наборы»",
      "Минимальная сумма набора - 1500 ₽",
      "Фирменная упаковка включена в стоимость",
      "Действует при заказе онлайн и в магазинах",
    ],
    productIds: ["p24", "p25", "p26"],
  },
  {
    id: "free-delivery",
    title: "Бесплатная доставка",
    description:
      "По Новосибирску при заказе от 3000 ₽. Привезём в день заказа.",
    ctaText: "Условия доставки",
    ctaLink: "/delivery",
    bgColor: "linear-gradient(120deg, #1a3028 0%, #2d5a3f 100%)",
    accentColor: "#e8b44f",
    icon: Truck,
    image: HOME_ASSETS.storeShelf.src,
    imageAlt: "Упакованные товары магазина Жемчужина Алтая для доставки",
    badge: "От 3000 ₽",
    validUntil: "действует постоянно",
    details: [
      "Бесплатно доставим заказ от 3000 ₽ в любую точку Новосибирска. При оформлении до 14:00 - привезём в этот же день, после - на следующий.",
      "Курьер приедет в удобный интервал, согласованный по телефону. Скоропортящиеся товары перевозятся в охлаждённой упаковке.",
      "Для заказов меньше 3000 ₽ доставка составляет от 300 ₽ в зависимости от района.",
    ],
    terms: [
      "Минимальная сумма заказа - 3000 ₽",
      "Зона: в пределах Новосибирска",
      "Доставка в день заказа при оформлении до 14:00",
      "Скоропортящиеся товары - только по Новосибирску",
    ],
    productIds: ["p05", "p09", "p15", "p18"],
  },
  {
    id: "new-season",
    title: "Новинки сезона",
    description:
      "Свежие травяные сборы урожая 2026 - алтайское лето в каждой пачке.",
    ctaText: "Открыть новинки",
    ctaLink: "/catalog",
    bgColor: "linear-gradient(120deg, #6b2e5a 0%, #c46aa0 100%)",
    accentColor: "#faf7f2",
    icon: Sparkles,
    image: HOME_ASSETS.teaHerbs.src,
    imageAlt: "Свежий урожай алтайских травяных сборов",
    badge: "Новое",
    categoryFilter: "tea",
    validUntil: "пока есть в наличии",
    details: [
      "Свежий урожай 2026 уже на полках: иван-чай ручной ферментации, сборы «Горный воздух» и «Ягодный лес», чага и редкие алтайские травы.",
      "Все сборы заготовлены в экологически чистых районах Республики Алтай и обработаны по традиционной технологии - без потери аромата и полезных свойств.",
      "Количество ограничено - до следующего сезона. Берите про запас, чаи отлично хранятся в герметичной упаковке.",
    ],
    terms: [
      "Свежий сбор урожая 2026 года",
      "Срок годности - 24 месяца с даты упаковки",
      "Ограниченные партии - пока есть в наличии",
    ],
    productIds: ["p05", "p06", "p07", "p08"],
  },
];
