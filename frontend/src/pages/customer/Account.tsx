import { useState } from "react";
import { Link } from "react-router-dom";
import { orders } from "../../data/mock/products";
import { useAuth } from "../../context/AuthContext";

const statusColors: Record<string, string> = {
  Delivered: "bg-[#ECFDF5] text-[#12773D]",
  Shipped: "bg-[#EFF6FF] text-[#1769AA]",
  Processing: "bg-[#FFFBEB] text-[#B45309]",
  Pending: "bg-[#F3F4F6] text-[#667085]",
  Confirmed: "bg-[#EFF6FF] text-[#1769AA]",
  Packed: "bg-[#FFFBEB] text-[#B45309]",
  Cancelled: "bg-[#FEF2F2] text-[#C0392B]",
};

interface Address {
  id: string;
  name: string;
  line1: string;
  city: string;
  state: string;
  pincode: string;
  phone: string;
  isDefault: boolean;
}

export default function Account() {
  const [tab, setTab] = useState("orders");
  const [selectedOrder, setSelectedOrder] = useState<typeof orders[0] | null>(null);
  
  const { user, logout } = useAuth();

  // Address State
  const [addresses, setAddresses] = useState<Address[]>([
    {
      id: "1",
      name: "Rajesh Kumar",
      line1: "45, Nehru Street, RS Puram",
      city: "Coimbatore",
      state: "Tamil Nadu",
      pincode: "641002",
      phone: "9876543210",
      isDefault: true
    }
  ]);
  const [isAddressFormOpen, setIsAddressFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [addressForm, setAddressForm] = useState<Omit<Address, "id">>({
    name: "",
    line1: "",
    city: "",
    state: "",
    pincode: "",
    phone: "",
    isDefault: false
  });

  const openAddAddress = () => {
    setEditingId(null);
    setAddressForm({ name: "", line1: "", city: "", state: "", pincode: "", phone: "", isDefault: false });
    setIsAddressFormOpen(true);
  };

  const openEditAddress = (addr: Address) => {
    setEditingId(addr.id);
    setAddressForm({
      name: addr.name,
      line1: addr.line1,
      city: addr.city,
      state: addr.state,
      pincode: addr.pincode,
      phone: addr.phone,
      isDefault: addr.isDefault
    });
    setIsAddressFormOpen(true);
  };

  const handleDeleteAddress = (id: string) => {
    if (window.confirm("Are you sure you want to delete this address?")) {
      setAddresses(prev => prev.filter(a => a.id !== id));
    }
  };

  const saveAddress = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      setAddresses(prev => prev.map(a => a.id === editingId ? { ...addressForm, id: editingId } : a));
    } else {
      setAddresses(prev => [...prev, { ...addressForm, id: Date.now().toString() }]);
    }
    
    // If set to default, update others
    if (addressForm.isDefault) {
      setAddresses(prev => prev.map(a => 
        (editingId ? a.id === editingId : a.id === Date.now().toString()) 
          ? a 
          : { ...a, isDefault: false }
      ));
    }
    
    setIsAddressFormOpen(false);
  };

  if (selectedOrder) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6">
        <button onClick={() => setSelectedOrder(null)} className="flex items-center gap-2 text-sm text-[#667085] hover:text-[#1769AA] mb-4">
          ← Back to Orders
        </button>
        <div className="bg-white border border-[#D9E1E8] rounded-xl p-6">
          <div className="flex flex-wrap justify-between items-start gap-3 mb-6">
            <div>
              <h2 className="text-xl font-bold text-[#0B3A63]">Order #{selectedOrder.id}</h2>
              <p className="text-sm text-[#667085]">Placed on {new Date(selectedOrder.date).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}</p>
            </div>
            <span className={`text-sm font-semibold px-3 py-1 rounded-full ${statusColors[selectedOrder.status] || "bg-gray-100 text-gray-600"}`}>
              {selectedOrder.status}
            </span>
          </div>

          {/* Timeline */}
          <div className="mb-6">
            <h3 className="font-semibold text-[#0B3A63] mb-4">Order Timeline</h3>
            <div className="space-y-3">
              {selectedOrder.timeline.map((event, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${event.done ? "bg-[#12773D]" : event.time === "" && i === selectedOrder.timeline.filter(e => e.done).length ? "border-2 border-[#1769AA]" : "bg-[#D9E1E8]"}`}>
                    {event.done && <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>}
                  </div>
                  <div className={`flex-1 ${event.done ? "text-[#17212B]" : "text-[#667085]"}`}>
                    <p className="text-sm font-medium">{event.status}</p>
                    {event.time && <p className="text-xs text-[#667085]">{event.time}</p>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Items */}
          <div className="mb-5">
            <h3 className="font-semibold text-[#0B3A63] mb-3">Items Ordered</h3>
            <div className="space-y-3">
              {selectedOrder.items.map((item, i) => (
                <div key={i} className="flex gap-3 py-3 border-b border-[#D9E1E8] last:border-0">
                  <img src={item.product.images[0]} alt={item.product.name} className="w-14 h-14 object-cover rounded-lg bg-[#F6F8FA]" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-[#17212B]">{item.product.name}</p>
                    <p className="text-xs text-[#667085]">{item.product.brand} · Qty: {item.quantity}</p>
                  </div>
                  <p className="font-semibold text-[#0B3A63] text-sm">₹{(item.price * item.quantity).toLocaleString("en-IN")}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Delivery */}
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="bg-[#F6F8FA] rounded-xl p-4">
              <h4 className="font-semibold text-[#0B3A63] mb-2 text-sm">Delivery Address</h4>
              <p className="text-sm text-[#667085]">{selectedOrder.customer.name}</p>
              <p className="text-sm text-[#667085]">{selectedOrder.address.line1}</p>
              <p className="text-sm text-[#667085]">{selectedOrder.address.city}, {selectedOrder.address.state} - {selectedOrder.address.pincode}</p>
            </div>
            <div className="bg-[#F6F8FA] rounded-xl p-4">
              <h4 className="font-semibold text-[#0B3A63] mb-2 text-sm">Payment Info</h4>
              <p className="text-sm text-[#667085]">Method: {selectedOrder.paymentMethod}</p>
              <p className="text-sm text-[#667085]">Status: {selectedOrder.paymentStatus}</p>
              <p className="text-sm font-bold text-[#0B3A63] mt-1">Total: ₹{selectedOrder.total.toLocaleString("en-IN")}</p>
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
              <div className="space-y-4">
                {orders.map(order => (
                  <div key={order.id} className="bg-white border border-[#D9E1E8] rounded-2xl p-6 hover:shadow-md transition-shadow">
                    <div className="flex flex-wrap justify-between items-start gap-4 mb-4">
                      <div>
                        <p className="font-semibold text-[#17212B] text-base font-mono">#{order.id}</p>
                        <p className="text-sm text-[#667085] mt-1">{new Date(order.date).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}</p>
                      </div>
                      <span className={`text-xs font-semibold px-3 py-1.5 rounded-full ${statusColors[order.status] || ""}`}>{order.status}</span>
                    </div>
                    <div className="flex gap-3 mb-4 overflow-x-auto pb-2">
                      {order.items.map((item, i) => (
                        <div key={i} className="relative group">
                          <img src={item.product.images[0]} alt={item.product.name} className="w-16 h-16 object-cover rounded-xl bg-[#F6F8FA] flex-shrink-0 border border-[#D9E1E8]" />
                          <span className="absolute -top-2 -right-2 bg-[#0B3A63] text-white text-[10px] w-5 h-5 flex items-center justify-center rounded-full font-bold shadow-sm">
                            x{item.quantity}
                          </span>
                        </div>
                      ))}
                    </div>
                    <div className="flex justify-between items-center pt-4 border-t border-[#F6F8FA]">
                      <p className="text-base font-bold text-[#0B3A63]">₹{order.total.toLocaleString("en-IN")}</p>
                      <button
                        onClick={() => setSelectedOrder(order)}
                        className="text-sm bg-[#F6F8FA] hover:bg-[#1769AA] text-[#1769AA] hover:text-white px-4 py-2 rounded-lg font-medium transition-colors"
                      >
                        View Details
                      </button>
                    </div>
                  </div>
                ))}
              </div>
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

              {isAddressFormOpen ? (
                <div className="bg-white border border-[#D9E1E8] rounded-2xl p-6 shadow-sm mb-6 animate-in fade-in zoom-in-95 duration-200">
                  <h3 className="text-lg font-bold text-[#0B3A63] mb-4">{editingId ? 'Edit Address' : 'Add New Address'}</h3>
                  <form onSubmit={saveAddress} className="space-y-4">
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-[#17212B] mb-1.5">Full Name</label>
                        <input required value={addressForm.name} onChange={e => setAddressForm({...addressForm, name: e.target.value})} className="w-full px-4 py-2.5 bg-[#F6F8FA] border border-[#D9E1E8] rounded-xl text-sm focus:bg-white focus:border-[#1769AA] outline-none" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[#17212B] mb-1.5">Phone Number</label>
                        <input required value={addressForm.phone} onChange={e => setAddressForm({...addressForm, phone: e.target.value})} className="w-full px-4 py-2.5 bg-[#F6F8FA] border border-[#D9E1E8] rounded-xl text-sm focus:bg-white focus:border-[#1769AA] outline-none" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-[#17212B] mb-1.5">Address Line</label>
                      <input required value={addressForm.line1} onChange={e => setAddressForm({...addressForm, line1: e.target.value})} className="w-full px-4 py-2.5 bg-[#F6F8FA] border border-[#D9E1E8] rounded-xl text-sm focus:bg-white focus:border-[#1769AA] outline-none" />
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                      <div className="col-span-2 sm:col-span-1">
                        <label className="block text-sm font-medium text-[#17212B] mb-1.5">City</label>
                        <input required value={addressForm.city} onChange={e => setAddressForm({...addressForm, city: e.target.value})} className="w-full px-4 py-2.5 bg-[#F6F8FA] border border-[#D9E1E8] rounded-xl text-sm focus:bg-white focus:border-[#1769AA] outline-none" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[#17212B] mb-1.5">State</label>
                        <input required value={addressForm.state} onChange={e => setAddressForm({...addressForm, state: e.target.value})} className="w-full px-4 py-2.5 bg-[#F6F8FA] border border-[#D9E1E8] rounded-xl text-sm focus:bg-white focus:border-[#1769AA] outline-none" />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-[#17212B] mb-1.5">Pincode</label>
                        <input required value={addressForm.pincode} onChange={e => setAddressForm({...addressForm, pincode: e.target.value})} className="w-full px-4 py-2.5 bg-[#F6F8FA] border border-[#D9E1E8] rounded-xl text-sm focus:bg-white focus:border-[#1769AA] outline-none" />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-4 pt-2">
                      <input type="checkbox" id="isDefault" checked={addressForm.isDefault} onChange={e => setAddressForm({...addressForm, isDefault: e.target.checked})} className="rounded text-[#1769AA] focus:ring-[#1769AA]" />
                      <label htmlFor="isDefault" className="text-sm text-[#17212B]">Set as default address</label>
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
              ) : null}

              <div className="grid sm:grid-cols-2 gap-6">
                {addresses.map(addr => (
                  <div key={addr.id} className={`bg-white rounded-2xl p-6 relative transition-all ${addr.isDefault ? 'border-2 border-[#1769AA] shadow-sm' : 'border border-[#D9E1E8] hover:border-[#1769AA]/50'}`}>
                    {addr.isDefault && (
                      <span className="absolute top-4 right-4 text-xs bg-[#EFF6FF] text-[#1769AA] font-bold px-2.5 py-1 rounded-full tracking-wide">DEFAULT</span>
                    )}
                    <p className="font-bold text-[#17212B] text-lg mb-2 pr-20" style={{ fontFamily: "Outfit" }}>{addr.name}</p>
                    <div className="space-y-1">
                      <p className="text-sm text-[#667085] leading-relaxed">{addr.line1}</p>
                      <p className="text-sm text-[#667085] leading-relaxed">{addr.city}, {addr.state} - {addr.pincode}</p>
                      <p className="text-sm text-[#17212B] font-medium mt-2 pt-2 border-t border-[#F6F8FA]">📞 {addr.phone}</p>
                    </div>
                    <div className="flex gap-4 mt-5 pt-4 border-t border-[#F6F8FA]">
                      <button onClick={() => openEditAddress(addr)} className="text-sm font-medium text-[#1769AA] hover:text-[#0B3A63] transition-colors">Edit</button>
                      <button onClick={() => handleDeleteAddress(addr.id)} className="text-sm font-medium text-[#C0392B] hover:text-[#992D22] transition-colors">Delete</button>
                    </div>
                  </div>
                ))}
                
                {!isAddressFormOpen && (
                  <button onClick={openAddAddress} className="bg-[#F6F8FA] border-2 border-dashed border-[#D9E1E8] rounded-2xl p-6 text-center hover:border-[#1769AA] hover:bg-[#EFF6FF] transition-colors group flex flex-col items-center justify-center min-h-[220px]">
                    <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm mb-3 group-hover:scale-110 transition-transform">
                      <span className="text-2xl text-[#1769AA] leading-none mb-1">+</span>
                    </div>
                    <span className="text-sm font-semibold text-[#667085] group-hover:text-[#1769AA]">Add New Address</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {tab === "profile" && (
            <div>
              <h2 className="text-2xl font-bold text-[#0B3A63] mb-6" style={{ fontFamily: "Outfit" }}>Profile Settings</h2>
              <div className="bg-white border border-[#D9E1E8] rounded-2xl p-8 shadow-sm">
                <div className="grid sm:grid-cols-2 gap-6">
                  {[
                    { label: "First Name", value: user?.name?.split(" ")[0] || "Rajesh" },
                    { label: "Last Name", value: user?.name?.split(" ")[1] || "Kumar" },
                    { label: "Email Address", value: user?.email || "rajesh@email.com" },
                    { label: "Mobile Number", value: "+91 9876543210" },
                  ].map(f => (
                    <div key={f.label}>
                      <label className="text-sm font-medium text-[#17212B] mb-2 block">{f.label}</label>
                      <input defaultValue={f.value} className="w-full bg-[#F6F8FA] border border-[#D9E1E8] rounded-xl px-4 py-3 text-sm outline-none focus:bg-white focus:border-[#1769AA] focus:ring-4 focus:ring-[#1769AA]/10 transition-all" />
                    </div>
                  ))}
                </div>
                <div className="mt-8 pt-6 border-t border-[#F6F8FA] flex justify-end">
                  <button className="bg-[#0B3A63] text-white px-8 py-3 rounded-xl text-sm font-semibold hover:bg-[#1769AA] transition-colors shadow-md shadow-[#1769AA]/20">
                    Save Changes
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
