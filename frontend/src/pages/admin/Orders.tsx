import { useState, useEffect } from "react";
import { Search, Calendar, FileText, Truck, Package, CheckCircle2, XCircle, RotateCcw } from "lucide-react";
import InvoiceModal from "../../components/admin/InvoiceModal";
import { ordersApi } from "../../api/orders";
import { OrderSummary, OrderDetailData, OrderStatus } from "../../types/api";

const STATUS_TABS: (OrderStatus | "All")[] = [
  "All",
  "PENDING",
  "CONFIRMED",
  "PACKED",
  "SHIPPED",
  "DELIVERED",
  "CANCELLED",
  "RETURN_REQUESTED",
  "RETURN_APPROVED",
  "RETURN_REJECTED",
  "RETURN_COMPLETED",
];

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-slate-100 text-slate-700",
  CONFIRMED: "bg-blue-100 text-blue-700",
  PACKED: "bg-amber-100 text-amber-700",
  SHIPPED: "bg-indigo-100 text-indigo-700",
  DELIVERED: "bg-emerald-100 text-emerald-700",
  CANCELLED: "bg-red-100 text-red-700",
  RETURN_REQUESTED: "bg-orange-100 text-orange-700",
  RETURN_APPROVED: "bg-purple-100 text-purple-700",
  RETURN_REJECTED: "bg-rose-100 text-rose-700",
  RETURN_COMPLETED: "bg-slate-200 text-slate-800",
};

