import { lazy, Suspense } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { CartProvider } from "./context/CartContext";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/common/ProtectedRoute";

import CustomerLayout from "./layouts/CustomerLayout";
import AdminLayout from "./layouts/AdminLayout";

// Lazy-loaded customer pages
const Home = lazy(() => import("./pages/customer/Home"));
const Shop = lazy(() => import("./pages/customer/Shop"));
const ProductDetail = lazy(() => import("./pages/customer/ProductDetail"));
const Cart = lazy(() => import("./pages/customer/Cart"));
const Checkout = lazy(() => import("./pages/customer/Checkout"));
const OrderSuccess = lazy(() => import("./pages/customer/OrderSuccess"));
const Account = lazy(() => import("./pages/customer/Account"));
const About = lazy(() => import("./pages/customer/About"));
const Contact = lazy(() => import("./pages/customer/Contact"));
const PolicyPage = lazy(() => import("./pages/customer/PolicyPage"));

// Lazy-loaded admin pages
const Dashboard = lazy(() => import("./pages/admin/Dashboard"));
const AdminProducts = lazy(() => import("./pages/admin/Products"));
const ProductForm = lazy(() => import("./pages/admin/ProductForm"));
const AdminInventory = lazy(() => import("./pages/admin/Inventory"));
const AdminOrders = lazy(() => import("./pages/admin/Orders"));
const ImportProducts = lazy(() => import("./pages/admin/ImportProducts"));
const AdminCategories = lazy(() => import("./pages/admin/Categories"));

// Lazy-loaded auth pages
const Login = lazy(() => import("./pages/auth/Login"));
const Register = lazy(() => import("./pages/auth/Register"));
const ForgotPassword = lazy(() => import("./pages/auth/ForgotPassword"));

function PageLoader() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[55vh] py-16 gap-3">
      <div className="w-9 h-9 border-3 border-[#D9E1E8] border-t-[#0B3A63] rounded-full animate-spin" />
      <span className="text-xs font-semibold text-[#0B3A63] tracking-wider animate-pulse uppercase">
        Loading...
      </span>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <CartProvider>
          <Suspense fallback={<PageLoader />}>
            <Routes>
              {/* Auth routes */}
              <Route path="/login" element={<Login />} />
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
                <Route path="products" element={<AdminProducts />} />
                <Route path="products/add" element={<ProductForm />} />
                <Route path="products/edit/:id" element={<ProductForm />} />
                <Route path="inventory" element={<AdminInventory />} />
                <Route path="orders" element={<AdminOrders />} />
                <Route path="categories" element={<AdminCategories />} />
                <Route path="import" element={<ImportProducts />} />
                <Route path="customers" element={<div className="bg-white rounded-xl border border-[#D9E1E8] p-8 text-center text-[#667085]"><p className="text-4xl mb-3">👥</p><p className="font-semibold text-[#0B3A63]">Customer Management</p><p className="text-sm mt-1">Coming soon</p></div>} />
                <Route path="settings" element={<div className="bg-white rounded-xl border border-[#D9E1E8] p-8 text-center text-[#667085]"><p className="text-4xl mb-3">⚙️</p><p className="font-semibold text-[#0B3A63]">Settings</p><p className="text-sm mt-1">Coming soon</p></div>} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </CartProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}
