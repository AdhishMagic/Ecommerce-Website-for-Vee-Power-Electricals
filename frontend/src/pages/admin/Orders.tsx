import { useState } from "react";
import { orders as initialOrders } from "../../data/mock/products";

const statusColors: Record<string, string> = {
  Delivered: "bg-[#ECFDF5] text-[#12773D]",
  Shipped: "bg-[#EFF6FF] text-[#1769AA]",
  Processing: "bg-[#FFFBEB] text-[#B45309]",
  Pending: "bg-[#F3F4F6] text-[#667085]",
  Confirmed: "bg-[#EFF6FF] text-[#1769AA]",
  Packed: "bg-[#FFFBEB] text-[#B45309]",
  Cancelled: "bg-[#FEF2F2] text-[#C0392B]",
};

const statusFlow = ["Pending", "Confirmed", "Processing", "Packed", "Shipped", "Delivered"];

export default function AdminOrders() {
  const [orders, setOrders] = useState(initialOrders);
  const [selected, setSelected] = useState<typeof initialOrders[0] | null>(null);
  const [search, setSearch] = useState("");

  const filtered = orders.filter(o =>
    o.id.toLowerCase().includes(search.toLowerCase()) ||
    o.customer.name.toLowerCase().includes(search.toLowerCase())
  );

  const updateStatus = (orderId: string, newStatus: string) => {
    setOrders(prev => prev.map(o => o.id === orderId ? {...o, status: newStatus} : o));
    if (selected?.id === orderId) setSelected(prev => prev ? {...prev, status: newStatus} : null);
  };

  if (selected) {
    const order = orders.find(o => o.id === selected.id) || selected;
    return (
      <div>
        <button onClick={() => setSelected(null)} className="flex items-center gap-2 text-sm text-[#667085] hover:text-[#1769AA] mb-4">
          ← Back to Orders
        </button>
        <div className="grid lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-4">
            {/* Header */}
            <div className="bg-white border border-[#D9E1E8] rounded-xl p-5">
              <div className="flex flex-wrap justify-between items-start gap-3">
                <div>
                  <h2 className="text-xl font-bold text-[#0B3A63]">Order #{order.id}</h2>
                  <p className="text-sm text-[#667085]">{new Date(order.date).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })}</p>
                </div>
                <div className="flex flex-col gap-2">
                  <span className={`text-sm font-semibold px-3 py-1 rounded-full ${statusColors[order.status] || ""}`}>{order.status}</span>
                </div>
              </div>
            </div>

            {/* Update Status */}
            <div className="bg-white border border-[#D9E1E8] rounded-xl p-5">
              <h3 className="font-semibold text-[#0B3A63] mb-3">Update Order Status</h3>
              <div className="flex flex-wrap gap-2">
                {statusFlow.map(status => (
                  <button
                    key={status}
                    onClick={() => updateStatus(order.id, status)}
                    className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${order.status === status ? "bg-[#0B3A63] text-white border-[#0B3A63]" : "bg-white text-[#667085] border-[#D9E1E8] hover:border-[#1769AA]"}`}
                  >
                    {status}
                  </button>
                ))}
                <button onClick={() => updateStatus(order.id, "Cancelled")} className={`text-sm px-3 py-1.5 rounded-lg border transition-colors ${order.status === "Cancelled" ? "bg-[#C0392B] text-white border-[#C0392B]" : "bg-white text-[#C0392B] border-[#C0392B]/30 hover:bg-[#FEF2F2]"}`}>
                  Cancel Order
                </button>
              </div>
            </div>

            {/* Items */}
            <div className="bg-white border border-[#D9E1E8] rounded-xl p-5">
              <h3 className="font-semibold text-[#0B3A63] mb-4">Order Items</h3>
              <div className="space-y-3">
                {order.items.map((item, i) => (
                  <div key={i} className="flex gap-3 items-center py-2 border-b border-[#D9E1E8] last:border-0">
                    <img src={item.product.images[0]} alt={item.product.name} className="w-12 h-12 object-cover rounded-lg bg-[#F6F8FA]" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-[#17212B]">{item.product.name}</p>
                      <p className="text-xs text-[#667085] font-mono">{item.product.sku} · Qty: {item.quantity}</p>
                    </div>
                    <p className="font-bold text-[#0B3A63]">₹{(item.price * item.quantity).toLocaleString("en-IN")}</p>
                  </div>
                ))}
                <div className="flex justify-between pt-2 font-bold text-[#0B3A63]">
                  <span>Total</span><span>₹{order.total.toLocaleString("en-IN")}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Customer Info */}
          <div className="space-y-4">
            <div className="bg-white border border-[#D9E1E8] rounded-xl p-5">
              <h3 className="font-semibold text-[#0B3A63] mb-3">Customer</h3>
              <p className="text-sm font-medium text-[#17212B]">{order.customer.name}</p>
              <p className="text-sm text-[#667085]">{order.customer.email}</p>
              <p className="text-sm text-[#667085]">{order.customer.phone}</p>
            </div>
            <div className="bg-white border border-[#D9E1E8] rounded-xl p-5">
              <h3 className="font-semibold text-[#0B3A63] mb-3">Delivery Address</h3>
              <p className="text-sm text-[#667085]">{order.address.line1}</p>
              {order.address.line2 && <p className="text-sm text-[#667085]">{order.address.line2}</p>}
              <p className="text-sm text-[#667085]">{order.address.city}, {order.address.state}</p>
              <p className="text-sm text-[#667085]">PIN: {order.address.pincode}</p>
            </div>
            <div className="bg-white border border-[#D9E1E8] rounded-xl p-5">
              <h3 className="font-semibold text-[#0B3A63] mb-3">Payment</h3>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-[#667085]">Method</span><span className="font-medium">{order.paymentMethod}</span></div>
                <div className="flex justify-between"><span className="text-[#667085]">Status</span><span className={`font-semibold ${order.paymentStatus === "Paid" ? "text-[#12773D]" : "text-[#C0392B]"}`}>{order.paymentStatus}</span></div>
                <div className="flex justify-between"><span className="text-[#667085]">Amount</span><span className="font-bold text-[#0B3A63]">₹{order.total.toLocaleString("en-IN")}</span></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-xl font-bold text-[#0B3A63]">Orders</h1>
          <p className="text-sm text-[#667085]">{orders.length} total orders</p>
        </div>
      </div>

      <div className="bg-white border border-[#D9E1E8] rounded-xl p-4 mb-5">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by Order ID or customer name..." className="w-full sm:max-w-sm border border-[#D9E1E8] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#1769AA]" />
      </div>

      <div className="bg-white border border-[#D9E1E8] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[#F6F8FA] border-b border-[#D9E1E8]">
              <tr>
                <th className="text-left text-xs font-semibold text-[#667085] px-5 py-3 uppercase tracking-wider">Order ID</th>
                <th className="text-left text-xs font-semibold text-[#667085] px-3 py-3 uppercase tracking-wider">Customer</th>
                <th className="text-left text-xs font-semibold text-[#667085] px-3 py-3 uppercase tracking-wider">Date</th>
                <th className="text-left text-xs font-semibold text-[#667085] px-3 py-3 uppercase tracking-wider">Amount</th>
                <th className="text-left text-xs font-semibold text-[#667085] px-3 py-3 uppercase tracking-wider">Payment</th>
                <th className="text-left text-xs font-semibold text-[#667085] px-3 py-3 uppercase tracking-wider">Status</th>
                <th className="text-left text-xs font-semibold text-[#667085] px-3 py-3 uppercase tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D9E1E8]">
              {filtered.map(order => (
                <tr key={order.id} className="hover:bg-[#F6F8FA] transition-colors">
                  <td className="px-5 py-3 text-xs font-mono text-[#1769AA] font-semibold">{order.id}</td>
                  <td className="px-3 py-3">
                    <p className="text-sm font-medium text-[#17212B]">{order.customer.name}</p>
                    <p className="text-xs text-[#667085]">{order.customer.phone}</p>
                  </td>
                  <td className="px-3 py-3 text-sm text-[#667085]">{new Date(order.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</td>
                  <td className="px-3 py-3 text-sm font-bold text-[#0B3A63]">₹{order.total.toLocaleString("en-IN")}</td>
                  <td className="px-3 py-3">
                    <span className={`text-xs font-semibold ${order.paymentStatus === "Paid" ? "text-[#12773D]" : "text-[#C0392B]"}`}>{order.paymentStatus}</span>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${statusColors[order.status] || ""}`}>{order.status}</span>
                  </td>
                  <td className="px-3 py-3">
                    <button onClick={() => setSelected(order)} className="text-xs text-[#1769AA] hover:text-[#0B3A63] border border-[#D9E1E8] hover:border-[#1769AA] px-3 py-1 rounded-lg transition-colors">
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
