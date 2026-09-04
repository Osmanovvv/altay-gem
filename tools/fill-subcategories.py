# -*- coding: utf-8 -*-
"""
Заполнение подкатегорий у загруженных товаров + чистка списков подкатегорий.

ЗАЧЕМ. До загрузки каталога подкатегории работали: товаров было 14, и у всех
поле было заполнено. Мы залили 563 карточки без него — и подписи на плитках
категорий («Твёрдые сыры», «Масло») стали вести на один товар. Плюс после
переименования «Косметики и бакалеи» в «Косметику» у неё осталась подпись
«Бакалея», хотя бакалея теперь отдельная категория.

Это регресс нашей загрузки, а не недоработка контент-менеджера.

ПРАВИЛО ОСТОРОЖНОСТИ: не уверены — оставляем пусто. Товар без подкатегории
просто не попадёт в её фильтр; товар в ЧУЖОЙ подкатегории вводит покупателя в
заблуждение. Пустое лучше неверного.

Уже заполненные подкатегории (те самые 14 карточек) НЕ трогаем.

Запуск:
  python fill-subcategories.py --dry-run
  python fill-subcategories.py --apply
Переменные окружения: STRAPI_URL, STRAPI_API_TOKEN
"""
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from collections import Counter

APPLY = "--apply" in sys.argv
BASE = os.environ.get("STRAPI_URL", "http://localhost:1337").rstrip("/")
TOKEN = os.environ.get("STRAPI_API_TOKEN", "")

# Списки подкатегорий по категориям. Держим короткими: пять пунктов покупатель
# охватывает взглядом, пятнадцать — уже не фильтр, а второй каталог.
SUBCATEGORIES = {
    "zdorovie-altaya": ["Пантопродукция", "Травы и сборы", "Чай", "Каши и кисели",
                        "Бальзамы и сиропы", "Капсулы и концентраты"],
    "kosmetika-i-bakaleya": ["Мыло", "Уход за лицом", "Уход за телом",
                             "Для волос", "Зубные пасты", "Эфирные масла"],
    "sladosti": ["Мармелад и пастила", "Конфеты и шоколад", "Печенье и пряники",
                 "Халва и козинаки", "Зефир"],
    "myaso-i-delikatesy": ["Колбасы и сосиски", "Копчёности", "Консервы", "Дичь"],
    "zamorozka": ["Пельмени и вареники", "Полуфабрикаты", "Мороженое", "Ягоды и овощи"],
    "syry-i-maslo": ["Твёрдые сыры", "Плавленые", "Масло", "Молоко и кисломолочное"],
    "bakaleya-i-napitki": ["Мука и крупы", "Напитки", "Консервы", "Хлеб"],
    "med-i-pcheloprodukciya": ["Мёд", "Продукты пчеловодства"],
}

# Правила: (категория) -> [(подкатегория, регулярка)]. Первое совпадение выигрывает.
RULES = {
    "zdorovie-altaya": [
        ("Каши и кисели", r"(каша|кисель|каши)"),
        ("Чай", r"(чай|чайный напиток|иван-чай)"),
        ("Травы и сборы", r"(\bтрав|сбор |фитозапарк|хмель|кора |ч\.?\s?н\.?\s|чн |зверобой|ромашк|мох)"),
        ("Пантопродукция", r"(пант|мараленок|силапант|гематоген|марал)"),
        ("Бальзамы и сиропы", r"(бальзам|сироп|эликсир|настойк)"),
        ("Капсулы и концентраты", r"(капсул|концентрат|экстракт|драже|таблетк|порошок)"),
    ],
    "kosmetika-i-bakaleya": [
        ("Зубные пасты", r"зубная паста"),
        ("Мыло", r"мыло"),
        ("Эфирные масла", r"(эфирное масло|масло пихтов|масло эфир)"),
        ("Для волос", r"(шампун|для волос|кондиционер)"),
        ("Уход за лицом", r"(для лица|крем для лица|маска для лица|тоник|сыворотк|умыван)"),
        ("Уход за телом", r"(скраб|мочалк|гель для душа|для тела|бальзам для тела|соль для ванн)"),
    ],
    "sladosti": [
        ("Мармелад и пастила", r"(мармелад|пастил)"),
        ("Зефир", r"зефир"),
        ("Халва и козинаки", r"(халва|козинак|щербет|шербет)"),
        ("Печенье и пряники", r"(печень\w*е|пряник|сушка|галет|вафл)"),
        ("Конфеты и шоколад", r"(конфет|шоколад|цукат|леденц|трюфел)"),
    ],
    "myaso-i-delikatesy": [
        ("Консервы", r"(ж/б|консерв|тушен|тушён|в собственном соку|паштет.*(ж/б|стекло)|стекло)"),
        ("Дичь", r"(марал|олен|кабан|медвеж|лося|лось|глухар|дичь|косул|бобр)"),
        ("Колбасы и сосиски", r"(колбас|сосиск|сардельк|шпикачк|ливерн|молочная|докторск)"),
        ("Копчёности", r"(шпик|грудинк|карбонат|окорок|бастурм|вырезк|буженин|карпаччо|шейка|сервелат|балык)"),
    ],
    "zamorozka": [
        ("Мороженое", r"(мороженое|пломбир|эскимо|рожок|стаканчик)"),
        ("Пельмени и вареники", r"(пельмен|вареник|манты|хинкал|бузы)"),
        ("Ягоды и овощи", r"(клюкв|брусник|смородин|вишн|облепих|клубник|капуст|брокколи|смесь|лечо|перец фарширован)"),
        ("Полуфабрикаты", r"(котлет|люля|голубц|блин|чебурек|беляш|наггетс|шашлык|фарш|купаты)"),
    ],
    "syry-i-maslo": [
        ("Плавленые", r"плавлен"),
        ("Масло", r"(масло слив|масло крестьянск|масло топлен|\bмасло\b)"),
        ("Молоко и кисломолочное", r"(молоко|кефир|йогурт|творог|сметана|сливки|ряженка|простокваш|пахта|биопахта)"),
        ("Твёрдые сыры", r"сыр"),
    ],
    "bakaleya-i-napitki": [
        ("Напитки", r"(вода|морс|квас|сбитень|сок |напиток|лимонад)"),
        ("Мука и крупы", r"(мука|крупа|макарон|ракушки|хлопь|отруб|зерно)"),
        ("Хлеб", r"(хлеб|багет|хлебц|брускетт|лаваш)"),
        ("Консервы", r"(ж/б|консерв|печень трески|груздь|грузди|икра грибная|закуска грибная)"),
    ],
    "med-i-pcheloprodukciya": [
        ("Продукты пчеловодства", r"(перга|воск|прополис|забрус|восковая моль|пыльц|маточн)"),
        ("Мёд", r"(мёд|мед)"),
    ],
}

