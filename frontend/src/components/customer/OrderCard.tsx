import React from "react";
import { OrderSummary } from "../../types/api";
import OrderStatusBadge from "./OrderStatusBadge";

interface OrderCardProps {
  order: OrderSummary;
  onViewDetails: (orderId: number) => void;
  isLoadingDetails?: boolean;
}

export default function OrderCard({
  order,
  onViewDetails,
  isLoadingDetails = false,
}: OrderCardProps) {
  const formattedDate = new Date(order.created_at).toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const formattedAmount = Number(order.total_amount).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const isPaid = order.payment_status?.toLowerCase() === "paid";

  return (
    <article
      className="bg-white border border-[#D9E1E8] rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-xs hover:shadow-md transition-all duration-200 card-interactive group"
      aria-labelledby={`order-heading-${order.id}`}
    >
      {/* Top Header: Order #, Date & Status Badge */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-4 border-b border-[#F1F5F9]">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-[#667085] uppercase tracking-wider">
              Order
            </span>
            <span
              id={`order-heading-${order.id}`}
              className="font-mono font-bold text-[#17212B] text-sm sm:text-base tracking-tight truncate select-all"
              title={`Order Number: ${order.order_number}`}
            >
              #{order.order_number}
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-[#667085] mt-1">
            <svg
              className="w-3.5 h-3.5 text-[#667085] shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.8}
                d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z"
              />
            </svg>
            <span>Placed on {formattedDate}</span>
          </div>
        </div>

        <div className="self-start sm:self-center shrink-0">
          <OrderStatusBadge status={order.status} />
        </div>
      </div>

      {/* Middle/Bottom Summary & Action Area */}
      <div className="pt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Order Metrics */}
        <div className="flex flex-wrap items-baseline sm:items-center gap-x-6 gap-y-2">
          {/* Total Amount */}
          <div>
            <span className="text-[11px] font-semibold text-[#667085] uppercase tracking-wider block">
              Total Amount
            </span>
            <p className="text-base sm:text-lg font-bold text-[#0B3A63] tracking-tight">
              ₹{formattedAmount}
            </p>
          </div>

          {/* Items & Payment Method */}
          <div className="border-l border-slate-200 pl-4 sm:pl-6">
            <span className="text-[11px] font-semibold text-[#667085] uppercase tracking-wider block">
              Order Info
            </span>
            <div className="flex items-center gap-2 text-xs text-[#17212B] font-medium mt-0.5">
              <span>
                {order.items_count} {order.items_count === 1 ? "item" : "items"}
              </span>
              {order.payment_method && (
                <>
                  <span className="text-slate-300">·</span>
                  <span className="px-1.5 py-0.5 bg-slate-100 text-[#0B3A63] rounded text-[11px] font-semibold">
                    {order.payment_method}
                  </span>
                </>
              )}
              {order.payment_status && (
                <span
                  className={`text-[11px] font-medium px-1.5 py-0.5 rounded ${
                    isPaid
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-amber-50 text-amber-700"
                  }`}
                >
                  {order.payment_status}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* View Details Action */}
        <div className="self-stretch sm:self-auto shrink-0 pt-2 sm:pt-0">
          <button
            type="button"
            onClick={() => onViewDetails(order.id)}
            disabled={isLoadingDetails}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[#F6F8FA] hover:bg-[#1769AA] text-[#0B3A63] hover:text-white border border-[#D9E1E8] hover:border-[#1769AA] rounded-xl text-xs sm:text-sm font-semibold transition-all duration-200 focus-visible:ring-2 focus-visible:ring-[#1769AA] focus-visible:outline-none disabled:opacity-60 cursor-pointer shadow-2xs group-hover:border-[#1769AA]/40"
          >
            <span>{isLoadingDetails ? "Loading..." : "View Details"}</span>
            <svg
              className="w-4 h-4 text-[#1769AA] group-hover:text-white group-hover:translate-x-0.5 transition-all duration-200"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5l7 7-7 7"
              />
            </svg>
          </button>
        </div>
      </div>
    </article>
  );
}
