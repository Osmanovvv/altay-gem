import { describe, expect, test } from "bun:test";
import {
  PICKUP_POINTS,
  isPickupMethod,
  normalizePhone,
  paymentOptionsFor,
  validateContacts,
  validateReceiving,
} from "./checkout-rules";

/**
 * Правила оформления заказа. Живут ОТДЕЛЬНО от экранов, потому что их два:
 * веб-чекаут и чекаут мини-приложения MAX. По ТЗ р.13 мини-апп оформляет
 * заказ «по тем же правилам раздела 6.7 и 11» — если продублировать правила
 * в двух экранах, они неизбежно разъедутся, и один из каналов начнёт
 * принимать заказы, которые сервер отклонит.
 */

describe("normalizePhone", () => {
  test("российский номер приводится к +7XXXXXXXXXX", () => {
    expect(normalizePhone("+7 (960) 798-16-22")).toBe("+79607981622");
    expect(normalizePhone("8 960 798 16 22")).toBe("+79607981622");
    expect(normalizePhone("79607981622")).toBe("+79607981622");
  });

  test("неполный номер — пустая строка, а не мусор", () => {
    expect(normalizePhone("+7 960 798")).toBe("");
    expect(normalizePhone("")).toBe("");
    expect(normalizePhone("телефона нет")).toBe("");
  });

  test("лишние цифры не проходят (12 цифр — не наш формат)", () => {
    expect(normalizePhone("796079816221")).toBe("");
  });
});

describe("isPickupMethod", () => {
  test("оба самовывоза распознаются", () => {
    expect(isPickupMethod("pickup_leningradskaya")).toBe(true);
    expect(isPickupMethod("pickup_titova")).toBe(true);
  });
  test("доставка — не самовывоз", () => {
    expect(isPickupMethod("courier_nsk")).toBe(false);
    expect(isPickupMethod("russia")).toBe(false);
    expect(isPickupMethod("")).toBe(false);
  });
});

describe("PICKUP_POINTS", () => {
  test("две точки с полным и коротким адресом", () => {
    expect(PICKUP_POINTS.pickup_leningradskaya.full).toContain("Ленинградская");
    expect(PICKUP_POINTS.pickup_titova.full).toContain("Титова");
    expect(PICKUP_POINTS.pickup_leningradskaya.short).toBe("Ленинградская 75/2");
  });
});

describe("paymentOptionsFor", () => {
  test("самовывоз — можно платить на месте", () => {
    const o = paymentOptionsFor("pickup_titova");
    expect(o.online).toBe(true);
    expect(o.cashOnPickup).toBe(true);
    expect(o.cardOnPickup).toBe(true);
  });

  test("курьер и почта — только онлайн (наличных курьеру нет)", () => {
    for (const m of ["courier_nsk", "russia"]) {
      const o = paymentOptionsFor(m);
      expect(o.online).toBe(true);
      expect(o.cashOnPickup).toBe(false);
      expect(o.cardOnPickup).toBe(false);
    }
  });
});

describe("validateContacts", () => {
  const ok = { name: "Иван", phone: "+79607981622", email: "", payment: "cash_on_pickup" };

  test("корректные данные — ошибок нет", () => {
    expect(validateContacts(ok)).toEqual({});
  });

  test("без имени — ошибка", () => {
    expect(validateContacts({ ...ok, name: "  " }).name).toBeTruthy();
  });

  test("кривой телефон — ошибка с подсказкой формата", () => {
    expect(validateContacts({ ...ok, phone: "123" }).phone).toContain("+7");
  });

  test("онлайн-оплата без e-mail — ошибка: чек уходит ТОЛЬКО на почту", () => {
    const e = validateContacts({ ...ok, payment: "online", email: "" });
    expect(e.email).toBeTruthy();
  });

  test("онлайн-оплата с e-mail — ошибок нет", () => {
    expect(validateContacts({ ...ok, payment: "online", email: "a@b.ru" })).toEqual({});
  });

  test("оплата на месте без e-mail — норма, e-mail необязателен", () => {
    expect(validateContacts({ ...ok, email: "" }).email).toBeUndefined();
  });

  test("e-mail с опечаткой отклоняется", () => {
    expect(validateContacts({ ...ok, email: "просто-текст" }).email).toBeTruthy();
  });
});

describe("validateReceiving", () => {
  test("способ не выбран — ошибка", () => {
    expect(validateReceiving({ delivery: "", address: "" }).delivery).toBeTruthy();
  });

  test("самовывоз — адрес не нужен", () => {
    expect(validateReceiving({ delivery: "pickup_titova", address: "" })).toEqual({});
  });

  test("курьер без адреса — ошибка", () => {
    expect(validateReceiving({ delivery: "courier_nsk", address: "" }).address).toBeTruthy();
  });

  test("доставка по России без адреса — ошибка", () => {
    expect(validateReceiving({ delivery: "russia", address: "  " }).address).toBeTruthy();
  });

  test("курьер с адресом — ошибок нет", () => {
    expect(validateReceiving({ delivery: "courier_nsk", address: "ул. Ленина 1" })).toEqual({});
  });
});
