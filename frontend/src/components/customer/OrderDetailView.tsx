import React from "react";
import { OrderDetailData } from "../../types/api";
import { resolveProductImage, handleProductImageError } from "../../utils/productImageResolver";
import OrderStatusBadge from "./OrderStatusBadge";

interface OrderDetailViewProps {
  order: OrderDetailData;
  onBack: () => void;
  onCancelOrder: (orderId: number) => void;
  onRequestReturn: (orderId: number) => void;
  actionLoading: boolean;
  actionError: string;
}

export default function OrderDetailView({
  order,
  onBack,
  onCancelOrder,
  onRequestReturn,
  actionLoading,
  actionError,
}: OrderDetailViewProps) {
  const shipping = order.shipping_address || {};
  const formattedDate = new Date(order.created_at).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  const normStatus = (order.status || "").toUpperCase();

  const canCancel = ["PENDING", "CONFIRMED", "PACKED"].includes(normStatus);
  const canReturn = ["DELIVERED"].includes(normStatus);

  const gstTotal =
    Number(order.cgst_amount || 0) +
    Number(order.sgst_amount || 0) +
    Number(order.igst_amount || 0);

  return (
    <div className="w-full space-y-6 min-w-0 animate-dashboard-card">
      {/* Navigation & Title Bar */}
      <div className="flex items-center justify-between gap-3">
        <button
          type="button"
          onClick={onBack}
          className="inline-flex items-center gap-2 text-xs sm:text-sm font-semibold text-[#0B3A63] hover:text-[#1769AA] px-3 py-1.5 rounded-lg bg-white sm:bg-transparent hover:bg-white transition-all duration-150 border border-[#D9E1E8] sm:border-transparent hover:border-[#D9E1E8] outline-none focus-visible:ring-2 focus-visible:ring-[#1769AA] shadow-2xs sm:shadow-none cursor-pointer"
        >
          <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          <span>Back to All Orders</span>
        </button>
      </div>

      {/* Main Order Card */}
      <div className="bg-white border border-[#D9E1E8] rounded-2xl p-4 sm:p-7 shadow-xs min-w-0">
        {/* Header Block */}
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-5 border-b border-[#F1F5F9] min-w-0">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <span className="text-xs font-semibold text-[#667085] uppercase tracking-wider">
                Order Details
              </span>
              <h2
                className="text-lg sm:text-xl font-bold text-[#0B3A63] font-mono select-all truncate max-w-full"
                style={{ fontFamily: "JetBrains Mono, monospace" }}
              >
                #{order.order_number}
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-[#667085] mt-1">
              Placed on {formattedDate}
            </p>
          </div>
          <div className="shrink-0 self-start sm:self-auto">
            <OrderStatusBadge status={order.status} size="md" />
          </div>
        </div>

        {/* Timeline / Audit Trail (if available) */}
        {order.status_history && order.status_history.length > 0 && (
          <div className="my-6 p-4 sm:p-5 bg-[#F8FAFC] rounded-xl border border-slate-200/80">
            <h3 className="font-bold text-[#0B3A63] mb-3 text-xs uppercase tracking-wider">
              Status History & Timeline
            </h3>
            <div className="space-y-3">
              {order.status_history.map((event, i) => (
                <div key={event.id || i} className="flex items-start gap-3 min-w-0">
                  <div className="w-5 h-5 rounded-full bg-[#12773D] text-white flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div className="flex-1 text-xs sm:text-sm min-w-0">
                    <p className="font-semibold text-[#17212B]">
                      {event.new_status}{" "}
                      <span className="font-normal text-xs text-[#667085]">
                        ({new Date(event.created_at).toLocaleString("en-IN")})
                      </span>
                    </p>
                    {event.reason && (
                      <p className="text-xs text-[#667085] mt-0.5 bg-white p-2 rounded border border-slate-100">
                        Reason: {event.reason}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Items Ordered List */}
        <div className="my-6 min-w-0">
          <h3 className="font-bold text-[#0B3A63] text-xs sm:text-sm uppercase tracking-wider mb-4">
            Items Ordered ({order.items?.length || 0})
          </h3>
          <div className="divide-y divide-[#F1F5F9]">
            {order.items?.map((item, i) => (
              <div
                key={item.id || i}
                className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 min-w-0"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <img
                    src={resolveProductImage(item.image_url)}
                    alt={item.product_name}
                    className="w-14 h-14 object-contain p-1 rounded-xl bg-[#F8FAFC] border border-[#E2E8F0] shrink-0"
                    onError={(e) => handleProductImageError(e)}
                  />
                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm font-semibold text-[#17212B] line-clamp-2">
                      {item.product_name}
                    </p>
                    <p className="text-xs text-[#667085] mt-0.5">
                      SKU: <span className="font-mono">{item.sku}</span> · Qty: {item.quantity} × ₹
                      {Number(item.unit_price).toLocaleString("en-IN", {
                        minimumFractionDigits: 2,
                      })}
                    </p>
                  </div>
                </div>
                <div className="sm:text-right shrink-0">
                  <span className="text-xs text-[#667085] block sm:hidden">Total: </span>
                  <p className="font-bold text-[#0B3A63] text-sm sm:text-base">
                    ₹
                    {Number(item.total_amount).toLocaleString("en-IN", {
                      minimumFractionDigits: 2,
                    })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Delivery & Financial Summary Split */}
        <div className="grid md:grid-cols-2 gap-5 pt-4 border-t border-[#F1F5F9] min-w-0">
          {/* Shipping Address */}
          <div className="bg-[#F8FAFC] rounded-xl p-4 sm:p-5 border border-slate-200/80 min-w-0">
            <h4 className="font-bold text-[#0B3A63] mb-3 text-xs uppercase tracking-wider flex items-center gap-2">
              <svg className="w-4 h-4 text-[#1769AA] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              <span>Delivery Address</span>
            </h4>
            <div className="space-y-1 text-xs sm:text-sm text-[#667085] leading-relaxed min-w-0">
              <p className="font-bold text-[#17212B] text-sm">
                {shipping.recipient_name || order.customer_name}
              </p>
              <p className="break-words">{shipping.address_line1 || shipping.address}</p>
              {shipping.address_line2 && <p className="break-words">{shipping.address_line2}</p>}
              <p>
                {shipping.city || ""}, {shipping.state || ""} - {shipping.pincode || ""}
              </p>
              <p className="text-[#1769AA] font-medium pt-1">
                📞 {shipping.phone || order.customer_phone || "Not specified"}
              </p>
            </div>
          </div>

          {/* Payment & Price Summary */}
          <div className="bg-[#F8FAFC] rounded-xl p-4 sm:p-5 border border-slate-200/80 space-y-2 text-xs sm:text-sm min-w-0">
            <h4 className="font-bold text-[#0B3A63] mb-3 text-xs uppercase tracking-wider flex items-center gap-2">
              <svg className="w-4 h-4 text-[#1769AA] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l4-2 4 2 4-2 4 2z" />
              </svg>
              <span>Price Summary</span>
            </h4>
            <div className="flex justify-between text-[#667085]">
              <span>Subtotal:</span>
              <span className="font-medium text-[#17212B]">
                ₹{Number(order.subtotal).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
            </div>
            {Number(order.total_discount) > 0 && (
              <div className="flex justify-between text-[#12773D]">
                <span>Discount:</span>
                <span className="font-medium">
                  −₹{Number(order.total_discount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}
            <div className="flex justify-between text-[#667085]">
              <span>Delivery Fee:</span>
              <span className="font-medium text-[#17212B]">
                ₹{Number(order.shipping_fee).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
            </div>
            {gstTotal > 0 && (
              <div className="flex justify-between text-[#667085]">
                <span>Applicable GST:</span>
                <span className="font-medium text-[#17212B]">
                  ₹{gstTotal.toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                </span>
              </div>
            )}
            <div className="flex justify-between text-sm sm:text-base font-bold text-[#0B3A63] pt-2 border-t border-slate-200">
              <span>Total Amount:</span>
              <span className="text-[#1769AA]">
                ₹{Number(order.total_amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
              </span>
            </div>
            <div className="pt-2 text-xs text-[#667085] flex items-center justify-between border-t border-slate-200 flex-wrap gap-1">
              <span>Payment Method: {order.payment_method || "N/A"}</span>
              <span className="font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/60">
                {order.payment_status || "Pending"}
              </span>
            </div>
          </div>
        </div>

        {/* Action Error Alerts */}
        {actionError && (
          <div className="mt-5 p-3.5 bg-red-50 text-red-700 text-xs sm:text-sm rounded-xl border border-red-200 flex items-center gap-2">
            <svg className="w-4 h-4 shrink-0 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{actionError}</span>
          </div>
        )}

        {/* Action Buttons & Order Status Notices */}
        <div className="mt-6 pt-5 border-t border-[#F1F5F9] flex flex-col sm:flex-row sm:items-center justify-between gap-4 min-w-0">
          <div className="text-xs min-w-0">
            {normStatus === "CANCELLED" && (
              <p className="text-red-600 font-medium">This order was cancelled. Stock has been returned to inventory.</p>
            )}
            {normStatus === "RETURN_REQUESTED" && (
              <p className="text-orange-600 font-medium">Return request submitted and pending warehouse review.</p>
            )}
            {normStatus === "RETURN_APPROVED" && (
              <p className="text-purple-600 font-medium">Return approved. Please dispatch items for inspection.</p>
            )}
            {normStatus === "RETURN_REJECTED" && (
              <p className="text-rose-600 font-medium">Return request rejected.</p>
            )}
            {normStatus === "RETURN_COMPLETED" && (
              <p className="text-slate-600 font-medium">Return completed and merchandise restocked.</p>
            )}
          </div>

          <div className="flex items-center gap-3 self-end sm:self-auto shrink-0">
            {canCancel && (
              <button
                type="button"
                onClick={() => onCancelOrder(order.id)}
                disabled={actionLoading}
                className="px-4 py-2 text-xs font-semibold text-red-600 border border-red-200 rounded-xl hover:bg-red-50 disabled:opacity-50 transition-colors focus-visible:ring-2 focus-visible:ring-red-500 cursor-pointer outline-none shadow-2xs"
              >
                {actionLoading ? "Processing..." : "Cancel Order"}
              </button>
            )}

            {canReturn && (
              <button
                type="button"
                onClick={() => onRequestReturn(order.id)}
                disabled={actionLoading}
                className="px-4 py-2 text-xs font-semibold text-orange-700 border border-orange-300 rounded-xl hover:bg-orange-50 disabled:opacity-50 transition-colors focus-visible:ring-2 focus-visible:ring-orange-500 cursor-pointer outline-none shadow-2xs"
              >
                {actionLoading ? "Processing..." : "Request Return"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
