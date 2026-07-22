/**
 * Клиент API бэкенда (/api/v1) + адаптеры к типам витрины.
 * Данные каталога/контента приходят с сервера (ТЗ р.4: витрина без
 * бизнес-логики); адаптеры сохраняют существующие типы компонентов.
 */
import {
  Cookie,
  Droplet,
  Drumstick,
  Flower2,
  Gift,
  Leaf,
  Milk,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import type { Product } from "@/data/products";
import type { Category } from "@/data/categories";

export const API_URL: string =
  (import.meta.env?.VITE_API_URL as string | undefined) ?? "http://localhost:3000/api/v1";

// ---------- типы ответов API ----------

export interface ApiCard {
  id: string;
  slug: string;
  name: string;
  categorySlug: string | null;
  categoryName: string | null;
  subcategory: string | null;
  priceRub: number;
  oldPriceRub: number | null;
  badges: string[];
  photo: string | null;
  unit: string;
  portionMassG: number | null;
  inStock: boolean;
  availableQty: number;
  pickupAvailability?: Array<{
    point: "pickup_leningradskaya" | "pickup_titova";
    availableQty: number;
  }>;
  isPerishable: boolean;
  shortDescription: string | null;
}

export interface ApiProductDetail extends ApiCard {
  fullDescription: string | null;
  photos: string[];
  characteristics: Record<string, string | null>;
  deliveryZone: "all" | "nsk_only";
  related: ApiCard[];
}

export interface ApiCategory {
  slug: string;
  name: string;
  description: string | null;
  photo: string | null;
  sortOrder: number;
  productCount: number;
  subcategories: string[];
}

export interface ApiCatalogResponse {
  items: ApiCard[];
  pagination: { page: number; perPage: number; total: number; pageCount: number };
  categoryCounts: Record<string, number>;
}

export interface ApiBanner {
  title: string;
  badge: string | null;
  description: string | null;
  buttonText: string | null;
  image: string | null;
  link: { type: "promo" | "category"; slug: string } | null;
  sortOrder: number;
}

export interface ApiHome {
  hero: ApiProductDetail | null;
  hits: ApiCard[];
  banners: ApiBanner[];
  sections: {
    apiary: { title?: string; text?: string } | null;
    history: { title?: string; text?: string } | null;
    advantages: Array<{ title: string; text?: string }>;
  };
  trust: { yandexRating?: number; gisRating?: number; note?: string } | null;
}

export interface ApiPromoListItem {
  slug: string;
  title: string;
  description: string | null;
  image: string | null;
  validTo: string | null;
}

export interface ApiPromoDetail extends ApiPromoListItem {
  detailText: string | null;
  conditions: string[];
  promocode: string | null;
  categorySlug: string | null;
  products: ApiCard[];
}

export interface ApiReviews {
  average: number | null;
  count: number;
  reviews: Array<{
    author: string;
    date: string;
    rating: number;
    text: string;
    source: "dgis" | "yandex" | "other";
  }>;
}

export interface ApiSettings {
  contacts: { phone?: string; email?: string } | null;
  storePoints: Array<{
    name: string;
    address: string;
    hours?: string;
    phone?: string;
    mapUrl?: string;
  }>;
  socialLinks: Array<{ label: string; url: string }>;
  requisites: string | null;
  privacyPolicy: string | null;
  reviewYandexUrl: string | null;
  review2gisUrl: string | null;
  yandexReviewsWidgetUrl: string | null;
  trust: { yandexRating?: number; gisRating?: number; note?: string } | null;
  delivery: {
    courierNskPriceRub: number | null;
    freeDeliveryThresholdRub: number | null;
    russiaWeightTiers: Array<{ weightUpToG: number; priceRub: number }>;
    termsText: string | null;
  };
}

export type ApiDeliveryMethod =
  | "pickup_leningradskaya"
  | "pickup_titova"
  | "courier_nsk"
  | "russia";

export interface ApiDeliveryQuote {
  deliveryRub: number;
  subtotalRub: number;
  discountRub: number;
  totalRub: number;
  weightG: number;
  freeDeliveryThresholdRub: number | null;
  stockProblems?: Array<{
    id: string;
    availableQty: number;
    otherPickup?: {
      point: "pickup_leningradskaya" | "pickup_titova";
      availableQty: number;
    };
  }>;
}

export interface ApiPromoValidation {
  valid: boolean;
  code?: string;
  discountRub?: number;
  message: string;
  reason?: string;
}

export interface ApiOrderCreated {
  id: number;
  orderNumber: string;
  accessToken: string;
  status: string;
  totals: {
    subtotalRub: number;
    discountRub: number;
    deliveryRub: number;
    totalRub: number;
  };
  paymentUrl: string | null;
}

export interface ApiOrderStatus {
  orderNumber: string;
  status: string;
  createdAt: string;
  deliveryMethod: ApiDeliveryMethod;
  deliveryAddress: string | null;
  paymentMethod: string;
  totals: ApiOrderCreated["totals"];
  items: Array<{ name: string; quantity: number; unit: string; priceRub: number; sumRub: number }>;
  instruction: string;
}

/** Ошибка API с телом ответа (коды ORDER_VALIDATION, PROMO_INVALID и т.п.). */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: {
      code?: string;
      message?: string | string[];
      details?: Array<Record<string, unknown>>;
    },
  ) {
    super(
      typeof body?.message === "string"
        ? body.message
        : Array.isArray(body?.message)
          ? body.message.join("; ")
          : `HTTP ${status}`,
    );
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(API_URL + path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body);
  }
  return (await res.json()) as T;
}

