export type Badge = "Хит" | "Новинка" | "-15%" | "-20%";

export interface Product {
  id: string;
  name: string;
  category: string; // category id from categories.ts
  subcategory: string;
  price: number;
  oldPrice: number | null;
  unit: string;
  inStock: boolean;
  isPerishable: boolean;
  badges: Badge[];
  image: string; // gradient placeholder
  shortDescription: string;
}

const G = {
  honey: "linear-gradient(135deg, #c8963e 0%, #e8b44f 100%)",
  honeyDark: "linear-gradient(135deg, #8a5a1a 0%, #c8963e 100%)",
  tea: "linear-gradient(135deg, #1f4a30 0%, #3b6e4a 100%)",
  teaLight: "linear-gradient(135deg, #3b6e4a 0%, #6e8a3b 100%)",
  cheese: "linear-gradient(135deg, #d8b970 0%, #f0d99a 100%)",
  meat: "linear-gradient(135deg, #5a1f1a 0%, #a63d3d 100%)",
  cosmetics: "linear-gradient(135deg, #6b2e5a 0%, #c46aa0 100%)",
  balm: "linear-gradient(135deg, #2a4a1a 0%, #6e8a3b 100%)",
  panto: "linear-gradient(135deg, #1a3028 0%, #2d5a3f 100%)",
  gift: "linear-gradient(135deg, #a67c2e 0%, #1a2a20 100%)",
};

// Временные фото-плейсхолдеры до подключения реальных карточек из Эватора.
// Каждый URL визуально проверен (сюжет соответствует категории).
const P = {
  honeyGlow: "/img/stock/u-1587049352851-8d4e89133924.jpg",
  honeyJars: "/img/stock/u-1671548185843-3f50c6c1060b.jpg",
  honeycomb: "/img/stock/u-1558642452-9d2a7deb7f62.jpg",
  apiary: "/img/stock/u-1471943311424-646960669fbc.jpg",
  teapot: "/img/stock/u-1564890369478-c89ca6d9cde9.jpg",
  herbalCup: "/img/stock/u-1576092768241-dec231879fc3.jpg",
  herbs: "/img/stock/u-1515586000433-45406d8e6662.jpg",
  teaCup: "/img/stock/u-1544787219-7f47ccb76574.jpg",
  cheeseFigs: "/img/stock/u-1452195100486-9cc805987862.jpg",
  cheeseWheel: "/img/stock/u-1486297678162-eb2a19b0a32d.jpg",
  cheeseStall: "/img/stock/u-1552767059-ce182ead6c1b.jpg",
  meatDeli: "/img/stock/u-1529692236671-f1f6cf9683ba.jpg",
  creamSet: "/img/stock/u-1601049676869-702ea24cfd58.jpg",
  soapBars: "/img/stock/u-1600857544200-b2f666a9a2ec.jpg",
  cosmetics: "/img/stock/u-1612817288484-6f916006741a.jpg",
  amberBottle: "/img/stock/u-1608571423902-eed4a5ad8108.jpg",
  oilBottles: "/img/stock/u-1471193945509-9ad0617afabf.jpg",
  giftGold: "/img/stock/u-1607344645866-009c320b63e0.jpg",
};

// Фото поверх градиента: градиент остаётся видимым, пока грузится картинка.
const img = (photo: string, fallback: string) =>
  `url(${photo}) center/cover no-repeat, ${fallback}`;

