import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Product } from "@/data/products";
import { PROMOS } from "@/data/promos";

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
  applyPromoCode: (code: string) => void;
  clearPromoCode: () => void;
  getPromoDiscount: () => number;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [promoCode, setPromoCode] = useState<string | null>(null);
  const [promoError, setPromoError] = useState<string | null>(null);

  const addToCart = useCallback((product: Product, qty: number = 1) => {
    setItems((cur) => {
      const existing = cur.find((i) => i.product.id === product.id);
      if (existing) {
        return cur.map((i) =>
          i.product.id === product.id
            ? { ...i, quantity: i.quantity + qty }
            : i,
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
        .map((i) =>
          i.product.id === productId
            ? { ...i, quantity: Math.max(1, qty) }
            : i,
        )
        .filter((i) => i.quantity > 0),
    );
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const applyPromoCode = useCallback((code: string) => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    const promo = PROMOS.find((p) => p.promoCode?.toUpperCase() === trimmed);
    if (!promo) {
      setPromoError("Такой промокод не найден");
      setPromoCode(null);
      return;
    }
    setPromoCode(promo.promoCode ?? trimmed);
    setPromoError(null);
  }, []);

  const clearPromoCode = useCallback(() => {
    setPromoCode(null);
    setPromoError(null);
  }, []);

  const getPromoDiscount = useCallback(() => {
    if (!promoCode) return 0;
    const promo = PROMOS.find(
      (p) => p.promoCode?.toUpperCase() === promoCode.toUpperCase(),
    );
    if (!promo?.discountPercent) return 0;
    const base = items
      .filter(
        (i) => !promo.categoryFilter || i.product.category === promo.categoryFilter,
      )
      .reduce((sum, i) => sum + i.product.price * i.quantity, 0);
    return Math.round(base * (promo.discountPercent / 100));
  }, [items, promoCode]);

  const getCartTotal = useCallback(
    () =>
      items.reduce((sum, i) => sum + i.product.price * i.quantity, 0) -
      getPromoDiscount(),
    [items, getPromoDiscount],
  );

  const getCartOldTotal = useCallback(
    () =>
      items.reduce(
        (sum, i) => sum + (i.product.oldPrice ?? i.product.price) * i.quantity,
        0,
      ),
    [items],
  );

  const getCartDiscount = useCallback(
    () => Math.max(0, getCartOldTotal() - getCartTotal()),
    [getCartOldTotal, getCartTotal],
  );

  const getCartCount = useCallback(
    () => items.reduce((sum, i) => sum + i.quantity, 0),
    [items],
  );

  const hasPerishable = useCallback(
    () => items.some((i) => i.product.isPerishable),
    [items],
  );

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
      applyPromoCode,
      clearPromoCode,
      getPromoDiscount,
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
      applyPromoCode,
      clearPromoCode,
      getPromoDiscount,
      getCartCount,
      hasPerishable,
    ],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within a CartProvider");
  return ctx;
}
