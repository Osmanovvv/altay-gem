import { describe, expect, test } from "bun:test";
import { insideMax, openExternal, type MaxBridge } from "./max-bridge";

/** Мост, каким он выглядит внутри настоящего MAX: initData подписан платформой. */
const inMax = (openLink: (u: string) => void): MaxBridge => ({
  openLink,
  initData: "query_id=AA&user=%7B%22id%22%3A1%7D&hash=abc123",
});

describe("определение, что мы внутри MAX", () => {
  /**
   * Ключевой факт, проверенный на живой странице: скрипт моста создаёт
   * window.WebApp В ЛЮБОМ браузере, и openLink там ЕСТЬ. Но вне MAX он молча
   * ничего не делает — не бросает ошибку и не переходит. Значит наличие моста
   * не признак. Признак — подписанный initData, который вне MAX пустой.
   */
  test("мост есть, но initData пуст — мы НЕ в MAX", () => {
    expect(insideMax({ openLink: () => {}, initData: null })).toBe(false);
    expect(insideMax({ openLink: () => {}, initData: "" })).toBe(false);
    expect(insideMax({ openLink: () => {}, initData: "   " })).toBe(false);
  });

  test("моста нет вовсе — не в MAX", () => {
    expect(insideMax(undefined)).toBe(false);
  });

  test("подписанный initData — мы в MAX", () => {
    expect(insideMax(inMax(() => {}))).toBe(true);
  });
});

describe("переход на внешнюю страницу оплаты", () => {
  /**
   * Платёжная страница ЮKassa отдаёт X-Frame-Options: SAMEORIGIN — показать её
   * внутри чужого окна нельзя. Если MAX открывает мини-апп во фрейме, подмена
   * адреса окна ведёт ровно к запрещённому встраиванию и покупатель видит
   * пустой экран. Внутри MAX уводим штатным openLink — во внешний браузер.
   */
  test("внутри MAX — через мост, без подмены адреса", () => {
    const opened: string[] = [];
    const fellBack: string[] = [];
    openExternal("https://yoomoney.ru/checkout/1", inMax((u) => opened.push(u)), (u) =>
      fellBack.push(u),
    );
    expect(opened).toEqual(["https://yoomoney.ru/checkout/1"]);
    expect(fellBack).toEqual([]);
  });

  /**
   * Тот самый случай, ради которого переписан тест: приложение открыли по
   * ссылке в обычном браузере. Мост есть, openLink есть — но он немой.
   * Нажатие «Оплатить» обязано увести на оплату, а не превратиться в тишину.
   */
  test("обычный браузер: мост есть, но он немой — уводим обычным переходом", () => {
    const opened: string[] = [];
    const fellBack: string[] = [];
    openExternal(
      "https://yoomoney.ru/checkout/2",
      { openLink: (u) => opened.push(u), initData: null },
      (u) => fellBack.push(u),
    );
    expect(opened).toEqual([]);
    expect(fellBack).toEqual(["https://yoomoney.ru/checkout/2"]);
  });

  test("моста нет — обычный переход", () => {
    const fellBack: string[] = [];
    openExternal("https://yoomoney.ru/checkout/3", undefined, (u) => fellBack.push(u));
    expect(fellBack).toEqual(["https://yoomoney.ru/checkout/3"]);
  });

  test("старый клиент MAX без openLink — тоже обычный переход, а не тишина", () => {
    const fellBack: string[] = [];
    openExternal(
      "https://yoomoney.ru/checkout/4",
      { initData: "hash=abc" } as MaxBridge,
      (u) => fellBack.push(u),
    );
    expect(fellBack).toEqual(["https://yoomoney.ru/checkout/4"]);
  });

  test("мост упал с ошибкой — всё равно уводим на оплату", () => {
    const fellBack: string[] = [];
    openExternal(
      "https://yoomoney.ru/checkout/5",
      {
        initData: "hash=abc",
        openLink: () => {
          throw new Error("мост недоступен");
        },
      },
      (u) => fellBack.push(u),
    );
    expect(fellBack).toEqual(["https://yoomoney.ru/checkout/5"]);
  });

  /** Пустой адрес — никуда не уходим, иначе окно уедет на пустую страницу. */
  test("пустой адрес игнорируется", () => {
    const opened: string[] = [];
    const fellBack: string[] = [];
    openExternal("", inMax((u) => opened.push(u)), (u) => fellBack.push(u));
    openExternal("   ", undefined, (u) => fellBack.push(u));
    expect(opened).toEqual([]);
    expect(fellBack).toEqual([]);
  });
});
