import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import type { Product } from "../types/product";
import { useAuth } from "./AuthContext";

export interface CartItem {
  product: Product;
  quantity: number;
}

interface CartContextType {
  items: CartItem[];
  addToCart: (product: Product, qty?: number) => void;
  removeFromCart: (productId: string | number) => void;
  updateQty: (productId: string | number, qty: number) => void;
  clearCart: () => void;
  totalItems: number;
  subtotal: number;
}

const CartContext = createContext<CartContextType | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(() => {
    try {
      const stored = localStorage.getItem("vp_cart_items");
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  const { requireAuth } = useAuth();

  useEffect(() => {
    try {
      localStorage.setItem("vp_cart_items", JSON.stringify(items));
    } catch {
      // storage full / disabled
    }
  }, [items]);

  const addToCart = useCallback((product: Product, qty = 1) => {
    requireAuth(() => {
      setItems(prev => {
        const existing = prev.find(i => String(i.product.id) === String(product.id));
        if (existing) {
          return prev.map(i =>
            String(i.product.id) === String(product.id)
              ? { ...i, quantity: i.quantity + qty }
              : i
          );
        }
        return [...prev, { product, quantity: qty }];
      });
    });
  }, [requireAuth]);

  const removeFromCart = useCallback((productId: string | number) => {
    setItems(prev => prev.filter(i => String(i.product.id) !== String(productId)));
  }, []);

  const updateQty = useCallback((productId: string | number, qty: number) => {
    if (qty <= 0) {
      setItems(prev => prev.filter(i => String(i.product.id) !== String(productId)));
    } else {
      setItems(prev => prev.map(i =>
        String(i.product.id) === String(productId)
          ? { ...i, quantity: qty }
          : i
      ));
    }
  }, []);

  const clearCart = useCallback(() => setItems([]), []);

  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);
  const subtotal = items.reduce((sum, i) => sum + (Number(i.product.price) || 0) * i.quantity, 0);

  return (
    <CartContext.Provider value={{ items, addToCart, removeFromCart, updateQty, clearCart, totalItems, subtotal }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
