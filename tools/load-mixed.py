# -*- coding: utf-8 -*-
"""
Догрузка оставшихся групп выгрузки — тех, что при первом заходе отложили.

Отложили их по двум причинам: названия групп неинформативны («мороз»,
«федоруц» — это поставщики) и внутри групп лежат товары разных категорий
(в «Брюкке» и колбаса, и творог, и вареники, и торт).

Поэтому здесь категория и скоропорт определяются ПО НАЗВАНИЮ ТОВАРА, а не по
названию группы.

ПРО СКОРОПОРТ — ГЛАВНОЕ ОТЛИЧИЕ ОТ ПЕРВОГО ЗАХОДА. Скоропорт запрещает
доставку по России. Ставить его на всю мясную группу нельзя: тушёнка в жестяной
банке и паштет в стекле хранятся годами, и запрет отрезал бы от пересылки
ровно те товары, которые лучше всего её переносят. Поэтому консервы
распознаются отдельно и скоропортом НЕ помечаются.

Запуск:
  python load-mixed.py ВЫГРУЗКА.xlsx --dry-run
  python load-mixed.py ВЫГРУЗКА.xlsx --apply
"""
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from collections import Counter

import openpyxl

SRC = sys.argv[1] if len(sys.argv) > 1 else None
APPLY = "--apply" in sys.argv
BASE = os.environ.get("STRAPI_URL", "http://localhost:1337").rstrip("/")
TOKEN = os.environ.get("STRAPI_API_TOKEN", "")

# Группы, которые догружаем. Остальные уже загружены первым заходом.
GROUPS = {
    "Брюкке", "Белокуриха", "Монастырский двор", "Сибирские грибочки",
    "Сашера мед", "ИП Зажецкая Н.А", "мороз", "федоруц", "Травы акция",
    "Молочка Брюкке",
}
# Не выкладываем вовсе: не товар витрины.
NEVER = {"Пакеты", "без группы"}

SLUGS = {
    "Сыры и молочка": "syry-i-maslo",
    "Здоровье Алтая": "zdorovie-altaya",
    "Косметика": "kosmetika-i-bakaleya",
    "Мясо и деликатесы": "myaso-i-delikatesy",
    "Сладости": "sladosti",
    "Мёд и пчелопродукция": "med-i-pcheloprodukciya",
    "Бакалея и напитки": "bakaleya-i-napitki",
    "Заморозка": "zamorozka",
}

# Консервы и пресервы: хранятся долго, скоропортом НЕ помечаем.
# ВАЖНО: «паштет» сам по себе консервом НЕ считается — у мясокомбината это
# охлаждённый продукт. Консервом его делает только явно названная тара
# (ж/б, стекло, «консервы»), иначе паштет уедет по России и испортится.
CANNED = re.compile(r"(ж/б|тушен|тушён|консерв|в собственном соку|стекло|"
                    r"икра грибная|грузди солен|закуска грибная|сгущ)", re.I)

# Порядок правил важен: первое совпадение выигрывает.
RULES = [
    # заморозка — раньше мяса и молочки: «вареники с творогом» это заморозка
    ("Заморозка", re.compile(
        r"(пельмен|вареник|манты|бузы|чебурек|беляш|люля|голубц|котлет|наггетс|"
        r"блинчик|хинкал|перец фаршированн|мороженое|пломбир|эскимо|стаканчик|в рожке|рожок|морж|"
        r"смесь|капуста цветная|брокколи|лечо|клюква вес|брусника вес|"
        r"смородина черная вес|вишня без косточки|облепиха вес|клубника вес)", re.I)),
    # косметика — раньше здоровья: «крем-бальзам» это косметика
    ("Косметика", re.compile(
        r"(мыло|шампун|скраб|мочалк|крем |крем-|бб крем|маска для|зубная паста|"
        r"лосьон|гель для|пена для|дезодорант|бальзам для волос|эфирное масло)", re.I)),
    ("Сыры и молочка", re.compile(
        r"(молоко|кефир|йогурт|творог|сметана|сливки|ряженка|простокваша|"
        r"\bсыр\b|сыр |брынза|сулугуни|качотта|зеленодольский|масло слив|"
        r"масло крестьянское|масло топлен|пахта|колбасный сыр)", re.I)),
    ("Мясо и деликатесы", re.compile(
        r"(шашлык|орех мясной|фарш|зернистая|мясной дуэт|"
        r"колбас|сосиск|сардельк|ветчин|карбонат|шейка|сервелат|краковск|лионск|"
        r"таллинск|украинск|докторск|конская|конина|ливерн|бастурм|карпаччо|окорок|"
        r"грудинк|шпик|вырезк|намазк|буженин|зельц|мозайка|тушен|тушён|говядин|"
        r"свинин|оленин|марал|кабан|медвежат|лося|дичь|горная из|паштет|мясо)", re.I)),
    ("Сладости", re.compile(
        r"(мармелад|пастил|зефир|конфет|шоколад|козинак|щербет|халва|торт|рулет|"
        r"пряник|печенье|сушка|цукат|леденц|драже|какао|профитрол|десерт)", re.I)),
    ("Мёд и пчелопродукция", re.compile(
        r"(\bмёд\b|\bмед\b|перга|воск|прополис|забрус|восковая моль)", re.I)),
    ("Бакалея и напитки", re.compile(
        r"(хлеб|багет|хлебц|брускетт|мука|макарон|ракушки|крупа|каша|квас|"
        r"вода|морс|сбитень|сок |майонез|соус|масло растит|печень трески|"
        r"грузди|икра грибная|закуска грибная|чипсы)", re.I)),
    # чай и сборы — в здоровье, у этого магазина они лечебные
    ("Здоровье Алтая", re.compile(r"(чай|сбор|травы|хмель|кора |бальзам|капли|"
                                  r"капсул|экстракт|сироп|пант|мумие|живица|чн |ч\.н\.|сустарад)", re.I)),
]