# Товары, оказавшиеся не в своей категории (замечены при осмотре витрины).
RECATEGORIZE = [
    (r"^мука монастырский двор", "bakaleya-i-napitki"),
    (r"^крем для лица тб клеопатра", "kosmetika-i-bakaleya"),
    (r"^блины с ", "zamorozka"),
]


def norm(s):
    return (s or "").lower().replace("ё", "е")


def api(method, path, payload=None, tries=3):
    """Три попытки: на длинном прогоне соединение изредка обрывается, и без
    повтора работа останавливается на середине списка."""
    last = None
    for attempt in range(tries):
        try:
            req = urllib.request.Request(
                BASE + path, method=method,
                data=json.dumps(payload).encode("utf-8") if payload is not None else None,
                headers={"Authorization": "Bearer " + TOKEN,
                         "Content-Type": "application/json"})
            with urllib.request.urlopen(req, timeout=40) as r:
                b = r.read().decode("utf-8")
                return json.loads(b) if b else {}
        except urllib.error.HTTPError:
            raise
        except Exception as e:
            last = e
            time.sleep(1.5 * (attempt + 1))
    raise last


def pick(cat_slug, name):
    for sub, pat in RULES.get(cat_slug, []):
        if re.search(pat, norm(name), re.I):
            return sub
    return None


def main():
    if not APPLY:
        print("=== ПРОБНЫЙ ПРОГОН, ничего не записывается ===\n")

    cats = {c["slug"]: c for c in api("GET", "/api/categories?pagination[pageSize]=100")["data"]}

    print("Списки подкатегорий:")
    for slug, subs in SUBCATEGORIES.items():
        cur = [s["name"] for s in (cats[slug].get("subcategories") or [])]
        if cur != subs:
            print(f"  {cats[slug]['name']}: {cur or '—'}  ->  {subs}")
            if APPLY:
                api("PUT", f"/api/categories/{cats[slug]['documentId']}",
                    {"data": {"subcategories": [{"name": n, "sortOrder": i + 1}
                                                for i, n in enumerate(subs)]}})
    print()

    page, products = 1, []
    while True:
        res = api("GET", f"/api/products?pagination[page]={page}&pagination[pageSize]=100&populate=category")
        products += res["data"]
        if page >= res["meta"]["pagination"]["pageCount"]:
            break
        page += 1
    print(f"товаров в админке: {len(products)}\n")

    moved, filled, skipped = [], [], Counter()
    for p in products:
        name = p.get("adminName") or ""
        cat = (p.get("category") or {}).get("slug")
        doc = p["documentId"]

        # не в своей категории?
        new_cat = None
        for pat, target in RECATEGORIZE:
            if re.search(pat, norm(name)) and cat != target:
                new_cat = target
                break
        if new_cat:
            moved.append((name, cat, new_cat))
            cat = new_cat

        if p.get("subcategory"):
            skipped["уже заполнено"] += 1
            if not new_cat:
                continue

        sub = pick(cat, name)
        if not sub:
            skipped["не распознано — оставляем пусто"] += 1
            if not new_cat:
                continue

        data = {}
        if new_cat:
            data["category"] = cats[new_cat]["documentId"]
        if sub and not p.get("subcategory"):
            data["subcategory"] = sub
        if not data:
            continue
        filled.append((name, cat, sub))
        if APPLY:
            api("PUT", f"/api/products/{doc}", {"data": data})

    print("Переносы в другую категорию:")
    for n, was, now in moved:
        print(f"   {n[:44]:46} {was} -> {now}")
    print(f"   всего: {len(moved)}\n")

    print("Заполнение подкатегорий:")
    by = Counter(f"{c} / {s}" for _, c, s in filled if s)
    for k, v in by.most_common(40):
        print(f"   {k:52} {v:>4}")
    print(f"\n   заполнено: {len([1 for _, _, s in filled if s])}")
    for k, v in skipped.most_common():
        print(f"   {k}: {v}")

    if not APPLY:
        print("\nЗапуск с --apply запишет это.")


main()
