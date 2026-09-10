import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { CartProvider } from "./context/CartContext";

import CustomerLayout from "./layouts/CustomerLayout";
import AdminLayout from "./layouts/AdminLayout";

import Home from "./pages/customer/Home";
import Shop from "./pages/customer/Shop";
import ProductDetail from "./pages/customer/ProductDetail";
import Cart from "./pages/customer/Cart";
import Checkout from "./pages/customer/Checkout";
import OrderSuccess from "./pages/customer/OrderSuccess";
import Account from "./pages/customer/Account";
import About from "./pages/customer/About";
import Contact from "./pages/customer/Contact";
import PolicyPage from "./pages/customer/PolicyPage";

import Dashboard from "./pages/admin/Dashboard";
import AdminProducts from "./pages/admin/Products";
import ProductForm from "./pages/admin/ProductForm";
import AdminInventory from "./pages/admin/Inventory";
import AdminOrders from "./pages/admin/Orders";
import ImportProducts from "./pages/admin/ImportProducts";

export default function App() {
  return (
    <BrowserRouter>
      <CartProvider>
        <Routes>
          {/* Customer routes */}
          <Route path="/" element={<CustomerLayout><Home /></CustomerLayout>} />
          <Route path="/shop" element={<CustomerLayout><Shop /></CustomerLayout>} />
          <Route path="/product/:id" element={<CustomerLayout><ProductDetail /></CustomerLayout>} />
          <Route path="/cart" element={<CustomerLayout><Cart /></CustomerLayout>} />
          <Route path="/checkout" element={<CustomerLayout><Checkout /></CustomerLayout>} />
          <Route path="/order-success" element={<CustomerLayout><OrderSuccess /></CustomerLayout>} />
          <Route path="/account" element={<CustomerLayout><Account /></CustomerLayout>} />
          <Route path="/account/orders" element={<CustomerLayout><Account /></CustomerLayout>} />
          <Route path="/about" element={<CustomerLayout><About /></CustomerLayout>} />
          <Route path="/contact" element={<CustomerLayout><Contact /></CustomerLayout>} />
          <Route path="/:type" element={<CustomerLayout><PolicyPage /></CustomerLayout>} />

          {/* Admin routes */}
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="products" element={<AdminProducts />} />
            <Route path="products/add" element={<ProductForm />} />
            <Route path="products/edit/:id" element={<ProductForm />} />
            <Route path="inventory" element={<AdminInventory />} />
            <Route path="orders" element={<AdminOrders />} />
            <Route path="import" element={<ImportProducts />} />
            <Route path="customers" element={<div className="bg-white rounded-xl border border-[#D9E1E8] p-8 text-center text-[#667085]"><p className="text-4xl mb-3">👥</p><p className="font-semibold text-[#0B3A63]">Customer Management</p><p className="text-sm mt-1">Coming soon</p></div>} />
            <Route path="settings" element={<div className="bg-white rounded-xl border border-[#D9E1E8] p-8 text-center text-[#667085]"><p className="text-4xl mb-3">⚙️</p><p className="font-semibold text-[#0B3A63]">Settings</p><p className="text-sm mt-1">Coming soon</p></div>} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </CartProvider>
    </BrowserRouter>
  );
}
