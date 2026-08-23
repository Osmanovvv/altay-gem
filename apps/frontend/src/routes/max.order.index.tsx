import { useEffect, useState } from "react";
import { Link, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ClipboardList } from "lucide-react";

import { LAST_ORDER_KEY } from "./max.checkout";

/**
 * Вкладка «Заказ» (ТЗ р.13). Внутри мессенджера у покупателя нет ни почты под
 * рукой, ни истории ссылок, поэтому последний оформленный заказ запоминается
 * локально и открывается одним касанием. Если заказов не было — понятная
 * заглушка вместо пустого экрана.
 */
export const Route = createFileRoute("/max/order/")({
  component: MaxLastOrder,
});

interface LastOrder {
  id: number;
  token: string;
  number: string;
}

function MaxLastOrder() {
  const navigate = useNavigate();
  const [last, setLast] = useState<LastOrder | null>(null);
  const [checked, setChecked] = useState(false);

  // localStorage доступен только в браузере — на сервере рендерим нейтральное
  // состояние, иначе гидрация разойдётся с разметкой.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LAST_ORDER_KEY);
      const parsed = raw ? (JSON.parse(raw) as LastOrder) : null;
      if (parsed && typeof parsed.id === "number" && typeof parsed.token === "string") {
        setLast(parsed);
        void navigate({
          to: "/max/order/$id",
          params: { id: String(parsed.id) },
          search: { token: parsed.token },
          replace: true,
        });
      }
    } catch {
      /* битое хранилище — покажем заглушку */
    }
    setChecked(true);
  }, [navigate]);

  if (last) return null;

  return (
    <div className="flex flex-col items-center px-6 pb-6 pt-16 text-center">
      <ClipboardList size={40} style={{ color: "var(--color-text-muted)", opacity: 0.5 }} />
      <h1
        className="mt-4"
        style={{
          fontFamily: "var(--font-display)",
          fontSize: 22,
          fontWeight: 600,
          color: "var(--color-text)",
        }}
      >
        Заказов пока нет
      </h1>
      <p
        className="mt-1"
        style={{ fontFamily: "var(--font-body)", fontSize: 14, color: "var(--color-text-muted)" }}
      >
        {checked
          ? "Здесь появится ваш заказ — со статусом и составом"
          : "Загружаем…"}
      </p>
      <Link
        to="/max/catalog"
        className="mt-6 inline-flex items-center justify-center rounded-full px-7"
        style={{
          backgroundColor: "var(--color-accent)",
          color: "var(--color-bg-dark)",
          fontFamily: "var(--font-body)",
          fontWeight: 700,
          fontSize: 15,
          minHeight: 48,
          textDecoration: "none",
        }}
      >
        В каталог
      </Link>
    </div>
  );
}
