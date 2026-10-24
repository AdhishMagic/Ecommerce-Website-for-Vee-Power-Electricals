import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { 
  PackageOpen, 
  CheckCircle2, 
  Truck, 
  Undo2,
  MapPin, 
  AlertCircle, 
  RefreshCw,
  Clock,
  Box,
  CheckCircle,
  ArrowRight
} from "lucide-react";
import { ordersApi } from "../../api/orders";
import { OperationalDashboardSummary, OrderSummary, PaginatedResponse } from "../../types/api";

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
 * Renders an authoritative backend metric count.
 * Missing or undefined values are displayed as an em dash ("—") to avoid masquerading as 0.
 */
const formatMetricCount = (value: unknown): string => {
  const num = Number(value);
  return Number.isFinite(num) && value !== null && value !== undefined && value !== ""
    ? num.toLocaleString("en-IN")
    : "—";
};

export default function Dashboard() {
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<OperationalDashboardSummary | null>(null);
  const [recentOrders, setRecentOrders] = useState<OrderSummary[]>([]);
  const [totalOrdersCount, setTotalOrdersCount] = useState<number | null>(null);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date | null>(null);
  const requestIdRef = useRef(0);

  const loadDashboard = useCallback(async (options?: { keepPreviousData?: boolean }) => {
    const requestId = ++requestIdRef.current;
    const keepPreviousData = options?.keepPreviousData === true;

    if (!keepPreviousData) {
      setSummary(null);
      setRecentOrders([]);
      setTotalOrdersCount(null);
    }
    setIsLoading(true);
    setIsRefreshing(true);
    setError(null);

    try {
      const [summaryRes, ordersRes] = await Promise.all([
        ordersApi.getOperationalSummary(),
        ordersApi.getAdminOrders({ page_size: RECENT_ORDERS_LIMIT }),
      ]);
      if (requestId !== requestIdRef.current) return;

      setSummary(summaryRes);
      const paginatedOrders = ordersRes as PaginatedResponse<OrderSummary>;
      setRecentOrders(Array.isArray(ordersRes) ? ordersRes : paginatedOrders.results || []);
      setTotalOrdersCount(
        typeof paginatedOrders?.count === "number" ? paginatedOrders.count : null
      );
      setLastRefreshedAt(new Date());
    } catch (err: any) {
      if (requestId !== requestIdRef.current) return;
      console.error("Error fetching dashboard operational data:", err);
      setError(err?.message || "Failed to load operational metrics from backend.");
    } finally {
      if (requestId === requestIdRef.current) {
        setIsLoading(false);
        setIsRefreshing(false);
      }
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  // Loading skeleton
  if (isLoading && !summary) {
    return (
      <div className="space-y-6 animate-pulse" data-testid="dashboard-loading">
        <div className="flex flex-col md:flex-row gap-4 justify-between mb-8">
          <div className="h-12 w-48 bg-slate-200 rounded-lg"></div>
          <div className="h-10 w-36 bg-slate-200 rounded-full"></div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-32 bg-white border border-slate-100 rounded-xl"></div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-80 bg-white border border-slate-100 rounded-xl"></div>
          <div className="h-80 bg-white border border-slate-100 rounded-xl"></div>
        </div>
      </div>
    );
  }

  // Error boundary state
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
          onClick={() => loadDashboard()}
          className="inline-flex items-center gap-2 bg-[#0B3A63] text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-[#1769AA] transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Retry Connection
        </button>
      </div>
    );
  }

  // Purely operational KPI metrics
  const kpiCards = [
    { 
      key: "open-orders", 
      title: "Open Orders", 
      value: formatMetricCount(summary?.open_orders_count), 
      subtext: "Requires fulfillment", 
      icon: <PackageOpen className="w-5 h-5 text-amber-600" />, 
      iconBg: "bg-amber-100" 
    },
    { 
      key: "confirmed-orders", 
      title: "Confirmed Orders", 
      value: formatMetricCount(summary?.confirmed_orders_count), 
      subtext: "Ready for packing", 
      icon: <CheckCircle2 className="w-5 h-5 text-[#0B3A63]" />, 
      iconBg: "bg-[#0B3A63]/10" 
    },
    { 
      key: "out-for-delivery", 
      title: "Out for Delivery", 
      value: formatMetricCount(summary?.out_for_delivery_count), 
      subtext: "In transit with courier", 
      icon: <Truck className="w-5 h-5 text-[#F2A900]" />, 
      iconBg: "bg-[#F2A900]/20" 
    },
    { 
      key: "returns", 
      title: "Returns", 
      value: formatMetricCount(summary?.returns_count), 
      subtext: "Requested or active", 
      icon: <Undo2 className="w-5 h-5 text-orange-600" />, 
      iconBg: "bg-orange-100" 
    },
  ];

  const outForDeliveryCount = summary?.out_for_delivery_count;

  // Pipeline stages for live fulfillment tracking
  const pipelineStages = [
    {
      label: "Pending Intake",
      count: summary?.pending_orders_count ?? 0,
      description: "Awaiting confirmation",
      icon: <Clock className="w-4 h-4 text-amber-600" />,
      color: "bg-amber-500",
      textColor: "text-amber-700",
      bgColor: "bg-amber-50",
      statusFilter: "PENDING",
    },
    {
      label: "Confirmed",
      count: summary?.confirmed_orders_count ?? 0,
      description: "Ready for warehouse packing",
      icon: <CheckCircle2 className="w-4 h-4 text-blue-600" />,
      color: "bg-blue-500",
      textColor: "text-blue-700",
      bgColor: "bg-blue-50",
      statusFilter: "CONFIRMED",
    },
    {
      label: "Packed & Staged",
      count: summary?.packed_orders_count ?? 0,
      description: "Ready for dispatch pickup",
      icon: <Box className="w-4 h-4 text-indigo-600" />,
      color: "bg-indigo-500",
      textColor: "text-indigo-700",
      bgColor: "bg-indigo-50",
      statusFilter: "PACKED",
    },
    {
      label: "In Transit",
      count: summary?.out_for_delivery_count ?? 0,
      description: "With logistics partner",
      icon: <Truck className="w-4 h-4 text-[#F2A900]" />,
      color: "bg-[#F2A900]",
      textColor: "text-amber-800",
      bgColor: "bg-[#F2A900]/10",
      statusFilter: "SHIPPED",
    },
    {
      label: "Delivered",
      count: summary?.delivered_orders_count ?? 0,
      description: "Successfully fulfilled",
      icon: <CheckCircle className="w-4 h-4 text-emerald-600" />,
      color: "bg-emerald-500",
      textColor: "text-emerald-700",
      bgColor: "bg-emerald-50",
      statusFilter: "DELIVERED",
    },
  ];

  const totalTrackedInPipeline = pipelineStages.reduce((acc, s) => acc + s.count, 0);

  return (
    <div className="space-y-6">
      {/* 1. Header & Live Operational Status */}
      <div className="animate-dashboard-header flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0B3A63]">Overview</h1>
          <p className="text-sm text-slate-500 mt-1">
            Live operational status and fulfillment pipeline from Vee Power backend.
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          {lastRefreshedAt && (
            <span className="text-xs text-slate-400 hidden md:inline">
              Updated {lastRefreshedAt.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
            </span>
          )}
          <button
            onClick={() => loadDashboard({ keepPreviousData: true })}
            disabled={isRefreshing}
            className="inline-flex items-center gap-2 px-3.5 py-2 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300 rounded-lg text-xs font-semibold shadow-2xs transition-all active:scale-95 disabled:opacity-60 cursor-pointer"
            title="Refresh Live Data"
            data-testid="dashboard-refresh-btn"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-[#0B3A63] ${isRefreshing ? 'animate-spin' : ''}`} />
            <span>{isRefreshing ? "Refreshing..." : "Refresh Live Data"}</span>
          </button>
        </div>
      </div>

      {/* Refresh failure banner */}
      {error && summary && (
        <div
          className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 flex items-center justify-between text-sm animate-dashboard-header"
          data-testid="dashboard-error"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>Refresh failed: {error} Displayed values are from the last successful load.</span>
          </div>
          <button
            onClick={() => loadDashboard({ keepPreviousData: true })}
            className="px-3 py-1 bg-red-600 text-white rounded text-xs font-bold hover:bg-red-700 cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* 2. Operational KPI Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((card, idx) => (
          <div
            key={card.key}
            style={{ animationDelay: `${idx * 45}ms` }}
            className="animate-dashboard-card card-interactive group bg-white rounded-xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between hover:shadow-md hover:-translate-y-0.5 hover:border-[#1769AA]/40 transition-all duration-200"
          >
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-sm font-semibold text-slate-600 group-hover:text-[#0B3A63] transition-colors">{card.title}</h3>
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${card.iconBg} group-hover:scale-105 transition-transform duration-200`}>
                {card.icon}
              </div>
            </div>
            <div>
              <p className="text-2xl font-bold text-[#0B3A63] tracking-tight" data-testid={`kpi-${card.key}`}>{card.value}</p>
              <p className="text-xs text-slate-500 font-medium mt-1">{card.subtext}</p>
            </div>
          </div>
        ))}
      </div>

      {/* 3. Operational Overview & Regional Fulfillment */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Order Fulfillment Pipeline */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-xs p-6 hover:shadow-sm transition-shadow">
          <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-lg font-bold text-[#0B3A63]">Fulfillment Pipeline</h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">Live order distribution across fulfillment lifecycle</p>
            </div>
            <Link
              to="/admin/orders"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1769AA] hover:text-[#0B3A63] transition-colors self-start sm:self-auto"
            >
              <span>Manage all orders</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          {/* Pipeline stage cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            {pipelineStages.map((stage) => (
              <Link
                key={stage.label}
                to={`/admin/orders?status=${stage.statusFilter}`}
                className="group p-3.5 rounded-xl border border-slate-200 bg-white hover:border-[#1769AA]/40 hover:shadow-xs transition-all flex flex-col justify-between"
              >
                <div className="flex items-center justify-between mb-2">
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${stage.bgColor}`}>
                    {stage.icon}
                  </div>
                  <span className="text-[10px] text-slate-400 group-hover:text-[#1769AA] transition-colors font-medium">
                    View →
                  </span>
                </div>
                <div>
                  <p className="text-xl font-bold text-[#0B3A63] tracking-tight">
                    {formatMetricCount(stage.count)}
                  </p>
                  <p className="text-xs font-medium text-slate-700 mt-0.5">{stage.label}</p>
                  <p className="text-[10px] text-slate-400 truncate mt-0.5">{stage.description}</p>
                </div>
              </Link>
            ))}
          </div>

          {/* Distribution progress visual */}
          {totalTrackedInPipeline > 0 && (
            <div className="mt-6 pt-5 border-t border-slate-100">
              <div className="flex justify-between items-center text-xs text-slate-500 mb-2">
                <span className="font-medium text-slate-600">Pipeline Distribution</span>
                <span>{totalTrackedInPipeline} active orders tracked</span>
              </div>
              <div className="h-2.5 w-full bg-slate-100 rounded-full overflow-hidden flex">
                {pipelineStages.map((stage) => {
                  const pct = totalTrackedInPipeline > 0 ? (stage.count / totalTrackedInPipeline) * 100 : 0;
                  if (pct === 0) return null;
                  return (
                    <div
                      key={stage.label}
                      style={{ width: `${pct}%` }}
                      className={`${stage.color} h-full transition-all duration-300`}
                      title={`${stage.label}: ${stage.count} (${pct.toFixed(1)}%)`}
                    />
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center gap-4 mt-3 text-[11px] text-slate-500">
                {pipelineStages.map((stage) => (
                  <div key={stage.label} className="flex items-center gap-1.5">
                    <span className={`w-2 h-2 rounded-full ${stage.color}`}></span>
                    <span>{stage.label}: <strong>{stage.count}</strong></span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Live Delivery / Regional Hub Overview */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6 flex flex-col justify-between hover:shadow-sm transition-shadow">
          <div>
            <h2 className="text-lg font-bold text-[#0B3A63]">Delivery Hubs</h2>
            <p className="text-xs sm:text-sm text-slate-500 mt-0.5">Regional dispatch & distribution status</p>
          </div>
          <div className="my-5 bg-slate-50 rounded-xl p-5 border border-slate-200 text-center">
            <MapPin className="w-10 h-10 text-[#F2A900] mx-auto mb-2" />
            <h3 className="font-bold text-[#0B3A63] text-sm">Primary Hub: Coimbatore</h3>
            <p className="text-xs text-slate-500 mt-1">Delivering all around India across all states and B2B corridors.</p>
            <div className="mt-4 pt-3.5 border-t border-slate-200 flex justify-around text-center">
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
            className="w-full text-center py-2.5 border border-slate-200 hover:border-[#0B3A63] hover:bg-[#0B3A63]/5 text-[#0B3A63] rounded-lg text-xs font-semibold transition-colors shadow-2xs"
          >
            Configure Shipping Rules
          </Link>
        </div>
      </div>

      {/* 4. Bottom Data Tables: Live Recent Orders */}
      <div className="animate-dashboard-table bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
        <div className="flex justify-between items-center p-5 border-b border-slate-200">
          <div>
            <h2 className="font-bold text-[#0B3A63]">Recent Orders</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Latest {RECENT_ORDERS_LIMIT} of {totalOrdersCount === null ? "—" : totalOrdersCount.toLocaleString("en-IN")} orders in the database
            </p>
          </div>
          <Link
            to="/admin/orders"
            className="text-xs sm:text-sm font-medium text-[#0B3A63] hover:text-[#1769AA] transition-colors"
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
                  <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Items</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentOrders.slice(0, RECENT_ORDERS_LIMIT).map(order => {
                  const itemCount = order.items_count || 1;
                  return (
                    <tr key={order.id} className="table-row-interactive hover:bg-slate-50/70" data-testid="recent-order-row">
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
                      <td className="px-5 py-4 text-xs font-medium text-slate-600 text-right">
                        {itemCount} {itemCount === 1 ? 'item' : 'items'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
