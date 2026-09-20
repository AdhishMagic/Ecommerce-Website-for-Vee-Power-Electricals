import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer
} from "recharts";
import { 
  IndianRupee, Users, PackageOpen, Percent, 
  CheckCircle2, Truck, Undo2, MessageSquare,
  MapPin
} from "lucide-react";

// Mock Data
const revenueData = [
  { name: '1', revenue: 4000 },
  { name: '5', revenue: 3000 },
  { name: '10', revenue: 2000 },
  { name: '15', revenue: 2780 },
  { name: '20', revenue: 1890 },
  { name: '25', revenue: 2390 },
  { name: '30', revenue: 3490 },
];

const recentOrders = [
  { id: "ORD-7291", date: "Sep 18, 10:42 AM", status: "Paid", total: 12500 },
  { id: "ORD-7290", date: "Sep 18, 09:15 AM", status: "Pending", total: 3400 },
  { id: "ORD-7289", date: "Sep 17, 04:30 PM", status: "Paid", total: 45000 },
  { id: "ORD-7288", date: "Sep 17, 02:10 PM", status: "Cancelled", total: 1200 },
  { id: "ORD-7287", date: "Sep 17, 11:05 AM", status: "Paid", total: 8900 },
];

const topPincodes = [
  { pincode: "400001 (Mumbai)", revenue: 145000, percentage: 85 },
  { pincode: "110001 (Delhi)", revenue: 112000, percentage: 65 },
  { pincode: "560001 (Bengaluru)", revenue: 98000, percentage: 55 },
  { pincode: "600001 (Chennai)", revenue: 76000, percentage: 40 },
  { pincode: "411001 (Pune)", revenue: 45000, percentage: 25 },
];

const timeFilters = ["7 days", "30 days", "This month", "Last month", "3 months", "This year", "All time", "Custom"];

const statusStyles: Record<string, string> = {
  Paid: "bg-emerald-100 text-emerald-700",
  Pending: "bg-amber-100 text-amber-700",
  Cancelled: "bg-red-100 text-red-700",
};

