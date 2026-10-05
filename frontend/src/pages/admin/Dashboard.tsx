import { useCallback, useEffect, useRef, useState } from "react";
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
import { DashboardSummary, OrderSummary, PaginatedResponse } from "../../types/api";

/**
 * Period selector contract. Each label maps to an explicit, backend-supported
 * `filter_type`. There is deliberately no `default` fallback: an unknown filter is
 * surfaced as an error instead of silently reporting the wrong period.
 */
const timeFilters = [
  { label: "30 days", apiFilter: "30_days" },
  { label: "This month", apiFilter: "current_month" },
  { label: "Last month", apiFilter: "previous_month" },
  { label: "Today", apiFilter: "today" },
  { label: "All time", apiFilter: "all_time" },
] as const;

const DEFAULT_FILTER_LABEL = "30 days";
const RECENT_ORDERS_LIMIT = 5;

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

/**
 * Renders an authoritative backend value. Missing values are shown as an em dash
 * ("—") so a broken/partial response can never masquerade as a healthy ₹0 / 0 count.
 */
const formatMetricCount = (value: unknown): string => {
  const num = Number(value);
  return Number.isFinite(num) && value !== null && value !== undefined && value !== ""
    ? num.toLocaleString("en-IN")
    : "—";
};

const formatMetricCurrency = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "—";
  const num = Number(value);
  return Number.isFinite(num) ? `₹${num.toLocaleString("en-IN")}` : "—";
};

