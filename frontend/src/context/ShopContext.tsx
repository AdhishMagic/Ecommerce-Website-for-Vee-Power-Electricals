import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from "react";

export interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
  active: boolean; // Replaced isHidden with active
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
  
  // Admin Actions
  addProduct: (product: Omit<Product, "id">) => void;
  updateProduct: (id: string, updates: Partial<Product>) => void;
  updateStock: (productId: string, newStock: number) => void;
  deleteProduct: (id: string) => void;

  // User Actions
  addToCart: (productId: string, quantity: number) => void;
  updateCartItem: (productId: string, quantity: number) => void;
  removeFromCart: (productId: string) => void;
  clearCart: () => void;
  checkout: (userId: string) => { success: boolean; error?: string; orderId?: string };
}

const ShopContext = createContext<ShopContextType | null>(null);

export function ShopProvider({ children }: { children: ReactNode }) {
  // State Initialization from LocalStorage
  const [products, setProducts] = useState<Product[]>(() => {
    const stored = localStorage.getItem("vp_products");
    return stored ? JSON.parse(stored) : [];
  });

  const [cart, setCart] = useState<CartItem[]>(() => {
    const stored = localStorage.getItem("vp_cart");
    return stored ? JSON.parse(stored) : [];
  });

  const [orders, setOrders] = useState<Order[]>(() => {
    const stored = localStorage.getItem("vp_orders");
    return stored ? JSON.parse(stored) : [];
  });

  // Cross-Tab Synchronization
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === "vp_products" && e.newValue) setProducts(JSON.parse(e.newValue));
      if (e.key === "vp_cart" && e.newValue) setCart(JSON.parse(e.newValue));
      if (e.key === "vp_orders" && e.newValue) setOrders(JSON.parse(e.newValue));
    };

    window.addEventListener("storage", handleStorageChange);
    return () => window.removeEventListener("storage", handleStorageChange);
  }, []);

  // Save to LocalStorage whenever state changes
  useEffect(() => { localStorage.setItem("vp_products", JSON.stringify(products)); }, [products]);
  useEffect(() => { localStorage.setItem("vp_cart", JSON.stringify(cart)); }, [cart]);
  useEffect(() => { localStorage.setItem("vp_orders", JSON.stringify(orders)); }, [orders]);

  // ==============================
  // ADMIN ACTIONS
  // ==============================
  const addProduct = useCallback((product: Omit<Product, "id">) => {
    if (product.price < 0 || product.stock < 0) {
      console.error("Validation Error: Price and stock cannot be negative.");
      return;
    }
    const newProduct: Product = { ...product, id: crypto.randomUUID() };
    setProducts((prev) => [...prev, newProduct]);
  }, []);

  const updateProduct = useCallback((id: string, updates: Partial<Product>) => {
    if ((updates.price !== undefined && updates.price < 0) || (updates.stock !== undefined && updates.stock < 0)) {
      console.error("Validation Error: Price and stock cannot be negative.");
      return;
    }
    
    setProducts((prev) => 
      prev.map((p) => (p.id === id ? { ...p, ...updates } : p))
    );
  }, []);

  const updateStock = useCallback((productId: string, newStock: number) => {
    if (newStock < 0) {
      console.error("Validation Error: Stock cannot be negative.");
      return;
    }
    setProducts((prev) => 
      prev.map((p) => (p.id === productId ? { ...p, stock: newStock } : p))
    );
  }, []);

  const deleteProduct = useCallback((id: string) => {
    setProducts((prev) => prev.filter((p) => p.id !== id));
    // Also remove from carts if deleted globally
    setCart((prev) => prev.filter((c) => c.productId !== id));
  }, []);


  // ==============================
  // USER ACTIONS
  // ==============================
  const addToCart = useCallback((productId: string, quantity: number) => {
    if (quantity <= 0) return;

    setProducts((prevProducts) => {
      const product = prevProducts.find(p => p.id === productId);
      if (!product || !product.active) {
        console.error("Product not found or is inactive.");
        return prevProducts; // Cancel update
      }

      setCart((prevCart) => {
        const existingItem = prevCart.find(c => c.productId === productId);
        const currentQty = existingItem ? existingItem.quantity : 0;
        
        if (currentQty + quantity > product.stock) {
          console.error("Validation Error: Cannot add more than available stock.");
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
      removeFromCart(productId);
      return;
    }

    const product = products.find(p => p.id === productId);
    if (!product) return;

    if (quantity > product.stock) {
      alert("Cannot exceed available stock!");
      return;
    }

    setCart((prev) => prev.map(c => c.productId === productId ? { ...c, quantity } : c));
  }, [products]);

  const removeFromCart = useCallback((productId: string) => {
    setCart((prev) => prev.filter(c => c.productId !== productId));
  }, []);

  const clearCart = useCallback(() => {
    setCart([]);
  }, []);

  const checkout = useCallback((userId: string) => {
    if (cart.length === 0) return { success: false, error: "Cart is empty" };

    let validationFailed = false;
    let total = 0;
    const orderItems: Order["items"] = [];

    // 1. Verify stock before processing
    for (const cartItem of cart) {
      const product = products.find(p => p.id === cartItem.productId);
      if (!product || !product.active || cartItem.quantity > product.stock) {
        validationFailed = true;
        break;
      }
      
      total += product.price * cartItem.quantity;
      orderItems.push({
        productId: product.id,
        quantity: cartItem.quantity,
        priceAtPurchase: product.price,
        productName: product.name
      });
    }

    if (validationFailed) {
      return { success: false, error: "Validation failed: Some items have changed in stock or price." };
    }

    // 2. Deduct stock globally
    setProducts((prev) => prev.map(p => {
      const cartItem = cart.find(c => c.productId === p.id);
      if (cartItem) {
        return { ...p, stock: p.stock - cartItem.quantity };
      }
      return p;
    }));

    // 3. Create the order
    const newOrder: Order = {
      id: crypto.randomUUID(),
      userId,
      items: orderItems,
      total,
      status: "pending",
      createdAt: new Date().toISOString()
    };

    setOrders((prev) => [...prev, newOrder]);
    
    // 4. Clear the cart
    setCart([]);

    return { success: true, orderId: newOrder.id };
  }, [cart, products]);

  return (
    <ShopContext.Provider value={{ 
      products, cart, orders, 
      addProduct, updateProduct, updateStock, deleteProduct,
      addToCart, updateCartItem, removeFromCart, clearCart, checkout
    }}>
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