TRANS = {"а":"a","б":"b","в":"v","г":"g","д":"d","е":"e","ё":"e","ж":"zh","з":"z",
         "и":"i","й":"y","к":"k","л":"l","м":"m","н":"n","о":"o","п":"p","р":"r",
         "с":"s","т":"t","у":"u","ф":"f","х":"h","ц":"c","ч":"ch","ш":"sh",
         "щ":"sch","ъ":"","ы":"y","ь":"","э":"e","ю":"yu","я":"ya"}


def slugify(name):
    s = "".join(TRANS.get(c, c) for c in name.lower().strip())
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s[:60].rstrip("-") or "tovar"


def classify(name):
    """(категория, скоропорт). Категория None — не смогли определить."""
    for cat, pat in RULES:
        if pat.search(name):
            perish = cat in ("Сыры и молочка", "Заморозка") or (
                cat == "Мясо и деликатесы" and not CANNED.search(name)
            )
            if cat == "Сладости" and re.search(r"(торт|рулет|десерт)", name, re.I):
                perish = True
            return cat, perish
    return None, False


def num(v):
    try:
        return float(str(v).replace(",", "."))
    except Exception:
        return 0.0


def api(method, path, payload=None):
    req = urllib.request.Request(
        BASE + path, method=method,
        data=json.dumps(payload).encode("utf-8") if payload is not None else None,
        headers={"Authorization": "Bearer " + TOKEN, "Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=40) as r:
        b = r.read().decode("utf-8")
        return json.loads(b) if b else {}


def main():
    if not SRC:
        print("укажите файл выгрузки"); sys.exit(1)
    if not APPLY:
        print("=== ПРОБНЫЙ ПРОГОН, ничего не записывается ===\n")

    cats = {c["slug"]: c["documentId"]
            for c in api("GET", "/api/categories?pagination[pageSize]=100")["data"]}

    have, slugs = set(), set()
    page = 1
    while True:
        res = api("GET", f"/api/products?pagination[page]={page}&pagination[pageSize]=100"
                          f"&fields[0]=evotorUuid&fields[1]=slug")
        for p in res["data"]:
            if p.get("evotorUuid"): have.add(p["evotorUuid"].strip())
            if p.get("slug"): slugs.add(p["slug"].strip())
        if page >= res["meta"]["pagination"]["pageCount"]: break
        page += 1
    print(f"уже в админке: {len(have)} товаров\n")

    wb = openpyxl.load_workbook(SRC, read_only=True)
    ws = wb.active
    rows = list(ws.iter_rows(values_only=True))
    hdr = [str(h).strip() if h else "" for h in rows[0]]
    idx = {h: i for i, h in enumerate(hdr)}

    def col(r, n):
        i = idx.get(n)
        return r[i] if i is not None and i < len(r) else None

    plan, unknown = [], []
    for r in rows[1:]:
        if num(col(r, "Остаток")) <= 0: continue
        grp = str(col(r, "Группа") or "без группы").strip()
        if grp in NEVER or grp not in GROUPS: continue
        uuid = str(col(r, "uuid") or "").strip()
        name = str(col(r, "Наименование") or "").strip()
        if not uuid or not name or uuid in have: continue

        cat, perish = classify(name)
        if not cat:
            unknown.append((grp, name)); continue

        slug = slugify(name); base = slug; n = 2
        while slug in slugs:
            slug = f"{base[:56]}-{n}"; n += 1
        slugs.add(slug)

        item = {"adminName": name[:255], "evotorUuid": uuid, "slug": slug,
                "visible": True, "isPerishable": perish, "category": cats[SLUGS[cat]]}
        if str(col(r, "Ед.изм.") or "").strip().lower() == "кг":
            item["portionMassG"] = 100
        plan.append((cat, perish, item))

    print("К загрузке:", len(plan))
    for c, n in Counter(c for c, _, _ in plan).most_common():
        p = sum(1 for cc, pp, _ in plan if cc == c and pp)
        print(f"   {c:24} {n:>4}   из них скоропорт: {p}")
    print()
    print("Консервы, оставленные БЕЗ скоропорта (можно возить по России):")
    canned = [i["adminName"] for c, p, i in plan if c == "Мясо и деликатесы" and not p]
    for n in canned[:8]: print("   ", n[:62])
    print(f"   ... всего {len(canned)}")
    print()
    if unknown:
        print(f"НЕ РАСПОЗНАНО — {len(unknown)}, не загружаю:")
        for g, n in unknown[:12]: print(f"   [{g}] {n[:58]}")
    print()
    print("Примеры раскладки:")
    for c, p, i in plan[:8]:
        print(f"   {c:22} {'скоропорт' if p else '        —'}  {i['adminName'][:44]}")

    if not APPLY:
        print("\nЗапуск с --apply запишет это в админку."); return

    print("\n=== ЗАПИСЬ ===")
    ok = err = 0
    for n, (_, _, item) in enumerate(plan, 1):
        try:
            api("POST", "/api/products", {"data": item}); ok += 1
        except urllib.error.HTTPError as e:
            err += 1
            if err <= 5:
                print(f"  ошибка «{item['adminName'][:36]}»: {e.code} {e.read().decode()[:130]}")
        if n % 50 == 0:
            print(f"  ... {n}/{len(plan)}"); time.sleep(0.3)
    print(f"\nсоздано: {ok}, ошибок: {err}")


main()