export default function Dashboard() {
  const [activeFilter, setActiveFilter] = useState<string>(DEFAULT_FILTER_LABEL);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [recentOrders, setRecentOrders] = useState<OrderSummary[]>([]);
  const [totalOrdersCount, setTotalOrdersCount] = useState<number | null>(null);
  // Guards against out-of-order responses so a slow earlier request can never
  // overwrite the metrics of the currently selected filter.
  const requestIdRef = useRef(0);

  const loadDashboard = useCallback(async (
    filterLabel: string,
    options?: { keepPreviousData?: boolean }
  ) => {
    const selected = timeFilters.find((filter) => filter.label === filterLabel);

    if (!selected) {
      requestIdRef.current += 1;
      setSummary(null);
      setRecentOrders([]);
      setTotalOrdersCount(null);
      setError(
        `Unsupported dashboard filter "${filterLabel}". Expected one of: ${timeFilters
          .map((filter) => filter.label)
          .join(", ")}.`
      );
      setIsLoading(false);
      setIsRefreshing(false);
      return;
    }

    const requestId = ++requestIdRef.current;
    const keepPreviousData = options?.keepPreviousData === true;

    if (!keepPreviousData) {
      // Never render one filter's numbers under another filter's label.
      setSummary(null);
      setRecentOrders([]);
      setTotalOrdersCount(null);
    }
    setIsLoading(true);
    setIsRefreshing(true);
    setError(null);

    try {
      const [summaryRes, ordersRes] = await Promise.all([
        financeApi.getFinanceSummary({ filter_type: selected.apiFilter }),
        ordersApi.getAdminOrders({ page_size: RECENT_ORDERS_LIMIT }),
      ]);
      if (requestId !== requestIdRef.current) return;

      setSummary(summaryRes as DashboardSummary);
      const paginatedOrders = ordersRes as PaginatedResponse<OrderSummary>;
      setRecentOrders(Array.isArray(ordersRes) ? ordersRes : paginatedOrders.results || []);
      // Authoritative database total from pagination metadata — the recent-orders
      // array only ever holds the current page.
      setTotalOrdersCount(
        typeof paginatedOrders?.count === "number" ? paginatedOrders.count : null
      );
    } catch (err: any) {
      if (requestId !== requestIdRef.current) return;
      console.error("Error fetching dashboard data:", err);
      setError(err?.message || "Failed to load dashboard metrics from backend.");
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    loadDashboard(activeFilter);
  }, [activeFilter, loadDashboard]);

  // Initial load / filter change: skeleton only, no misleading zeroes.
  if (isLoading && !summary) {
    return (
      <div className="space-y-6 animate-pulse" data-testid="dashboard-loading">
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

  if (error && !summary) {
    return (
      <div
        className="p-8 bg-white border border-rose-200 rounded-xl text-center max-w-lg mx-auto my-12"
        data-testid="dashboard-error"
      >
        <AlertCircle className="w-12 h-12 text-rose-600 mx-auto mb-3" />
        <h2 className="text-xl font-bold text-slate-800 mb-2">Unable to Load Dashboard</h2>
        <p className="text-slate-500 text-sm mb-6">{error}</p>
        <button
          onClick={() => loadDashboard(activeFilter)}
          className="inline-flex items-center gap-2 bg-[#0B3A63] text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-[#1769AA] transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Retry Connection
        </button>
      </div>
    );
  }

  // Every business metric below is an authoritative database aggregate returned by
  // the backend summary API. Nothing is derived from the paginated recent-orders page.
  const dateRange = summary?.date_range;
  const periodLabel = dateRange
    ? (dateRange.start_date && dateRange.end_date
        ? `${dateRange.start_date} → ${dateRange.end_date}`
        : "all time")
    : "";

  const kpiCards = [
    { key: "total-sales", title: "Total Sales", value: formatMetricCurrency(summary?.total_sales), subtext: "Authoritative collections", icon: <IndianRupee className="w-5 h-5 text-[#0B3A63]" />, iconBg: "bg-[#0B3A63]/10" },
    { key: "total-invoiced", title: "Total Invoiced", value: formatMetricCurrency(summary?.total_invoiced), subtext: "GST invoiced volume", icon: <Receipt className="w-5 h-5 text-blue-600" />, iconBg: "bg-blue-100" },
    { key: "open-orders", title: "Open Orders", value: formatMetricCount(summary?.open_orders_count), subtext: "Requires fulfillment", icon: <PackageOpen className="w-5 h-5 text-amber-600" />, iconBg: "bg-amber-100" },
    { key: "total-outstanding", title: "Total Outstanding", value: formatMetricCurrency(summary?.total_outstanding), subtext: "Unpaid / overdue balance", icon: <IndianRupee className="w-5 h-5 text-red-600" />, iconBg: "bg-red-100" },
    { key: "confirmed-orders", title: "Confirmed Orders", value: formatMetricCount(summary?.confirmed_orders_count), subtext: "Ready for packing", icon: <CheckCircle2 className="w-5 h-5 text-[#0B3A63]" />, iconBg: "bg-[#0B3A63]/10" },
    { key: "out-for-delivery", title: "Out for Delivery", value: formatMetricCount(summary?.out_for_delivery_count), subtext: "In transit with courier", icon: <Truck className="w-5 h-5 text-[#F2A900]" />, iconBg: "bg-[#F2A900]/20" },
    { key: "returns", title: "Returns", value: formatMetricCount(summary?.returns_count), subtext: "Requested or active", icon: <Undo2 className="w-5 h-5 text-orange-600" />, iconBg: "bg-orange-100" },
    { key: "b2b-outstanding", title: "B2B Outstanding", value: formatMetricCurrency(summary?.b2b_outstanding), subtext: "Commercial credit exposure", icon: <IndianRupee className="w-5 h-5 text-indigo-600" />, iconBg: "bg-indigo-100" },
  ];

  const monthlyTrend = summary?.monthly_trend || [];
  const chartData = monthlyTrend.length > 0
    ? monthlyTrend.map((m) => ({ name: m.month || m.month_label, revenue: Number(m.revenue || 0) }))
    : [{ name: "Current", revenue: 0 }];

  const outForDeliveryCount = summary?.out_for_delivery_count;

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
              key={filter.label}
              data-testid={`dashboard-filter-${filter.apiFilter}`}
              onClick={() => setActiveFilter(filter.label)}
              className={`whitespace-nowrap px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                activeFilter === filter.label 
                  ? "bg-[#0B3A63] text-white shadow-sm" 
                  : "bg-white text-slate-600 hover:bg-slate-100 border border-slate-200"
              }`}
            >
              {filter.label}
            </button>
          ))}
          <button
            onClick={() => loadDashboard(activeFilter, { keepPreviousData: true })}
            disabled={isRefreshing}
            className="p-2 bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-full transition-colors ml-1 disabled:opacity-60"
            title="Refresh Live Data"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Refresh failure: previous authoritative values stay visible, the failure is explicit. */}
      {error && summary && (
        <div
          className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 flex items-center justify-between text-sm"
          data-testid="dashboard-error"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>Refresh failed: {error} Displayed values are from the last successful load.</span>
          </div>
          <button
            onClick={() => loadDashboard(activeFilter, { keepPreviousData: true })}
            className="px-3 py-1 bg-red-600 text-white rounded text-xs font-bold hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      )}

      {/* 2. KPI Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((card) => (
          <div key={card.key} className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm flex flex-col justify-between hover:shadow-md transition-shadow">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-sm font-semibold text-slate-600">{card.title}</h3>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${card.iconBg}`}>
                {card.icon}
              </div>
            </div>
            <div>
              <p className="text-2xl font-bold text-[#0B3A63]" data-testid={`kpi-${card.key}`}>{card.value}</p>
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
              <p className="text-sm text-slate-500">Backend 6-month collections trend</p>
              {periodLabel && (
                <p className="text-xs text-slate-400 mt-1" data-testid="dashboard-period">
                  Selected period: {periodLabel} ({dateRange?.filter_type})
                </p>
              )}
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
                <p className="text-sm font-bold text-emerald-600" data-testid="delivery-active-shipments">
                  {formatMetricCount(outForDeliveryCount)}
                </p>
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
            <p className="text-xs text-slate-500 mt-0.5">
              Latest {RECENT_ORDERS_LIMIT} of {totalOrdersCount === null ? "—" : totalOrdersCount.toLocaleString("en-IN")} orders in the database
            </p>
          </div>
          <Link
            to="/admin/orders"
            className="text-sm font-medium text-[#0B3A63] hover:text-[#F2A900] transition-colors"
            data-testid="view-all-orders"
          >
            View all{totalOrdersCount === null ? "" : ` (${totalOrdersCount.toLocaleString("en-IN")})`}
          </Link>
        </div>
        <div className="overflow-x-auto flex-1">
          {recentOrders.length === 0 ? (
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
                {recentOrders.slice(0, RECENT_ORDERS_LIMIT).map(order => (
                  <tr key={order.id} className="hover:bg-slate-50/50 transition-colors" data-testid="recent-order-row">
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
