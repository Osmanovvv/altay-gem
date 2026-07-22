import { Mail, MapPin, Phone } from "lucide-react";
import { Link } from "@tanstack/react-router";

// Фолбэк колонки «Каталог» на случай недоступного бэкенда;
// рабочие ссылки строятся из реальных категорий (useCategories)
const CATALOG_FALLBACK = [
  { label: "Мёд и пчелопродукты", slug: null },
  { label: "Травяные чаи", slug: null },
  { label: "Натуральная косметика", slug: null },
  { label: "Здоровье и БАДы", slug: null },
] as const;

const CUSTOMERS = [
  { label: "Доставка", to: "/delivery" },
  { label: "Оплата", to: "/delivery", hash: "payment" },
  { label: "Возврат", to: "/delivery", hash: "returns" },
  { label: "Контакты", to: "/about" },
] as const;

import { useCategories, useSettings } from "@/context/SettingsContext";

export function Footer() {
  const settings = useSettings();
  const apiCategories = useCategories();
  // Ссылки на категории каталога (ТЗ 6.1); фолбэк — без фильтра
  const catalogLinks: Array<{ label: string; slug: string | null }> = apiCategories.length
    ? apiCategories.map((c) => ({ label: c.name, slug: c.slug }))
    : [...CATALOG_FALLBACK];
  const points = settings?.storePoints?.length
    ? settings.storePoints
    : [
        {
          name: "Жемчужина Алтая",
          address: "Новосибирск, ул. Ленинградская 75/2",
          hours: "Ежедневно 9:00–20:00",
        },
        {
          name: "Натуральные продукты",
          address: "Новосибирск, ул. Титова 32",
          hours: "Ежедневно 9:00–20:00",
        },
      ];
  // Контакты из админки; фейковых заглушек не показываем — если заказчица
  // ещё не заполнила, строка контакта просто не рендерится (как в FindUs).
  const phone = settings?.contacts?.phone?.trim();
  const email = settings?.contacts?.email?.trim();
  const muted = "var(--color-text-muted)";
  const text = "#c8bfa8";
  const accent = "var(--color-accent)";

  const linkStyle = {
    color: text,
    fontFamily: "var(--font-body)",
    fontSize: 14,
    minHeight: 44,
    display: "inline-flex",
    alignItems: "center",
  } as const;

  const headingStyle = {
    fontFamily: "var(--font-display)",
    fontSize: 20,
    fontWeight: 600,
    color: "var(--color-text-on-dark)",
    marginBottom: 16,
  } as const;

  return (
    <footer
      style={{
        backgroundColor: "var(--color-bg-dark-deep)",
        color: text,
        borderTop: "1px solid rgba(200,150,62,0.25)",
      }}
    >
      <div className="mx-auto max-w-7xl px-4 py-12 md:px-8 md:py-16">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div>
            <div className="flex items-baseline gap-2">
              <span
                style={{
                  fontFamily: "var(--font-display)",
                  color: accent,
                  fontSize: 28,
                  fontWeight: 600,
                  lineHeight: 1,
                }}
              >
                Жемчужина
              </span>
              <span
                style={{
                  fontFamily: "var(--font-body)",
                  color: muted,
                  fontSize: 12,
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                }}
              >
                Алтая
              </span>
            </div>
            <p
              className="mt-4"
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 14,
                lineHeight: 1.6,
                color: text,
              }}
            >
              Натуральная продукция двух алтайских фермерских хозяйств. Бережно собираем мёд, травы
              и дары тайги. Привозим в Новосибирск и доставляем по всей России.
            </p>
          </div>

          {/* Catalog */}
          <div>
            <h4 style={headingStyle}>Каталог</h4>
            <ul className="flex flex-col">
              {catalogLinks.map((l) => (
                <li key={l.label}>
                  <Link
                    to="/catalog"
                    search={l.slug ? { category: l.slug } : undefined}
                    style={linkStyle}
                    className="transition-colors hover:text-white"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Customers */}
          <div>
            <h4 style={headingStyle}>Клиентам</h4>
            <ul className="flex flex-col">
              {CUSTOMERS.map((l) => (
                <li key={l.label}>
                  <Link
                    to={l.to}
                    hash={"hash" in l ? l.hash : undefined}
                    style={linkStyle}
                    className="transition-colors hover:text-white"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Contacts */}
          <div>
            <h4 style={headingStyle}>Контакты</h4>
            <ul className="flex flex-col gap-3">
              {points.map((p) => (
                <li
                  key={p.address}
                  className="flex items-start gap-2"
                  style={{ fontSize: 14, lineHeight: 1.5 }}
                >
                  <MapPin size={16} style={{ color: accent, marginTop: 2, flexShrink: 0 }} />
                  <span>
                    {p.name}: {p.address}
                    <br />
                    <span style={{ color: muted }}>{p.hours ?? ""}</span>
                  </span>
                </li>
              ))}
              {phone && (
                <li>
                  <a
                    href={"tel:" + phone.replace(/[^+\d]/g, "")}
                    className="flex items-center gap-2 transition-colors hover:text-white"
                    style={linkStyle}
                  >
                    <Phone size={16} style={{ color: accent }} />
                    {phone}
                  </a>
                </li>
              )}
              {email && (
                <li>
                  <a
                    href={"mailto:" + email}
                    className="flex items-center gap-2 transition-colors hover:text-white"
                    style={linkStyle}
                  >
                    <Mail size={16} style={{ color: accent }} />
                    {email}
                  </a>
                </li>
              )}
            </ul>
          </div>
        </div>

        <div
          className="mt-12 border-t pt-6"
          style={{
            borderColor: "rgba(200,191,168,0.12)",
            fontFamily: "var(--font-body)",
            fontSize: 13,
            color: muted,
          }}
        >
          {/* Реквизиты продавца (ТЗ 7.2: «реквизиты в подвале сайта»);
              значение заказчица ведёт в админке — «Тексты и настройки сайта». */}
          {settings?.requisites?.trim() && (
            <p className="mb-4" style={{ whiteSpace: "pre-line", lineHeight: 1.6 }}>
              {settings.requisites.trim()}
            </p>
          )}
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <span>© Жемчужина Алтая, 2026</span>
            <Link
              to="/privacy"
              className="transition-colors hover:text-white"
              style={{ minHeight: 44, display: "inline-flex", alignItems: "center" }}
            >
              Политика конфиденциальности
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}

export default Footer;
