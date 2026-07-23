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

/**
 * Ссылки «оставить отзыв»: точные URL карточек задаются в админке
 * (reviewYandexUrl / review2gisUrl); пока они пустые — ведём поиском
 * «имя + адрес», он приводит на карточку организации с кнопкой отзыва.
 */
export function yandexOrgUrl(p: { name: string; address: string }): string {
  return `https://yandex.ru/maps/?text=${encodeURIComponent(`${p.name}, ${p.address}`)}`;
}

export function dgisOrgUrl(p: { name: string; address: string }): string {
  return `https://2gis.ru/novosibirsk/search/${encodeURIComponent(`${p.name}, ${p.address}`)}`;
}
