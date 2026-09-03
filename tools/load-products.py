# -*- coding: utf-8 -*-
"""
Загрузка товаров из выгрузки Эвотора в админку (Strapi).

Грузит ТОЛЬКО бесспорные группы — те, по которым раскладка не вызывает вопросов
(см. tools/build-group-map.py и согласованную таблицу). Спорные и смешанные
группы пропускаются: их раскладывают отдельно, по названиям товаров.

ЧЕГО СКРИПТ НАМЕРЕННО НЕ ДЕЛАЕТ — НЕ УГАДЫВАЕТ ВЕС ДОСТАВКИ.
В карточках, заведённых вручную, вес — это вес ПОСЫЛКИ С УПАКОВКОЙ: у бальзама
100 мл стоит 250 г, у барсучьего жира 50 г — 300 г. Из названия товара такой
вес не выводится, там указано содержимое. Подстановка «примерно» уже была в
коде и её убрали осознанно (см. catalog.service.ts): неверный вес — это
неверная цена доставки в обе стороны, о которой никто не узнает. Поэтому
deliveryWeightG остаётся пустым, а доставка по России для таких товаров честно
откажет с понятным текстом, предложив самовывоз и курьера.

Весовым товарам (ед. изм. «кг») проставляется portionMassG = 100 — это принятый
в магазине размер порции, он одинаков у всех уже заведённых карточек.

Запуск:
  python load-products.py ВЫГРУЗКА.xlsx --dry-run     # показать, ничего не менять
  python load-products.py ВЫГРУЗКА.xlsx --apply       # записать
Переменные окружения: STRAPI_URL, STRAPI_API_TOKEN
"""
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from collections import Counter, defaultdict

import openpyxl

SRC = sys.argv[1] if len(sys.argv) > 1 else None
APPLY = "--apply" in sys.argv
BASE = os.environ.get("STRAPI_URL", "http://localhost:1337").rstrip("/")
TOKEN = os.environ.get("STRAPI_API_TOKEN", "")

# Категория витрины -> (слаг, порядок). Слаги существующих категорий НЕ меняем:
# по ним построены ссылки, которые уже могли разойтись.
CATEGORIES = {
    "Сыры и молочка":       ("syry-i-maslo", 1),          # существует как «Сыры и масло»
    "Здоровье Алтая":       ("zdorovie-altaya", 2),       # существует
    "Косметика":            ("kosmetika-i-bakaleya", 3),  # существует как «Косметика и бакалея»
    "Мясо и деликатесы":    ("myaso-i-delikatesy", 5),
    "Сладости":             ("sladosti", 6),
    "Мёд и пчелопродукция": ("med-i-pcheloprodukciya", 7),
    "Бакалея и напитки":    ("bakaleya-i-napitki", 8),
    "Заморозка":            ("zamorozka", 9),
}

