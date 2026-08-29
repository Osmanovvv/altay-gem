/**
 * Данные покупателя из профиля MAX (ТЗ р.13: «контакты покупателя
 * предзаполняются из профиля Max, где платформа это позволяет»).
 *
 * Что платформа позволяет на самом деле:
 * — имя и фамилия приходят сразу, в `initDataUnsafe.user`;
 * — ТЕЛЕФОНА там нет. Он запрашивается отдельно методом `requestContact()`,
 *   который показывает окно согласия. Поэтому телефон не подставляем молча:
 *   при входе в оформление никаких окон не всплывает, покупатель сам решает.
 *
 * Данные приходят от клиента и подписаны, но подпись здесь НЕ проверяется —
 * и это осознанно: значения только подставляются в видимые поля, которые
 * покупатель может исправить, а заказ всё равно перевалидируется сервером.
 * Проверка подписи понадобится, если мы начнём чему-то ДОВЕРЯТЬ на основании
 * личности (привязывать заказы к аккаунту MAX) — тогда HMAC-SHA256 по
 * botToken, как описано в документации платформы.
 */

import { normalizePhone } from "./checkout-rules";
import { phoneDigits } from "./phone-mask";

export interface MaxProfile {
  first_name?: string | null;
  last_name?: string | null;
  username?: string | null;
}

/** Имя для поля «Как к вам обращаться». Пусто, если профиля нет. */
export function profileName(user: MaxProfile | undefined | null): string {
  if (!user) return "";
  return [user.first_name, user.last_name]
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(" ");
}

/**
 * Подставить значение в поле, НЕ затирая введённое покупателем: он мог
 * вернуться на шаг назад, и увидеть вместо своего имени чужое — неприятно.
 */
export function prefill(current: string, suggestion: string): string {
  return current.trim() ? current : suggestion;
}

/**
 * Телефон из окна `requestContact()` — формат платформой не оговорён, поэтому
 * приводим сами. Возвращаем 10 значащих цифр (без кода страны) — именно с
 * ними работает маска формы. Всё, что не похоже на российский номер, лучше
 * отбросить, чем положить в заказ кривым.
 */
export function contactPhoneDigits(raw: string): string {
  return normalizePhone(raw) ? phoneDigits(raw) : "";
}
