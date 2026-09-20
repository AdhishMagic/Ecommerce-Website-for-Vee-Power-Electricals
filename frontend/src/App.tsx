import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { CartProvider } from "./context/CartContext";
import { AuthProvider } from "./context/AuthContext";
import { ShopProvider } from "./context/ShopContext";
import ProtectedRoute from "./components/common/ProtectedRoute";
import ScrollToTop from "./components/common/ScrollToTop";

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
import Transactions from "./pages/admin/Transactions";
import ShippingSettings from "./pages/admin/Shipping";
import FinanceSummaryPage from "./pages/admin/FinanceSummary";
import ExpensesPage from "./pages/admin/Expenses";
import QuotationsPage from "./pages/admin/Quotations";
import ClientsPage from "./pages/admin/Clients";
import InvoicesPage from "./pages/admin/Invoices";
import ProductsAnalytics from "./pages/admin/ProductsAnalytics";
import TrafficAnalytics from "./pages/admin/TrafficAnalytics";
import ImportProducts from "./pages/admin/ImportProducts";

import Login from "./pages/auth/Login";
import Register from "./pages/auth/Register";
import ForgotPassword from "./pages/auth/ForgotPassword";

export default function App() {
  return (
    <BrowserRouter>
      <ScrollToTop />
      <AuthProvider>
        <ShopProvider>
          <CartProvider>
            <Routes>
            {/* Auth routes */}
            <Route path="/login" element={<Login />} />
            <Route path="/admin/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            
            {/* Customer routes */}
            <Route path="/" element={<CustomerLayout><Home /></CustomerLayout>} />
            <Route path="/shop" element={<CustomerLayout><Shop /></CustomerLayout>} />
            <Route path="/product/:id" element={<CustomerLayout><ProductDetail /></CustomerLayout>} />
            <Route path="/cart" element={<CustomerLayout><Cart /></CustomerLayout>} />
            <Route path="/about" element={<CustomerLayout><About /></CustomerLayout>} />
            <Route path="/contact" element={<CustomerLayout><Contact /></CustomerLayout>} />
            <Route path="/:type" element={<CustomerLayout><PolicyPage /></CustomerLayout>} />
            
            {/* Protected Customer Routes */}
            <Route path="/checkout" element={<ProtectedRoute allowedRoles={["customer", "admin"]}><CustomerLayout><Checkout /></CustomerLayout></ProtectedRoute>} />
            <Route path="/order-success" element={<ProtectedRoute allowedRoles={["customer", "admin"]}><CustomerLayout><OrderSuccess /></CustomerLayout></ProtectedRoute>} />
            <Route path="/account" element={<ProtectedRoute allowedRoles={["customer", "admin"]}><CustomerLayout><Account /></CustomerLayout></ProtectedRoute>} />
            <Route path="/account/orders" element={<ProtectedRoute allowedRoles={["customer", "admin"]}><CustomerLayout><Account /></CustomerLayout></ProtectedRoute>} />

            {/* Admin routes */}
            <Route path="/admin" element={<ProtectedRoute allowedRoles={["admin"]}><AdminLayout /></ProtectedRoute>}>
              <Route index element={<Dashboard />} />
              
              {/* Orders */}
              <Route path="orders" element={<AdminOrders />} />
              <Route path="orders/transactions" element={<Transactions />} />
              <Route path="orders/shipping" element={<ShippingSettings />} />

              {/* Analytics */}
              <Route path="analytics/products" element={<ProductsAnalytics />} />
              <Route path="analytics/traffic" element={<TrafficAnalytics />} />

              {/* Finance */}
              <Route path="finance/expenses" element={<ExpensesPage />} />
              <Route path="finance/quotations" element={<QuotationsPage />} />
              <Route path="finance/clients" element={<ClientsPage />} />
              <Route path="finance/invoices" element={<InvoicesPage />} />
              <Route path="finance/summary" element={<FinanceSummaryPage />} />
              
              {/* Other existing routes (not in sidebar, but kept active if needed) */}
              <Route path="products" element={<AdminProducts />} />
              <Route path="products/add" element={<ProductForm />} />
              <Route path="products/edit/:id" element={<ProductForm />} />
              <Route path="inventory" element={<AdminInventory />} />
              <Route path="import" element={<ImportProducts />} />
              <Route path="customers" element={<div className="bg-white rounded-xl border border-[#D9E1E8] p-8 text-center text-[#667085]"><p className="text-4xl mb-3">👥</p><p className="font-semibold text-[#0B3A63]">Customer Management</p><p className="text-sm mt-1">Coming soon</p></div>} />
              <Route path="settings" element={<div className="bg-white rounded-xl border border-[#D9E1E8] p-8 text-center text-[#667085]"><p className="text-4xl mb-3">⚙️</p><p className="font-semibold text-[#0B3A63]">Settings</p><p className="text-sm mt-1">Coming soon</p></div>} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
          </CartProvider>
        </ShopProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
