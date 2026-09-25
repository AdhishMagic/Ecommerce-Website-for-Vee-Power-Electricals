import { useState } from "react";
import { 
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, 
  Tooltip as RechartsTooltip, ResponsiveContainer, Legend
} from "recharts";
import { Package, Tag, Layers, TrendingUp, IndianRupee, DollarSign, ShoppingBag, AlertTriangle } from "lucide-react";

// --- Mock Data ---
const revenueTrend = [
  { name: 'Jan', revenue: 45000, orders: 120 },
  { name: 'Feb', revenue: 52000, orders: 140 },
  { name: 'Mar', revenue: 38000, orders: 90 },
  { name: 'Apr', revenue: 65000, orders: 180 },
  { name: 'May', revenue: 48000, orders: 130 },
  { name: 'Jun', revenue: 58000, orders: 155 },
];

const salesByDay = [
  { name: 'Mon', revenue: 15000 },
  { name: 'Tue', revenue: 12000 },
  { name: 'Wed', revenue: 18000 },
  { name: 'Thu', revenue: 22000 },
  { name: 'Fri', revenue: 28000 },
  { name: 'Sat', revenue: 35000 },
  { name: 'Sun', revenue: 10000 },
];

const revenueByCategory = [
  { name: 'Fans', value: 45000 },
  { name: 'Wires & Cables', value: 35000 },
  { name: 'Switches', value: 25000 },
  { name: 'Lighting', value: 15000 },
  { name: 'MCB', value: 10000 },
];

const customerTypeBreakdown = [
  { name: 'B2B (Business)', value: 85000 },
  { name: 'B2C (Retail)', value: 45000 },
];

const topBrands = [
  { name: 'Havells', revenue: 45000 },
  { name: 'Polycab', revenue: 38000 },
  { name: 'Crompton', revenue: 32000 },
  { name: 'Finolex', revenue: 28000 },
  { name: 'Philips', revenue: 22000 },
  { name: 'Legrand', revenue: 18000 },
];

const topProducts = [
  { id: 1, name: "Havells Ambrose Ceiling Fan 1200mm", brand: "Havells", category: "Fans", units: 345, revenue: 862500, img: "https://via.placeholder.com/40" },
  { id: 2, name: "Polycab 1.5 sq mm Wire", brand: "Polycab", category: "Wires", units: 280, revenue: 336000, img: "https://via.placeholder.com/40" },
  { id: 3, name: "Legrand Mylinc Switch 10A", brand: "Legrand", category: "Switches", units: 1250, revenue: 112500, img: "https://via.placeholder.com/40" },
  { id: 4, name: "Philips 9W LED Bulb", brand: "Philips", category: "Lighting", units: 890, revenue: 89000, img: "https://via.placeholder.com/40" },
];

const slowMovers = [
  { id: 101, name: "Generic Copper Wire 0.5 sq mm", units: 2, revenue: 1200 },
  { id: 102, name: "Old Stock CFL Bulb 18W", units: 5, revenue: 750 },
  { id: 103, name: "Local Brand 3 Pin Plug", units: 8, revenue: 400 },
];

const unitsBySpec = [
  { name: '1.0 sq mm', sold: 450 },
  { name: '1.5 sq mm', sold: 820 },
  { name: '2.5 sq mm', sold: 650 },
  { name: '4.0 sq mm', sold: 310 },
  { name: '1200mm (Fans)', sold: 580 },
];

const lowStockAlerts = [
  { name: "Crompton Greaves 2.5 sq mm Wire (Red)", stock: 2 },
  { name: "Havells Stealth Air Ceiling Fan (Black)", stock: 0 },
  { name: "Legrand 32A DP MCB", stock: 5 },
  { name: "Philips 20W LED Tube", stock: 1 },
];

const COLORS = ['#0A2540', '#F2A900', '#1E4B7A', '#3A7CA5', '#81C3D7'];
const CUSTOMER_COLORS = ['#0A2540', '#F2A900'];

