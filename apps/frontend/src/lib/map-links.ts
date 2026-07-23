/**
 * Ссылки «построить маршрут» для точек магазинов. Единый источник для главной
 * («Как нас найти») и «О нас»: Яндекс — точная ссылка из админки (mapUrl точки)
 * либо поиск по адресу; 2ГИС — поиск по адресу.
 */
export function yandexMapUrl(p: { address: string; mapUrl?: string }): string {
  return p.mapUrl?.trim() || `https://yandex.ru/maps/?text=${encodeURIComponent(p.address)}`;
}

export function dgisMapUrl(p: { address: string }): string {
  return `https://2gis.ru/novosibirsk/search/${encodeURIComponent(p.address)}`;
}
