import { Outlet, createFileRoute } from "@tanstack/react-router";
import { MaxShell } from "@/components/max/MaxShell";
import { ChannelProvider } from "@/context/ChannelContext";

/**
 * Мини-приложение MAX (ТЗ р.13) — «второй канал продаж на том же бэкенде и
 * API». Живёт на том же домене по пути /max: платформа требует только HTTPS,
 * поэтому отдельный поддомен и второй сертификат не нужны.
 *
 * Этот маршрут — общая оболочка всех экранов мини-аппа: нижняя панель вкладок
 * вместо шапки и подвала сайта. Витрина сайта при этом не меняется вообще:
 * у неё свой Layout, сюда она не заходит.
 */
export const Route = createFileRoute("/max")({
  head: () => ({
    meta: [
      { title: "Жемчужина Алтая" },
      // Внутри мессенджера индексация не нужна, а лишние страницы в поиске
      // сайту только мешают (дубли каталога).
      { name: "robots", content: "noindex, nofollow" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
    ],
    // Мост MAX (window.WebApp). Нужен, чтобы уводить на оплату через openLink:
    // платёжная страница запрещает показ внутри чужого окна, и обычная подмена
    // адреса ломается, если MAX открывает приложение во фрейме. На сайте скрипт
    // не подключается — он только здесь. Вне MAX объект не появится, и код
    // честно откатывается на обычный переход (см. lib/max-bridge.ts).
    scripts: [{ src: "https://st.max.ru/js/max-web-app.js", defer: true }],
  }),
  component: MaxLayout,
});

function MaxLayout() {
  return (
    // Канал объявляем на всю оболочку: общие секции витрины рисуются и здесь,
    // и на сайте, а ссылки внутри них должны оставаться внутри /max — иначе из
    // приложения выбрасывает на сайт вместе с потерей панели вкладок.
    <ChannelProvider channel="max">
      <MaxShell>
        <Outlet />
      </MaxShell>
    </ChannelProvider>
  );
}
