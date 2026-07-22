# Контент-труба: /privacy, FindUs, Отзывы (аудит-хвосты 0-1)

Дата: 2026-07-22. Скоуп утверждён пользователем (пункты 1-3 из аудита).

## Проблема

Три «стыдных» плейсхолдера/фейка на витрине, оставшихся с макета:
1. Ссылка «Политика конфиденциальности» в подвале — мёртвый якорь `#privacy`, роута нет. Юр.требование 152-ФЗ (ТЗ:415).
2. FindUs: кнопки «Построить маршрут» захардкожены на фейковый адрес «Новосибирск, Ватутина 89» (один на оба магазина); телефон/почта кнопок захардкожены (`+73830000000`, `hello@altai-pearl.ru`) вместо данных из Strapi.
3. Отзывы: хардкод «Рейтинг 4,9» (бэкенд реально считает среднее, но страница игнорит), кнопки «Оставить отзыв» ведут в `#`, нет виджета Я.Карт.

## Принцип решения

Убираем хардкод/фейк, весь контент — из Strapi (заказчица правит в «Тексты и настройки сайта»). При пустом контенте — корректная деградация (плейсхолдер/скрытие), без мёртвых элементов. Мы строим «трубу»; текст ПД, ссылки отзывов и org-id Я.Карт — контент заказчицы.

## Изменения по слоям

### Strapi (schema, non-destructive — новые поля пустые)
- `site-setting` (singleType) += `privacyPolicy` (text), `reviewYandexUrl` (string), `review2gisUrl` (string), `yandexReviewsWidgetUrl` (string).
- `site.store-point` (component) += `mapUrl` (string, опц. — точная ссылка на карту точки).

Поля попадают в `siteSettings()` автоматически (`populate=*` + скаляры). Существующий контент (requisites и т.п.) не трогается.

### Backend
- `catalog.controller.settings()` в ответе добавляет: `privacyPolicy`, `reviewYandexUrl`, `review2gisUrl`, `yandexReviewsWidgetUrl`. `storePoints` уже отдаётся сырым компонентом → `mapUrl` пройдёт сам.
- TDD-смоук: `/settings` пробрасывает новые поля из siteSettings (map-passthrough, без изобретения логики).

### Frontend
- `api.ts` `ApiSettings` += `privacyPolicy: string | null`, `reviewYandexUrl/review2gisUrl/yandexReviewsWidgetUrl: string | null`; `storePoints[].mapUrl?: string`.
- **Роут `/routes/privacy.tsx`**: Header + PageHero(«Политика конфиденциальности») + текст `settings.privacyPolicy` (`white-space: pre-line`). Пусто → плейсхолдер «Политика обработки персональных данных готовится. По вопросам — <контакты из settings>». Footer + подвал.
- `Footer.tsx`: `<a href="#privacy">` → `<Link to="/privacy">`.
- `FindUsSection.tsx`:
  - Кнопки «Позвонить»/«Написать» — из `settings.contacts.phone/email`; если нет — скрыть соответствующую кнопку. Убрать `tel:+73830000000` / `mailto:hello@altai-pearl.ru`.
  - Нижняя панель «Построить маршрут:» — одна кнопка **на каждую точку** из `storePoints`: href = `point.mapUrl` || `https://yandex.ru/maps/?text=${encodeURIComponent(point.address)}`, подпись = короткий адрес/имя. Удалить фейк «Ватутина 89» (обе захардкоженные ссылки).
- `reviews.tsx`:
  - Рейтинг из `loader.average`: `average != null` → «Средний рейтинг {average} …»; null → нейтральный подзаголовок без числа. Убрать хардкод «4,9» (подзаголовок И meta — meta без числового заявления).
  - CTA «Оставить на Яндекс/2ГИС» → `reviewYandexUrl`/`review2gisUrl`; кнопка без ссылки не рендерится. Если обе пусты — скрыть ряд кнопок (текст CTA-блока оставить).
  - Виджет Я.Карт: если `yandexReviewsWidgetUrl` задан — секция с `<iframe src=…>` (lazy, с заголовком «Отзывы на Яндекс.Картах»); иначе секция не рендерится.

## Не входит
- Реальный юр.текст ПД, org-id/URL Я.Карт, ссылки 2ГИС/Яндекс, реальные телефон/почта — контент заказчицы (труба готова, поля пустые до заполнения).
- Виджет 2ГИС (в модели отзывы 2ГИС — ручные записи; так и остаётся).

## Проверка
- Backend: тесты (смоук /settings), lint, build.
- Frontend: `./node_modules/.bin/tsc --noEmit` (eslint не гоняем — CRLF-шум).
- Strapi: build.
- Live e2e (headless playwright на проде после деплоя): `/privacy` 200 и рендерит плейсхолдер/текст; FindUs — ссылки маршрута НЕ содержат «Ватутина», содержат реальные адреса; отзывы — нет строки «4,9» при пустом average, кнопки не ведут в `#`.

## Деплой
Порядок: Strapi (схема, автомиграция при старте) → backend (контракт) → frontend (пересборка с VITE_API_URL=https://ecomarket-altai.ru/api/v1). Бэкапы, boot-тесты, pm2. Новых env нет.
