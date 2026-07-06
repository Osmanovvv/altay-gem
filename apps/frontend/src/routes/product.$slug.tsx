import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Link,
  createFileRoute,
  notFound,
  useNavigate,
} from "@tanstack/react-router";
import { ChevronRight, ShoppingBag } from "lucide-react";

import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { ProductGallery } from "@/components/product/ProductGallery";
import { ProductInfo } from "@/components/product/ProductInfo";
import { RelatedProducts } from "@/components/product/RelatedProducts";
import type { Product } from "@/data/products";
import { ApiError, fetchProduct, toProduct } from "@/lib/api";

export const Route = createFileRoute("/product/$slug")({
  loader: async ({ params }) => {
    try {
      const detail = await fetchProduct(params.slug);
      return { detail, product: toProduct(detail) };
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) throw notFound();
      throw err;
    }
  },
  head: ({ loaderData }) => {
    const p = loaderData?.product;
    return {
      meta: [
        { title: p ? `${p.name} - Жемчужина Алтая` : "Товар - Жемчужина Алтая" },
        {
          name: "description",
          content: p
            ? `${p.shortDescription}. ${p.price.toLocaleString("ru-RU")} ₽ за ${p.unit}.`
            : "Натуральная продукция с Алтая.",
        },
        {
          property: "og:title",
          content: p ? `${p.name} - Жемчужина Алтая` : "Товар - Жемчужина Алтая",
        },
      ],
    };
  },
  notFoundComponent: () => (
    <ProductNotFound />
  ),
  component: ProductPage,
});

function ProductNotFound() {
  return (
    <div
      className="flex min-h-screen flex-col"
      style={{ backgroundColor: "var(--color-bg-cream)" }}
    >
      <Header />
      <main className="mx-auto flex max-w-2xl flex-1 flex-col items-center justify-center px-6 text-center">
        <h1
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 48,
            fontWeight: 600,
            color: "var(--color-bg-dark)",
          }}
        >
          Товар не найден
        </h1>
        <p
          className="mt-3"
          style={{
            fontFamily: "var(--font-body)",
            color: "var(--color-text-muted)",
          }}
        >
          Возможно, он был снят с продажи или ссылка устарела.
        </p>
        <Link
          to="/catalog"
          className="mt-6 inline-flex items-center gap-2 rounded-full"
          style={{
            backgroundColor: "var(--color-accent)",
            color: "var(--color-bg-dark)",
            fontFamily: "var(--font-body)",
            fontWeight: 600,
            padding: "12px 24px",
          }}
        >
          В каталог
        </Link>
      </main>
      <Footer />
    </div>
  );
}

