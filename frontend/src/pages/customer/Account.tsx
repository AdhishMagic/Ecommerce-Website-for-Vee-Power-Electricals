import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { ordersApi } from "../../api/orders";
import { addressesApi } from "../../api/addresses";
import { authService } from "../../services/authService";
import { OrderSummary, OrderDetailData, CustomerAddress, OrderStatus } from "../../types/api";

const statusColors: Record<string, string> = {
  PENDING: "bg-slate-100 text-slate-700",
  CONFIRMED: "bg-blue-100 text-blue-700",
  PACKED: "bg-amber-100 text-amber-700",
  SHIPPED: "bg-indigo-100 text-indigo-700",
  DELIVERED: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-red-100 text-red-700",
  RETURN_REQUESTED: "bg-orange-100 text-orange-700",
  RETURN_APPROVED: "bg-purple-100 text-purple-700",
  RETURN_REJECTED: "bg-rose-100 text-rose-700",
  RETURN_COMPLETED: "bg-gray-100 text-gray-700",
  // Legacy string mappings
  Delivered: "bg-emerald-100 text-emerald-700",
  Shipped: "bg-indigo-100 text-indigo-700",
  Packed: "bg-amber-100 text-amber-700",
  Confirmed: "bg-blue-100 text-blue-700",
  Pending: "bg-slate-100 text-slate-700",
  Cancelled: "bg-red-100 text-red-700",
};