// ---------- запросы ----------

export interface CatalogQuery {
  category?: string;
  subcategory?: string;
  priceMin?: number;
  priceMax?: number;
  inStock?: boolean;
  sort?: "price_asc" | "price_desc" | "name";
  page?: number;
  perPage?: number;
  q?: string;
}

export function fetchCatalog(query: CatalogQuery = {}): Promise<ApiCatalogResponse> {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  }
  const qs = params.toString();
  return request(`/catalog${qs ? `?${qs}` : ""}`);
}

export const fetchCategories = (): Promise<ApiCategory[]> => request("/categories");
export const fetchProduct = (slug: string): Promise<ApiProductDetail> =>
  request(`/products/${encodeURIComponent(slug)}`);
export const fetchHome = (): Promise<ApiHome> => request("/home");
export const fetchPromos = (): Promise<ApiPromoListItem[]> => request("/promos");
export const fetchPromo = (slug: string): Promise<ApiPromoDetail> =>
  request(`/promos/${encodeURIComponent(slug)}`);
export const fetchReviews = (): Promise<ApiReviews> => request("/reviews");
export const fetchSettings = (): Promise<ApiSettings> => request("/settings");

export const validatePromo = (
  code: string,
  items: Array<{ id: string; quantity: number }>,
): Promise<ApiPromoValidation> =>
  request("/promo/validate", { method: "POST", body: JSON.stringify({ code, items }) });

export const quoteDelivery = (body: {
  deliveryMethod: ApiDeliveryMethod;
  items: Array<{ id: string; quantity: number }>;
  promoCode?: string;
}): Promise<ApiDeliveryQuote> =>
  request("/delivery/calculate", { method: "POST", body: JSON.stringify(body) });

export const createOrder = (
  body: Record<string, unknown>,
  idempotencyKey: string,
): Promise<ApiOrderCreated> =>
  request("/orders", {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "Idempotency-Key": idempotencyKey },
  });

export const fetchOrder = (id: string | number, token: string): Promise<ApiOrderStatus> =>
  request(`/orders/${id}?token=${encodeURIComponent(token)}`);

// ---------- адаптеры к типам витрины ----------

const GRADIENTS = [
  "linear-gradient(135deg, #8a5a1a 0%, #c8963e 100%)",
  "linear-gradient(135deg, #1f4a30 0%, #3b6e4a 100%)",
  "linear-gradient(135deg, #b0903a 0%, #e8b44f 100%)",
  "linear-gradient(135deg, #2a4a1a 0%, #6e8a3b 100%)",
  "linear-gradient(135deg, #1a3028 0%, #2d5a3f 100%)",
  "linear-gradient(135deg, #a67c2e 0%, #1a2a20 100%)",
];

export function gradientFor(key: string | null): string {
  let h = 0;
  for (const ch of key ?? "") h = (h * 31 + ch.charCodeAt(0)) % 997;
  return GRADIENTS[h % GRADIENTS.length];
}

