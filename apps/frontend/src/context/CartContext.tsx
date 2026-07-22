import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { Product } from "@/data/products";
import { validatePromo } from "@/lib/api";

export interface CartItem {
  product: Product;
  quantity: number;
}

interface CartContextValue {
  items: CartItem[];
  isOpen: boolean;
  setOpen: (open: boolean) => void;
  addToCart: (product: Product, qty?: number) => void;
  removeFromCart: (productId: string) => void;
  updateQuantity: (productId: string, qty: number) => void;
  clearCart: () => void;
  getCartTotal: () => number;
  getCartOldTotal: () => number;
  getCartDiscount: () => number;
  getCartCount: () => number;
  hasPerishable: () => boolean;
  promoCode: string | null;
  promoError: string | null;
  promoPending: boolean;
  applyPromoCode: (code: string) => void;
  clearPromoCode: () => void;
  getPromoDiscount: () => number;
  /** Корзина восстановлена из localStorage (до этого не судить о пустоте). */
  ready: boolean;
}

const CartContext = createContext<CartContextValue | null>(null);

const STORAGE_KEY = "altai-cart-v1";

interface StoredCart {
  items: CartItem[];
  promoCode: string | null;
}

/** Корзина хранится на клиенте (localStorage, ТЗ 6.6);
 *  промокод валидируется ТОЛЬКО сервером (POST /promo/validate, ТЗ 8.3). */
export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [promoCode, setPromoCode] = useState<string | null>(null);
  const [promoDiscountRub, setPromoDiscountRub] = useState(0);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promoPending, setPromoPending] = useState(false);
  const hydrated = useRef(false);
  const [ready, setReady] = useState(false);

  // --- localStorage: восстановление и сохранение (SSR-безопасно) ---
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as StoredCart;
        if (Array.isArray(saved.items)) setItems(saved.items);
        if (saved.promoCode) setPromoCode(saved.promoCode);
      }
    } catch {
      /* повреждённое хранилище — начинаем с пустой корзины */
    }
    hydrated.current = true;
    setReady(true);
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    try {
      window.localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ items, promoCode } satisfies StoredCart),
      );
    } catch {
      /* квота/приватный режим — не критично */
    }
  }, [items, promoCode]);

  // --- серверная валидация промокода при изменении корзины/кода ---
  useEffect(() => {
    if (!promoCode) {
      setPromoDiscountRub(0);
      return;
    }
    if (items.length === 0) {
      setPromoDiscountRub(0);
      return;
    }
    let cancelled = false;
    setPromoPending(true);
    validatePromo(
      promoCode,
      items.map((i) => ({ id: i.product.id, quantity: i.quantity })),
    )
      .then((res) => {
        if (cancelled) return;
        if (res.valid) {
          setPromoDiscountRub(res.discountRub ?? 0);
          setPromoError(null);
        } else {
          setPromoDiscountRub(0);
          setPromoError(res.message);
          setPromoCode(null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPromoDiscountRub(0);
          setPromoError("Не удалось проверить промокод — попробуйте ещё раз");
        }
      })
      .finally(() => {
        if (!cancelled) setPromoPending(false);
      });
    return () => {
      cancelled = true;
    };
  }, [promoCode, items]);

  const addToCart = useCallback((product: Product, qty: number = 1) => {
    setItems((cur) => {
      const existing = cur.find((i) => i.product.id === product.id);
      if (existing) {
        return cur.map((i) =>
          i.product.id === product.id ? { ...i, quantity: i.quantity + qty } : i,
        );
      }
      return [...cur, { product, quantity: qty }];
    });
  }, []);

  const removeFromCart = useCallback((productId: string) => {
    setItems((cur) => cur.filter((i) => i.product.id !== productId));
  }, []);

  const updateQuantity = useCallback((productId: string, qty: number) => {
    setItems((cur) =>
      cur
        .map((i) => (i.product.id === productId ? { ...i, quantity: Math.max(1, qty) } : i))
        .filter((i) => i.quantity > 0),
    );
  }, []);

  const clearCart = useCallback(() => {
    setItems([]);
    setPromoCode(null);
    setPromoDiscountRub(0);
    setPromoError(null);
  }, []);

  const applyPromoCode = useCallback((code: string) => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    setPromoError(null);
    setPromoCode(trimmed); // валидация уйдёт на сервер эффектом выше
  }, []);

  const clearPromoCode = useCallback(() => {
    setPromoCode(null);
    setPromoDiscountRub(0);
    setPromoError(null);
  }, []);

  const getPromoDiscount = useCallback(() => promoDiscountRub, [promoDiscountRub]);

  const getCartTotal = useCallback(
    () => items.reduce((sum, i) => sum + i.product.price * i.quantity, 0) - promoDiscountRub,
    [items, promoDiscountRub],
  );

  const getCartOldTotal = useCallback(
    () => items.reduce((sum, i) => sum + (i.product.oldPrice ?? i.product.price) * i.quantity, 0),
    [items],
  );

  const getCartDiscount = useCallback(
    () => Math.max(0, getCartOldTotal() - getCartTotal()),
    [getCartOldTotal, getCartTotal],
  );

  const getCartCount = useCallback(() => items.reduce((sum, i) => sum + i.quantity, 0), [items]);

  const hasPerishable = useCallback(() => items.some((i) => i.product.isPerishable), [items]);

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      isOpen,
      setOpen: setIsOpen,
      addToCart,
      removeFromCart,
      updateQuantity,
      clearCart,
      getCartTotal,
      getCartOldTotal,
      getCartDiscount,
      getCartCount,
      hasPerishable,
      promoCode,
      promoError,
      promoPending,
      applyPromoCode,
      clearPromoCode,
      getPromoDiscount,
      ready,
    }),
    [
      items,
      isOpen,
      addToCart,
      removeFromCart,
      updateQuantity,
      clearCart,
      getCartTotal,
      getCartOldTotal,
      getCartDiscount,
      promoCode,
      promoError,
      promoPending,
      applyPromoCode,
      clearPromoCode,
      getPromoDiscount,
      getCartCount,
      hasPerishable,
      ready,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
}