export default function Account() {
  const [tab, setTab] = useState("orders");
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [selectedOrder, setSelectedOrder] = useState<OrderDetailData | null>(null);
  const [selectedOrderLoading, setSelectedOrderLoading] = useState(false);

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

  useEffect(() => {
    if (user) {
      const parts = user.name?.split(" ") || ["", ""];
      setProfileFirstName(parts[0] || "");
      setProfileLastName(parts.slice(1).join(" ") || "");
      setProfilePhone(user.phone || "");
    }
  }, [user]);

  // Load orders on mount
  useEffect(() => {
    let isMounted = true;
    const fetchOrders = async () => {
      try {
        setOrdersLoading(true);
        const res = await ordersApi.getMyOrders();
        if (isMounted) {
          setOrders(Array.isArray(res) ? res : res.results || []);
        }
      } catch (err) {
        console.error("Failed to load orders:", err);
      } finally {
        if (isMounted) setOrdersLoading(false);
      }
    };

    fetchOrders();
    return () => {
      isMounted = false;
    };
  }, []);

  // Load addresses on mount or tab change
  const loadAddresses = async () => {
    try {
      setAddressesLoading(true);
      const data = await addressesApi.getAddresses();
      setAddresses(data);
    } catch (err) {
      console.error("Failed to load addresses:", err);
    } finally {
      setAddressesLoading(false);
    }
  };

  useEffect(() => {
    if (tab === "addresses") {
      loadAddresses();
    }
  }, [tab]);

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
        setAddresses(prev => prev.filter(a => a.id !== id));
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
        setAddresses(prev => prev.map(a => a.id === editingId ? updated : a));
      } else {
        const created = await addressesApi.createAddress({
          ...addressForm,
          pincode: pinClean,
        });
        setAddresses(prev => [created, ...prev]);
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

  const handleViewOrder = async (id: number) => {
    setSelectedOrderLoading(true);
    try {
      const detail = await ordersApi.getOrderDetail(id);
      setSelectedOrder(detail);
    } catch (err: any) {
      alert(err?.message || "Failed to load order details.");
    } finally {
      setSelectedOrderLoading(false);
    }
  };

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
      setTimeout(() => setProfileSuccess(false), 3000);
    } catch (err: any) {
      setProfileError(err?.message || "Failed to update profile settings.");
    }
  };

  if (selectedOrder) {
    const shipping = selectedOrder.shipping_address || {};
    return (
      <div className="max-w-4xl mx-auto px-4 py-6">
        <button onClick={() => setSelectedOrder(null)} className="flex items-center gap-2 text-sm text-[#667085] hover:text-[#1769AA] mb-4 font-medium">
          ← Back to Orders
        </button>
        <div className="bg-white border border-[#D9E1E8] rounded-xl p-6 shadow-sm">
          <div className="flex flex-wrap justify-between items-start gap-3 mb-6 pb-4 border-b border-gray-100">
            <div>
              <h2 className="text-xl font-bold text-[#0B3A63] font-mono">Order #{selectedOrder.order_number}</h2>
              <p className="text-sm text-[#667085] mt-1">Placed on {new Date(selectedOrder.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}</p>
            </div>
            <span className={`text-sm font-semibold px-3 py-1 rounded-full ${statusColors[selectedOrder.status] || "bg-gray-100 text-gray-700"}`}>
              {selectedOrder.status}
            </span>
          </div>

          {/* Timeline */}
          {selectedOrder.status_history && selectedOrder.status_history.length > 0 && (
            <div className="mb-6 p-4 bg-[#F8FAFC] rounded-xl border border-gray-100">
              <h3 className="font-semibold text-[#0B3A63] mb-4 text-sm uppercase tracking-wider">Status History & Audit Trail</h3>
              <div className="space-y-3">
                {selectedOrder.status_history.map((event, i) => (
                  <div key={event.id || i} className="flex items-start gap-3">
                    <div className="w-5 h-5 rounded-full bg-[#12773D] flex items-center justify-center flex-shrink-0 mt-0.5">
                      <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                    </div>
                    <div className="flex-1 text-sm">
                      <p className="font-semibold text-[#17212B]">{event.new_status} <span className="font-normal text-xs text-[#667085]">({new Date(event.created_at).toLocaleString("en-IN")})</span></p>
                      {event.reason && <p className="text-xs text-[#667085] mt-0.5">{event.reason}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Items */}
          <div className="mb-6">
            <h3 className="font-semibold text-[#0B3A63] mb-3">Items Ordered ({selectedOrder.items?.length || 0})</h3>
            <div className="space-y-3">
              {selectedOrder.items?.map((item, i) => (
                <div key={item.id || i} className="flex gap-4 py-3 border-b border-[#D9E1E8] last:border-0 items-center">
                  {item.image_url ? (
                    <img src={item.image_url} alt={item.product_name} className="w-14 h-14 object-cover rounded-lg bg-[#F6F8FA] border border-gray-200" />
                  ) : (
                    <div className="w-14 h-14 bg-gray-100 rounded-lg flex items-center justify-center text-xl text-gray-400">⚡</div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-[#17212B] line-clamp-1">{item.product_name}</p>
                    <p className="text-xs text-[#667085] mt-0.5">SKU: {item.sku} · Qty: {item.quantity} × ₹{Number(item.unit_price).toLocaleString("en-IN")}</p>
                  </div>
                  <p className="font-bold text-[#0B3A63] text-sm">₹{Number(item.total_amount).toLocaleString("en-IN")}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Billing & Delivery */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="bg-[#F6F8FA] rounded-xl p-4 border border-[#D9E1E8]">
              <h4 className="font-semibold text-[#0B3A63] mb-2 text-sm">Delivery Address</h4>
              <p className="text-sm font-bold text-[#17212B]">{shipping.recipient_name || selectedOrder.customer_name}</p>
              <p className="text-sm text-[#667085] mt-0.5">{shipping.address_line1 || shipping.address}</p>
              {shipping.address_line2 && <p className="text-sm text-[#667085]">{shipping.address_line2}</p>}
              <p className="text-sm text-[#667085]">{shipping.city}, {shipping.state} - {shipping.pincode}</p>
              <p className="text-xs text-[#1769AA] mt-1 font-medium">📞 {shipping.phone || selectedOrder.customer_phone}</p>
            </div>
            <div className="bg-[#F6F8FA] rounded-xl p-4 border border-[#D9E1E8] space-y-1.5">
              <h4 className="font-semibold text-[#0B3A63] mb-2 text-sm">Financial Snapshot</h4>
              <div className="flex justify-between text-xs text-[#667085]"><span>Subtotal:</span><span>₹{Number(selectedOrder.subtotal).toLocaleString("en-IN")}</span></div>
              {Number(selectedOrder.total_discount) > 0 && (
                <div className="flex justify-between text-xs text-[#12773D]"><span>Discount:</span><span>−₹{Number(selectedOrder.total_discount).toLocaleString("en-IN")}</span></div>
              )}
              <div className="flex justify-between text-xs text-[#667085]"><span>Delivery Fee:</span><span>₹{Number(selectedOrder.shipping_fee).toLocaleString("en-IN")}</span></div>
              <div className="flex justify-between text-xs text-[#667085]"><span>GST:</span><span>₹{(Number(selectedOrder.cgst_amount || 0) + Number(selectedOrder.sgst_amount || 0) + Number(selectedOrder.igst_amount || 0)).toLocaleString("en-IN")}</span></div>
              <div className="flex justify-between text-sm font-bold text-[#0B3A63] pt-2 border-t border-gray-200">
                <span>Total Amount:</span>
                <span className="text-[#1769AA] text-base">₹{Number(selectedOrder.total_amount).toLocaleString("en-IN")}</span>
              </div>
              <div className="pt-2 text-xs text-[#667085] flex justify-between">
                <span>Payment: {selectedOrder.payment_method}</span>
                <span className="font-semibold text-emerald-700">{selectedOrder.payment_status}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="grid lg:grid-cols-12 gap-8">
        {/* Sidebar */}
        <div className="lg:col-span-3">
          <div className="bg-white border border-[#D9E1E8] rounded-2xl overflow-hidden shadow-sm sticky top-24">
            <div className="bg-[#0B3A63] p-6 text-center">
              <div className="w-20 h-20 bg-[#F2A900] rounded-full flex items-center justify-center mx-auto mb-3 shadow-md border-4 border-[#0B3A63]/50">
                <span className="text-[#0B3A63] font-bold text-3xl" style={{ fontFamily: "Outfit" }}>
                  {user?.name?.charAt(0) || "U"}
                </span>
              </div>
              <p className="font-semibold text-white text-base" style={{ fontFamily: "Outfit" }}>{user?.name || "Customer"}</p>
              <p className="text-white/70 text-sm mt-0.5">{user?.email || "customer@email.com"}</p>
            </div>
            <div className="p-4 space-y-1">
              {[
                { id: "orders", label: "My Orders", icon: "📦" },
                { id: "addresses", label: "Addresses", icon: "📍" },
                { id: "profile", label: "Profile Settings", icon: "👤" },
              ].map(item => (
                <button
                  key={item.id}
                  onClick={() => setTab(item.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 text-sm rounded-xl transition-all text-left ${tab === item.id ? "bg-[#1769AA] text-white font-medium shadow-md shadow-[#1769AA]/20" : "text-[#667085] hover:text-[#17212B] hover:bg-[#F6F8FA]"}`}
                >
                  <span className="text-lg">{item.icon}</span>
                  {item.label}
                </button>
              ))}
              <div className="pt-2 mt-2 border-t border-[#D9E1E8]">
                <button
                  onClick={logout}
                  className="w-full flex items-center gap-3 px-4 py-3 text-sm text-[#C0392B] hover:bg-[#FEF2F2] rounded-xl transition-colors font-medium"
                >
                  <span className="text-lg">🚪</span> Logout
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="lg:col-span-9">
          {tab === "orders" && (
            <div>
              <h2 className="text-2xl font-bold text-[#0B3A63] mb-6" style={{ fontFamily: "Outfit" }}>My Orders</h2>
              {ordersLoading ? (
                <div className="space-y-4">
                  {[...Array(3)].map((_, i) => (
                    <div key={i} className="animate-pulse bg-white border border-[#D9E1E8] rounded-2xl p-6 h-36"></div>
                  ))}
                </div>
              ) : orders.length === 0 ? (
                <div className="bg-white border border-[#D9E1E8] rounded-2xl p-12 text-center shadow-sm">
                  <div className="text-5xl mb-4">📦</div>
                  <h3 className="text-lg font-bold text-[#0B3A63] mb-2">No orders placed yet</h3>
                  <p className="text-sm text-[#667085] mb-6">Explore our wide catalog of genuine electrical merchandise.</p>
                  <Link to="/shop" className="bg-[#0B3A63] hover:bg-[#1769AA] text-white px-6 py-2.5 rounded-lg text-sm font-semibold transition-colors">
                    Start Shopping
                  </Link>
                </div>
              ) : (
                <div className="space-y-4">
                  {orders.map(order => (
                    <div key={order.id} className="bg-white border border-[#D9E1E8] rounded-2xl p-6 hover:shadow-md transition-shadow">
                      <div className="flex flex-wrap justify-between items-start gap-4 mb-4">
                        <div>
                          <p className="font-semibold text-[#17212B] text-base font-mono">#{order.order_number}</p>
                          <p className="text-sm text-[#667085] mt-1">{new Date(order.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}</p>
                        </div>
                        <span className={`text-xs font-semibold px-3 py-1.5 rounded-full ${statusColors[order.status] || "bg-gray-100 text-gray-700"}`}>
                          {order.status}
                        </span>
                      </div>
                      <div className="flex justify-between items-center pt-4 border-t border-[#F6F8FA]">
                        <div>
                          <p className="text-base font-bold text-[#0B3A63]">₹{Number(order.total_amount).toLocaleString("en-IN")}</p>
                          <p className="text-xs text-[#667085] mt-0.5">{order.items_count} item{order.items_count === 1 ? '' : 's'} · {order.payment_method}</p>
                        </div>
                        <button
                          onClick={() => handleViewOrder(order.id)}
                          disabled={selectedOrderLoading}
                          className="text-sm bg-[#F6F8FA] hover:bg-[#1769AA] text-[#1769AA] hover:text-white px-4 py-2 rounded-lg font-medium transition-colors"
                        >
                          View Details
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === "addresses" && (
            <div>
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-[#0B3A63]" style={{ fontFamily: "Outfit" }}>Saved Addresses</h2>
                {!isAddressFormOpen && (
                  <button
                    onClick={openAddAddress}
                    className="bg-[#1769AA] hover:bg-[#0B3A63] text-white text-sm font-medium px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
                  >
                    <span>+</span> Add New
                  </button>
                )}
              </div>

              {isAddressFormOpen && (
                <div className="bg-white border border-[#D9E1E8] rounded-2xl p-6 shadow-sm mb-6">
                  <h3 className="text-lg font-bold text-[#0B3A63] mb-4">{editingId ? 'Edit Address' : 'Add New Address'}</h3>

                  {addressError && (
                    <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm mb-4 border border-red-100">
                      {addressError}
                    </div>
                  )}

                  <form onSubmit={saveAddress} className="space-y-4">
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-[#17212B] mb-1.5">Recipient Full Name *</label>
                        <input required value={addressForm.recipient_name} onChange={e => setAddressForm({...addressForm, recipient_name: e.target.value})} className="w-full px-4 py-2.5 bg-[#F6F8FA] border border-[#D9E1E8] rounded-xl text-sm focus:bg-white focus:border-[#1769AA] outline-none" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[#17212B] mb-1.5">Phone Number *</label>
                        <input required value={addressForm.phone} onChange={e => setAddressForm({...addressForm, phone: e.target.value})} className="w-full px-4 py-2.5 bg-[#F6F8FA] border border-[#D9E1E8] rounded-xl text-sm focus:bg-white focus:border-[#1769AA] outline-none" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[#17212B] mb-1.5">Address Line 1 *</label>
                      <input required value={addressForm.address_line1} onChange={e => setAddressForm({...addressForm, address_line1: e.target.value})} className="w-full px-4 py-2.5 bg-[#F6F8FA] border border-[#D9E1E8] rounded-xl text-sm focus:bg-white focus:border-[#1769AA] outline-none" placeholder="Door No., Building, Street" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[#17212B] mb-1.5">Address Line 2 (Optional)</label>
                      <input value={addressForm.address_line2} onChange={e => setAddressForm({...addressForm, address_line2: e.target.value})} className="w-full px-4 py-2.5 bg-[#F6F8FA] border border-[#D9E1E8] rounded-xl text-sm focus:bg-white focus:border-[#1769AA] outline-none" placeholder="Area, Landmark" />
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      <div className="col-span-2 sm:col-span-1">
                        <label className="block text-sm font-medium text-[#17212B] mb-1.5">City *</label>
                        <input required value={addressForm.city} onChange={e => setAddressForm({...addressForm, city: e.target.value})} className="w-full px-4 py-2.5 bg-[#F6F8FA] border border-[#D9E1E8] rounded-xl text-sm focus:bg-white focus:border-[#1769AA] outline-none" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[#17212B] mb-1.5">State *</label>
                        <input required value={addressForm.state} onChange={e => setAddressForm({...addressForm, state: e.target.value})} className="w-full px-4 py-2.5 bg-[#F6F8FA] border border-[#D9E1E8] rounded-xl text-sm focus:bg-white focus:border-[#1769AA] outline-none" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[#17212B] mb-1.5">PIN Code (6 digits) *</label>
                        <input required value={addressForm.pincode} onChange={e => setAddressForm({...addressForm, pincode: e.target.value})} className="w-full px-4 py-2.5 bg-[#F6F8FA] border border-[#D9E1E8] rounded-xl text-sm focus:bg-white focus:border-[#1769AA] outline-none" placeholder="641001" />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-4 pt-2">
                      <input type="checkbox" id="is_default" checked={addressForm.is_default} onChange={e => setAddressForm({...addressForm, is_default: e.target.checked})} className="rounded text-[#1769AA] focus:ring-[#1769AA]" />
                      <label htmlFor="is_default" className="text-sm text-[#17212B]">Set as default shipping address</label>
                    </div>
                    <div className="flex gap-3 pt-4 border-t border-[#F6F8FA]">
                      <button type="submit" className="bg-[#1769AA] text-white px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-[#0B3A63] transition-colors">
                        Save Address
                      </button>
                      <button type="button" onClick={() => setIsAddressFormOpen(false)} className="bg-[#F6F8FA] text-[#667085] px-6 py-2.5 rounded-lg text-sm font-medium hover:bg-[#D9E1E8] hover:text-[#17212B] transition-colors">
                        Cancel
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {addressesLoading ? (
                <div className="grid sm:grid-cols-2 gap-6">
                  {[...Array(2)].map((_, i) => (
                    <div key={i} className="animate-pulse bg-white rounded-2xl p-6 h-48 border border-[#D9E1E8]"></div>
                  ))}
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-6">
                  {addresses.map(addr => (
                    <div key={addr.id} className={`bg-white rounded-2xl p-6 relative transition-all shadow-sm ${addr.is_default ? 'border-2 border-[#1769AA]' : 'border border-[#D9E1E8] hover:border-[#1769AA]/50'}`}>
                      {addr.is_default && (
                        <span className="absolute top-4 right-4 text-xs bg-[#EFF6FF] text-[#1769AA] font-bold px-2.5 py-1 rounded-full tracking-wide">DEFAULT</span>
                      )}
                      <p className="font-bold text-[#17212B] text-lg mb-2 pr-20" style={{ fontFamily: "Outfit" }}>{addr.recipient_name}</p>
                      <div className="space-y-1">
                        <p className="text-sm text-[#667085] leading-relaxed">{addr.address_line1}{addr.address_line2 ? `, ${addr.address_line2}` : ''}</p>
                        <p className="text-sm text-[#667085] leading-relaxed">{addr.city}, {addr.state} - {addr.pincode}</p>
                        <p className="text-sm text-[#17212B] font-medium mt-2 pt-2 border-t border-[#F6F8FA]">📞 {addr.phone}</p>
                      </div>
                      <div className="flex items-center justify-between mt-5 pt-4 border-t border-[#F6F8FA]">
                        <div className="flex gap-4">
                          <button onClick={() => openEditAddress(addr)} className="text-sm font-medium text-[#1769AA] hover:text-[#0B3A63] transition-colors">Edit</button>
                          <button onClick={() => handleDeleteAddress(addr.id)} className="text-sm font-medium text-[#C0392B] hover:text-[#992D22] transition-colors">Delete</button>
                        </div>
                        {!addr.is_default && (
                          <button onClick={() => handleSetDefaultAddress(addr.id)} className="text-xs text-slate-500 hover:text-[#1769AA] underline">
                            Set as Default
                          </button>
                        )}
                      </div>
                    </div>
                  ))}

                  {!isAddressFormOpen && (
                    <button onClick={openAddAddress} className="bg-[#F6F8FA] border-2 border-dashed border-[#D9E1E8] rounded-2xl p-6 text-center hover:border-[#1769AA] hover:bg-[#EFF6FF] transition-colors group flex flex-col items-center justify-center min-h-[200px]">
                      <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm mb-3 group-hover:scale-110 transition-transform">
                        <span className="text-2xl text-[#1769AA] leading-none mb-1">+</span>
                      </div>
                      <span className="text-sm font-semibold text-[#667085] group-hover:text-[#1769AA]">Add New Address</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {tab === "profile" && (
            <div>
              <h2 className="text-2xl font-bold text-[#0B3A63] mb-6" style={{ fontFamily: "Outfit" }}>Profile Settings</h2>
              <div className="bg-white border border-[#D9E1E8] rounded-2xl p-8 shadow-sm">
                {profileSuccess && (
                  <div className="bg-emerald-50 text-emerald-700 p-3.5 rounded-xl text-sm border border-emerald-200 mb-6">
                    ✓ Profile updated successfully!
                  </div>
                )}
                {profileError && (
                  <div className="bg-red-50 text-red-600 p-3.5 rounded-xl text-sm border border-red-100 mb-6">
                    {profileError}
                  </div>
                )}

                <form onSubmit={handleSaveProfile}>
                  <div className="grid sm:grid-cols-2 gap-6">
                    <div>
                      <label className="text-sm font-medium text-[#17212B] mb-2 block">First Name</label>
                      <input
                        value={profileFirstName}
                        onChange={e => setProfileFirstName(e.target.value)}
                        className="w-full bg-[#F6F8FA] border border-[#D9E1E8] rounded-xl px-4 py-3 text-sm outline-none focus:bg-white focus:border-[#1769AA] focus:ring-4 focus:ring-[#1769AA]/10 transition-all"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-[#17212B] mb-2 block">Last Name</label>
                      <input
                        value={profileLastName}
                        onChange={e => setProfileLastName(e.target.value)}
                        className="w-full bg-[#F6F8FA] border border-[#D9E1E8] rounded-xl px-4 py-3 text-sm outline-none focus:bg-white focus:border-[#1769AA] focus:ring-4 focus:ring-[#1769AA]/10 transition-all"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-[#17212B] mb-2 block">Email Address (Read-only)</label>
                      <input
                        disabled
                        value={user?.email || ""}
                        className="w-full bg-gray-100 border border-[#D9E1E8] rounded-xl px-4 py-3 text-sm text-gray-500 cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-[#17212B] mb-2 block">Mobile Number</label>
                      <input
                        value={profilePhone}
                        onChange={e => setProfilePhone(e.target.value)}
                        className="w-full bg-[#F6F8FA] border border-[#D9E1E8] rounded-xl px-4 py-3 text-sm outline-none focus:bg-white focus:border-[#1769AA] focus:ring-4 focus:ring-[#1769AA]/10 transition-all"
                        placeholder="+91 98765 43210"
                      />
                    </div>
                  </div>
                  <div className="mt-8 pt-6 border-t border-[#F6F8FA] flex justify-end">
                    <button type="submit" className="bg-[#0B3A63] text-white px-8 py-3 rounded-xl text-sm font-semibold hover:bg-[#1769AA] transition-colors shadow-md shadow-[#1769AA]/20">
                      Save Changes
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
