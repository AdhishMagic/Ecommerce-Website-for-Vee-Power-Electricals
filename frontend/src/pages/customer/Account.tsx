import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { ordersApi } from "../../api/orders";
import { addressesApi } from "../../api/addresses";
import { authService } from "../../services/authService";
import {
  OrderSummary,
  OrderDetailData,
  CustomerAddress,
} from "../../types/api";
import CustomerSidebar, { CustomerTabId } from "../../components/customer/CustomerSidebar";
import OrderCard from "../../components/customer/OrderCard";
import OrderDetailView from "../../components/customer/OrderDetailView";

type OrderFilterType = "all" | "in_progress" | "delivered" | "cancelled_returns";

export default function Account() {
  const location = useLocation();
  const [tab, setTab] = useState<CustomerTabId>(() => {
    if (location.pathname.includes("/orders")) return "orders";
    return "orders";
  });

  // Orders State
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<OrderDetailData | null>(null);
  const [selectedOrderLoading, setSelectedOrderLoading] = useState(false);
  const [orderFilter, setOrderFilter] = useState<OrderFilterType>("all");

  // Pagination State
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalOrdersCount, setTotalOrdersCount] = useState<number | undefined>(undefined);

  const { user, logout, refreshUser } = useAuth();

  // Address State
  const [addresses, setAddresses] = useState<CustomerAddress[]>([]);
  const [addressesLoading, setAddressesLoading] = useState(true);
  const [isAddressFormOpen, setIsAddressFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [addressError, setAddressError] = useState("");
  const [addressForm, setAddressForm] = useState({
    recipient_name: "",
    phone: "",
    address_line1: "",
    address_line2: "",
    landmark: "",
    city: "Coimbatore",
    state: "Tamil Nadu",
    pincode: "",
    address_type: "home" as "home" | "work" | "other",
    is_default: false,
  });

  // Profile Form State
  const [profileFirstName, setProfileFirstName] = useState("");
  const [profileLastName, setProfileLastName] = useState("");
  const [profilePhone, setProfilePhone] = useState("");
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState("");

  // Sync profile data when user changes
  useEffect(() => {
    if (user) {
      const cleanLastName = (user.last_name || "").trim().toLowerCase() === "user" ? "" : (user.last_name || "").trim();
      let cleanName = user.name?.trim() || "";
      if (cleanName.toLowerCase().endsWith(" user") && cleanName.toLowerCase() !== "user") {
        cleanName = cleanName.replace(/\s+user$/i, "").trim();
      }
      const parts = cleanName ? cleanName.split(/\s+/) : [];
      setProfileFirstName(user.first_name || parts[0] || "");
      setProfileLastName(cleanLastName || (parts.length > 1 ? parts.slice(1).join(" ") : ""));
      setProfilePhone(user.phone || "");
    }
  }, [user]);

  // Fetch orders with pagination
  const fetchOrders = useCallback(async (page = 1) => {
    try {
      setOrdersLoading(true);
      setOrdersError(null);
      const res = await ordersApi.getMyOrders({ page });
      if (Array.isArray(res)) {
        setOrders(res);
        setTotalOrdersCount(res.length);
        setTotalPages(1);
        setCurrentPage(1);
      } else if (res && Array.isArray(res.results)) {
        setOrders(res.results);
        setTotalOrdersCount(res.count ?? res.results.length);
        setTotalPages(res.total_pages || Math.ceil((res.count || 0) / 10) || 1);
        setCurrentPage(page);
      } else {
        setOrders([]);
        setTotalOrdersCount(0);
      }
    } catch (err: any) {
      console.error("Failed to load orders:", err);
      setOrdersError(err?.message || "Failed to load your orders. Please check your connection and try again.");
    } finally {
      setOrdersLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchOrders(1);
  }, [fetchOrders]);

  // Load addresses on tab change
  const loadAddresses = useCallback(async () => {
    try {
      setAddressesLoading(true);
      const data = await addressesApi.getAddresses();
      setAddresses(data);
    } catch (err) {
      console.error("Failed to load addresses:", err);
    } finally {
      setAddressesLoading(false);
    }
  }, []);

  useEffect(() => {
    if (tab === "addresses") {
      loadAddresses();
    }
  }, [tab, loadAddresses]);

  // Filtered orders calculation
  const filteredOrders = useMemo(() => {
    if (orderFilter === "all") return orders;
    return orders.filter((order) => {
      const s = (order.status || "").toUpperCase();
      if (orderFilter === "in_progress") {
        return ["PENDING", "CONFIRMED", "PACKED", "SHIPPED", "PROCESSING"].includes(s);
      }
      if (orderFilter === "delivered") {
        return s === "DELIVERED";
      }
      if (orderFilter === "cancelled_returns") {
        return ["CANCELLED", "RETURN_REQUESTED", "RETURN_APPROVED", "RETURN_REJECTED", "RETURN_COMPLETED", "REFUNDED"].includes(s);
      }
      return true;
    });
  }, [orders, orderFilter]);

  // Address Actions
  const openAddAddress = () => {
    setEditingId(null);
    setAddressError("");
    setAddressForm({
      recipient_name: user?.name || "",
      phone: user?.phone || "",
      address_line1: "",
      address_line2: "",
      landmark: "",
      city: "Coimbatore",
      state: "Tamil Nadu",
      pincode: "",
      address_type: "home",
      is_default: addresses.length === 0,
    });
    setIsAddressFormOpen(true);
  };

  const openEditAddress = (addr: CustomerAddress) => {
    setEditingId(addr.id);
    setAddressError("");
    setAddressForm({
      recipient_name: addr.recipient_name,
      phone: addr.phone,
      address_line1: addr.address_line1,
      address_line2: addr.address_line2 || "",
      landmark: addr.landmark || "",
      city: addr.city,
      state: addr.state,
      pincode: addr.pincode,
      address_type: addr.address_type,
      is_default: addr.is_default,
    });
    setIsAddressFormOpen(true);
  };

  const handleDeleteAddress = async (id: number) => {
    if (window.confirm("Are you sure you want to delete this address?")) {
      try {
        await addressesApi.deleteAddress(id);
        setAddresses((prev) => prev.filter((a) => a.id !== id));
      } catch (err: any) {
        alert(err?.message || "Failed to delete address.");
      }
    }
  };

  const saveAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddressError("");

    const pinClean = addressForm.pincode.trim();
    if (!/^[1-9][0-9]{5}$/.test(pinClean)) {
      setAddressError("PIN code must be a valid 6-digit Indian postal code.");
      return;
    }

    try {
      if (editingId) {
        const updated = await addressesApi.updateAddress(editingId, {
          ...addressForm,
          pincode: pinClean,
        });
        setAddresses((prev) => prev.map((a) => (a.id === editingId ? updated : a)));
      } else {
        const created = await addressesApi.createAddress({
          ...addressForm,
          pincode: pinClean,
        });
        setAddresses((prev) => [created, ...prev]);
      }
      setIsAddressFormOpen(false);
      loadAddresses();
    } catch (err: any) {
      setAddressError(err?.message || "Failed to save address. Please verify required fields.");
    }
  };

  const handleSetDefaultAddress = async (id: number) => {
    try {
      await addressesApi.setDefaultAddress(id);
      loadAddresses();
    } catch (err: any) {
      alert(err?.message || "Failed to set default address.");
    }
  };

  // Order Details Action
  const handleViewOrder = async (id: number) => {
    setSelectedOrderLoading(true);
    setActionError("");
    try {
      const detail = await ordersApi.getOrderDetail(id);
      setSelectedOrder(detail);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err: any) {
      alert(err?.message || "Failed to load order details.");
    } finally {
      setSelectedOrderLoading(false);
    }
  };

  const handleCancelOrder = async (orderId: number) => {
    const reason = window.prompt("Please enter a reason for cancelling this order:") || "Cancelled by customer";
    setActionError("");
    setActionLoading(true);
    try {
      const updated = await ordersApi.cancelOrder(orderId, reason);
      setSelectedOrder(updated);
      fetchOrders(currentPage);
    } catch (err: any) {
      setActionError(err?.message || "Failed to cancel order.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleRequestReturn = async (orderId: number) => {
    const reason = window.prompt("Please enter the reason for your return request (min 3 characters):");
    if (!reason || reason.trim().length < 3) {
      alert("A valid return reason of at least 3 characters is required.");
      return;
    }
    setActionError("");
    setActionLoading(true);
    try {
      const updated = await ordersApi.requestReturn(orderId, reason.trim());
      setSelectedOrder(updated);
      fetchOrders(currentPage);
    } catch (err: any) {
      setActionError(err?.message || "Failed to submit return request.");
    } finally {
      setActionLoading(false);
    }
  };

  // Profile Save Action
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileError("");
    setProfileSuccess(false);

    try {
      await authService.updateProfile({
        first_name: profileFirstName.trim(),
        last_name: profileLastName.trim(),
        phone: profilePhone.trim(),
      });
      await refreshUser();
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 3500);
    } catch (err: any) {
      setProfileError(err?.message || "Failed to update profile settings.");
    }
  };

  return (
    <div className="w-full bg-[#F6F8FA] min-h-[calc(100vh-140px)] py-6 sm:py-8 lg:py-10">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Breadcrumb Navigation */}
        <nav
          className="flex items-center gap-2 text-xs font-medium text-[#667085] mb-5 sm:mb-6 flex-wrap min-w-0"
          aria-label="Breadcrumb"
        >
          <Link to="/" className="hover:text-[#1769AA] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#1769AA] rounded">
            Home
          </Link>
          <span>/</span>
          <span className="text-[#17212B]">
            {tab === "orders" ? "My Orders" : tab === "addresses" ? "Saved Addresses" : "Profile Settings"}
          </span>
          {selectedOrder && (
            <>
              <span>/</span>
              <span className="text-[#1769AA] font-mono font-semibold">#{selectedOrder.order_number}</span>
            </>
          )}
        </nav>

        {/* 2-Column Responsive Layout */}
        <div className="w-full min-w-0 grid lg:grid-cols-12 gap-6 lg:gap-8 items-start">
          {/* Left Column: Customer Sidebar */}
          <aside className="w-full min-w-0 lg:col-span-4 xl:col-span-3 animate-dashboard-header">
            <CustomerSidebar
              user={user}
              activeTab={tab}
              onSelectTab={(newTab) => {
                setTab(newTab);
                setSelectedOrder(null);
              }}
              onLogout={logout}
              ordersCount={totalOrdersCount}
            />
          </aside>

          {/* Right Column: Main Content Area */}
          <main className="w-full min-w-0 lg:col-span-8 xl:col-span-9 animate-dashboard-card">
            {/* View Details View */}
            {selectedOrder ? (
              <OrderDetailView
                order={selectedOrder}
                onBack={() => setSelectedOrder(null)}
                onCancelOrder={handleCancelOrder}
                onRequestReturn={handleRequestReturn}
                actionLoading={actionLoading}
                actionError={actionError}
              />
            ) : (
              <>
                {/* TAB 1: MY ORDERS */}
                {tab === "orders" && (
                  <div className="space-y-6 min-w-0">
                    {/* Orders Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 min-w-0">
                      <div>
                        <div className="flex items-center gap-3 flex-wrap">
                          <h1
                            className="text-2xl sm:text-3xl font-bold text-[#0B3A63] tracking-tight"
                            style={{ fontFamily: "Outfit, sans-serif" }}
                          >
                            My Orders
                          </h1>
                          {typeof totalOrdersCount === "number" && (
                            <span className="px-2.5 py-0.5 text-xs font-bold bg-[#EFF6FF] text-[#1769AA] border border-[#BFDBFE] rounded-full">
                              {totalOrdersCount} {totalOrdersCount === 1 ? "Order" : "Orders"}
                            </span>
                          )}
                        </div>
                        <p className="text-xs sm:text-sm text-[#667085] mt-1">
                          Track your purchases and view your order details.
                        </p>
                      </div>

                      {/* Refresh Button */}
                      {!ordersLoading && (
                        <button
                          type="button"
                          onClick={() => fetchOrders(currentPage)}
                          className="self-start sm:self-center inline-flex items-center gap-1.5 text-xs font-semibold text-[#1769AA] hover:text-[#0B3A63] bg-white border border-[#D9E1E8] hover:border-[#1769AA] px-3 py-1.5 rounded-lg shadow-2xs transition-all duration-150 outline-none focus-visible:ring-2 focus-visible:ring-[#1769AA] cursor-pointer"
                          title="Refresh order history"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          <span>Refresh</span>
                        </button>
                      )}
                    </div>

                    {/* Status Filter Pills */}
                    {orders.length > 0 && (
                      <div className="w-full min-w-0 max-w-full flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
                        {(
                          [
                            { id: "all", label: "All Orders" },
                            { id: "in_progress", label: "In Progress" },
                            { id: "delivered", label: "Delivered" },
                            { id: "cancelled_returns", label: "Cancelled & Returns" },
                          ] as const
                        ).map((pill) => {
                          const isActive = orderFilter === pill.id;
                          return (
                            <button
                              key={pill.id}
                              type="button"
                              onClick={() => setOrderFilter(pill.id)}
                              className={`px-3.5 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap transition-all duration-150 shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-[#1769AA] ${
                                isActive
                                  ? "bg-[#0B3A63] text-white shadow-2xs font-semibold"
                                  : "bg-white text-[#667085] hover:text-[#17212B] border border-[#D9E1E8] hover:bg-slate-50"
                              }`}
                            >
                              {pill.label}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* STATE 1: Loading Skeleton */}
                    {ordersLoading && (
                      <div className="space-y-4 min-w-0">
                        {[1, 2, 3].map((n) => (
                          <div
                            key={n}
                            className="bg-white border border-[#D9E1E8] rounded-xl sm:rounded-2xl p-5 sm:p-6 shadow-2xs animate-pulse"
                          >
                            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                              <div className="space-y-2">
                                <div className="h-4 bg-slate-200 rounded w-36" />
                                <div className="h-3 bg-slate-100 rounded w-28" />
                              </div>
                              <div className="h-6 bg-slate-200 rounded-full w-20" />
                            </div>
                            <div className="pt-4 flex items-center justify-between">
                              <div className="space-y-2">
                                <div className="h-5 bg-slate-200 rounded w-24" />
                                <div className="h-3 bg-slate-100 rounded w-32" />
                              </div>
                              <div className="h-9 bg-slate-200 rounded-xl w-28" />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* STATE 2: API Failure / Error State */}
                    {!ordersLoading && ordersError && (
                      <div className="bg-white border border-rose-200 rounded-2xl p-8 sm:p-10 text-center shadow-xs">
                        <div className="w-14 h-14 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-rose-100">
                          <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                          </svg>
                        </div>
                        <h3
                          className="text-lg font-bold text-[#0B3A63] mb-2"
                          style={{ fontFamily: "Outfit, sans-serif" }}
                        >
                          Unable to Load Orders
                        </h3>
                        <p className="text-xs sm:text-sm text-[#667085] max-w-md mx-auto mb-6">
                          {ordersError}
                        </p>
                        <button
                          type="button"
                          onClick={() => fetchOrders(currentPage)}
                          className="inline-flex items-center gap-2 bg-[#1769AA] hover:bg-[#0B3A63] text-white px-6 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-colors shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-[#1769AA] cursor-pointer"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                          </svg>
                          <span>Retry</span>
                        </button>
                      </div>
                    )}

                    {/* STATE 3: Empty State (Zero orders) */}
                    {!ordersLoading && !ordersError && orders.length === 0 && (
                      <div className="bg-white border border-[#D9E1E8] rounded-2xl p-8 sm:p-12 text-center shadow-xs">
                        <div className="w-16 h-16 bg-[#EFF6FF] text-[#1769AA] rounded-full flex items-center justify-center mx-auto mb-4 border border-[#BFDBFE]">
                          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                          </svg>
                        </div>
                        <h3
                          className="text-lg sm:text-xl font-bold text-[#0B3A63] mb-2"
                          style={{ fontFamily: "Outfit, sans-serif" }}
                        >
                          No Orders Placed Yet
                        </h3>
                        <p className="text-xs sm:text-sm text-[#667085] max-w-md mx-auto mb-6">
                          Explore our wide catalog of genuine electrical switches, cables, fans, and appliances.
                        </p>
                        <Link
                          to="/shop"
                          className="inline-flex items-center gap-2 bg-[#0B3A63] hover:bg-[#1769AA] text-white px-6 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all shadow-2xs outline-none focus-visible:ring-2 focus-visible:ring-[#1769AA]"
                        >
                          <span>Start Shopping</span>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                          </svg>
                        </Link>
                      </div>
                    )}

                    {/* STATE 4: Filter Empty State */}
                    {!ordersLoading && !ordersError && orders.length > 0 && filteredOrders.length === 0 && (
                      <div className="bg-white border border-[#D9E1E8] rounded-2xl p-8 text-center shadow-xs">
                        <p className="text-sm font-semibold text-[#17212B] mb-1">
                          No orders found matching this filter
                        </p>
                        <p className="text-xs text-[#667085] mb-4">
                          Try switching to "All Orders" to view your full history.
                        </p>
                        <button
                          type="button"
                          onClick={() => setOrderFilter("all")}
                          className="text-xs font-semibold text-[#1769AA] hover:underline outline-none focus-visible:ring-1 focus-visible:ring-[#1769AA]"
                        >
                          Show All Orders
                        </button>
                      </div>
                    )}

                    {/* STATE 5: Orders List */}
                    {!ordersLoading && !ordersError && filteredOrders.length > 0 && (
                      <div className="space-y-4 min-w-0">
                        {filteredOrders.map((order, idx) => (
                          <OrderCard
                            key={order.id}
                            order={order}
                            onViewDetails={handleViewOrder}
                            isLoadingDetails={selectedOrderLoading}
                            style={{ animationDelay: `${idx * 60}ms` }}
                          />
                        ))}

                        {/* Pagination Bar */}
                        {totalPages > 1 && (
                          <div className="bg-white border border-[#D9E1E8] rounded-xl px-4 py-3 flex items-center justify-between gap-3 text-xs shadow-2xs mt-6 flex-wrap">
                            <span className="text-[#667085]">
                              Page <strong className="text-[#17212B]">{currentPage}</strong> of{" "}
                              <strong className="text-[#17212B]">{totalPages}</strong>
                            </span>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                disabled={currentPage <= 1 || ordersLoading}
                                onClick={() => fetchOrders(currentPage - 1)}
                                className="px-3 py-1.5 border border-[#D9E1E8] rounded-lg font-medium text-[#17212B] hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#1769AA]"
                              >
                                Previous
                              </button>
                              <button
                                type="button"
                                disabled={currentPage >= totalPages || ordersLoading}
                                onClick={() => fetchOrders(currentPage + 1)}
                                className="px-3 py-1.5 border border-[#D9E1E8] rounded-lg font-medium text-[#17212B] hover:bg-slate-50 disabled:opacity-40 disabled:pointer-events-none transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#1769AA]"
                              >
                                Next
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 2: SAVED ADDRESSES */}
                {tab === "addresses" && (
                  <div className="space-y-6 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2">
                      <div>
                        <h2
                          className="text-2xl sm:text-3xl font-bold text-[#0B3A63] tracking-tight"
                          style={{ fontFamily: "Outfit, sans-serif" }}
                        >
                          Saved Addresses
                        </h2>
                        <p className="text-xs sm:text-sm text-[#667085] mt-1">
                          Manage your delivery addresses for quick and easy checkout.
                        </p>
                      </div>
                      {!isAddressFormOpen && (
                        <button
                          type="button"
                          onClick={openAddAddress}
                          className="self-start sm:self-center inline-flex items-center gap-2 bg-[#1769AA] hover:bg-[#0B3A63] text-white text-xs sm:text-sm font-semibold px-4 py-2.5 rounded-xl shadow-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[#1769AA]"
                        >
                          <span>+</span>
                          <span>Add New Address</span>
                        </button>
                      )}
                    </div>

                    {isAddressFormOpen && (
                      <div className="bg-white border border-[#D9E1E8] rounded-2xl p-5 sm:p-7 shadow-xs">
                        <h3
                          className="text-base sm:text-lg font-bold text-[#0B3A63] mb-4"
                          style={{ fontFamily: "Outfit, sans-serif" }}
                        >
                          {editingId ? "Edit Address" : "Add New Address"}
                        </h3>

                        {addressError && (
                          <div className="bg-red-50 text-red-600 p-3 rounded-xl text-xs sm:text-sm mb-4 border border-red-100">
                            {addressError}
                          </div>
                        )}

                        <form onSubmit={saveAddress} className="space-y-4">
                          <div className="grid sm:grid-cols-2 gap-4">
                            <div>
                              <label className="block text-xs font-semibold text-[#17212B] mb-1.5">
                                Recipient Full Name *
                              </label>
                              <input
                                required
                                value={addressForm.recipient_name}
                                onChange={(e) =>
                                  setAddressForm({ ...addressForm, recipient_name: e.target.value })
                                }
                                className="w-full px-3.5 py-2.5 bg-[#F6F8FA] border border-[#D9E1E8] rounded-xl text-xs sm:text-sm focus:bg-white focus:border-[#1769AA] outline-none"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-[#17212B] mb-1.5">
                                Phone Number *
                              </label>
                              <input
                                required
                                value={addressForm.phone}
                                onChange={(e) =>
                                  setAddressForm({ ...addressForm, phone: e.target.value })
                                }
                                className="w-full px-3.5 py-2.5 bg-[#F6F8FA] border border-[#D9E1E8] rounded-xl text-xs sm:text-sm focus:bg-white focus:border-[#1769AA] outline-none"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-[#17212B] mb-1.5">
                              Address Line 1 *
                            </label>
                            <input
                              required
                              value={addressForm.address_line1}
                              onChange={(e) =>
                                setAddressForm({ ...addressForm, address_line1: e.target.value })
                              }
                              className="w-full px-3.5 py-2.5 bg-[#F6F8FA] border border-[#D9E1E8] rounded-xl text-xs sm:text-sm focus:bg-white focus:border-[#1769AA] outline-none"
                              placeholder="Door No., Building, Street"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold text-[#17212B] mb-1.5">
                              Address Line 2 (Optional)
                            </label>
                            <input
                              value={addressForm.address_line2}
                              onChange={(e) =>
                                setAddressForm({ ...addressForm, address_line2: e.target.value })
                              }
                              className="w-full px-3.5 py-2.5 bg-[#F6F8FA] border border-[#D9E1E8] rounded-xl text-xs sm:text-sm focus:bg-white focus:border-[#1769AA] outline-none"
                              placeholder="Area, Landmark"
                            />
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                            <div className="col-span-2 sm:col-span-1">
                              <label className="block text-xs font-semibold text-[#17212B] mb-1.5">
                                City *
                              </label>
                              <input
                                required
                                value={addressForm.city}
                                onChange={(e) =>
                                  setAddressForm({ ...addressForm, city: e.target.value })
                                }
                                className="w-full px-3.5 py-2.5 bg-[#F6F8FA] border border-[#D9E1E8] rounded-xl text-xs sm:text-sm focus:bg-white focus:border-[#1769AA] outline-none"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-[#17212B] mb-1.5">
                                State *
                              </label>
                              <input
                                required
                                value={addressForm.state}
                                onChange={(e) =>
                                  setAddressForm({ ...addressForm, state: e.target.value })
                                }
                                className="w-full px-3.5 py-2.5 bg-[#F6F8FA] border border-[#D9E1E8] rounded-xl text-xs sm:text-sm focus:bg-white focus:border-[#1769AA] outline-none"
                              />
                            </div>
                            <div>
                              <label className="block text-xs font-semibold text-[#17212B] mb-1.5">
                                PIN Code (6 digits) *
                              </label>
                              <input
                                required
                                value={addressForm.pincode}
                                onChange={(e) =>
                                  setAddressForm({ ...addressForm, pincode: e.target.value })
                                }
                                className="w-full px-3.5 py-2.5 bg-[#F6F8FA] border border-[#D9E1E8] rounded-xl text-xs sm:text-sm focus:bg-white focus:border-[#1769AA] outline-none"
                                placeholder="641001"
                              />
                            </div>
                          </div>
                          <div className="flex items-center gap-2 mt-4 pt-2">
                            <input
                              type="checkbox"
                              id="is_default"
                              checked={addressForm.is_default}
                              onChange={(e) =>
                                setAddressForm({ ...addressForm, is_default: e.target.checked })
                              }
                              className="rounded text-[#1769AA] focus:ring-[#1769AA]"
                            />
                            <label htmlFor="is_default" className="text-xs sm:text-sm text-[#17212B]">
                              Set as default shipping address
                            </label>
                          </div>
                          <div className="flex gap-3 pt-4 border-t border-[#F1F5F9]">
                            <button
                              type="submit"
                              className="bg-[#1769AA] text-white px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold hover:bg-[#0B3A63] transition-colors"
                            >
                              Save Address
                            </button>
                            <button
                              type="button"
                              onClick={() => setIsAddressFormOpen(false)}
                              className="bg-[#F6F8FA] text-[#667085] px-5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold hover:bg-[#D9E1E8] hover:text-[#17212B] transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </form>
                      </div>
                    )}

                    {addressesLoading ? (
                      <div className="grid sm:grid-cols-2 gap-5">
                        {[1, 2].map((i) => (
                          <div
                            key={i}
                            className="animate-pulse bg-white rounded-2xl p-6 h-48 border border-[#D9E1E8]"
                          />
                        ))}
                      </div>
                    ) : (
                      <div className="grid sm:grid-cols-2 gap-5">
                        {addresses.map((addr) => (
                          <div
                            key={addr.id}
                            className={`bg-white rounded-2xl p-5 sm:p-6 relative transition-all shadow-xs ${
                              addr.is_default
                                ? "border-2 border-[#1769AA]"
                                : "border border-[#D9E1E8] hover:border-[#1769AA]/50"
                            }`}
                          >
                            {addr.is_default && (
                              <span className="absolute top-4 right-4 text-[10px] bg-[#EFF6FF] text-[#1769AA] font-bold px-2 py-0.5 rounded-full tracking-wide">
                                DEFAULT
                              </span>
                            )}
                            <p
                              className="font-bold text-[#17212B] text-base mb-2 pr-16"
                              style={{ fontFamily: "Outfit, sans-serif" }}
                            >
                              {addr.recipient_name}
                            </p>
                            <div className="space-y-1 text-xs sm:text-sm text-[#667085] leading-relaxed">
                              <p>
                                {addr.address_line1}
                                {addr.address_line2 ? `, ${addr.address_line2}` : ""}
                              </p>
                              <p>
                                {addr.city}, {addr.state} - {addr.pincode}
                              </p>
                              <p className="text-[#17212B] font-medium pt-2 border-t border-[#F1F5F9]">
                                📞 {addr.phone}
                              </p>
                            </div>
                            <div className="flex items-center justify-between mt-5 pt-3 border-t border-[#F1F5F9]">
                              <div className="flex gap-4">
                                <button
                                  type="button"
                                  onClick={() => openEditAddress(addr)}
                                  className="text-xs font-semibold text-[#1769AA] hover:text-[#0B3A63] transition-colors"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteAddress(addr.id)}
                                  className="text-xs font-semibold text-[#C0392B] hover:text-[#992D22] transition-colors"
                                >
                                  Delete
                                </button>
                              </div>
                              {!addr.is_default && (
                                <button
                                  type="button"
                                  onClick={() => handleSetDefaultAddress(addr.id)}
                                  className="text-xs text-slate-500 hover:text-[#1769AA] underline"
                                >
                                  Set as Default
                                </button>
                              )}
                            </div>
                          </div>
                        ))}

                        {!isAddressFormOpen && (
                          <button
                            type="button"
                            onClick={openAddAddress}
                            className="bg-white border-2 border-dashed border-[#D9E1E8] rounded-2xl p-6 text-center hover:border-[#1769AA] hover:bg-[#EFF6FF]/40 transition-colors group flex flex-col items-center justify-center min-h-[180px] shadow-2xs"
                          >
                            <div className="w-10 h-10 bg-[#EFF6FF] rounded-full flex items-center justify-center mb-2 group-hover:scale-110 transition-transform text-[#1769AA]">
                              <span className="text-xl font-bold leading-none">+</span>
                            </div>
                            <span className="text-xs sm:text-sm font-semibold text-[#667085] group-hover:text-[#1769AA]">
                              Add New Address
                            </span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 3: PROFILE SETTINGS */}
                {tab === "profile" && (
                  <div className="space-y-6 min-w-0">
                    <div>
                      <h2
                        className="text-2xl sm:text-3xl font-bold text-[#0B3A63] tracking-tight"
                        style={{ fontFamily: "Outfit, sans-serif" }}
                      >
                        Profile Settings
                      </h2>
                      <p className="text-xs sm:text-sm text-[#667085] mt-1">
                        Update your personal details and contact information.
                      </p>
                    </div>

                    <div className="bg-white border border-[#D9E1E8] rounded-2xl p-6 sm:p-8 shadow-xs">
                      {profileSuccess && (
                        <div className="bg-emerald-50 text-emerald-700 p-3.5 rounded-xl text-xs sm:text-sm border border-emerald-200 mb-6 flex items-center gap-2">
                          <svg className="w-4 h-4 shrink-0 text-emerald-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          <span>Profile updated successfully!</span>
                        </div>
                      )}
                      {profileError && (
                        <div className="bg-red-50 text-red-600 p-3.5 rounded-xl text-xs sm:text-sm border border-red-100 mb-6 flex items-center gap-2">
                          <svg className="w-4 h-4 shrink-0 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span>{profileError}</span>
                        </div>
                      )}

                      <form onSubmit={handleSaveProfile}>
                        <div className="grid sm:grid-cols-2 gap-5">
                          <div>
                            <label className="text-xs font-semibold text-[#17212B] mb-2 block">
                              First Name
                            </label>
                            <input
                              value={profileFirstName}
                              onChange={(e) => setProfileFirstName(e.target.value)}
                              className="w-full bg-[#F6F8FA] border border-[#D9E1E8] rounded-xl px-4 py-2.5 text-xs sm:text-sm outline-none focus:bg-white focus:border-[#1769AA] focus:ring-2 focus:ring-[#1769AA]/15 transition-all"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-[#17212B] mb-2 block">
                              Last Name
                            </label>
                            <input
                              value={profileLastName}
                              onChange={(e) => setProfileLastName(e.target.value)}
                              className="w-full bg-[#F6F8FA] border border-[#D9E1E8] rounded-xl px-4 py-2.5 text-xs sm:text-sm outline-none focus:bg-white focus:border-[#1769AA] focus:ring-2 focus:ring-[#1769AA]/15 transition-all"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-[#17212B] mb-2 block">
                              Email Address (Read-only)
                            </label>
                            <input
                              disabled
                              value={user?.email || ""}
                              className="w-full bg-slate-100 border border-[#D9E1E8] rounded-xl px-4 py-2.5 text-xs sm:text-sm text-slate-500 cursor-not-allowed"
                            />
                          </div>
                          <div>
                            <label className="text-xs font-semibold text-[#17212B] mb-2 block">
                              Mobile Number
                            </label>
                            <input
                              value={profilePhone}
                              onChange={(e) => setProfilePhone(e.target.value)}
                              className="w-full bg-[#F6F8FA] border border-[#D9E1E8] rounded-xl px-4 py-2.5 text-xs sm:text-sm outline-none focus:bg-white focus:border-[#1769AA] focus:ring-2 focus:ring-[#1769AA]/15 transition-all"
                              placeholder="+91 98765 43210"
                            />
                          </div>
                        </div>
                        <div className="mt-8 pt-5 border-t border-[#F1F5F9] flex justify-end">
                          <button
                            type="submit"
                            className="bg-[#0B3A63] text-white px-6 py-2.5 rounded-xl text-xs sm:text-sm font-semibold hover:bg-[#1769AA] transition-colors shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-[#1769AA]"
                          >
                            Save Changes
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