export default function AdminOrders() {
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<OrderStatus | "All">("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [trackingInputs, setTrackingInputs] = useState<Record<string | number, string>>({});
  const [selectedInvoiceOrder, setSelectedInvoiceOrder] = useState<OrderDetailData | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadOrders = async () => {
    try {
      setLoading(true);
      const res = await ordersApi.getAdminOrders({
        status: activeTab === "All" ? undefined : (activeTab as OrderStatus),
        search: searchQuery || undefined,
      });
      setOrders(Array.isArray(res) ? res : res.results || []);
    } catch (err: any) {
      console.error("Failed to load admin orders:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadOrders();
  }, [activeTab]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    loadOrders();
  };

  const handleStatusTransition = async (orderId: number, targetStatus: OrderStatus, reason: string = "") => {
    setActionError(null);
    setUpdatingId(orderId);
    try {
      const updated = await ordersApi.updateOrderStatus(orderId, targetStatus, reason || `Transitioned to ${targetStatus}`);
      setOrders(prev => prev.map(o => o.id === orderId ? {
        ...o,
        status: updated.status,
      } : o));
    } catch (err: any) {
      setActionError(err?.message || `Failed to transition order status to ${targetStatus}`);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleOpenInvoiceModal = async (orderId: number) => {
    try {
      const detail = await ordersApi.getOrderDetail(orderId);
      setSelectedInvoiceOrder(detail);
    } catch (err: any) {
      alert(err?.message || "Failed to load order invoice details.");
    }
  };

  const getFsmActions = (status: OrderStatus, orderId: number) => {
    switch (status) {
      case "PENDING":
        return (
          <div className="flex gap-2">
            <button
              onClick={() => handleStatusTransition(orderId, "CONFIRMED", "Payment received & confirmed")}
              disabled={updatingId === orderId}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors"
            >
              <CheckCircle2 className="w-3.5 h-3.5" /> Confirm
            </button>
            <button
              onClick={() => handleStatusTransition(orderId, "CANCELLED", "Cancelled by admin")}
              disabled={updatingId === orderId}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-semibold rounded-lg transition-colors"
            >
              <XCircle className="w-3.5 h-3.5" /> Cancel
            </button>
          </div>
        );
      case "CONFIRMED":
        return (
          <div className="flex gap-2">
            <button
              onClick={() => handleStatusTransition(orderId, "PACKED", "Order packed in warehouse")}
              disabled={updatingId === orderId}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg transition-colors"
            >
              <Package className="w-3.5 h-3.5" /> Mark Packed
            </button>
            <button
              onClick={() => handleStatusTransition(orderId, "CANCELLED", "Cancelled before packing")}
              disabled={updatingId === orderId}
              className="flex items-center gap-1.5 px-3 py-1.5 border border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        );
      case "PACKED":
        return (
          <button
            onClick={() => handleStatusTransition(orderId, "SHIPPED", trackingInputs[orderId] ? `Shipped: ${trackingInputs[orderId]}` : "Shipped via courier")}
            disabled={updatingId === orderId}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition-colors"
          >
            <Truck className="w-3.5 h-3.5" /> Dispatch / Ship
          </button>
        );
      case "SHIPPED":
        return (
          <button
            onClick={() => handleStatusTransition(orderId, "DELIVERED", "Delivered to customer")}
            disabled={updatingId === orderId}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors"
          >
            <CheckCircle2 className="w-3.5 h-3.5" /> Mark Delivered
          </button>
        );
      case "DELIVERED":
        return (
          <button
            onClick={() => handleStatusTransition(orderId, "RETURN_REQUESTED", "Customer requested return")}
            disabled={updatingId === orderId}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-orange-200 text-orange-700 hover:bg-orange-50 text-xs font-semibold rounded-lg transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Request Return
          </button>
        );
      case "RETURN_REQUESTED":
        return (
          <div className="flex gap-2">
            <button
              onClick={() => handleStatusTransition(orderId, "RETURN_APPROVED", "Return inspected and approved")}
              disabled={updatingId === orderId}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold rounded-lg transition-colors"
            >
              Approve Return
            </button>
            <button
              onClick={() => handleStatusTransition(orderId, "RETURN_REJECTED", "Return rejected due to damage policy")}
              disabled={updatingId === orderId}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-lg transition-colors"
            >
              Reject Return
            </button>
          </div>
        );
      case "RETURN_APPROVED":
        return (
          <button
            onClick={() => handleStatusTransition(orderId, "RETURN_COMPLETED", "Stock received back in warehouse")}
            disabled={updatingId === orderId}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg transition-colors"
          >
            Complete Return
          </button>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0B3A63]">All Orders</h1>
          <p className="text-sm text-slate-500 mt-1">Manage customer fulfillment and 10-state lifecycle transitions.</p>
        </div>
      </div>

      {actionError && (
        <div className="bg-red-50 border border-red-200 text-red-700 p-3.5 rounded-xl text-sm flex items-center justify-between">
          <span>⚠️ {actionError}</span>
          <button onClick={() => setActionError(null)} className="text-red-500 hover:text-red-800 font-bold ml-2">✕</button>
        </div>
      )}

      {/* Header Filters */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col lg:flex-row gap-4">
        <form onSubmit={handleSearchSubmit} className="relative flex-1">
          <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search by Order Number or Customer Name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#0B3A63] text-sm"
          />
        </form>
        <button
          onClick={loadOrders}
          className="px-4 py-2 bg-[#0B3A63] text-white text-sm font-semibold rounded-lg hover:bg-[#1769AA] transition-colors"
        >
          Search
        </button>
      </div>

      {/* Status Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {STATUS_TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`whitespace-nowrap px-4 py-2 rounded-full text-xs font-bold uppercase tracking-wider transition-colors ${
              activeTab === tab
                ? "bg-[#0B3A63] text-white shadow-sm"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            {tab.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Order Cards */}
      <div className="space-y-4">
        {loading ? (
          <div className="space-y-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="animate-pulse bg-white p-6 rounded-xl border border-slate-200 h-32"></div>
            ))}
          </div>
        ) : orders.length === 0 ? (
          <div className="bg-white p-8 rounded-xl border border-slate-200 text-center">
            <p className="text-slate-500">No orders found matching your criteria.</p>
          </div>
        ) : (
          orders.map(order => (
            <div key={order.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-5 flex flex-col md:flex-row justify-between gap-5">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="font-bold text-[#0B3A63] text-lg font-mono">#{order.order_number}</h3>
                    <span className={`inline-flex px-3 py-1 rounded-full text-xs font-bold ${STATUS_COLORS[order.status] || "bg-slate-100 text-slate-700"}`}>
                      {order.status}
                    </span>
                  </div>
                  <p className="text-sm font-medium text-slate-700 mt-1">{order.customer_name} · <span className="text-slate-500 text-xs">{order.customer_email}</span></p>
                  <p className="text-xs text-slate-500 mt-1">{new Date(order.created_at).toLocaleString("en-IN")}</p>
                </div>

                <div className="flex flex-col md:items-end justify-center gap-1">
                  <p className="text-xl font-bold text-[#0B3A63]">₹{Number(order.total_amount).toLocaleString("en-IN")}</p>
                  <p className="text-xs text-slate-500">{order.items_count} items · {order.payment_method} · <span className="text-emerald-700 font-semibold">{order.payment_status}</span></p>
                </div>
              </div>

              <div className="bg-slate-50 px-5 py-3 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-4">
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  {order.status === "PACKED" && (
                    <input
                      type="text"
                      placeholder="AWB / Courier tracking..."
                      value={trackingInputs[order.id] || ""}
                      onChange={(e) => setTrackingInputs({ ...trackingInputs, [order.id]: e.target.value })}
                      className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg outline-none focus:border-[#0B3A63] w-52 bg-white"
                    />
                  )}
                  {getFsmActions(order.status, order.id)}
                </div>

                <div className="flex items-center gap-3 self-end sm:self-auto">
                  <button
                    onClick={() => handleOpenInvoiceModal(order.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 text-[#0B3A63] text-xs font-semibold rounded-lg transition-colors shadow-2xs"
                  >
                    <FileText className="w-3.5 h-3.5" /> View Details / Invoice
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {selectedInvoiceOrder && (
        <InvoiceModal
          order={selectedInvoiceOrder as any}
          onClose={() => setSelectedInvoiceOrder(null)}
        />
      )}
    </div>
  );
}
