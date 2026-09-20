import { useState } from "react";
import { Search, PackageCheck, AlertTriangle, AlertOctagon, Plus, Minus, X } from "lucide-react";
import { useShop, calculateStockStatus, Product } from "../../context/ShopContext";

export default function AdminInventory() {
  const { products: inventory, updateStock } = useShop();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All"); // All, In Stock, Low Stock, Out of Stock

  // Modal State
  const [adjustingItem, setAdjustingItem] = useState<Product | null>(null);
  const [adjustAmount, setAdjustAmount] = useState<number>(0);

  // Derived Metrics
  const inStockCount = inventory.filter(item => calculateStockStatus(item.stock, item.lowStockThreshold) === "IN STOCK").length;
  const lowStockCount = inventory.filter(item => calculateStockStatus(item.stock, item.lowStockThreshold) === "LOW STOCK").length;
  const outOfStockCount = inventory.filter(item => calculateStockStatus(item.stock, item.lowStockThreshold) === "OUT OF STOCK").length;

  // Derived Filtered List
  const filteredInventory = inventory.filter(item => {
    const matchSearch = item.name.toLowerCase().includes(search.toLowerCase()) || 
                        item.sku.toLowerCase().includes(search.toLowerCase());
    
    let matchFilter = true;
    const status = calculateStockStatus(item.stock, item.lowStockThreshold);
    if (filter === "In Stock") matchFilter = status === "IN STOCK";
    if (filter === "Low Stock") matchFilter = status === "LOW STOCK";
    if (filter === "Out of Stock") matchFilter = status === "OUT OF STOCK";

    return matchSearch && matchFilter;
  });

  // Modal Handlers
  const handleOpenAdjust = (item: Product) => {
    setAdjustingItem(item);
    setAdjustAmount(item.stock);
  };

  const handleCloseAdjust = () => {
    setAdjustingItem(null);
    setAdjustAmount(0);
  };

  const handleSaveStock = () => {
    if (adjustingItem && adjustAmount >= 0) {
      updateStock(adjustingItem.id, adjustAmount);
      handleCloseAdjust();
    }
  };

  return (
    <div className="space-y-6">
      {/* 2. Top Header & Overview Cards */}
      <div>
        <h1 className="text-2xl font-bold text-[#0A2540]">Inventory Management</h1>
        <p className="text-sm text-slate-500 mt-1">Monitor and update product stock levels</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { title: "In Stock", value: inStockCount, icon: <PackageCheck className="w-6 h-6 text-emerald-600" />, bg: "bg-emerald-100" },
          { title: "Low Stock", value: lowStockCount, icon: <AlertTriangle className="w-6 h-6 text-amber-600" />, bg: "bg-amber-100" },
          { title: "Out of Stock", value: outOfStockCount, icon: <AlertOctagon className="w-6 h-6 text-red-600" />, bg: "bg-red-100" },
        ].map((kpi, idx) => (
          <div key={idx} className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-500 mb-1">{kpi.title}</p>
              <p className="text-2xl font-bold text-[#0A2540]">{kpi.value}</p>
            </div>
            <div className={`w-14 h-14 rounded-full flex items-center justify-center ${kpi.bg}`}>
              {kpi.icon}
            </div>
          </div>
        ))}
      </div>

      {/* 3. Search & Filter Bar */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="relative flex-1 w-full max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search by product name or SKU..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#0A2540] text-sm"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {["All", "In Stock", "Low Stock", "Out of Stock"].map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${
                filter === f 
                  ? "bg-[#0A2540] text-white" 
                  : "bg-slate-100 text-slate-600 hover:bg-slate-200"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* 4. Inventory Data Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-slate-50/80">
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Product</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">SKU</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Current Stock</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Threshold</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">Status</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">Adjust</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredInventory.map(item => {
                const statusLabel = calculateStockStatus(item.stock, item.lowStockThreshold);
                let statusBadge = "";
                if (statusLabel === "OUT OF STOCK") statusBadge = "bg-red-100 text-red-700";
                else if (statusLabel === "LOW STOCK") statusBadge = "bg-amber-100 text-amber-700";
                else statusBadge = "bg-emerald-100 text-emerald-700";

                return (
                  <tr key={item.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-3">
                        <img src={item.image || "https://placehold.co/100x100/F1F5F9/0A2540?text=Product"} alt={item.name} className="w-10 h-10 rounded-lg object-cover bg-slate-100 border border-slate-200 flex-shrink-0" />
                        <p className="text-sm font-bold text-[#0A2540] line-clamp-1 max-w-xs">{item.name}</p>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm font-mono text-slate-600">{item.sku}</td>
                    <td className="px-5 py-4 text-sm font-black text-[#0A2540] text-right text-lg">{item.stock}</td>
                    <td className="px-5 py-4 text-sm font-medium text-slate-500 text-right">{item.lowStockThreshold || 10}</td>
                    <td className="px-5 py-4 text-center">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${statusBadge}`}>
                        {statusLabel}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <button 
                        onClick={() => handleOpenAdjust(item)}
                        className="px-3 py-1.5 border border-[#0A2540] text-[#0A2540] hover:bg-[#0A2540] hover:text-white rounded-md text-xs font-bold transition-colors shadow-sm"
                      >
                        Adjust Stock
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredInventory.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-5 py-12 text-center text-slate-500">
                    No products found matching your search or filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. Interactive Stock Adjustment Modal */}
      {adjustingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0A2540]/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden flex flex-col">
            <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-[#0A2540]">Adjust Stock</h3>
              <button onClick={handleCloseAdjust} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 flex flex-col items-center">
              <div className="flex items-center gap-3 w-full mb-6 p-3 bg-slate-50 rounded-lg border border-slate-100">
                <img src={adjustingItem.image || "https://placehold.co/100x100/F1F5F9/0A2540?text=Product"} alt={adjustingItem.name} className="w-12 h-12 rounded bg-white border border-slate-200 object-cover flex-shrink-0" />
                <div className="overflow-hidden">
                  <p className="text-sm font-bold text-[#0A2540] truncate">{adjustingItem.name}</p>
                  <p className="text-xs text-slate-500 font-mono mt-0.5">{adjustingItem.sku}</p>
                </div>
              </div>
              
              <label className="block text-sm font-semibold text-slate-700 mb-4 text-center w-full">Current Quantity</label>
              
              <div className="flex items-center justify-center gap-4 mb-4">
                <button 
                  onClick={() => setAdjustAmount(Math.max(0, adjustAmount - 1))}
                  className="w-10 h-10 rounded-full flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                >
                  <Minus className="w-5 h-5" />
                </button>
                <input 
                  type="number" 
                  value={adjustAmount === 0 ? "" : adjustAmount}
                  onChange={(e) => setAdjustAmount(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-24 text-center text-2xl font-black text-[#0A2540] border-b-2 border-slate-200 focus:border-[#0A2540] outline-none py-1"
                />
                <button 
                  onClick={() => setAdjustAmount(adjustAmount + 1)}
                  className="w-10 h-10 rounded-full flex items-center justify-center bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                >
                  <Plus className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-5 border-t border-slate-200 flex gap-3 justify-end bg-slate-50">
              <button 
                onClick={handleCloseAdjust}
                className="flex-1 px-4 py-2 border border-slate-200 bg-white text-slate-600 text-sm font-semibold rounded-lg hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveStock}
                className="flex-1 px-4 py-2 bg-[#F2A900] text-[#0A2540] text-sm font-bold rounded-lg hover:bg-[#e09b00] transition-colors shadow-sm"
              >
                Update Stock
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
