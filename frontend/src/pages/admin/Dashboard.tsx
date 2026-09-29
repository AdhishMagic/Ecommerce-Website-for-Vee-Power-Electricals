import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer
} from "recharts";
import { 
  IndianRupee, PackageOpen, 
  CheckCircle2, Truck, Undo2,
  MapPin, AlertCircle, RefreshCw, Receipt
} from "lucide-react";
import { financeApi } from "../../api/finance";
import { ordersApi } from "../../api/orders";
import { OrderSummary } from "../../types/api";

const timeFilters = ["30 days", "This month", "Last month", "Today", "All time"];

const statusStyles: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700",
  CONFIRMED: "bg-blue-100 text-blue-700",
  PACKED: "bg-indigo-100 text-indigo-700",
  SHIPPED: "bg-purple-100 text-purple-700",
  DELIVERED: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-red-100 text-red-700",
  RETURN_REQUESTED: "bg-orange-100 text-orange-700",
  RETURN_APPROVED: "bg-teal-100 text-teal-700",
  RETURN_REJECTED: "bg-rose-100 text-rose-700",
  RETURN_COMPLETED: "bg-slate-200 text-slate-800",
  Paid: "bg-emerald-100 text-emerald-700",
  Pending: "bg-amber-100 text-amber-700",
  Failed: "bg-red-100 text-red-700",
};

