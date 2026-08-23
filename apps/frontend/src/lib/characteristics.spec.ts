import { describe, expect, test } from "bun:test";
import { readableCharacteristics } from "./characteristics";

/**
 * Характеристики товара приходят из Strapi техническими ключами
 * (weightVolume, storage...). Покупателю их показывать нельзя, а список
 * допустимых ключей должен быть ОДИН для сайта и мини-аппа: иначе в одном
 * канале появится сырой ключ, как это уже случилось на карточке MAX.
 */
describe("readableCharacteristics", () => {
  test("технические ключи переводятся в человеческие подписи", () => {
    expect(
      readableCharacteristics({
        weightVolume: "250 мл",
        composition: "панты марала",
        manufacturer: "АлтайБиоПроект",
        shelfLife: "12 мес",
        storage: "в сухом месте",
      }),
    ).toEqual([
      ["Вес/Объём", "250 мл"],
      ["Состав", "панты марала"],
      ["Производитель", "АлтайБиоПроект"],
      ["Срок годности", "12 мес"],
      ["Условия хранения", "в сухом месте"],
    ]);
  });

  test("порядок подписей стабильный, а не как придёт из API", () => {
    const a = readableCharacteristics({ storage: "с", weightVolume: "в" });
    expect(a.map(([k]) => k)).toEqual(["Вес/Объём", "Условия хранения"]);
  });

  test("незнакомый ключ не показывается покупателю", () => {
    expect(readableCharacteristics({ someInternalField: "мусор" })).toEqual([]);
  });

  test("пустые значения отбрасываются", () => {
    expect(readableCharacteristics({ composition: "", storage: null })).toEqual([]);
  });

  test("нет характеристик — пустой список, а не падение", () => {
    expect(readableCharacteristics(undefined)).toEqual([]);
    expect(readableCharacteristics({})).toEqual([]);
  });
});
