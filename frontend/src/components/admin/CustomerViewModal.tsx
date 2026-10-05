import { useState, useEffect } from "react";
import { 
  X, User, Mail, Phone, Calendar, ShieldCheck, ShieldAlert, 
  MapPin, ShoppingCart, IndianRupee, Clock, CheckCircle2, 
  XCircle, Truck, Package, RotateCcw, AlertTriangle, Loader2,
  ExternalLink, Edit, Ban
} from "lucide-react";
import { Link } from "react-router-dom";
import { customersApi } from "../../api/customers";
import { CustomerDetail, OrderStatus } from "../../types/api";

interface CustomerViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  customerId: number | string | null;
  onCustomerUpdated: () => void;
  onEditRequested: (customer: CustomerDetail) => void;
}

const statusBadgeClasses: Record<OrderStatus | string, string> = {
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
};

export default function CustomerViewModal({
  isOpen,
  onClose,
  customerId,
  onCustomerUpdated,
  onEditRequested,
}: CustomerViewModalProps) {
  const [customer, setCustomer] = useState<CustomerDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'addresses' | 'orders'>('overview');
  const [actionLoading, setActionLoading] = useState(false);
  const [showDeactivateConfirm, setShowDeactivateConfirm] = useState(false);

  useEffect(() => {
    if (isOpen && customerId) {
      loadCustomer(customerId);
    } else {
      setCustomer(null);
      setError(null);
      setActiveTab('overview');
      setShowDeactivateConfirm(false);
    }
  }, [isOpen, customerId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !actionLoading) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, actionLoading, onClose]);

  const loadCustomer = async (id: number | string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await customersApi.getCustomerDetail(id);
      setCustomer(data);
    } catch (err: any) {
      console.error("Failed to load customer detail:", err);
      setError(err?.message || "Failed to load customer profile from server.");
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!customer) return;
    setActionLoading(true);
    try {
      const updated = await customersApi.toggleCustomerStatus(customer.id, !customer.is_active);
      setCustomer(updated);
      onCustomerUpdated();
    } catch (err: any) {
      alert(err?.message || "Failed to toggle customer status.");
    } finally {
      setActionLoading(false);
    }
  };

  const handleSafeDelete = async () => {
    if (!customer) return;
    setActionLoading(true);
    try {
      const res = await customersApi.deleteCustomer(customer.id);
      alert(res.message || "Customer account processed successfully.");
      onCustomerUpdated();
      onClose();
    } catch (err: any) {
      alert(err?.message || "Failed to remove customer.");
    } finally {
      setActionLoading(false);
      setShowDeactivateConfirm(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div 
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] overflow-y-auto flex flex-col relative animate-in fade-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
        aria-labelledby="customer-detail-title"
      >
        {/* Header */}
        <div className="sticky top-0 bg-[#0B3A63] text-white p-6 flex justify-between items-start z-10 rounded-t-2xl">
          <div className="flex items-start gap-4">
            <div className="w-13 h-13 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-xl font-bold text-white shadow-inner">
              {customer?.first_name ? customer.first_name[0].toUpperCase() : "C"}
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h2 id="customer-detail-title" className="text-xl font-bold text-white">
                  {loading ? "Loading customer..." : customer?.name || "Customer Profile"}
                </h2>
                {customer && (
                  <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                    customer.is_active 
                      ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" 
                      : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                  }`}>
                    {customer.is_active ? <ShieldCheck className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}
                    {customer.is_active ? "Active" : "Inactive"}
                  </span>
                )}
                {customer?.customer_type && (
                  <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                    customer.customer_type === 'B2B'
                      ? "bg-[#F2A900]/20 text-[#F2A900] border border-[#F2A900]/40"
                      : "bg-blue-400/20 text-blue-200 border border-blue-400/30"
                  }`}>
                    {customer.customer_type}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-slate-300">
                <span>ID: <strong className="text-white font-mono">{customer?.customer_id || "—"}</strong></span>
                <span>•</span>
                <span>{customer?.email}</span>
                {customer?.phone && (
                  <>
                    <span>•</span>
                    <span>{customer.phone}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {customer && (
              <button
                type="button"
                onClick={() => onEditRequested(customer)}
                className="p-2 text-white/80 hover:bg-white/10 hover:text-white rounded-lg transition-colors text-xs font-semibold flex items-center gap-1.5"
                title="Edit Customer"
              >
                <Edit className="w-4 h-4" />
                <span className="hidden sm:inline">Edit</span>
              </button>
            )}
            <button
              onClick={onClose}
              type="button"
              className="p-2 text-white/70 hover:bg-white/10 hover:text-white rounded-lg transition-colors"
              aria-label="Close modal"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="bg-slate-100 border-b border-slate-200 px-6 flex items-center gap-6 text-sm font-semibold text-slate-600">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`py-3.5 border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'overview'
                ? "border-[#0B3A63] text-[#0B3A63] font-bold"
                : "border-transparent hover:text-slate-900"
            }`}
          >
            <User className="w-4 h-4" /> Overview & Ledger
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('addresses')}
            className={`py-3.5 border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'addresses'
                ? "border-[#0B3A63] text-[#0B3A63] font-bold"
                : "border-transparent hover:text-slate-900"
            }`}
          >
            <MapPin className="w-4 h-4" /> Saved Addresses ({customer?.addresses?.length || 0})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('orders')}
            className={`py-3.5 border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'orders'
                ? "border-[#0B3A63] text-[#0B3A63] font-bold"
                : "border-transparent hover:text-slate-900"
            }`}
          >
            <ShoppingCart className="w-4 h-4" /> Orders History ({customer?.order_summary?.total_orders || 0})
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto space-y-6">
          {loading && (
            <div className="py-16 text-center text-slate-400 flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 animate-spin text-[#0B3A63]" />
              <p className="text-sm font-medium">Fetching real-time customer data from database...</p>
            </div>
          )}

          {error && (
            <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl flex items-center gap-3 text-sm">
              <AlertTriangle className="w-5 h-5 shrink-0 text-rose-600" />
              <div className="flex-1">
                <p className="font-semibold">Unable to load customer profile</p>
                <p className="text-xs text-rose-600 mt-0.5">{error}</p>
              </div>
              <button
                type="button"
                onClick={() => customerId && loadCustomer(customerId)}
                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold"
              >
                Retry
              </button>
            </div>
          )}

          {!loading && customer && activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Top KPI row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <span className="text-xs font-medium text-slate-500 uppercase tracking-wider block">Total Spent</span>
                  <span className="text-xl font-bold text-[#0B3A63] mt-1 block">
                    ₹{Number(customer.order_summary?.total_spent || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </span>
                  <span className="text-[11px] text-slate-400 mt-1 block">Non-cancelled orders</span>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <span className="text-xs font-medium text-slate-500 uppercase tracking-wider block">Outstanding</span>
                  <span className={`text-xl font-bold mt-1 block ${
                    Number(customer.financial_summary?.outstanding_amount || 0) > 0 ? "text-amber-600" : "text-emerald-600"
                  }`}>
                    ₹{Number(customer.financial_summary?.outstanding_amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                  </span>
                  <span className="text-[11px] text-slate-400 mt-1 block">Pending settlement</span>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <span className="text-xs font-medium text-slate-500 uppercase tracking-wider block">Total Orders</span>
                  <span className="text-xl font-bold text-slate-800 mt-1 block">
                    {customer.order_summary?.total_orders ?? 0}
                  </span>
                  <span className="text-[11px] text-slate-400 mt-1 block">
                    {customer.order_summary?.completed_orders ?? 0} delivered
                  </span>
                </div>

                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <span className="text-xs font-medium text-slate-500 uppercase tracking-wider block">Invoices</span>
                  <span className="text-xl font-bold text-slate-800 mt-1 block">
                    {customer.financial_summary?.invoice_count ?? 0}
                  </span>
                  <span className="text-[11px] text-slate-400 mt-1 block">
                    ₹{Number(customer.financial_summary?.total_invoiced || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })} invoiced
                  </span>
                </div>
              </div>

              {/* Order Status Breakdown */}
              <div className="bg-white border border-[#D9E1E8] rounded-xl p-5 shadow-xs">
                <h3 className="text-sm font-bold text-[#0B3A63] mb-4 flex items-center gap-2">
                  <Package className="w-4 h-4" /> Order Fulfillment Status
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  <div className="p-3 bg-amber-50 rounded-lg border border-amber-200/60">
                    <span className="text-xs font-semibold text-amber-700 block">Pending / Processing</span>
                    <span className="text-lg font-bold text-amber-900 mt-1 block">{customer.order_summary?.pending_orders ?? 0}</span>
                  </div>
                  <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200/60">
                    <span className="text-xs font-semibold text-emerald-700 block">Delivered</span>
                    <span className="text-lg font-bold text-emerald-900 mt-1 block">{customer.order_summary?.completed_orders ?? 0}</span>
                  </div>
                  <div className="p-3 bg-red-50 rounded-lg border border-red-200/60">
                    <span className="text-xs font-semibold text-red-700 block">Cancelled</span>
                    <span className="text-lg font-bold text-red-900 mt-1 block">{customer.order_summary?.cancelled_orders ?? 0}</span>
                  </div>
                  <div className="p-3 bg-orange-50 rounded-lg border border-orange-200/60">
                    <span className="text-xs font-semibold text-orange-700 block">Returns</span>
                    <span className="text-lg font-bold text-orange-900 mt-1 block">{customer.order_summary?.returned_orders ?? 0}</span>
                  </div>
                </div>
              </div>

              {/* Recent Orders List Preview */}
              <div className="bg-white border border-[#D9E1E8] rounded-xl p-5 shadow-xs">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-sm font-bold text-[#0B3A63] flex items-center gap-2">
                    <Clock className="w-4 h-4" /> Recent Order Activity
                  </h3>
                  <button
                    type="button"
                    onClick={() => setActiveTab('orders')}
                    className="text-xs font-semibold text-[#0B3A63] hover:underline"
                  >
                    View All ({customer.order_summary?.total_orders ?? 0})
                  </button>
                </div>

                {customer.recent_orders && customer.recent_orders.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold uppercase tracking-wider">
                          <th className="py-2.5 px-3">Order Number</th>
                          <th className="py-2.5 px-3">Date</th>
                          <th className="py-2.5 px-3">Items</th>
                          <th className="py-2.5 px-3">Status</th>
                          <th className="py-2.5 px-3">Payment</th>
                          <th className="py-2.5 px-3 text-right">Amount</th>
                          <th className="py-2.5 px-3 text-center">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {customer.recent_orders.slice(0, 5).map(ord => (
                          <tr key={ord.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-2.5 px-3 font-mono font-medium text-[#0B3A63]">{ord.order_number}</td>
                            <td className="py-2.5 px-3 text-slate-500">
                              {new Date(ord.created_at).toLocaleDateString("en-IN", {
                                year: "numeric",
                                month: "short",
                                day: "numeric",
                              })}
                            </td>
                            <td className="py-2.5 px-3 text-slate-600">{ord.items_count} item{ord.items_count === 1 ? '' : 's'}</td>
                            <td className="py-2.5 px-3">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                statusBadgeClasses[ord.status] || "bg-slate-100 text-slate-700"
                              }`}>
                                {ord.status}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-slate-600">
                              <span className={`font-semibold ${
                                ord.payment_status === 'Paid' ? 'text-emerald-600' : 'text-amber-600'
                              }`}>
                                {ord.payment_status}
                              </span> ({ord.payment_method})
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                              ₹{Number(ord.total_amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <Link
                                to="/admin/orders"
                                onClick={onClose}
                                className="inline-flex items-center gap-1 text-[#0B3A63] hover:underline font-semibold"
                              >
                                View <ExternalLink className="w-3 h-3" />
                              </Link>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 text-center py-6">No order activity recorded yet.</p>
                )}
              </div>

              {/* Account Metadata */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs text-slate-500 flex flex-wrap justify-between items-center gap-4">
                <div>
                  <span>Registered: </span>
                  <strong className="text-slate-700">
                    {customer.created_at ? new Date(customer.created_at).toLocaleString("en-IN") : "—"}
                  </strong>
                </div>
                {customer.last_login && (
                  <div>
                    <span>Last Login: </span>
                    <strong className="text-slate-700">
                      {new Date(customer.last_login).toLocaleString("en-IN")}
                    </strong>
                  </div>
                )}
                <div>
                  <span>Security Role: </span>
                  <strong className="capitalize text-slate-700">{customer.role}</strong>
                </div>
              </div>
            </div>
          )}

          {!loading && customer && activeTab === 'addresses' && (
            <div className="space-y-4">
              {customer.addresses && customer.addresses.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {customer.addresses.map((addr, idx) => (
                    <div 
                      key={addr.id || idx}
                      className={`p-4 rounded-xl border ${
                        addr.is_default 
                          ? "border-[#0B3A63] bg-blue-50/20 shadow-xs" 
                          : "border-slate-200 bg-white"
                      }`}
                    >
                      <div className="flex justify-between items-start gap-2 mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-sm text-[#0B3A63]">{addr.recipient_name}</span>
                          <span className="capitalize px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[11px] font-medium">
                            {addr.address_type}
                          </span>
                        </div>
                        {addr.is_default && (
                          <span className="px-2 py-0.5 bg-[#0B3A63] text-white rounded text-[10px] font-bold">
                            Default Address
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-600 space-y-0.5">
                        <span className="block">{addr.address_line1}</span>
                        {addr.address_line2 && <span className="block">{addr.address_line2}</span>}
                        {addr.landmark && <span className="block text-slate-400">Landmark: {addr.landmark}</span>}
                        <span className="block font-medium text-slate-700">
                          {addr.city}, {addr.state} — {addr.pincode}
                        </span>
                      </p>
                      {addr.phone && (
                        <p className="text-xs text-slate-500 mt-2 flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-slate-400" /> {addr.phone}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12 bg-slate-50 rounded-xl border border-slate-200">
                  <MapPin className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-medium text-slate-600">No saved addresses</p>
                  <p className="text-xs text-slate-400 mt-1">This customer has not saved any shipping or billing addresses yet.</p>
                </div>
              )}
            </div>
          )}

          {!loading && customer && activeTab === 'orders' && (
            <div className="space-y-4">
              {customer.recent_orders && customer.recent_orders.length > 0 ? (
                <div className="overflow-x-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-slate-600 font-semibold uppercase tracking-wider">
                        <th className="py-3 px-4">Order ID</th>
                        <th className="py-3 px-4">Order Date</th>
                        <th className="py-3 px-4">Items</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">Payment</th>
                        <th className="py-3 px-4 text-right">Order Amount</th>
                        <th className="py-3 px-4 text-center">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {customer.recent_orders.map(ord => (
                        <tr key={ord.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4 font-mono font-medium text-[#0B3A63]">{ord.order_number}</td>
                          <td className="py-3 px-4 text-slate-600">
                            {new Date(ord.created_at).toLocaleString("en-IN", {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit"
                            })}
                          </td>
                          <td className="py-3 px-4 text-slate-600 font-medium">
                            {ord.items_count} item{ord.items_count === 1 ? '' : 's'}
                          </td>
                          <td className="py-3 px-4">
                            <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                              statusBadgeClasses[ord.status] || "bg-slate-100 text-slate-700"
                            }`}>
                              {ord.status}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-slate-600">
                            <span className={`font-semibold ${
                              ord.payment_status === 'Paid' ? 'text-emerald-600' : 'text-amber-600'
                            }`}>
                              {ord.payment_status}
                            </span> <span className="text-slate-400 text-[11px]">({ord.payment_method})</span>
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-slate-900">
                            ₹{Number(ord.total_amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <Link
                              to="/admin/orders"
                              onClick={onClose}
                              className="inline-flex items-center gap-1 text-[#0B3A63] hover:underline font-semibold"
                            >
                              Manage <ExternalLink className="w-3 h-3" />
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-12 bg-slate-50 rounded-xl border border-slate-200">
                  <ShoppingCart className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm font-medium text-slate-600">No orders placed</p>
                  <p className="text-xs text-slate-400 mt-1">This customer has not completed any retail or commercial purchases yet.</p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {customer && (
          <div className="sticky bottom-0 bg-white border-t border-slate-200 p-4 px-6 flex flex-wrap justify-between items-center gap-4 rounded-b-2xl">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleToggleStatus}
                disabled={actionLoading}
                className={`px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors flex items-center gap-1.5 ${
                  customer.is_active
                    ? "border-amber-300 text-amber-700 hover:bg-amber-50"
                    : "border-emerald-300 text-emerald-700 hover:bg-emerald-50"
                }`}
              >
                {actionLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : customer.is_active ? (
                  <Ban className="w-3.5 h-3.5" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5" />
                )}
                {customer.is_active ? "Suspend / Deactivate" : "Activate Account"}
              </button>

              {!showDeactivateConfirm ? (
                <button
                  type="button"
                  onClick={() => setShowDeactivateConfirm(true)}
                  disabled={actionLoading}
                  className="px-3 py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                >
                  Delete / Purge
                </button>
              ) : (
                <div className="flex items-center gap-2 p-1.5 bg-rose-50 border border-rose-200 rounded-lg text-xs">
                  <span className="text-rose-700 font-medium">Safe deactivation policy applies. Proceed?</span>
                  <button
                    type="button"
                    onClick={handleSafeDelete}
                    disabled={actionLoading}
                    className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded font-bold"
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowDeactivateConfirm(false)}
                    className="px-2 py-1 text-slate-600 hover:text-slate-900"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
