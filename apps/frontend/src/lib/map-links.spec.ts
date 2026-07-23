import { describe, expect, test } from "bun:test";
import { dgisMapUrl, dgisOrgUrl, yandexMapUrl, yandexOrgUrl } from "./map-links";

const SHOP = { name: "Жемчужина Алтая", address: "г. Новосибирск, ул. Ленинградская 75/2" };

describe("yandexMapUrl / dgisMapUrl (маршрут до точки)", () => {
  test("точная ссылка из админки имеет приоритет", () => {
    expect(yandexMapUrl({ address: SHOP.address, mapUrl: "https://yandex.ru/maps/org/1" })).toBe(
      "https://yandex.ru/maps/org/1",
    );
  });
  test("без mapUrl — поиск Яндекса по адресу", () => {
    expect(yandexMapUrl({ address: SHOP.address })).toBe(
      `https://yandex.ru/maps/?text=${encodeURIComponent(SHOP.address)}`,
    );
  });
  test("2ГИС — поиск по адресу", () => {
    expect(dgisMapUrl({ address: SHOP.address })).toBe(
      `https://2gis.ru/novosibirsk/search/${encodeURIComponent(SHOP.address)}`,
    );
  });
});

describe("yandexOrgUrl / dgisOrgUrl (карточка организации для отзыва)", () => {
  test("Яндекс — поиск по имени и адресу (ведёт на карточку с кнопкой отзыва)", () => {
    expect(yandexOrgUrl(SHOP)).toBe(
      `https://yandex.ru/maps/?text=${encodeURIComponent(`${SHOP.name}, ${SHOP.address}`)}`,
    );
  });
  test("2ГИС — поиск по имени и адресу", () => {
    expect(dgisOrgUrl(SHOP)).toBe(
      `https://2gis.ru/novosibirsk/search/${encodeURIComponent(`${SHOP.name}, ${SHOP.address}`)}`,
    );
  });
});