# Группа выгрузки -> (категория витрины, скоропорт)
GROUPS = {
    "Травы Белокуриха":      ("Здоровье Алтая", False),
    "Косметика Ощепково":    ("Косметика", False),
    "Алтын Бай":             ("Косметика", False),
    "Специалист":            ("Здоровье Алтая", False),
    "АлтайСелигор":          ("Здоровье Алтая", False),
    "ДивАлтай":              ("Косметика", False),
    "Альтамар":              ("Здоровье Алтая", False),
    "Две линии Косметика":   ("Косметика", False),
    "Виталанг Био":          ("Здоровье Алтая", False),
    "ИП Зажецкая":           ("Сладости", False),
    "Белоруссия колбаса":    ("Мясо и деликатесы", True),
    "Брюкке Сыры":           ("Сыры и молочка", True),
    "Мед":                   ("Мёд и пчелопродукция", False),
    "Пятачок":               ("Мясо и деликатесы", True),
    "Rifero конфеты":        ("Сладости", False),
    "Лазурин":               ("Косметика", False),
    "Алатау":                ("Сладости", False),
    "Маркет Сервис Бакалея": ("Бакалея и напитки", False),
    "Беллорусия сыры":       ("Сыры и молочка", True),
    "Бакалея Белоруссия":    ("Бакалея и напитки", False),
    "Радоград":              ("Сладости", False),
    "Белорусская кондитерка":("Сладости", False),
    "Биостимул":             ("Здоровье Алтая", False),
    "Алтайбиопроект":        ("Здоровье Алтая", False),
    "Соломонов":             ("Заморозка", True),
    "Деликатесы дичь":       ("Мясо и деликатесы", True),
    "Мази Тельменевой":      ("Здоровье Алтая", False),
    "Нарине":                ("Здоровье Алтая", False),
    "Органик Мир":           ("Здоровье Алтая", False),
    "Профитроли":            ("Сладости", False),
    "Морсы":                 ("Бакалея и напитки", False),
    "Алтайские луга":        ("Мясо и деликатесы", True),
    "Черга":                 ("Сыры и молочка", True),
    "Куяган":                ("Сыры и молочка", True),
    "Мумие и чай":           ("Здоровье Алтая", False),
    "Велнесс кемист":        ("Здоровье Алтая", False),
    "Посолье Колывань":      ("Мясо и деликатесы", True),
    "Сибирская Воля":        ("Бакалея и напитки", False),
    "Колывань":              ("Мясо и деликатесы", True),
    "Кедровый орех":         ("Бакалея и напитки", False),
    "Жива":                  ("Косметика", False),
}

TRANS = {
    "а": "a", "б": "b", "в": "v", "г": "g", "д": "d", "е": "e", "ё": "e",
    "ж": "zh", "з": "z", "и": "i", "й": "y", "к": "k", "л": "l", "м": "m",
    "н": "n", "о": "o", "п": "p", "р": "r", "с": "s", "т": "t", "у": "u",
    "ф": "f", "х": "h", "ц": "c", "ч": "ch", "ш": "sh", "щ": "sch",
    "ъ": "", "ы": "y", "ь": "", "э": "e", "ю": "yu", "я": "ya",
}


def slugify(name):
    s = name.lower().strip()
    s = "".join(TRANS.get(ch, ch) for ch in s)
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s[:60].rstrip("-") or "tovar"


def num(v):
    try:
        return float(str(v).replace(",", "."))
    except Exception:
        return 0.0


