import { Outlet, createFileRoute } from "@tanstack/react-router";
import { MaxShell } from "@/components/max/MaxShell";

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
  }),
  component: MaxLayout,
});

function MaxLayout() {
  return (
    <MaxShell>
      <Outlet />
    </MaxShell>
  );
}
