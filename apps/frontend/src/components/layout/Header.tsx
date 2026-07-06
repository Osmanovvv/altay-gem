import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Menu, Phone, Search, ShoppingBag, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useCart } from "@/context/CartContext";

const NAV_LINKS = [
  { label: "Каталог", to: "/catalog" },
  { label: "Акции", to: "/promo" },
  { label: "О нас", to: "/about" },
  { label: "Доставка", to: "/delivery" },
  { label: "Отзывы", to: "/reviews" },
] as const;

interface HeaderProps {
  phone?: string;
}

import { useSettings } from "@/context/SettingsContext";

export function Header({ phone: phoneProp }: HeaderProps) {
  const settings = useSettings();
  const phone = phoneProp ?? settings?.contacts?.phone ?? "+7 (383) 000-00-00";
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const { getCartCount } = useCart();
  const cartCount = getCartCount();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 80);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  // Header всегда держит светлую (тёплая бумага) подложку — на тёмном хиро
  // прозрачный хэдер сливался с фото и переставал читаться.
  const textColor = "var(--color-text)";
  const accent = "var(--color-accent)";

  return (
    <>
      <header
        className="fixed top-0 left-0 right-0 z-40 transition-all duration-300"
        style={{
          backgroundColor: "var(--color-bg-cream)",
          boxShadow: scrolled ? "0 6px 24px rgba(31,26,14,0.12)" : "none",
        }}
      >
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 md:h-20 md:px-8">
          {/* Logo */}
          <Link
            to="/"
            className="flex items-baseline gap-2"
            style={{ minHeight: 44 }}
          >
            <span
              style={{
                fontFamily: "var(--font-display)",
                color: accent,
                fontWeight: 600,
                fontSize: 28,
                lineHeight: 1,
              }}
            >
              Жемчужина
            </span>
            <span
              style={{
                fontFamily: "var(--font-body)",
                color: "var(--color-text-muted)",
                fontWeight: 500,
                fontSize: 13,
                letterSpacing: "0.18em",
                textTransform: "uppercase",
              }}
            >
              Алтая
            </span>
          </Link>

          {/* Desktop nav */}
          <nav className="hidden lg:flex items-center gap-8">
            {NAV_LINKS.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="text-sm transition-colors hover:opacity-70"
                style={{
                  color: textColor,
                  fontFamily: "var(--font-body)",
                  fontWeight: 500,
                  minHeight: 44,
                  display: "inline-flex",
                  alignItems: "center",
                }}
              >
                {l.label}
              </Link>
            ))}
          </nav>

          {/* Icons */}
          <div className="flex items-center gap-1 md:gap-2">
            <a
              href={`tel:${phone.replace(/[^+\d]/g, "")}`}
              className="hidden md:inline-flex items-center justify-center rounded-full transition-colors hover:bg-black/5"
              style={{ width: 44, height: 44, color: textColor }}
              aria-label="Позвонить"
            >
              <Phone size={20} />
            </a>
            <Link
              to="/search"
              className="inline-flex items-center justify-center rounded-full transition-colors hover:bg-black/5"
              style={{ width: 44, height: 44, color: textColor }}
              aria-label="Поиск"
            >
              <Search size={20} />
            </Link>
            <Link
              to="/cart"
              className="relative inline-flex items-center justify-center rounded-full transition-colors hover:bg-black/5"
              style={{ width: 44, height: 44, color: textColor }}
              aria-label="Корзина"
            >
              <ShoppingBag size={20} />
              {cartCount > 0 && (
                <span
                  className="absolute -top-0.5 -right-0.5 flex items-center justify-center rounded-full text-[10px] font-semibold"
                  style={{
                    minWidth: 18,
                    height: 18,
                    padding: "0 5px",
                    backgroundColor: accent,
                    color: "var(--color-bg-dark)",
                  }}
                >
                  {cartCount}
                </span>
              )}
            </Link>
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="inline-flex lg:hidden items-center justify-center rounded-full transition-colors hover:bg-black/5"
              style={{ width: 44, height: 44, color: textColor }}
              aria-label="Меню"
            >
              <Menu size={22} />
            </button>
          </div>
        </div>
      </header>

      {/* Mobile drawer */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 bg-black/50"
            />
            <motion.aside
              key="drawer"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "tween", ease: "easeOut", duration: 0.28 }}
              className="fixed top-0 right-0 z-50 flex h-full w-[85%] max-w-sm flex-col"
              style={{ backgroundColor: "var(--color-bg-dark)" }}
            >
              <div className="flex items-center justify-between px-6 py-5">
                <span
                  style={{
                    fontFamily: "var(--font-display)",
                    color: "var(--color-accent)",
                    fontSize: 24,
                    fontWeight: 600,
                  }}
                >
                  Жемчужина
                </span>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex items-center justify-center rounded-full hover:bg-white/10"
                  style={{ width: 44, height: 44, color: "var(--color-text-on-dark)" }}
                  aria-label="Закрыть меню"
                >
                  <X size={22} />
                </button>
              </div>
              <nav className="flex flex-col px-2">
                {NAV_LINKS.map((l) => (
                  <Link
                    key={l.to}
                    to={l.to}
                    onClick={() => setOpen(false)}
                    className="rounded-lg px-4 py-3 transition-colors hover:bg-white/5"
                    style={{
                      color: "var(--color-text-on-dark)",
                      fontFamily: "var(--font-body)",
                      fontSize: 17,
                      fontWeight: 500,
                      minHeight: 44,
                    }}
                  >
                    {l.label}
                  </Link>
                ))}
              </nav>
              <div className="mt-auto border-t border-white/10 px-6 py-5">
                <a
                  href={`tel:${phone.replace(/[^+\d]/g, "")}`}
                  className="flex items-center gap-3"
                  style={{ color: "var(--color-accent)", minHeight: 44 }}
                >
                  <Phone size={18} />
                  <span style={{ fontFamily: "var(--font-body)", fontWeight: 500 }}>
                    {phone}
                  </span>
                </a>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

export default Header;
