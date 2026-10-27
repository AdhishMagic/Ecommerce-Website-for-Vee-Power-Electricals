import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from "react";
import type { Product } from "../types/product";
import { useAuth } from "./AuthContext";
import { cartApi } from "../api/cart";
import { mapApiProductToProduct } from "../services/productService";
import { ApiCart, ApiCartItem } from "../types/api";

export interface CartItem {
  id?: number | string;
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
  isLoading: boolean;
  refreshCart: () => Promise<void>;
}

const CartContext = createContext<CartContextType | null>(null);

const LEGACY_STORAGE_KEY = "vp_cart_items";
const GUEST_STORAGE_KEY = "vp_cart_items_guest";
const GUEST_SESSION_KEY = "vp_guest_session_id";

function getStorageKey(userId: string | number | null | undefined): string {
  if (userId !== null && userId !== undefined && String(userId).trim() !== "") {
    return `vp_cart_items_user_${String(userId).trim()}`;
  }
  return GUEST_STORAGE_KEY;
}

function getOrCreateGuestSessionId(): string {
  try {
    let sid = sessionStorage.getItem(GUEST_SESSION_KEY);
    if (!sid) {
      sid = `guest_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
      sessionStorage.setItem(GUEST_SESSION_KEY, sid);
    }
    return sid;
  } catch {
    return `guest_fallback_${Date.now()}`;
  }
}

function parseStoredItems(key: string): CartItem[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function convertApiCartToCartItems(apiCart: ApiCart): CartItem[] {
  if (!apiCart || !Array.isArray(apiCart.items)) return [];
  return apiCart.items.map((apiItem: ApiCartItem) => ({
    id: apiItem.id,
    product: mapApiProductToProduct(apiItem.product),
    quantity: apiItem.quantity,
  }));
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { user, isAuthenticated, isBootstrapping, requireAuth } = useAuth();
  const currentUserId = isAuthenticated && user?.id ? String(user.id) : null;

  // Scrub obsolete shared global key on load to prevent cross-account pollution
  useEffect(() => {
    try {
      localStorage.removeItem(LEGACY_STORAGE_KEY);
    } catch {
      // storage disabled
    }
  }, []);

  const [items, setItems] = useState<CartItem[]>(() => {
    const key = getStorageKey(currentUserId);
    return parseStoredItems(key);
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);

  // References to guarantee race-condition safety and cancel stale in-flight requests
  const activeUserIdRef = useRef<string | null>(currentUserId);
  const abortControllerRef = useRef<AbortController | null>(null);
  const cartVersionRef = useRef<number>(0);

  // Persist items to account-scoped local cache whenever items or user changes
  useEffect(() => {
    const key = getStorageKey(currentUserId);
    try {
      localStorage.setItem(key, JSON.stringify(items));
    } catch {
      // storage full / disabled
    }
  }, [items, currentUserId]);

  // Synchronize cart with backend when user identity changes
  const fetchBackendCart = useCallback(async (targetUserId: string | null) => {
    // Increment generation version to discard any previous in-flight responses
    cartVersionRef.current += 1;
    const requestVersion = cartVersionRef.current;

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);

    try {
      if (targetUserId) {
        // Authenticated user: fetch strictly isolated backend cart
        const apiCart = await cartApi.getCart(undefined, controller.signal);

        // Guard against stale responses or mid-request user switches
        if (
          cartVersionRef.current === requestVersion &&
          activeUserIdRef.current === targetUserId
        ) {
          const freshItems = convertApiCartToCartItems(apiCart);
          setItems(freshItems);
          const key = getStorageKey(targetUserId);
          try {
            localStorage.setItem(key, JSON.stringify(freshItems));
          } catch {}
          setIsLoading(false);
        }
      } else {
        // Guest user: load only guest items
        if (
          cartVersionRef.current === requestVersion &&
          activeUserIdRef.current === null
        ) {
          const guestItems = parseStoredItems(GUEST_STORAGE_KEY);
          setItems(guestItems);
          setIsLoading(false);
        }
      }
    } catch (err: any) {
      if (err?.name === "AbortError" || controller.signal.aborted) {
        // Cancelled due to user switch; ignore
        return;
      }
      // On network failure, retain account-scoped local storage fallback
      if (
        cartVersionRef.current === requestVersion &&
        activeUserIdRef.current === targetUserId
      ) {
        const fallbackItems = parseStoredItems(getStorageKey(targetUserId));
        setItems(fallbackItems);
        setIsLoading(false);
      }
    }
  }, []);

  // Detect user login, logout, and account-switching
  useEffect(() => {
    const previousUserId = activeUserIdRef.current;
    activeUserIdRef.current = currentUserId;

    if (previousUserId !== currentUserId) {
      // IDENTITY CHANGE DETECTED:
      // Immediately clear previous account's in-memory cart and cancel in-flight requests
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
      cartVersionRef.current += 1;

      // On logout: remove logged-out user's local cache for complete privacy
      if (previousUserId && !currentUserId) {
        try {
          localStorage.removeItem(getStorageKey(previousUserId));
        } catch {}
      }

      // Immediately clear visible application state before next account loads
      setItems([]);
      setIsLoading(true);

      if (!isBootstrapping) {
        fetchBackendCart(currentUserId);
      }
    } else if (!isBootstrapping) {
      fetchBackendCart(currentUserId);
    }
  }, [currentUserId, isBootstrapping, fetchBackendCart]);

  const refreshCart = useCallback(async () => {
    await fetchBackendCart(activeUserIdRef.current);
  }, [fetchBackendCart]);

  // Authenticated Actions
  const addToCart = useCallback(
    (product: Product, qty = 1) => {
      requireAuth(() => {
        // Optimistic UI update
        setItems((prev) => {
          const existing = prev.find((i) => String(i.product.id) === String(product.id));
          if (existing) {
            return prev.map((i) =>
              String(i.product.id) === String(product.id)
                ? { ...i, quantity: i.quantity + qty }
                : i
            );
          }
          return [...prev, { product, quantity: qty }];
        });

        // Backend authoritative persistence
        cartApi
          .addToCart(product.id, qty)
          .then((apiCart) => {
            if (activeUserIdRef.current === currentUserId) {
              setItems(convertApiCartToCartItems(apiCart));
            }
          })
          .catch((err) => {
            console.error("Failed to persist item to backend cart:", err);
            // Re-sync authoritative cart on error
            refreshCart();
          });
      });
    },
    [requireAuth, currentUserId, refreshCart]
  );

  const removeFromCart = useCallback(
    (productId: string | number) => {
      // Optimistic UI update
      setItems((prev) => prev.filter((i) => String(i.product.id) !== String(productId)));

      if (isAuthenticated && currentUserId) {
        cartApi
          .removeItem(productId)
          .then((apiCart) => {
            if (activeUserIdRef.current === currentUserId) {
              setItems(convertApiCartToCartItems(apiCart));
            }
          })
          .catch((err) => {
            console.error("Failed to remove item from backend cart:", err);
            refreshCart();
          });
      }
    },
    [isAuthenticated, currentUserId, refreshCart]
  );

  const updateQty = useCallback(
    (productId: string | number, qty: number) => {
      if (qty <= 0) {
        removeFromCart(productId);
        return;
      }

      // Optimistic UI update
      setItems((prev) =>
        prev.map((i) =>
          String(i.product.id) === String(productId) ? { ...i, quantity: qty } : i
        )
      );

      if (isAuthenticated && currentUserId) {
        cartApi
          .updateItemQuantity(productId, qty)
          .then((apiCart) => {
            if (activeUserIdRef.current === currentUserId) {
              setItems(convertApiCartToCartItems(apiCart));
            }
          })
          .catch((err) => {
            console.error("Failed to update item quantity in backend cart:", err);
            refreshCart();
          });
      }
    },
    [isAuthenticated, currentUserId, removeFromCart, refreshCart]
  );

  const clearCart = useCallback(() => {
    // Immediately clear in-memory state
    setItems([]);

    const key = getStorageKey(currentUserId);
    try {
      localStorage.removeItem(key);
    } catch {}

    if (isAuthenticated && currentUserId) {
      cartApi.clearCart().catch((err) => {
        console.error("Failed to clear backend cart:", err);
      });
    }
  }, [isAuthenticated, currentUserId]);

  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);
  const subtotal = items.reduce(
    (sum, i) => sum + (Number(i.product.price) || 0) * i.quantity,
    0
  );

  return (
    <CartContext.Provider
      value={{
        items,
        addToCart,
        removeFromCart,
        updateQty,
        clearCart,
        totalItems,
        subtotal,
        isLoading,
        refreshCart,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be used within CartProvider");
  return ctx;
}
