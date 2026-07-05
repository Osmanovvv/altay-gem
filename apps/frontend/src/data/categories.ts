import type { LucideIcon } from "lucide-react";
import {
  Cookie,
  Drumstick,
  Flower2,
  Gift,
  Leaf,
  Milk,
  Sparkles,
  Droplet,
} from "lucide-react";
import { HOME_ASSETS } from "./homeAssets";

export interface Category {
  id: string;
  name: string;
  slug: string;
  icon: LucideIcon;
  description: string;
  subcategories: string[];
  gradient: string;
  image: string;
  imageAlt: string;
}

export const CATEGORIES: Category[] = [
  {
    id: "honey",
    name: "Мёд",
    slug: "honey",
    icon: Cookie,
    description: "Разнотравье, гречишный, акациевый и таёжный мёд прямо с пасек.",
    subcategories: ["Разнотравье", "Гречишный", "Акациевый", "С пергой"],
    gradient: "linear-gradient(135deg, #8a5a1a 0%, #c8963e 100%)",
    image: HOME_ASSETS.honeycomb.src,
    imageAlt: "Соты и продукты пчеловодства собственной пасеки",
  },
  {
    id: "tea",
    name: "Чаи и травяные сборы",
    slug: "tea",
    icon: Leaf,
    description: "Иван-чай, горные сборы и ягодные купажи для каждого дня.",
    subcategories: ["Иван-чай", "Горные травы", "Ягодные", "Успокаивающие"],
    gradient: "linear-gradient(135deg, #1f4a30 0%, #3b6e4a 100%)",
    image: HOME_ASSETS.teaHerbs.src,
    imageAlt: HOME_ASSETS.teaHerbs.alt,
  },
  {
    id: "cheese",
    name: "Сыры",
    slug: "cheese",
    icon: Milk,
    description: "Фермерские сыры из свежего молока алтайских хозяйств.",
    subcategories: ["Твёрдые", "Полутвёрдые", "С плесенью", "Копчёные"],
    gradient: "linear-gradient(135deg, #b0903a 0%, #e8b44f 100%)",
    image: HOME_ASSETS.cheese.src,
    imageAlt: HOME_ASSETS.cheese.alt,
  },
  {
    id: "meat",
    name: "Мясные деликатесы",
    slug: "meat",
    icon: Drumstick,
    description: "Вяленые, копчёные и сыровяленые изделия из марала и оленя.",
    subcategories: ["Марал", "Оленина", "Колбасы", "Снеки"],
    gradient: "linear-gradient(135deg, #5a1f1a 0%, #a63d3d 100%)",
    image: HOME_ASSETS.maralDeli.src,
    imageAlt: HOME_ASSETS.maralDeli.alt,
  },
  {
    id: "cosmetics",
    name: "Натуральная косметика",
    slug: "cosmetics",
    icon: Flower2,
    description: "Кремы, маски и скрабы на основе алтайских трав и масел.",
    subcategories: ["Лицо", "Тело", "Волосы", "Мужская"],
    gradient: "linear-gradient(135deg, #6b2e5a 0%, #c46aa0 100%)",
    image: HOME_ASSETS.cosmetics.src,
    imageAlt: HOME_ASSETS.cosmetics.alt,
  },
  {
    id: "balms",
    name: "Бальзамы и масла",
    slug: "balms",
    icon: Droplet,
    description: "Кедровое, облепиховое масло и травяные бальзамы здоровья.",
    subcategories: ["Кедровое", "Облепиховое", "Бальзамы", "Настойки"],
    gradient: "linear-gradient(135deg, #2a4a1a 0%, #6e8a3b 100%)",
    image: HOME_ASSETS.balms.src,
    imageAlt: HOME_ASSETS.balms.alt,
  },
  {
    id: "pantohematogen",
    name: "Пантогематоген",
    slug: "pantohematogen",
    icon: Sparkles,
    description: "Продукция из пантов марала: сила и тонус сибирской тайги.",
    subcategories: ["Жидкий", "Капсулы", "Сиропы", "Концентраты"],
    gradient: "linear-gradient(135deg, #1a3028 0%, #2d5a3f 100%)",
    image: HOME_ASSETS.altaiPanorama.src,
    imageAlt: "Алтайские горы и тайга как источник пантовой продукции",
  },
  {
    id: "gifts",
    name: "Подарочные наборы",
    slug: "gifts",
    icon: Gift,
    description: "Готовые наборы в подарочной упаковке для близких и партнёров.",
    subcategories: ["До 2000 ₽", "До 5000 ₽", "Премиум", "Корпоративные"],
    gradient: "linear-gradient(135deg, #a67c2e 0%, #1a2a20 100%)",
    image: HOME_ASSETS.gifts.src,
    imageAlt: HOME_ASSETS.gifts.alt,
  },
];