function ProductPage() {
  const { detail, product } = Route.useLoaderData();
  const navigate = useNavigate();
  const [toast, setToast] = useState<string | null>(null);

  const category = detail.categoryName
    ? { name: detail.categoryName }
    : null;

  const CHAR_LABELS: Record<string, string> = {
    weightVolume: "Вес/Объём",
    composition: "Состав",
    manufacturer: "Производитель",
    shelfLife: "Срок годности",
    storage: "Условия хранения",
  };
  const specs: Record<string, string> = {};
  for (const [k, v] of Object.entries(detail.characteristics ?? {})) {
    if (v && CHAR_LABELS[k]) specs[CHAR_LABELS[k]] = v;
  }
  const relatedProducts = detail.related.map(toProduct);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(null), 2200);
  };

  const onAdd = (p: Product, qty = 1) => {
    showToast(`Товар «${p.name}» добавлен · ${qty} шт`);
  };

  const onStickyAdd = () => {
    const qty = (window as unknown as { __productQty?: number }).__productQty ?? 1;
    onAdd(product, qty);
  };

  const onRelatedAdd = (p: Product) => onAdd(p, 1);

  return (
    <div style={{ backgroundColor: "var(--color-bg-cream)", minHeight: "100vh" }}>
      <Header />

      <main className="pt-20 pb-32 md:pt-24 md:pb-16">
        <div className="mx-auto max-w-7xl px-4 md:px-8">
          {/* Breadcrumbs */}
          <nav
            aria-label="breadcrumb"
            className="flex flex-wrap items-center gap-1.5"
            style={{
              fontFamily: "var(--font-body)",
              fontSize: 13,
              color: "var(--color-text-muted)",
            }}
          >
            <Link to="/" className="transition-colors hover:text-[color:var(--color-text)]">
              Главная
            </Link>
            <ChevronRight size={14} />
            <Link to="/catalog" className="transition-colors hover:text-[color:var(--color-text)]">
              Каталог
            </Link>
            {category && (
              <>
                <ChevronRight size={14} />
                <button
                  type="button"
                  onClick={() => navigate({ to: "/catalog" })}
                  className="transition-colors hover:text-[color:var(--color-text)]"
                >
                  {category.name}
                </button>
              </>
            )}
            <ChevronRight size={14} />
            <span style={{ color: "var(--color-text)" }}>{product.name}</span>
          </nav>

          <div className="mt-6 grid gap-8 md:mt-10 md:grid-cols-2 md:gap-12">
            <ProductGallery
              baseImage={product.image}
              name={product.name}
              badges={product.badges}
            />
            <ProductInfo
              product={product}
              detail={{
                specs,
                stock: detail.availableQty,
                longDesc: detail.fullDescription ?? product.shortDescription,
                categoryName: detail.categoryName,
              }}
              onAdd={onAdd}
            />
          </div>

          <RelatedProducts products={relatedProducts} onAdd={onRelatedAdd} />
        </div>
      </main>

      <Footer />

      {/* Sticky mobile CTA */}
      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t md:hidden"
        style={{
          backgroundColor: "rgba(255,253,247,0.96)",
          backdropFilter: "blur(14px)",
          WebkitBackdropFilter: "blur(14px)",
          borderColor: "rgba(31,26,14,0.08)",
          padding: "10px 16px calc(10px + env(safe-area-inset-bottom))",
        }}
      >
        <div className="flex items-center gap-3">
          <div className="flex flex-col">
            <span
              style={{
                fontFamily: "var(--font-body)",
                        fontVariantNumeric: "tabular-nums",
                fontSize: 22,
                fontWeight: 700,
                color: "var(--color-accent)",
                lineHeight: 1,
              }}
            >
              {product.price.toLocaleString("ru-RU")} ₽
            </span>
            <span
              style={{
                fontFamily: "var(--font-body)",
                fontSize: 11,
                color: "var(--color-text-muted)",
              }}
            >
              за {product.unit}
            </span>
          </div>
          <button
            type="button"
            disabled={!product.inStock}
            onClick={onStickyAdd}
            className="ml-auto inline-flex flex-1 items-center justify-center gap-2 rounded-full"
            style={{
              backgroundColor: product.inStock
                ? "var(--color-accent)"
                : "rgba(31,26,14,0.1)",
              color: product.inStock
                ? "var(--color-bg-dark)"
                : "var(--color-text-muted)",
              fontFamily: "var(--font-body)",
              fontWeight: 700,
              fontSize: 14,
              minHeight: 48,
              padding: "0 18px",
            }}
          >
            <ShoppingBag size={18} />
            {product.inStock ? "В корзину" : "Нет в наличии"}
          </button>
        </div>
      </div>

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.25 }}
            className="fixed left-1/2 z-50 -translate-x-1/2"
            style={{
              bottom: 96,
              backgroundColor: "var(--color-bg-dark)",
              color: "var(--color-text-on-dark)",
              fontFamily: "var(--font-body)",
              fontSize: 14,
              fontWeight: 500,
              padding: "12px 20px",
              borderRadius: 999,
              boxShadow: "var(--shadow-elevated)",
              maxWidth: "calc(100% - 32px)",
            }}
          >
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
