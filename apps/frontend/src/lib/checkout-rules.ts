/**
 * Правила оформления заказа — ОБЩИЕ для веб-чекаута и мини-приложения MAX.
 *
 * По ТЗ р.13 мини-апп оформляет заказ «по тем же правилам раздела 6.7 и 11».
 * Если продублировать правила в двух экранах, они разъедутся, и один из
 * каналов начнёт пропускать заказы, которые сервер отклонит. Поэтому здесь
 * только чистые функции без React — их одинаково зовут оба экрана, и они
 * покрыты тестами.
 *
 * Сервер всё равно проверяет всё заново: это подсказки покупателю, а не
 * защита. Защита — на бэкенде.
 */

export type ReceivingMethod =
  | "pickup_leningradskaya"
  | "pickup_titova"
  | "courier_nsk"
  | "russia";

export type PaymentMethod = "online" | "cash_on_pickup" | "card_on_pickup";

/** Точки самовывоза. Адреса синхронизированы с подвалом и блоком «Как нас найти». */
export const PICKUP_POINTS = {
  pickup_leningradskaya: {
    full: "г. Новосибирск, ул. Ленинградская 75/2",
    short: "Ленинградская 75/2",
  },
  pickup_titova: {
    full: "г. Новосибирск, ул. Титова 32",
    short: "Титова 32",
  },
} as const;

export function isPickupMethod(method: string): boolean {
  return method === "pickup_leningradskaya" || method === "pickup_titova";
}

/**
 * Телефон к виду +7XXXXXXXXXX. Неполный или слишком длинный номер — пустая
 * строка: лучше явная ошибка в форме, чем мусор, улетевший на сервер.
 */
export function normalizePhone(value: string): string {
  const digits = value.replace(/\D/g, "").replace(/^8/, "7");
  return digits.length === 11 && digits.startsWith("7") ? `+${digits}` : "";
}

/**
 * Какие способы оплаты возможны при выбранном способе получения.
 * Наличные и карта «при получении» физически возможны только в магазине —
 * у курьера и в почтовом отделении терминала нет.
 */
export function paymentOptionsFor(method: string): {
  online: boolean;
  cashOnPickup: boolean;
  cardOnPickup: boolean;
} {
  const pickup = isPickupMethod(method);
  return { online: true, cashOnPickup: pickup, cardOnPickup: pickup };
}

export interface ContactErrors {
  name?: string;
  phone?: string;
  email?: string;
}

/**
 * Шаг «Контакты». E-mail обязателен ТОЛЬКО при онлайн-оплате: чек 54-ФЗ
 * доставляется «Чеками от ЮKassa» на почту, СМС недоступна — без адреса
 * покупатель просто не получит чек.
 */
export function validateContacts(input: {
  name: string;
  phone: string;
  email: string;
  payment: string;
}): ContactErrors {
  const errors: ContactErrors = {};
  if (!input.name.trim()) errors.name = "Укажите имя";
  if (!normalizePhone(input.phone)) errors.phone = "Введите телефон в формате +7XXXXXXXXXX";

  const email = input.email.trim();
  if (input.payment === "online" && !email) {
    errors.email = "Для онлайн-оплаты укажите e-mail — на него придёт чек";
  } else if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "Проверьте адрес почты";
  }
  return errors;
}

export interface ReceivingErrors {
  delivery?: string;
  address?: string;
}

/** Шаг «Получение». Адрес нужен только там, где заказ везут. */
export function validateReceiving(input: {
  delivery: string;
  address: string;
}): ReceivingErrors {
  const errors: ReceivingErrors = {};
  if (!input.delivery) {
    errors.delivery = "Выберите способ получения";
    return errors;
  }
  if (!isPickupMethod(input.delivery) && !input.address.trim()) {
    errors.address = "Укажите адрес доставки";
  }
  return errors;
}
