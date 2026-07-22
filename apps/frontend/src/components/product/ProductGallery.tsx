import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface ProductGalleryProps {
  baseImage: string; // CSS-фон: фото поверх градиента либо градиент (фолбэк)
  /** Фото товара из админки (до 5, ТЗ 6.4); пусто — показываем один фолбэк. */
  photos?: string[];
  name: string;
  badges?: string[];
}

export function ProductGallery({ baseImage, photos = [], name, badges = [] }: ProductGalleryProps) {
  // Каждое фото рисуем поверх фолбэка (градиента), пока файл не загрузился
  const variants = photos.length
    ? photos.map((p) => `url("${p}") center/cover no-repeat, ${baseImage}`)
    : [baseImage];
  const [active, setActive] = useState(0);
  const [zoom, setZoom] = useState(false);
  const [pos, setPos] = useState({ x: 50, y: 50 });

  // Touch swipe
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => setTouchStart(e.touches[0].clientX);
  const onTouchEnd = (e: React.TouchEvent) => {
    if (touchStart === null) return;
    const dx = e.changedTouches[0].clientX - touchStart;
    if (Math.abs(dx) > 50) {
      if (dx < 0 && active < variants.length - 1) setActive(active + 1);
      if (dx > 0 && active > 0) setActive(active - 1);
    }
    setTouchStart(null);
  };

  const onMove = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    setPos({
      x: ((e.clientX - rect.left) / rect.width) * 100,
      y: ((e.clientY - rect.top) / rect.height) * 100,
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div
        className="relative overflow-hidden"
        style={{
          aspectRatio: "1 / 1",
          borderRadius: 24,
          border: "1px solid rgba(31,26,14,0.06)",
          boxShadow: "var(--shadow-card)",
          backgroundColor: "#fffdf7",
          cursor: "zoom-in",
        }}
        onMouseEnter={() => setZoom(true)}
        onMouseLeave={() => setZoom(false)}
        onMouseMove={onMove}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={active}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.35 }}
            className="absolute inset-0"
            style={{
              background: variants[active],
              transformOrigin: `${pos.x}% ${pos.y}%`,
              transform: zoom ? "scale(1.5)" : "scale(1)",
              transition: "transform 250ms ease-out",
            }}
            aria-label={name}
          />
        </AnimatePresence>

        {badges.length > 0 && (
          <div className="pointer-events-none absolute left-4 top-4 flex flex-col gap-1.5">
            {badges.map((b) => (
              <span
                key={b}
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: 11,
                  fontWeight: 700,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  padding: "5px 10px",
                  borderRadius: 999,
                  backgroundColor: "var(--color-accent)",
                  color: "var(--color-bg-dark)",
                }}
              >
                {b}
              </span>
            ))}
          </div>
        )}
      </div>

      {variants.length > 1 && (
        <div
          className="grid gap-2"
          style={{ gridTemplateColumns: `repeat(${variants.length}, minmax(0,1fr))` }}
        >
          {variants.map((v, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActive(i)}
              aria-label={`Изображение ${i + 1}`}
              className="overflow-hidden transition-all"
              style={{
                aspectRatio: "1 / 1",
                borderRadius: 12,
                background: v,
                border:
                  active === i ? "2px solid var(--color-accent)" : "1px solid rgba(31,26,14,0.1)",
                opacity: active === i ? 1 : 0.75,
                cursor: "pointer",
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default ProductGallery;