/** ApiCard -> Product витрины: фото поверх градиента, цены в рублях. */
export function toProduct(c: ApiCard): Product {
  const grad = gradientFor(c.categorySlug);
  return {
    id: c.slug,
    name: c.name,
    category: c.categorySlug ?? "",
    categoryName: c.categoryName ?? "",
    subcategory: c.subcategory ?? c.categoryName ?? "",
    price: c.priceRub,
    oldPrice: c.oldPriceRub,
    unit: c.unit,
    inStock: c.inStock,
    isPerishable: c.isPerishable,
    badges: c.badges,
    image: c.photo ? `url("${c.photo}") center/cover no-repeat, ${grad}` : grad,
    shortDescription: c.shortDescription ?? "",
  };
}

const ICON_RULES: Array<[RegExp, LucideIcon]> = [
  [/med|honey/, Cookie],
  [/chai|tea|trav/, Leaf],
  [/syr|maslo|molo/, Milk],
  [/myas|meat|delikat/, Drumstick],
  [/kosmet/, Flower2],
  [/balzam|zdorov|pant/, Sparkles],
  [/podar|gift/, Gift],
  [/maslo|neft|oil/, Droplet],
];

export function iconFor(slug: string): LucideIcon {
  for (const [re, icon] of ICON_RULES) if (re.test(slug)) return icon;
  return Leaf;
}

import type { Promo } from "@/data/promos";

export const PROMO_ICONS: LucideIcon[] = [Cookie, Gift, Sparkles, Leaf];
export const promoIcon = (i: number): LucideIcon => PROMO_ICONS[i % PROMO_ICONS.length];
const PROMO_BG = [
  "linear-gradient(120deg, #8a5a1a 0%, #c8963e 100%)",
  "linear-gradient(120deg, #1f4a30 0%, #3b6e4a 100%)",
  "linear-gradient(120deg, #1a3028 0%, #2d5a3f 100%)",
];

export interface FrontReview {
  id: string;
  name: string;
  date: string;
  text: string;
  source: "Яндекс" | "2ГИС";
  rating: number;
}

/** Отзывы API -> формат витрины (даты по-русски, источники читабельно). */
export function toReviews(api: ApiReviews): FrontReview[] {
  return api.reviews.map((r, i) => ({
    id: `${r.author}-${i}`,
    name: r.author,
    date: new Date(r.date).toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }),
    text: r.text,
    source: r.source === "yandex" ? "Яндекс" : "2ГИС",
    rating: r.rating,
  }));
}

/** ApiPromo -> Promo витрины (акции из админки). */
export type FrontPromo = Omit<Promo, "icon">;

export function toPromo(p: ApiPromoDetail | ApiPromoListItem, i = 0): FrontPromo {
  const d = p as Partial<ApiPromoDetail>;
  const validUntil = p.validTo
    ? `до ${new Date(p.validTo).toLocaleDateString("ru-RU")}`
    : undefined;
  return {
    id: p.slug,
    title: p.title,
    description: p.description ?? "",
    ctaText: "Подробнее",
    ctaLink: "/promo/" + p.slug,
    bgColor: PROMO_BG[i % PROMO_BG.length],
    accentColor: "#faf7f2",
    image: p.image ?? "",
    imageAlt: p.title,
    badge: d.promocode ? `Промокод ${d.promocode}` : undefined,
    details: d.detailText ? d.detailText.split(/\n{2,}/) : undefined,
    terms: d.conditions,
    promoCode: d.promocode ?? undefined,
    categoryFilter: d.categorySlug ?? undefined,
    productIds: d.products?.map((x) => x.slug),
    validUntil,
  };
}

/** Категория витрины без React-иконки (loader-данные должны сериализоваться). */
export type FrontCategory = Omit<Category, "icon"> & { count: number };

/** ApiCategory -> категория витрины (иконку подбирает рендер: iconFor). */
export function toCategory(a: ApiCategory): FrontCategory {
  return {
    id: a.slug,
    name: a.name,
    slug: a.slug,
    description: a.description ?? "",
    subcategories: a.subcategories,
    gradient: gradientFor(a.slug),
    image: a.photo ?? "",
    imageAlt: a.name,
    count: a.productCount,
  };
}
