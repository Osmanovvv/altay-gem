/**
 * Мост мини-приложения MAX (`window.WebApp`, скрипт st.max.ru/js/max-web-app.js).
 *
 * Нужен ради одного, но денежного случая — увода покупателя на оплату.
 * Платёжная страница ЮKassa отдаёт `X-Frame-Options: SAMEORIGIN`, то есть
 * запрещает показывать себя внутри чужого окна. Если MAX открывает мини-апп во
 * фрейме, привычный `window.location.href = paymentUrl` меняет адрес именно
 * этого фрейма — и покупатель вместо оплаты получает пустой экран. Штатный
 * метод MAX `openLink` открывает ссылку во ВНЕШНЕМ браузере и от способа
 * показа приложения не зависит.
 *
 * ЛОВУШКА, проверенная на живой странице: скрипт моста создаёт `window.WebApp`
 * в ЛЮБОМ браузере, и метод `openLink` там ЕСТЬ — но вне MAX он молча ничего
 * не делает: не бросает ошибку, не переходит, возвращает undefined. Поэтому
 * «мост есть» — НЕ признак того, что мы внутри мессенджера, и полагаться на
 * try/catch бесполезно: ловить нечего. Если так ошибиться, покупатель,
 * открывший приложение по ссылке в обычном браузере, нажмёт «Оплатить» и
 * останется ни с чем — заказ создан, корзина очищена, оплаты нет.
 *
 * Настоящий признак — подписанный платформой `initData`: внутри MAX это строка
 * с хешем, снаружи он пустой.
 */

export interface MaxBridge {
  /** Открыть произвольную ссылку во внешнем браузере. Вне MAX — пустышка. */
  openLink?: (url: string) => void;
  /** Подписанные данные запуска. Заполнены только внутри MAX. */
  initData?: string | null;
}

declare global {
  interface Window {
    WebApp?: MaxBridge;
  }
}

/** Мост доступен только в браузере; при серверном рендеринге его нет. */
export function maxBridge(): MaxBridge | undefined {
  return typeof window === "undefined" ? undefined : window.WebApp;
}

/** Мы действительно внутри MAX, а не просто открыли /max в браузере. */
export function insideMax(bridge: MaxBridge | undefined): boolean {
  return typeof bridge?.initData === "string" && bridge.initData.trim().length > 0;
}

/**
 * Увести покупателя на внешнюю страницу (платёж).
 *
 * Мост передаётся аргументом, а не берётся изнутри, чтобы поведение можно было
 * проверить тестом без браузера.
 */
export function openExternal(
  url: string,
  bridge: MaxBridge | undefined,
  fallback: (url: string) => void,
): void {
  const target = url.trim();
  if (!target) return;

  if (insideMax(bridge) && bridge?.openLink) {
    try {
      bridge.openLink(target);
      return;
    } catch {
      // Мост сломался (старый клиент, изменившийся API) — не оставляем
      // покупателя на месте после нажатия «Оплатить».
    }
  }
  fallback(target);
}