export default function Dashboard() {
  const [activeFilter, setActiveFilter] = useState("30 days");
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [financeSummary, setFinanceSummary] = useState<any>(null);
  const [orders, setOrders] = useState<OrderSummary[]>([]);

  const mapFilterToApi = (filter: string): string => {
    switch (filter) {
      case "Today": return "today";
      case "This month": return "current_month";
      case "Last month": return "previous_month";
      case "30 days":
      default:
        return "current_month";
    }
  };

  const fetchDashboardData = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const apiFilter = mapFilterToApi(activeFilter);
      const [summaryRes, ordersRes] = await Promise.all([
        financeApi.getFinanceSummary({ filter_type: apiFilter }),
        ordersApi.getAdminOrders({ page_size: 10 }),
      ]);
      setFinanceSummary(summaryRes);
      setOrders(Array.isArray(ordersRes) ? ordersRes : ordersRes.results || []);
    } catch (err: any) {
      console.error("Error fetching dashboard data:", err);
      setError(err?.message || "Failed to load dashboard metrics from backend.");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [activeFilter]);

  if (isLoading && !financeSummary) {
    return (
      <div className="space-y-6 animate-pulse">
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

  if (error && !financeSummary) {
    return (
      <div className="p-8 bg-white border border-rose-200 rounded-xl text-center max-w-lg mx-auto my-12">
        <AlertCircle className="w-12 h-12 text-rose-600 mx-auto mb-3" />
        <h2 className="text-xl font-bold text-slate-800 mb-2">Unable to Load Dashboard</h2>
        <p className="text-slate-500 text-sm mb-6">{error}</p>
        <button
          onClick={fetchDashboardData}
          className="inline-flex items-center gap-2 bg-[#0B3A63] text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-[#1769AA] transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Retry Connection
        </button>
      </div>
    );
  }

  const kpis = financeSummary?.kpis || {};
  const totalSales = Number(kpis.total_paid || 0);
  const totalInvoiced = Number(kpis.total_invoiced || 0);
  const totalOutstanding = Number(kpis.total_outstanding || 0);
  const b2bOutstanding = Number(kpis.b2b_outstanding || 0);

  const openOrdersCount = orders.filter(o => ['PENDING', 'CONFIRMED', 'PACKED'].includes(o.status)).length;
  const confirmedCount = orders.filter(o => o.status === 'CONFIRMED').length;
  const outForDeliveryCount = orders.filter(o => o.status === 'SHIPPED').length;
  const returnsCount = orders.filter(o => ['RETURN_REQUESTED', 'RETURN_APPROVED', 'RETURN_COMPLETED'].includes(o.status)).length;

  const kpiCards = [
    { title: "Total Sales", value: `₹${totalSales.toLocaleString("en-IN")}`, subtext: "Authoritative collections", icon: <IndianRupee className="w-5 h-5 text-[#0B3A63]" />, iconBg: "bg-[#0B3A63]/10" },
    { title: "Total Invoiced", value: `₹${totalInvoiced.toLocaleString("en-IN")}`, subtext: "GST invoiced volume", icon: <Receipt className="w-5 h-5 text-blue-600" />, iconBg: "bg-blue-100" },
    { title: "Open Orders", value: openOrdersCount, subtext: "Requires fulfillment", icon: <PackageOpen className="w-5 h-5 text-amber-600" />, iconBg: "bg-amber-100" },
    { title: "Total Outstanding", value: `₹${totalOutstanding.toLocaleString("en-IN")}`, subtext: "Unpaid / overdue balance", icon: <IndianRupee className="w-5 h-5 text-red-600" />, iconBg: "bg-red-100" },
    { title: "Confirmed Orders", value: confirmedCount, subtext: "Ready for packing", icon: <CheckCircle2 className="w-5 h-5 text-[#0B3A63]" />, iconBg: "bg-[#0B3A63]/10" },
    { title: "Out for Delivery", value: outForDeliveryCount, subtext: "In transit with courier", icon: <Truck className="w-5 h-5 text-[#F2A900]" />, iconBg: "bg-[#F2A900]/20" },
    { title: "Returns", value: returnsCount, subtext: "Requested or active", icon: <Undo2 className="w-5 h-5 text-orange-600" />, iconBg: "bg-orange-100" },
    { title: "B2B Outstanding", value: `₹${b2bOutstanding.toLocaleString("en-IN")}`, subtext: "Commercial credit exposure", icon: <IndianRupee className="w-5 h-5 text-indigo-600" />, iconBg: "bg-indigo-100" },
  ];

  const monthlyTrend = financeSummary?.monthly_trend || [];
  const chartData = monthlyTrend.length > 0
    ? monthlyTrend.map((m: any) => ({ name: m.month || m.month_label, revenue: Number(m.revenue || 0) }))
    : [{ name: "Current", revenue: totalSales }];

  return (
    <div className="space-y-6">
      {/* 1. Header & Period Selector */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-5">
        <div>
          <h1 className="text-2xl font-bold text-[#0B3A63]">Overview</h1>
          <p className="text-sm text-slate-500 mt-1">Live operational and financial status from Vee Power backend.</p>
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
          <button
            onClick={fetchDashboardData}
            className="p-2 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-full transition-colors ml-1"
            title="Refresh Live Data"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
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
          <div className="mb-6 flex justify-between items-center">
            <div>
              <h2 className="text-lg font-bold text-[#0B3A63]">Revenue Overview</h2>
              <p className="text-sm text-slate-500">Live authoritative collections trend</p>
            </div>
          </div>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0B3A63" stopOpacity={0.2}/>
                    <stop offset="95%" stopColor="#0B3A63" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} tickFormatter={(val) => `₹${val >= 1000 ? (val/1000).toFixed(0) + 'k' : val}`} />
                <RechartsTooltip 
                  contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: any) => [`₹${Number(value || 0).toLocaleString("en-IN")}`, 'Revenue']}
                  labelStyle={{ color: '#0B3A63', fontWeight: 'bold' }}
                />
                <Area type="monotone" dataKey="revenue" stroke="#0B3A63" strokeWidth={3} fillOpacity={1} fill="url(#colorRevenue)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Live Delivery / Regional Overview */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 flex flex-col justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#0B3A63]">Delivery Hubs</h2>
            <p className="text-sm text-slate-500">Regional dispatch & distribution status</p>
          </div>
          <div className="my-6 bg-slate-50 rounded-xl p-6 border border-slate-200 text-center">
            <MapPin className="w-12 h-12 text-[#F2A900] mx-auto mb-3" />
            <h3 className="font-bold text-[#0B3A63] text-sm">Primary Hub: Coimbatore</h3>
            <p className="text-xs text-slate-500 mt-1">Serving Tamil Nadu and Pan-India B2B corridors.</p>
            <div className="mt-4 pt-4 border-t border-slate-200 flex justify-around text-center">
              <div>
                <p className="text-xs text-slate-500">Origin PIN</p>
                <p className="text-sm font-bold text-[#0B3A63]">641001</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Active Shipments</p>
                <p className="text-sm font-bold text-emerald-600">{outForDeliveryCount}</p>
              </div>
            </div>
          </div>
          <Link
            to="/admin/orders/shipping"
            className="w-full text-center py-2.5 border border-slate-200 hover:border-[#0B3A63] text-[#0B3A63] rounded-lg text-sm font-semibold transition-colors"
          >
            Configure Shipping Rules
          </Link>
        </div>
      </div>

      {/* 4. Bottom Data Tables: Live Recent Orders */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        <div className="flex justify-between items-center p-5 border-b border-slate-200">
          <div>
            <h2 className="font-bold text-[#0B3A63]">Recent Orders</h2>
            <p className="text-xs text-slate-500 mt-0.5">Authoritative order records from backend</p>
          </div>
          <Link to="/admin/orders" className="text-sm font-medium text-[#0B3A63] hover:text-[#F2A900] transition-colors">
            View all ({orders.length})
          </Link>
        </div>
        <div className="overflow-x-auto flex-1">
          {orders.length === 0 ? (
            <div className="py-12 text-center text-slate-500">
              <p className="text-sm">No customer orders recorded yet.</p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse min-w-[500px]">
              <thead>
                <tr className="bg-slate-50/80">
                  <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Order Number</th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Customer</th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Total Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {orders.slice(0, 5).map(order => (
                  <tr key={order.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-4 text-sm font-bold text-[#0B3A63]">
                      <Link to={`/admin/orders`} className="hover:underline">
                        {order.order_number || `ORD-${order.id}`}
                      </Link>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-600">
                      {order.customer_name || order.customer_email || 'Customer'}
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-500">
                      {order.created_at ? new Date(order.created_at).toLocaleDateString("en-IN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—"}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-bold ${statusStyles[order.status] || "bg-slate-100 text-slate-700"}`}>
                        {order.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-sm font-bold text-slate-700 text-right">
                      ₹{Number(order.total_amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
