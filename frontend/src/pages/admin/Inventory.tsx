import { useState } from "react";
import { products as initialProducts } from "../../data/mock/products";

export default function AdminInventory() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [adjusting, setAdjusting] = useState<string | null>(null);
  const [adjustment, setAdjustment] = useState({ amount: "", reason: "Restock" });
  const [stocks, setStocks] = useState<Record<string, number>>(
    Object.fromEntries(initialProducts.map(p => [p.id, p.stock]))
  );

  const filtered = initialProducts.filter(p => {
    const stock = stocks[p.id];
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase());
    if (filter === "out") return stock === 0 && matchSearch;
    if (filter === "low") return stock > 0 && stock <= p.lowStockThreshold && matchSearch;
    if (filter === "in") return stock > p.lowStockThreshold && matchSearch;
    return matchSearch;
  });

  const handleAdjust = (productId: string) => {
    const amount = parseInt(adjustment.amount);
    if (isNaN(amount)) return;
    setStocks(s => ({ ...s, [productId]: Math.max(0, (s[productId] || 0) + amount) }));
    setAdjusting(null);
    setAdjustment({ amount: "", reason: "Restock" });
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-xl font-bold text-[#0B3A63]">Inventory Management</h1>
          <p className="text-sm text-[#667085]">Monitor and update product stock levels</p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        {[
          { label: "In Stock", count: initialProducts.filter(p => stocks[p.id] > p.lowStockThreshold).length, color: "bg-[#ECFDF5] text-[#12773D]", icon: "✅" },
          { label: "Low Stock", count: initialProducts.filter(p => stocks[p.id] > 0 && stocks[p.id] <= p.lowStockThreshold).length, color: "bg-[#FFFBEB] text-[#B45309]", icon: "⚠️" },
          { label: "Out of Stock", count: initialProducts.filter(p => stocks[p.id] === 0).length, color: "bg-[#FEF2F2] text-[#C0392B]", icon: "❌" },
        ].map(s => (
          <button key={s.label} onClick={() => setFilter(s.label === "In Stock" ? "in" : s.label === "Low Stock" ? "low" : "out")} className={`bg-white border border-[#D9E1E8] rounded-xl p-4 text-center hover:border-[#1769AA] transition-colors`}>
            <p className="text-2xl font-bold text-[#0B3A63]">{s.count}</p>
            <p className="text-sm text-[#667085] mt-0.5">{s.label}</p>
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white border border-[#D9E1E8] rounded-xl p-4 mb-5 flex flex-wrap gap-3">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search product or SKU..." className="flex-1 min-w-[200px] border border-[#D9E1E8] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#1769AA]" />
        <div className="flex gap-2">
          {[["all", "All"], ["in", "In Stock"], ["low", "Low Stock"], ["out", "Out of Stock"]].map(([val, label]) => (
            <button key={val} onClick={() => setFilter(val)} className={`text-sm px-3 py-2 rounded-lg border transition-colors ${filter === val ? "bg-[#0B3A63] text-white border-[#0B3A63]" : "bg-white text-[#667085] border-[#D9E1E8] hover:border-[#1769AA]"}`}>{label}</button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white border border-[#D9E1E8] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[#F6F8FA] border-b border-[#D9E1E8]">
              <tr>
                <th className="text-left text-xs font-semibold text-[#667085] px-5 py-3 uppercase tracking-wider">Product</th>
                <th className="text-left text-xs font-semibold text-[#667085] px-3 py-3 uppercase tracking-wider">SKU</th>
                <th className="text-center text-xs font-semibold text-[#667085] px-3 py-3 uppercase tracking-wider">Current Stock</th>
                <th className="text-center text-xs font-semibold text-[#667085] px-3 py-3 uppercase tracking-wider">Threshold</th>
                <th className="text-left text-xs font-semibold text-[#667085] px-3 py-3 uppercase tracking-wider">Status</th>
                <th className="text-left text-xs font-semibold text-[#667085] px-3 py-3 uppercase tracking-wider">Adjust</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D9E1E8]">
              {filtered.map(p => {
                const stock = stocks[p.id];
                const statusLabel = stock === 0 ? "Out of Stock" : stock <= p.lowStockThreshold ? "Low Stock" : "In Stock";
                const statusColor = stock === 0 ? "bg-[#FEF2F2] text-[#C0392B]" : stock <= p.lowStockThreshold ? "bg-[#FFFBEB] text-[#B45309]" : "bg-[#ECFDF5] text-[#12773D]";

                return (
                  <tr key={p.id} className="hover:bg-[#F6F8FA] transition-colors">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <img src={p.images[0]} alt={p.name} className="w-9 h-9 object-cover rounded-lg bg-[#F6F8FA]" />
                        <p className="text-sm font-medium text-[#17212B] line-clamp-1 max-w-[180px]">{p.name}</p>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs font-mono text-[#667085]">{p.sku}</td>
                    <td className="px-3 py-3 text-center">
                      <span className="text-lg font-bold text-[#0B3A63]">{stock}</span>
                    </td>
                    <td className="px-3 py-3 text-center text-sm text-[#667085]">{p.lowStockThreshold}</td>
                    <td className="px-3 py-3">
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full ${statusColor}`}>{statusLabel}</span>
                    </td>
                    <td className="px-3 py-3">
                      {adjusting === p.id ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            value={adjustment.amount}
                            onChange={e => setAdjustment(a => ({...a, amount: e.target.value}))}
                            className="w-16 border border-[#D9E1E8] rounded px-2 py-1 text-xs outline-none focus:border-[#1769AA] text-center"
                            placeholder="+/-"
                          />
                          <select value={adjustment.reason} onChange={e => setAdjustment(a => ({...a, reason: e.target.value}))} className="border border-[#D9E1E8] rounded px-1 py-1 text-xs outline-none bg-white">
                            <option>Restock</option>
                            <option>Order</option>
                            <option>Damaged</option>
                            <option>Manual</option>
                          </select>
                          <button onClick={() => handleAdjust(p.id)} className="bg-[#12773D] text-white text-xs px-2 py-1 rounded">✓</button>
                          <button onClick={() => setAdjusting(null)} className="text-[#667085] text-xs px-2 py-1 rounded hover:bg-[#F6F8FA]">✕</button>
                        </div>
                      ) : (
                        <button onClick={() => setAdjusting(p.id)} className="text-xs text-[#1769AA] hover:text-[#0B3A63] border border-[#D9E1E8] hover:border-[#1769AA] px-3 py-1 rounded-lg transition-colors">
                          Adjust Stock
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
