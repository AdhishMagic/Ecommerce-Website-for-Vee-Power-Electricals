import { useState } from "react";
import { Link } from "react-router-dom";
import { orders } from "../data/products";

const statusColors: Record<string, string> = {
  Delivered: "bg-[#ECFDF5] text-[#12773D]",
  Shipped: "bg-[#EFF6FF] text-[#1769AA]",
  Processing: "bg-[#FFFBEB] text-[#B45309]",
  Pending: "bg-[#F3F4F6] text-[#667085]",
  Confirmed: "bg-[#EFF6FF] text-[#1769AA]",
  Packed: "bg-[#FFFBEB] text-[#B45309]",
  Cancelled: "bg-[#FEF2F2] text-[#C0392B]",
};

export default function Account() {
  const [tab, setTab] = useState("orders");
  const [selectedOrder, setSelectedOrder] = useState<typeof orders[0] | null>(null);

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
    <div className="max-w-5xl mx-auto px-4 py-6">
      <div className="grid lg:grid-cols-4 gap-6">
        {/* Sidebar */}
        <div className="lg:col-span-1">
          <div className="bg-white border border-[#D9E1E8] rounded-xl overflow-hidden">
            <div className="bg-[#0B3A63] p-5 text-center">
              <div className="w-16 h-16 bg-[#F2A900] rounded-full flex items-center justify-center mx-auto mb-2">
                <span className="text-[#0B3A63] font-bold text-2xl">R</span>
              </div>
              <p className="font-semibold text-white text-sm">Rajesh Kumar</p>
              <p className="text-white/60 text-xs">rajesh@email.com</p>
            </div>
            <div className="p-3">
              {[
                { id: "orders", label: "My Orders", icon: "📦" },
                { id: "addresses", label: "Addresses", icon: "📍" },
                { id: "profile", label: "Profile Settings", icon: "👤" },
              ].map(item => (
                <button
                  key={item.id}
                  onClick={() => setTab(item.id)}
                  className={`w-full flex items-center gap-2.5 px-4 py-2.5 text-sm rounded-lg transition-colors text-left ${tab === item.id ? "bg-[#EFF6FF] text-[#1769AA] font-medium" : "text-[#667085] hover:text-[#17212B] hover:bg-[#F6F8FA]"}`}
                >
                  <span>{item.icon}</span>
                  {item.label}
                </button>
              ))}
              <button className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-[#C0392B] hover:bg-[#FEF2F2] rounded-lg transition-colors">
                <span>🚪</span> Logout
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="lg:col-span-3">
          {tab === "orders" && (
            <div>
              <h2 className="text-xl font-bold text-[#0B3A63] mb-4">My Orders</h2>
              <div className="space-y-3">
                {orders.map(order => (
                  <div key={order.id} className="bg-white border border-[#D9E1E8] rounded-xl p-5 hover:border-[#1769AA]/30 transition-colors">
                    <div className="flex flex-wrap justify-between items-start gap-3 mb-3">
                      <div>
                        <p className="font-semibold text-[#17212B] text-sm font-mono">#{order.id}</p>
                        <p className="text-xs text-[#667085]">{new Date(order.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</p>
                      </div>
                      <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${statusColors[order.status] || ""}`}>{order.status}</span>
                    </div>
                    <div className="flex gap-2 mb-3 overflow-x-auto">
                      {order.items.map((item, i) => (
                        <img key={i} src={item.product.images[0]} alt={item.product.name} className="w-12 h-12 object-cover rounded-lg bg-[#F6F8FA] flex-shrink-0" />
                      ))}
                    </div>
                    <div className="flex justify-between items-center">
                      <p className="text-sm font-bold text-[#0B3A63]">₹{order.total.toLocaleString("en-IN")}</p>
                      <button
                        onClick={() => setSelectedOrder(order)}
                        className="text-sm text-[#1769AA] hover:text-[#0B3A63] font-medium"
                      >
                        View Details →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {tab === "addresses" && (
            <div>
              <h2 className="text-xl font-bold text-[#0B3A63] mb-4">Saved Addresses</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="bg-white border-2 border-[#1769AA] rounded-xl p-5 relative">
                  <span className="absolute top-3 right-3 text-xs bg-[#EFF6FF] text-[#1769AA] font-semibold px-2 py-0.5 rounded">Default</span>
                  <p className="font-semibold text-[#17212B] mb-1">Home</p>
                  <p className="text-sm text-[#667085]">Rajesh Kumar</p>
                  <p className="text-sm text-[#667085]">45, Nehru Street, RS Puram</p>
                  <p className="text-sm text-[#667085]">Coimbatore, Tamil Nadu - 641002</p>
                  <p className="text-sm text-[#667085]">📞 9876543210</p>
                  <div className="flex gap-2 mt-3">
                    <button className="text-xs text-[#1769AA] underline">Edit</button>
                    <button className="text-xs text-[#C0392B] underline">Delete</button>
                  </div>
                </div>
                <button className="bg-[#F6F8FA] border-2 border-dashed border-[#D9E1E8] rounded-xl p-5 text-center hover:border-[#1769AA] hover:bg-[#EFF6FF] transition-colors group">
                  <span className="text-3xl mb-2 block">+</span>
                  <span className="text-sm text-[#667085] group-hover:text-[#1769AA]">Add New Address</span>
                </button>
              </div>
            </div>
          )}

          {tab === "profile" && (
            <div>
              <h2 className="text-xl font-bold text-[#0B3A63] mb-4">Profile Settings</h2>
              <div className="bg-white border border-[#D9E1E8] rounded-xl p-6">
                <div className="grid sm:grid-cols-2 gap-4">
                  {[
                    { label: "First Name", value: "Rajesh" },
                    { label: "Last Name", value: "Kumar" },
                    { label: "Email", value: "rajesh@email.com" },
                    { label: "Mobile", value: "+91 9876543210" },
                  ].map(f => (
                    <div key={f.label}>
                      <label className="text-sm font-medium text-[#17212B] mb-1.5 block">{f.label}</label>
                      <input defaultValue={f.value} className="w-full border border-[#D9E1E8] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1769AA]" />
                    </div>
                  ))}
                </div>
                <button className="mt-5 bg-[#0B3A63] text-white px-6 py-2.5 rounded-lg text-sm font-semibold hover:bg-[#1769AA] transition-colors">
                  Save Changes
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
