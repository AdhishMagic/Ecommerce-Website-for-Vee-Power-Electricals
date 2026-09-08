import { Link } from "react-router-dom";
import { products, orders } from "../../data/products";

const statCards = [
  { label: "Total Products", value: products.length, suffix: "", icon: "📦", color: "bg-[#EFF6FF] text-[#1769AA]", change: "+12 this month" },
  { label: "Total Orders", value: orders.length, suffix: "", icon: "🛒", color: "bg-[#ECFDF5] text-[#12773D]", change: "+3 today" },
  { label: "Today's Sales", value: "₹18,450", suffix: "", icon: "💰", color: "bg-[#FFFBEB] text-[#B45309]", change: "+22% vs yesterday" },
  { label: "Low Stock Items", value: products.filter(p => p.stock > 0 && p.stock <= p.lowStockThreshold).length, suffix: "", icon: "⚠️", color: "bg-[#FEF2F2] text-[#C0392B]", change: "Needs attention" },
];

const statusColors: Record<string, string> = {
  Delivered: "bg-[#ECFDF5] text-[#12773D]",
  Shipped: "bg-[#EFF6FF] text-[#1769AA]",
  Processing: "bg-[#FFFBEB] text-[#B45309]",
  Pending: "bg-[#F3F4F6] text-[#667085]",
  Cancelled: "bg-[#FEF2F2] text-[#C0392B]",
};

export default function Dashboard() {
  const lowStockProducts = products.filter(p => p.stock <= p.lowStockThreshold);

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-xl font-bold text-[#0B3A63]">Dashboard</h1>
          <p className="text-sm text-[#667085]">Welcome back. Here's what's happening today.</p>
        </div>
        <Link to="/admin/products/add" className="bg-[#0B3A63] hover:bg-[#1769AA] text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors">
          + Add Product
        </Link>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {statCards.map(card => (
          <div key={card.label} className="bg-white border border-[#D9E1E8] rounded-xl p-5">
            <div className="flex justify-between items-start mb-3">
              <p className="text-xs font-medium text-[#667085] uppercase tracking-wider">{card.label}</p>
              <span className={`text-xl p-1.5 rounded-lg ${card.color}`}>{card.icon}</span>
            </div>
            <p className="text-2xl font-bold text-[#0B3A63] mb-1">{card.value}</p>
            <p className="text-xs text-[#667085]">{card.change}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-5">
        {/* Recent Orders */}
        <div className="bg-white border border-[#D9E1E8] rounded-xl overflow-hidden">
          <div className="flex justify-between items-center px-5 py-4 border-b border-[#D9E1E8]">
            <h2 className="font-bold text-[#0B3A63]">Recent Orders</h2>
            <Link to="/admin/orders" className="text-xs text-[#1769AA] hover:text-[#0B3A63]">View all →</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-[#F6F8FA]">
                <tr>
                  <th className="text-left text-xs font-semibold text-[#667085] px-5 py-3">Order ID</th>
                  <th className="text-left text-xs font-semibold text-[#667085] px-3 py-3">Customer</th>
                  <th className="text-left text-xs font-semibold text-[#667085] px-3 py-3">Amount</th>
                  <th className="text-left text-xs font-semibold text-[#667085] px-3 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#D9E1E8]">
                {orders.map(order => (
                  <tr key={order.id} className="hover:bg-[#F6F8FA] transition-colors">
                    <td className="px-5 py-3 text-xs font-mono text-[#1769AA] font-semibold">{order.id}</td>
                    <td className="px-3 py-3 text-sm text-[#17212B]">{order.customer.name}</td>
                    <td className="px-3 py-3 text-sm font-semibold text-[#0B3A63]">₹{order.total.toLocaleString("en-IN")}</td>
                    <td className="px-3 py-3">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${statusColors[order.status] || ""}`}>{order.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Low Stock */}
        <div className="bg-white border border-[#D9E1E8] rounded-xl overflow-hidden">
          <div className="flex justify-between items-center px-5 py-4 border-b border-[#D9E1E8]">
            <h2 className="font-bold text-[#0B3A63]">Low / Out of Stock</h2>
            <Link to="/admin/inventory" className="text-xs text-[#1769AA] hover:text-[#0B3A63]">Manage →</Link>
          </div>
          <div className="divide-y divide-[#D9E1E8]">
            {lowStockProducts.map(p => (
              <div key={p.id} className="flex items-center gap-3 px-5 py-3 hover:bg-[#F6F8FA] transition-colors">
                <img src={p.images[0]} alt={p.name} className="w-10 h-10 object-cover rounded-lg bg-[#F6F8FA]" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#17212B] truncate">{p.name}</p>
                  <p className="text-xs text-[#667085]">SKU: {p.sku}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  {p.stock === 0 ? (
                    <span className="text-xs font-semibold text-[#C0392B] bg-[#FEF2F2] px-2 py-0.5 rounded-full">Out of Stock</span>
                  ) : (
                    <span className="text-xs font-semibold text-[#B45309] bg-[#FFFBEB] px-2 py-0.5 rounded-full">{p.stock} left</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
