import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";
import { productService } from "../services/productService";
import { catalogApi } from "../api/catalog";
import { inventoryApi } from "../api/inventory";

export interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
  active: boolean;
  category: string;
  sku: string;
  brand: string;
  lowStockThreshold?: number;
  image?: string;
  description?: string;
}

export const calculateStockStatus = (stock: number, threshold: number = 10) => {
  if (stock === 0) return "OUT OF STOCK";
  if (stock > 0 && stock <= threshold) return "LOW STOCK";
  return "IN STOCK";
};

export interface CartItem {
  productId: string;
  quantity: number;
}

export interface Order {
  id: string;
  userId: string;
  items: { productId: string; quantity: number; priceAtPurchase: number; productName: string }[];
  total: number;
  status: "pending" | "processing" | "shipped" | "delivered";
  createdAt: string;
}

interface ShopContextType {
  products: Product[];
  cart: CartItem[];
  orders: Order[];
  loading: boolean;
  refreshProducts: () => Promise<void>;

  // Admin Actions
  addProduct: (product: Omit<Product, "id">) => Promise<void>;
  updateProduct: (id: string, updates: Partial<Product>) => Promise<void>;
  updateStock: (productId: string, newStock: number) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;

  // User Actions
  addToCart: (productId: string, quantity: number) => void;
  updateCartItem: (productId: string, quantity: number) => void;
  removeFromCart: (productId: string) => void;
  clearCart: () => void;
  checkout: (userId: string) => { success: boolean; error?: string; orderId?: string };
}

const ShopContext = createContext<ShopContextType | null>(null);