export const PRODUCTS: Product[] = [
  // Мёд
  { id: "p01", name: "Мёд разнотравье горный", category: "honey", subcategory: "Разнотравье", price: 890, oldPrice: null, unit: "500 г", inStock: true, isPerishable: false, badges: ["Хит"], image: img(P.honeyGlow, G.honey), shortDescription: "Собран на пасеках предгорий Алтая" },
  { id: "p02", name: "Мёд гречишный", category: "honey", subcategory: "Гречишный", price: 950, oldPrice: 1100, unit: "500 г", inStock: true, isPerishable: false, badges: ["-15%"], image: img(P.honeyJars, G.honeyDark), shortDescription: "Тёмный, с насыщенным вкусом" },
  { id: "p03", name: "Мёд акациевый", category: "honey", subcategory: "Акациевый", price: 1180, oldPrice: null, unit: "500 г", inStock: true, isPerishable: false, badges: [], image: img(P.honeycomb, G.honey), shortDescription: "Светлый, долго не кристаллизуется" },
  { id: "p04", name: "Мёд с пергой", category: "honey", subcategory: "С пергой", price: 1450, oldPrice: null, unit: "300 г", inStock: false, isPerishable: false, badges: ["Новинка"], image: img(P.apiary, G.honeyDark), shortDescription: "Богат витаминами и аминокислотами" },

  // Чаи
  { id: "p05", name: "Иван-чай ферментированный", category: "tea", subcategory: "Иван-чай", price: 380, oldPrice: null, unit: "100 г", inStock: true, isPerishable: false, badges: ["Хит"], image: img(P.teapot, G.tea), shortDescription: "Классический алтайский иван-чай" },
  { id: "p06", name: "Сбор Горный воздух", category: "tea", subcategory: "Горные травы", price: 420, oldPrice: 490, unit: "80 г", inStock: true, isPerishable: false, badges: ["-15%"], image: img(P.herbs, G.teaLight), shortDescription: "Чабрец, душица, зверобой" },
  { id: "p07", name: "Чага алтайская", category: "tea", subcategory: "Горные травы", price: 450, oldPrice: null, unit: "100 г", inStock: true, isPerishable: false, badges: [], image: img(P.herbalCup, G.tea), shortDescription: "Берёзовый гриб с антиоксидантами" },
  { id: "p08", name: "Сбор Ягодный лес", category: "tea", subcategory: "Ягодные", price: 360, oldPrice: null, unit: "80 г", inStock: true, isPerishable: false, badges: ["Новинка"], image: img(P.teaCup, G.teaLight), shortDescription: "Брусника, малина, смородина" },

  // Сыры
  { id: "p09", name: "Сыр Алтайский выдержанный", category: "cheese", subcategory: "Твёрдые", price: 620, oldPrice: 730, unit: "300 г", inStock: true, isPerishable: true, badges: ["-15%", "Хит"], image: img(P.cheeseFigs, G.cheese), shortDescription: "Выдержка 6 месяцев" },
  { id: "p10", name: "Сыр Качотта с травами", category: "cheese", subcategory: "Полутвёрдые", price: 490, oldPrice: null, unit: "250 г", inStock: true, isPerishable: true, badges: [], image: img(P.cheeseWheel, G.cheese), shortDescription: "Мягкий полутвёрдый сыр" },
  { id: "p11", name: "Сыр копчёный Чечил", category: "cheese", subcategory: "Копчёные", price: 380, oldPrice: null, unit: "200 г", inStock: false, isPerishable: true, badges: [], image: img(P.cheeseStall, G.cheese), shortDescription: "Натуральное копчение на ольхе" },

  // Мясные деликатесы
  { id: "p12", name: "Колбаса из марала сыровяленая", category: "meat", subcategory: "Марал", price: 1250, oldPrice: null, unit: "200 г", inStock: true, isPerishable: false, badges: ["Хит"], image: img(P.meatDeli, G.meat), shortDescription: "Без консервантов и красителей" },
  { id: "p13", name: "Вяленая оленина", category: "meat", subcategory: "Оленина", price: 980, oldPrice: 1150, unit: "150 г", inStock: true, isPerishable: false, badges: ["-15%"], image: img(P.meatDeli, G.meat), shortDescription: "Классический рецепт" },
  { id: "p14", name: "Снеки из марала", category: "meat", subcategory: "Снеки", price: 540, oldPrice: null, unit: "80 г", inStock: true, isPerishable: false, badges: ["Новинка"], image: img(P.meatDeli, G.meat), shortDescription: "Перекус на любой случай" },

  // Косметика
  { id: "p15", name: "Крем для лица облепиховый", category: "cosmetics", subcategory: "Лицо", price: 720, oldPrice: null, unit: "50 мл", inStock: true, isPerishable: false, badges: ["Хит"], image: img(P.creamSet, G.cosmetics), shortDescription: "Питание и восстановление" },
  { id: "p16", name: "Скраб для тела медовый", category: "cosmetics", subcategory: "Тело", price: 540, oldPrice: 640, unit: "200 мл", inStock: true, isPerishable: false, badges: ["-15%"], image: img(P.soapBars, G.cosmetics), shortDescription: "Мёд и кедровая скорлупа" },
  { id: "p17", name: "Шампунь травяной", category: "cosmetics", subcategory: "Волосы", price: 480, oldPrice: null, unit: "250 мл", inStock: true, isPerishable: false, badges: [], image: img(P.cosmetics, G.cosmetics), shortDescription: "Без сульфатов и парабенов" },

  // Бальзамы и масла
  { id: "p18", name: "Бальзам Сила Алтая", category: "balms", subcategory: "Бальзамы", price: 780, oldPrice: null, unit: "100 мл", inStock: true, isPerishable: false, badges: ["Хит"], image: img(P.amberBottle, G.balm), shortDescription: "27 трав в одной бутылке" },
  { id: "p19", name: "Масло кедровое холодного отжима", category: "balms", subcategory: "Кедровое", price: 590, oldPrice: null, unit: "250 мл", inStock: true, isPerishable: false, badges: ["Новинка"], image: img(P.oilBottles, G.balm), shortDescription: "Первый холодный отжим" },
  { id: "p20", name: "Масло облепиховое", category: "balms", subcategory: "Облепиховое", price: 520, oldPrice: 620, unit: "200 мл", inStock: true, isPerishable: false, badges: ["-15%"], image: img(P.oilBottles, G.balm), shortDescription: "Богато каротиноидами" },

  // Пантогематоген
  { id: "p21", name: "Пантогематоген классический", category: "pantohematogen", subcategory: "Жидкий", price: 1100, oldPrice: 1380, unit: "50 мл", inStock: true, isPerishable: false, badges: ["-20%"], image: img(P.amberBottle, G.panto), shortDescription: "Сила сибирской тайги" },
  { id: "p22", name: "Пантогематоген капсулы", category: "pantohematogen", subcategory: "Капсулы", price: 1450, oldPrice: null, unit: "60 шт", inStock: true, isPerishable: false, badges: ["Хит"], image: img(P.amberBottle, G.panto), shortDescription: "Удобный формат приёма" },
  { id: "p23", name: "Сироп с пантами и шиповником", category: "pantohematogen", subcategory: "Сиропы", price: 890, oldPrice: null, unit: "200 мл", inStock: false, isPerishable: false, badges: ["Новинка"], image: img(P.herbalCup, G.panto), shortDescription: "Натуральный иммуномодулятор" },

  // Подарочные наборы
  { id: "p24", name: "Подарочный набор Премиум", category: "gifts", subcategory: "Премиум", price: 3200, oldPrice: null, unit: "5 предметов", inStock: true, isPerishable: false, badges: ["Хит"], image: img(P.giftGold, G.gift), shortDescription: "Мёд, чай, бальзам, орехи, конфеты" },
  { id: "p25", name: "Набор Алтайское утро", category: "gifts", subcategory: "До 2000 ₽", price: 1850, oldPrice: 2100, unit: "3 предмета", inStock: true, isPerishable: false, badges: ["-15%"], image: img(P.honeyJars, G.gift), shortDescription: "Мёд, иван-чай, кедровые орехи" },
  { id: "p26", name: "Набор Сила гор", category: "gifts", subcategory: "До 5000 ₽", price: 4200, oldPrice: null, unit: "4 предмета", inStock: true, isPerishable: false, badges: ["Новинка"], image: img(P.giftGold, G.gift), shortDescription: "Пантогематоген, бальзамы, мёд" },
];

export const PRODUCT_COUNTS: Record<string, number> = PRODUCTS.reduce(
  (acc, p) => {
    acc[p.category] = (acc[p.category] || 0) + 1;
    return acc;
  },
  {} as Record<string, number>,
);