export default function ProductsAnalytics() {
  const [sortBy, setSortBy] = useState<"revenue" | "units">("revenue");
  const [startDate, setStartDate] = useState("2026-01-01");
  const [endDate, setEndDate] = useState("2026-09-18");

  // Dynamic Filtering Logic based on Date Range
  const startMonth = startDate ? new Date(startDate).getMonth() : 0;
  const endMonth = endDate ? new Date(endDate).getMonth() : 11;
  
  const filteredRevenueTrend = revenueTrend.slice(
    Math.max(0, startMonth),
    Math.min(revenueTrend.length, endMonth + 1)
  );

  const totalRev = filteredRevenueTrend.reduce((acc, curr) => acc + curr.revenue, 0);
  const totalOrd = filteredRevenueTrend.reduce((acc, curr) => acc + curr.orders, 0);
  const avgOrder = totalOrd > 0 ? Math.round(totalRev / totalOrd) : 0;

  return (
    <div className="space-y-6">
      {/* 1. Header Filter Bar */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-[#0A2540]">Products Analytics</h1>
          <p className="text-sm text-slate-500 mt-1">Analyze product performance, stock levels, and revenue trends.</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-3">
            <div className="flex items-center border border-slate-200 rounded-full px-4 py-2 bg-slate-50 focus-within:border-[#0A2540] transition-colors">
              <input 
                type="date" 
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-transparent text-sm outline-none text-slate-600 w-32 cursor-pointer" 
              />
            </div>
            <span className="text-slate-500 text-sm font-medium">to</span>
            <div className="flex items-center border border-slate-200 rounded-full px-4 py-2 bg-slate-50 focus-within:border-[#0A2540] transition-colors">
              <input 
                type="date" 
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-transparent text-sm outline-none text-slate-600 w-32 cursor-pointer" 
              />
            </div>
          </div>
          
          <select className="border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 text-sm text-slate-600 outline-none focus:border-[#0A2540]">
            <option>Last 12 months</option>
            <option>Last 30 days</option>
            <option>This Year</option>
          </select>
        </div>
      </div>

      {/* 2. KPI Summary Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { title: "Total Revenue", value: `₹${totalRev.toLocaleString("en-IN")}`, icon: <IndianRupee className="w-6 h-6 text-[#0A2540]" />, bg: "bg-[#0A2540]/10" },
          { title: "Total Orders", value: totalOrd.toString(), icon: <Package className="w-6 h-6 text-[#F2A900]" />, bg: "bg-[#F2A900]/20" },
          { title: "Avg Order Value", value: `₹${avgOrder.toLocaleString("en-IN")}`, icon: <TrendingUp className="w-6 h-6 text-[#0A2540]" />, bg: "bg-[#0A2540]/10" },
        ].map((kpi, idx) => (
          <div key={idx} className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-500 mb-1">{kpi.title}</p>
              <p className="text-3xl font-bold text-[#0A2540]">{kpi.value}</p>
            </div>
            <div className={`w-14 h-14 rounded-full flex items-center justify-center ${kpi.bg}`}>
              {kpi.icon}
            </div>
          </div>
        ))}
      </div>

      {/* 3. Main Trend Chart */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-lg font-bold text-[#0A2540] mb-6">Revenue Over Time</h2>
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={filteredRevenueTrend}>
              <defs>
                <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0A2540" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#0A2540" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} dy={10} />
              <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} tickFormatter={(val) => `₹${val/1000}k`} />
              <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} />
              <RechartsTooltip 
                contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              />
              <Legend verticalAlign="top" height={36} />
              <Area yAxisId="left" type="monotone" name="Revenue (₹)" dataKey="revenue" stroke="#0A2540" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
              <Area yAxisId="right" type="monotone" name="Orders" dataKey="orders" stroke="#F2A900" strokeWidth={3} fillOpacity={0} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 4. 2x2 Analytics Chart Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="text-base font-bold text-[#0A2540] mb-4">Sales by Day of Week</h2>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={salesByDay}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12 }} tickFormatter={(val) => `₹${val/1000}k`} />
                <RechartsTooltip cursor={{ fill: '#F1F5F9' }} />
                <Bar dataKey="revenue" fill="#0A2540" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="text-base font-bold text-[#0A2540] mb-4">Revenue by Category</h2>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={revenueByCategory} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                  {revenueByCategory.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                </Pie>
                <RechartsTooltip formatter={(value: any) => `₹${Number(value || 0).toLocaleString()}`} />
                <Legend layout="vertical" verticalAlign="middle" align="right" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="text-base font-bold text-[#0A2540] mb-4">Customer Type Breakdown</h2>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={customerTypeBreakdown} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                  {customerTypeBreakdown.map((entry, index) => <Cell key={`cell-${index}`} fill={CUSTOMER_COLORS[index % CUSTOMER_COLORS.length]} />)}
                </Pie>
                <RechartsTooltip formatter={(value: any) => `₹${Number(value || 0).toLocaleString()}`} />
                <Legend layout="vertical" verticalAlign="middle" align="right" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="text-base font-bold text-[#0A2540] mb-4">Top Brands by Revenue</h2>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topBrands} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} tickFormatter={(val) => `₹${val/1000}k`} />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                <RechartsTooltip cursor={{ fill: '#F1F5F9' }} />
                <Bar dataKey="revenue" fill="#F2A900" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 5. Top Selling Products Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex justify-between items-center p-5 border-b border-slate-200">
          <h2 className="font-bold text-[#0A2540]">Top Selling Products</h2>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-slate-500 font-semibold uppercase tracking-wider text-xs">Sort By:</span>
            <select 
              value={sortBy} 
              onChange={(e) => setSortBy(e.target.value as any)}
              className="bg-slate-50 border border-slate-200 rounded-md px-2 py-1 outline-none font-medium text-[#0A2540]"
            >
              <option value="revenue">Revenue</option>
              <option value="units">Units Sold</option>
            </select>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80">
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Product Name</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Brand</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Category</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Units Sold</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Total Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {topProducts.sort((a, b) => b[sortBy] - a[sortBy]).map(product => (
                <tr key={product.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-4 flex items-center gap-3">
                    <img src={product.img} alt={product.name} className="w-10 h-10 rounded border border-slate-200" />
                    <span className="text-sm font-bold text-[#0A2540]">{product.name}</span>
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-600">{product.brand}</td>
                  <td className="px-5 py-4 text-sm text-slate-600">
                    <span className="bg-slate-100 text-slate-600 px-2.5 py-1 rounded-md text-xs font-semibold">{product.category}</span>
                  </td>
                  <td className="px-5 py-4 text-sm font-bold text-slate-700 text-right">{product.units}</td>
                  <td className="px-5 py-4 text-sm font-bold text-[#0A2540] text-right">₹{product.revenue.toLocaleString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 6. Lower Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="text-base font-bold text-[#0A2540] mb-4">Units Sold by Specifications</h2>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={unitsBySpec} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                <RechartsTooltip cursor={{ fill: '#F1F5F9' }} />
                <Bar dataKey="sold" fill="#0A2540" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col">
          <h2 className="text-base font-bold text-[#0A2540] mb-4">Low Stock Alert</h2>
          <div className="flex-1 overflow-y-auto space-y-3">
            {lowStockAlerts.map((item, idx) => (
              <div key={idx} className="flex justify-between items-center p-3 rounded-lg border border-red-100 bg-red-50/50">
                <span className="text-sm font-semibold text-[#0A2540]">{item.name}</span>
                <span className={`px-2.5 py-1 rounded-md text-xs font-bold ${item.stock === 0 ? "bg-red-600 text-white" : "bg-red-200 text-red-800"}`}>
                  {item.stock} left
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 7. Slow Movers Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-200">
          <h2 className="font-bold text-[#0A2540]">Slow Movers (Needs Attention)</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80">
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Product Name</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Units Sold</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Total Revenue</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {slowMovers.map(product => (
                <tr key={product.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-4 text-sm font-semibold text-[#0A2540]">{product.name}</td>
                  <td className="px-5 py-4 text-sm font-bold text-slate-700 text-right">{product.units}</td>
                  <td className="px-5 py-4 text-sm font-bold text-red-600 text-right">₹{product.revenue.toLocaleString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