def api(method, path, payload=None):
    req = urllib.request.Request(
        BASE + path,
        method=method,
        data=json.dumps(payload).encode("utf-8") if payload is not None else None,
        headers={
            "Authorization": "Bearer " + TOKEN,
            "Content-Type": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=40) as r:
        body = r.read().decode("utf-8")
        return json.loads(body) if body else {}


def ensure_categories(dry):
    """Существующие переименовываем (слаг не трогаем), недостающие создаём."""
    existing = {c["slug"]: c for c in api("GET", "/api/categories?pagination[pageSize]=100")["data"]}
    ids = {}
    for name, (slug, order) in CATEGORIES.items():
        cur = existing.get(slug)
        if cur:
            ids[name] = cur["documentId"]
            if cur["name"] != name:
                print(f"  переименование: «{cur['name']}» -> «{name}» (слаг {slug} сохраняется)")
                if not dry:
                    api("PUT", f"/api/categories/{cur['documentId']}", {"data": {"name": name}})
        else:
            print(f"  создать категорию: «{name}» ({slug})")
            if not dry:
                res = api("POST", "/api/categories",
                          {"data": {"name": name, "slug": slug, "sortOrder": order}})
                ids[name] = res["data"]["documentId"]
            else:
                ids[name] = "—"
    return ids


def main():
    if not SRC:
        print("укажите файл выгрузки"); sys.exit(1)
    if not APPLY:
        print("=== ПРОБНЫЙ ПРОГОН, ничего не записывается ===\n")

    wb = openpyxl.load_workbook(SRC, read_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    hdr = [str(h).strip() if h else "" for h in rows[0]]
    idx = {h: i for i, h in enumerate(hdr)}

    def col(r, n):
        i = idx.get(n)
        return r[i] if i is not None and i < len(r) else None

    print("Категории:")
    cat_ids = ensure_categories(dry=not APPLY)
    print()

    # уже заведённые товары — по uuid, чтобы не задваивать
    have = set()
    seen_slugs = set()
    page = 1
    while True:
        res = api("GET", f"/api/products?pagination[page]={page}&pagination[pageSize]=100&fields[0]=evotorUuid&fields[1]=slug")
        for p in res["data"]:
            if p.get("evotorUuid"):
                have.add(p["evotorUuid"].strip())
            # Слаги существующих карточек тоже занимаем: адрес страницы уникален,
            # и товар с тем же названием, но другим кодом Эвотора иначе упрётся
            # в конфликт уже при записи.
            if p.get("slug"):
                seen_slugs.add(p["slug"].strip())

        if page >= res["meta"]["pagination"]["pageCount"]:
            break
        page += 1
    print(f"уже в админке: {len(have)} товаров (их пропускаем), занято слагов: {len(seen_slugs)}\n")
    plan, skipped = [], Counter()
    for r in rows[1:]:
        if num(col(r, "Остаток")) <= 0:
            skipped["нет остатка"] += 1
            continue
        group = str(col(r, "Группа") or "без группы").strip()
        if group not in GROUPS:
            skipped["спорная группа: " + group] += 1
            continue
        uuid = str(col(r, "uuid") or "").strip()
        name = str(col(r, "Наименование") or "").strip()
        if not uuid or not name:
            skipped["нет uuid или названия"] += 1
            continue
        if uuid in have:
            skipped["уже заведён"] += 1
            continue

        cat, perish = GROUPS[group]
        slug = slugify(name)
        base = slug
        n = 2
        while slug in seen_slugs:
            slug = f"{base[:56]}-{n}"
            n += 1
        seen_slugs.add(slug)

        item = {
            "adminName": name[:255],
            "evotorUuid": uuid,
            "slug": slug,
            "visible": True,
            "isPerishable": perish,
            "category": cat_ids[cat],
        }
        if str(col(r, "Ед.изм.") or "").strip().lower() == "кг":
            item["portionMassG"] = 100
        plan.append((cat, item))

    print("К загрузке:", len(plan))
    by_cat = Counter(c for c, _ in plan)
    for c, n in by_cat.most_common():
        print(f"   {c:24} {n:>5}")
    print()
    print("Пропущено:")
    for k, v in skipped.most_common(8):
        print(f"   {k[:50]:52} {v:>5}")
    print()
    perish_n = sum(1 for _, i in plan if i["isPerishable"])
    print(f"скоропортящихся (без доставки по России): {perish_n}")
    print(f"весовых (порция 100 г): {sum(1 for _, i in plan if 'portionMassG' in i)}")
    print()
    print("Примеры карточек:")
    for c, i in plan[:5]:
        print(f"   [{c}] {i['adminName'][:45]}  ->  /product/{i['slug']}")

    if not APPLY:
        print("\nЗапуск с --apply запишет это в админку.")
        return

    print("\n=== ЗАПИСЬ ===")
    ok = err = 0
    for n, (_, item) in enumerate(plan, 1):
        try:
            api("POST", "/api/products", {"data": item})
            ok += 1
        except urllib.error.HTTPError as e:
            err += 1
            if err <= 5:
                print(f"  ошибка на «{item['adminName'][:40]}»: {e.code} {e.read().decode('utf-8')[:160]}")
        if n % 100 == 0:
            print(f"  ... {n}/{len(plan)}")
            time.sleep(0.5)
    print(f"\nсоздано: {ok}, ошибок: {err}")


main()