export default function Dashboard() {
  const [activeFilter, setActiveFilter] = useState("30 days");
  const [isLoading, setIsLoading] = useState(true);
  const [metrics, setMetrics] = useState<any>(null);

  useEffect(() => {
    // Simulate data fetching
    const fetchDashboardMetrics = async () => {
      setIsLoading(true);
      try {
        // Mock API call delay
        await new Promise(resolve => setTimeout(resolve, 800));
        setMetrics({
          sales: 1245000,
          customers: 8432,
          openOrders: 156,
          conversionRate: 3.2,
          confirmedOrders: 892,
          outForDelivery: 45,
          returns: 12,
          pendingReviews: 38
        });
      } catch (error) {
        console.error("Error fetching metrics", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDashboardMetrics();
  }, [activeFilter]);

  if (isLoading || !metrics) {
    return (
      <div className="space-y-6 animate-pulse">
        {/* Skeleton UI */}
        <div className="flex flex-col md:flex-row gap-4 justify-between mb-8">
          <div className="h-12 w-48 bg-slate-200 rounded-lg"></div>
          <div className="h-10 w-full md:w-96 bg-slate-200 rounded-full"></div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => <div key={i} className="h-32 bg-white border border-slate-100 rounded-xl"></div>)}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-80 bg-white border border-slate-100 rounded-xl"></div>
          <div className="h-80 bg-white border border-slate-100 rounded-xl"></div>
        </div>
      </div>
    );
  }

  const kpiCards = [
    { title: "Total Sales", value: `₹${metrics.sales.toLocaleString("en-IN")}`, subtext: "+14.5% vs last period", icon: <IndianRupee className="w-5 h-5 text-[#0B3A63]" />, iconBg: "bg-[#0B3A63]/10" },
    { title: "Customers", value: metrics.customers.toLocaleString("en-IN"), subtext: "+123 new customers", icon: <Users className="w-5 h-5 text-blue-600" />, iconBg: "bg-blue-100" },
    { title: "Open Orders", value: metrics.openOrders, subtext: "Requires processing", icon: <PackageOpen className="w-5 h-5 text-amber-600" />, iconBg: "bg-amber-100" },
    { title: "Conversion Rate", value: `${metrics.conversionRate}%`, subtext: "-0.4% vs last period", icon: <Percent className="w-5 h-5 text-purple-600" />, iconBg: "bg-purple-100" },
    { title: "Confirmed Orders", value: metrics.confirmedOrders, subtext: "Ready for shipping", icon: <CheckCircle2 className="w-5 h-5 text-[#0B3A63]" />, iconBg: "bg-[#0B3A63]/10" },
    { title: "Out for Delivery", value: metrics.outForDelivery, subtext: "Arriving today", icon: <Truck className="w-5 h-5 text-[#F2A900]" />, iconBg: "bg-[#F2A900]/20" },
    { title: "Returns", value: metrics.returns, subtext: "Needs attention", icon: <Undo2 className="w-5 h-5 text-red-600" />, iconBg: "bg-red-100" },
    { title: "Pending Reviews", value: metrics.pendingReviews, subtext: "Unanswered reviews", icon: <MessageSquare className="w-5 h-5 text-cyan-600" />, iconBg: "bg-cyan-100" },
  ];

  return (
    <div className="space-y-6">
      {/* 1. Header & Period Selector */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-5">
        <div>
          <h1 className="text-2xl font-bold text-[#0B3A63]">Overview</h1>
          <p className="text-sm text-slate-500 mt-1">Welcome back! Here's what's happening with your store.</p>
        </div>
        
        {/* Pills Toggle Group */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 hide-scrollbar" style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
          {timeFilters.map(filter => (
            <button
              key={filter}
              onClick={() => setActiveFilter(filter)}
              className={`whitespace-nowrap px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                activeFilter === filter 
                  ? "bg-[#0B3A63] text-white shadow-sm" 
                  : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
              }`}
            >
              {filter}
            </button>
          ))}
        </div>
      </div>

      {/* 2. KPI Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((card, idx) => (
          <div key={idx} className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-sm font-semibold text-slate-600">{card.title}</h3>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${card.iconBg}`}>
                {card.icon}
              </div>
            </div>
            <div>
              <p className="text-2xl font-bold text-[#0B3A63]">{card.value}</p>
              <p className="text-xs text-slate-500 font-medium mt-1">{card.subtext}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 3. Charts & Data Visualization */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Order Overview Chart */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="mb-6">
            <h2 className="text-lg font-bold text-[#0B3A63]">Revenue Overview</h2>
            <p className="text-sm text-slate-500">Last 30 days revenue trend</p>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={revenueData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0B3A63" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#0B3A63" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} tickFormatter={(val) => `₹${val/1000}k`} />
                <RechartsTooltip 
                  contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: number) => [`₹${value.toLocaleString()}`, 'Revenue']}
                  labelStyle={{ color: '#0B3A63', fontWeight: 'bold' }}
                />
                <Area type="monotone" dataKey="revenue" stroke="#0B3A63" strokeWidth={3} fillOpacity={1} fill="url(#colorRevenue)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Orders by Region (Map Placeholder) */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col">
          <div className="mb-6">
            <h2 className="text-lg font-bold text-[#0B3A63]">Orders by Region - India</h2>
            <p className="text-sm text-slate-500">Revenue distribution by pin code</p>
          </div>
          <div className="flex-1 bg-slate-50 rounded-lg border border-slate-200 flex items-center justify-center relative overflow-hidden group">
            {/* Map Placeholder Visualization Pattern */}
            <div className="absolute inset-0 bg-[radial-gradient(#CBD5E1_1px,transparent_1px)] [background-size:16px_16px] opacity-60"></div>
            
            <div className="text-center z-10 p-6">
              <MapPin className="w-12 h-12 text-[#F2A900] mx-auto mb-3 opacity-90 drop-shadow-sm" />
              <p className="text-sm font-bold text-[#0B3A63] mb-1">3D Globe / Map View</p>
              <p className="text-xs text-slate-500 max-w-[200px] mx-auto">Map container ready for WebGL or Leaflet integration</p>
            </div>
            
            {/* Faux Hotspots */}
            <div className="absolute top-1/3 left-1/4 w-3 h-3 bg-[#F2A900] rounded-full shadow-[0_0_15px_rgba(242,169,0,0.8)] animate-pulse"></div>
            <div className="absolute bottom-1/3 right-1/3 w-4 h-4 bg-[#0B3A63] rounded-full shadow-[0_0_15px_rgba(11,58,99,0.5)] animate-pulse" style={{ animationDelay: '1s' }}></div>
            <div className="absolute top-1/2 right-1/4 w-2 h-2 bg-emerald-500 rounded-full shadow-[0_0_10px_rgba(16,185,129,0.8)] animate-pulse" style={{ animationDelay: '0.5s' }}></div>
          </div>
        </div>
      </div>

      {/* 4. Bottom Data Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Table 1: Recent Orders */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="flex justify-between items-center p-5 border-b border-slate-200">
            <h2 className="font-bold text-[#0B3A63]">Recent Orders</h2>
            <Link to="/admin/orders" className="text-sm font-medium text-[#0B3A63] hover:text-[#F2A900] transition-colors">
              View all
            </Link>
          </div>
          <div className="overflow-x-auto flex-1">
            <table className="w-full text-left border-collapse min-w-[500px]">
              <thead>
                <tr className="bg-slate-50/80">
                  <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Order ID</th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentOrders.map(order => (
                  <tr key={order.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-4 text-sm font-bold text-[#0B3A63]">{order.id}</td>
                    <td className="px-5 py-4 text-sm text-slate-500">{order.date}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold ${statusStyles[order.status]}`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-sm font-bold text-slate-700 text-right">
                      ₹{order.total.toLocaleString("en-IN")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Table 2: Top Pincodes */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-5 border-b border-slate-200">
            <h2 className="font-bold text-[#0B3A63]">Top Pincodes</h2>
          </div>
          <div className="p-6 space-y-6 flex-1">
            {topPincodes.map((item, idx) => (
              <div key={idx}>
                <div className="flex justify-between items-end mb-2">
                  <span className="text-sm font-semibold text-slate-700">{item.pincode}</span>
                  <div className="text-right">
                    <span className="text-sm font-bold text-[#0B3A63] block">₹{item.revenue.toLocaleString("en-IN")}</span>
                  </div>
                </div>
                <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                  <div 
                    className="bg-[#0B3A63] h-2.5 rounded-full transition-all duration-1000 ease-out" 
                    style={{ width: `${item.percentage}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
