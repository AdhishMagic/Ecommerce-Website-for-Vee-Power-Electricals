import { useState, useEffect, useCallback, useMemo } from "react";
import { 
  AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, 
  Tooltip as RechartsTooltip, ResponsiveContainer, Legend
} from "recharts";
import { Package, TrendingUp, IndianRupee, AlertTriangle, RefreshCw } from "lucide-react";
import { catalogApi, financeApi, ordersApi } from "../../api";
import type { ProductSummary, FinanceSummary } from "../../types/api";
import { resolveProductImage, handleProductImageError } from "../../utils/productImageResolver";

const COLORS = ['#0A2540', '#F2A900', '#1E4B7A', '#3A7CA5', '#81C3D7', '#E09B00'];

export default function ProductsAnalytics() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"revenue" | "units">("revenue");
  const [filterPeriod, setFilterPeriod] = useState<"current_month" | "previous_month" | "today" | "custom">("current_month");

  const [financeData, setFinanceData] = useState<FinanceSummary | null>(null);
  const [products, setProducts] = useState<ProductSummary[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  // Authoritative database-wide product count from the pagination envelope.
  const [catalogTotalCount, setCatalogTotalCount] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [finRes, prodRes, ordersRes] = await Promise.allSettled([
        financeApi.getFinanceSummary({ filter_type: filterPeriod }),
        catalogApi.getProducts({ page_size: 100 }),
        ordersApi.getAdminOrders({ page_size: 100 }),
      ]);

      if (finRes.status === "fulfilled") {
        setFinanceData(finRes.value);
      }
      if (prodRes.status === "fulfilled") {
        setProducts(prodRes.value.results || []);
        setCatalogTotalCount(typeof prodRes.value.count === "number" ? prodRes.value.count : null);
      }
      if (ordersRes.status === "fulfilled") {
        setOrders(ordersRes.value.results || []);
      }

      if (finRes.status === "rejected" && prodRes.status === "rejected") {
        throw new Error("Failed to load analytics data from server.");
      }
    } catch (err: any) {
      console.error("ProductsAnalytics load error:", err);
      setError(err?.message || "Failed to load live analytics data.");
    } finally {
      setLoading(false);
    }
  }, [filterPeriod]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Authoritative calculations from real backend data.
  // `total_orders_count` is the complete database count returned by the finance
  // summary API — never the length of the page of orders loaded for the table.
  const totalRevenue = financeData?.kpis?.total_paid ?? 0;
  const totalInvoiced = financeData?.kpis?.total_invoiced ?? 0;
  const totalOrders = (financeData as any)?.total_orders_count ?? null;
  const avgOrderValue = totalOrders ? Math.round(totalRevenue / totalOrders) : null;

  // Monthly trend from backend finance summary
  const revenueTrend = useMemo(() => {
    if (financeData?.monthly_trend && financeData.monthly_trend.length > 0) {
      return financeData.monthly_trend.map((t: { month: string; revenue: number; expenses: number; net: number }) => ({
        name: t.month,
        revenue: t.revenue,
        expenses: t.expenses,
        net: t.net,
      }));
    }
    return [];
  }, [financeData]);

  // Low stock products directly from authoritative catalog
  const lowStockAlerts = useMemo(() => {
    return products
      .filter(p => (p.stock ?? 0) <= 5)
      .slice(0, 10);
  }, [products]);

  // Product categories breakdown from live products
  const categoryBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    products.forEach(p => {
      const cat = p.category_name || (typeof p.category === 'object' && p.category !== null ? p.category.name : "General");
      counts[cat] = (counts[cat] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [products]);

  // Top products from live catalog with price / inventory metrics
  const productMetrics = useMemo(() => {
    return products.map(p => {
      let units = 0;
      let rev = 0;
      orders.forEach(o => {
        (o.items || []).forEach((item: any) => {
          if (item.product === p.id || item.product_id === p.id || item.product_name === p.name) {
            const qty = item.quantity || 1;
            units += qty;
            rev += qty * (parseFloat(String(item.unit_price || p.price)) || 0);
          }
        });
      });
      return {
        id: p.id,
        name: p.name,
        brand: p.brand_name || (typeof p.brand === 'object' && p.brand !== null ? p.brand.name : "Standard"),
        category: p.category_name || (typeof p.category === 'object' && p.category !== null ? p.category.name : "General"),
        units: units,
        revenue: rev > 0 ? rev : parseFloat(String(p.price || "0")) * (p.stock || 0),
        stock: p.stock ?? 0,
        img: resolveProductImage({ image: p.primary_image, category: p.category }),
      };
    });
  }, [products, orders]);

  const sortedProducts = useMemo(() => {
    return [...productMetrics].sort((a, b) => b[sortBy] - a[sortBy]);
  }, [productMetrics, sortBy]);

  const slowMovers = useMemo(() => {
    return productMetrics.filter(p => p.units === 0).slice(0, 5);
  }, [productMetrics]);

  return (
    <div className="space-y-6">
      {/* 1. Header Filter Bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-[#0A2540]">Products Analytics</h1>
          <p className="text-sm text-slate-500 mt-1">Live product performance, authoritative inventory levels, and revenue trends.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <select 
            value={filterPeriod} 
            onChange={(e) => setFilterPeriod(e.target.value as any)}
            className="border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 text-sm text-slate-600 outline-none focus:border-[#0A2540]"
          >
            <option value="current_month">Current Month</option>
            <option value="previous_month">Previous Month</option>
            <option value="today">Today</option>
          </select>
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 text-sm bg-slate-100 hover:bg-slate-200 text-[#0A2540] rounded-lg font-medium transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg text-sm flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-500" />
            <span>{error}</span>
          </div>
          <button onClick={loadData} className="underline text-red-800 font-semibold text-xs">Retry</button>
        </div>
      )}

      {loading ? (
        <div className="p-12 text-center text-slate-500 bg-white rounded-xl border border-slate-200">
          <RefreshCw className="w-8 h-8 mx-auto animate-spin text-[#0A2540] mb-3" />
          <p className="text-sm font-medium">Loading live analytics from backend...</p>
        </div>
      ) : (
        <>
          {/* 2. KPI Summary Row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-500 mb-1">Total Paid Revenue</p>
                <p className="text-3xl font-bold text-[#0A2540]">₹{totalRevenue.toLocaleString("en-IN")}</p>
                <p className="text-xs text-slate-400 mt-1">Invoiced: ₹{totalInvoiced.toLocaleString("en-IN")}</p>
              </div>
              <div className="w-14 h-14 rounded-full flex items-center justify-center bg-[#0A2540]/10">
                <IndianRupee className="w-6 h-6 text-[#0A2540]" />
              </div>
            </div>

            <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-500 mb-1">Total Orders</p>
                <p className="text-3xl font-bold text-[#0A2540]" data-testid="analytics-total-orders">{totalOrders === null ? "—" : totalOrders.toLocaleString("en-IN")}</p>
                <p className="text-xs text-slate-400 mt-1">Products: {catalogTotalCount === null ? products.length : catalogTotalCount.toLocaleString("en-IN")}</p>
              </div>
              <div className="w-14 h-14 rounded-full flex items-center justify-center bg-[#F2A900]/20">
                <Package className="w-6 h-6 text-[#F2A900]" />
              </div>
            </div>

            <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-500 mb-1">Avg Order Value</p>
                <p className="text-3xl font-bold text-[#0A2540]">{avgOrderValue === null ? "—" : `₹${avgOrderValue.toLocaleString("en-IN")}`}</p>
                <p className="text-xs text-slate-400 mt-1">Period revenue ÷ orders on record</p>
              </div>
              <div className="w-14 h-14 rounded-full flex items-center justify-center bg-[#0A2540]/10">
                <TrendingUp className="w-6 h-6 text-[#0A2540]" />
              </div>
            </div>
          </div>

          {/* 3. Main Trend Chart */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-lg font-bold text-[#0A2540] mb-6">Revenue Over Time (Live Finance API)</h2>
            <div className="h-80 w-full">
              {revenueTrend.length === 0 ? (
                <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                  No monthly trend records reported by backend for current filter.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={revenueTrend}>
                    <defs>
                      <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0A2540" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#0A2540" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} dy={10} />
                    <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} tickFormatter={(val) => `₹${val/1000}k`} />
                    <RechartsTooltip 
                      formatter={(val: any) => `₹${Number(val || 0).toLocaleString("en-IN")}`}
                      contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                    <Legend verticalAlign="top" height={36} />
                    <Area yAxisId="left" type="monotone" name="Revenue (₹)" dataKey="revenue" stroke="#0A2540" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
                    <Area yAxisId="left" type="monotone" name="Expenses (₹)" dataKey="expenses" stroke="#ef4444" strokeWidth={2} fillOpacity={0} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* 4. Analytics Chart Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
              <h2 className="text-base font-bold text-[#0A2540] mb-4">Catalog by Category</h2>
              <div className="h-64 w-full">
                {categoryBreakdown.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-slate-400 text-sm">No catalog categories found</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={categoryBreakdown} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                        {categoryBreakdown.map((_, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                      </Pie>
                      <RechartsTooltip formatter={(value: any) => `${value} products`} />
                      <Legend layout="vertical" verticalAlign="middle" align="right" />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col">
              <h2 className="text-base font-bold text-[#0A2540] mb-4">Authoritative Low Stock Alerts</h2>
              <div className="flex-1 overflow-y-auto space-y-3">
                {lowStockAlerts.length === 0 ? (
                  <p className="text-sm text-emerald-600 font-medium p-4 text-center">✓ All inventory items are above low-stock threshold.</p>
                ) : (
                  lowStockAlerts.map(item => (
                    <div key={item.id} className="flex justify-between items-center p-3 rounded-lg border border-red-100 bg-red-50/50">
                      <div>
                        <span className="text-sm font-semibold text-[#0A2540] block">{item.name}</span>
                        <span className="text-xs text-slate-400">SKU: {item.sku}</span>
                      </div>
                      <span className={`px-2.5 py-1 rounded-md text-xs font-bold ${(item.stock ?? 0) === 0 ? "bg-red-600 text-white" : "bg-red-200 text-red-800"}`}>
                        {item.stock ?? 0} in stock
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          {/* 5. Top Products Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="flex justify-between items-center p-5 border-b border-slate-200">
              <h2 className="font-bold text-[#0A2540]">Catalog Products & Performance</h2>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-slate-500 font-semibold uppercase tracking-wider text-xs">Sort By:</span>
                <select 
                  value={sortBy} 
                  onChange={(e) => setSortBy(e.target.value as any)}
                  className="bg-slate-50 border border-slate-200 rounded-md px-2 py-1 outline-none font-medium text-[#0A2540]"
                >
                  <option value="revenue">Value / Revenue</option>
                  <option value="units">Units Sold</option>
                </select>
              </div>
            </div>
            <div className="overflow-x-auto">
              {sortedProducts.length === 0 ? (
                <div className="p-8 text-center text-slate-400 text-sm">No products in database.</div>
              ) : (
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80">
                      <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Product Name</th>
                      <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Brand</th>
                      <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Category</th>
                      <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Stock</th>
                      <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Units Sold</th>
                      <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Metric Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {sortedProducts.slice(0, 10).map(product => (
                      <tr key={product.id} className="hover:bg-slate-50/50">
                        <td className="px-5 py-4 flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center p-0.5 overflow-hidden shrink-0">
                            <img
                              src={product.img}
                              alt={product.name}
                              className="w-full h-full object-contain"
                              onError={(e) => handleProductImageError(e, product.category)}
                            />
                          </div>
                          <span className="text-sm font-bold text-[#0A2540]">{product.name}</span>
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-600">{product.brand}</td>
                        <td className="px-5 py-4 text-sm text-slate-600">
                          <span className="bg-slate-100 text-slate-600 px-2.5 py-1 rounded-md text-xs font-semibold">{product.category}</span>
                        </td>
                        <td className="px-5 py-4 text-sm font-semibold text-slate-700 text-right">{product.stock}</td>
                        <td className="px-5 py-4 text-sm font-bold text-slate-700 text-right">{product.units}</td>
                        <td className="px-5 py-4 text-sm font-bold text-[#0A2540] text-right">₹{product.revenue.toLocaleString("en-IN")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* 6. Unsold Items Table */}
          {slowMovers.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-slate-200">
                <h2 className="font-bold text-[#0A2540]">Zero-Sales Inventory (Needs Marketing)</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/80">
                      <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Product Name</th>
                      <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Available Stock</th>
                      <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Current Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {slowMovers.map(product => (
                      <tr key={product.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-5 py-4 text-sm font-semibold text-[#0A2540]">{product.name}</td>
                        <td className="px-5 py-4 text-sm font-bold text-slate-700 text-right">{product.stock}</td>
                        <td className="px-5 py-4 text-sm font-bold text-red-600 text-right">₹{product.revenue.toLocaleString("en-IN")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