export function ShopProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const [cart, setCart] = useState<CartItem[]>(() => {
    const stored = localStorage.getItem("vp_cart");
    return stored ? JSON.parse(stored) : [];
  });

  const [orders, setOrders] = useState<Order[]>(() => {
    const stored = localStorage.getItem("vp_orders");
    return stored ? JSON.parse(stored) : [];
  });

  const refreshProducts = useCallback(async () => {
    try {
      setLoading(true);
      const items = await productService.getProducts();
      setProducts(items.map(p => ({
        id: p.id,
        name: p.name,
        price: p.price,
        stock: p.stock,
        active: p.active,
        category: p.category,
        sku: p.sku,
        brand: p.brand,
        lowStockThreshold: p.lowStockThreshold,
        image: p.images?.[0] || '',
        description: p.description,
      })));
    } catch (err) {
      console.error("Failed to load products from API:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshProducts();
  }, [refreshProducts]);

  useEffect(() => {
    localStorage.setItem("vp_cart", JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    localStorage.setItem("vp_orders", JSON.stringify(orders));
  }, [orders]);

  // ==============================
  // ADMIN ACTIONS
  // ==============================
  const addProduct = useCallback(async (product: Omit<Product, "id">) => {
    if (product.price < 0 || product.stock < 0) {
      console.error("Validation Error: Price and stock cannot be negative.");
      return;
    }

    try {
      await catalogApi.createProduct({
        name: product.name,
        sku: product.sku,
        price: product.price,
        mrp: product.price,
        stock: product.stock,
        low_stock_threshold: product.lowStockThreshold || 5,
        active: product.active,
        description: product.description || '',
      });
      await refreshProducts();
    } catch (err) {
      console.error("Error creating product via API:", err);
      // Optimistic fallback for UI responsiveness
      const newProduct: Product = { ...product, id: crypto.randomUUID() };
      setProducts((prev) => [...prev, newProduct]);
    }
  }, [refreshProducts]);

  const updateProduct = useCallback(async (id: string, updates: Partial<Product>) => {
    try {
      const payload: any = {};
      if (updates.name !== undefined) payload.name = updates.name;
      if (updates.sku !== undefined) payload.sku = updates.sku;
      if (updates.price !== undefined) {
        payload.price = updates.price;
        payload.mrp = updates.price;
      }
      if (updates.stock !== undefined) payload.stock = updates.stock;
      if (updates.active !== undefined) payload.active = updates.active;
      if (updates.description !== undefined) payload.description = updates.description;

      if (!id.includes('-') && !isNaN(Number(id))) {
        await catalogApi.updateProduct(id, payload);
        await refreshProducts();
      } else {
        setProducts((prev) =>
          prev.map((p) => (p.id === id ? { ...p, ...updates } : p))
        );
      }
    } catch (err) {
      console.error("Error updating product:", err);
      setProducts((prev) =>
        prev.map((p) => (p.id === id ? { ...p, ...updates } : p))
      );
    }
  }, [refreshProducts]);

  const updateStock = useCallback(async (productId: string, newStock: number) => {
    const current = products.find(p => p.id === productId);
    if (current && !productId.includes('-') && !isNaN(Number(productId))) {
      const diff = newStock - current.stock;
      if (diff !== 0) {
        await inventoryApi.adjustStock(productId, diff, 'Manual adjustment via dashboard');
        await refreshProducts();
        return;
      }
    }

    setProducts((prev) =>
      prev.map((p) => (p.id === productId ? { ...p, stock: newStock } : p))
    );
  }, [products, refreshProducts]);

  const deleteProduct = useCallback(async (id: string) => {
    try {
      if (!id.includes('-') && !isNaN(Number(id))) {
        await catalogApi.deleteProduct(id);
        await refreshProducts();
      }
    } catch (err) {
      console.error("Error deleting product via API:", err);
    }

    setProducts((prev) => prev.filter((p) => p.id !== id));
    setCart((prev) => prev.filter((c) => c.productId !== id));
  }, [refreshProducts]);

  // ==============================
  // USER ACTIONS
  // ==============================
  const addToCart = useCallback((productId: string, quantity: number) => {
    if (quantity <= 0) return;

    setProducts((prevProducts) => {
      const product = prevProducts.find(p => p.id === productId);
      if (!product || !product.active) {
        return prevProducts;
      }

      setCart((prevCart) => {
        const existingItem = prevCart.find(c => c.productId === productId);
        const currentQty = existingItem ? existingItem.quantity : 0;

        if (currentQty + quantity > product.stock) {
          alert("Not enough stock available!");
          return prevCart;
        }

        if (existingItem) {
          return prevCart.map(c => c.productId === productId ? { ...c, quantity: c.quantity + quantity } : c);
        }
        return [...prevCart, { productId, quantity }];
      });

      return prevProducts;
    });
  }, []);

  const updateCartItem = useCallback((productId: string, quantity: number) => {
    if (quantity <= 0) {
      setCart((prev) => prev.filter((c) => c.productId !== productId));
      return;
    }

    const product = products.find((p) => p.id === productId);
    if (!product || quantity > product.stock) {
      alert("Cannot set quantity higher than available stock.");
      return;
    }

    setCart((prev) =>
      prev.map((c) => (c.productId === productId ? { ...c, quantity } : c))
    );
  }, [products]);

  const removeFromCart = useCallback((productId: string) => {
    setCart((prev) => prev.filter((c) => c.productId !== productId));
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
  }, []);

  const checkout = useCallback((userId: string) => {
    if (cart.length === 0) {
      return { success: false, error: "Cart is empty." };
    }

    for (const item of cart) {
      const product = products.find((p) => p.id === item.productId);
      if (!product) return { success: false, error: `Product not found.` };
      if (!product.active) return { success: false, error: `${product.name} is no longer available.` };
      if (item.quantity > product.stock) {
        return { success: false, error: `Insufficient stock for ${product.name}.` };
      }
    }

    const newOrder: Order = {
      id: crypto.randomUUID(),
      userId,
      items: cart.map((c) => {
        const p = products.find((prod) => prod.id === c.productId)!;
        return {
          productId: c.productId,
          quantity: c.quantity,
          priceAtPurchase: p.price,
          productName: p.name,
        };
      }),
      total: cart.reduce((sum, c) => {
        const p = products.find((prod) => prod.id === c.productId)!;
        return sum + p.price * c.quantity;
      }, 0),
      status: "pending",
      createdAt: new Date().toISOString(),
    };

    setOrders((prev) => [newOrder, ...prev]);
    clearCart();
    return { success: true, orderId: newOrder.id };
  }, [cart, products, clearCart]);

  return (
    <ShopContext.Provider
      value={{
        products,
        cart,
        orders,
        loading,
        refreshProducts,
        addProduct,
        updateProduct,
        updateStock,
        deleteProduct,
        addToCart,
        updateCartItem,
        removeFromCart,
        clearCart,
        checkout,
      }}
    >
      {children}
    </ShopContext.Provider>
  );
}

export function useShop() {
  const context = useContext(ShopContext);
  if (!context) {
    throw new Error("useShop must be used within a ShopProvider");
  }
  return context;
}
