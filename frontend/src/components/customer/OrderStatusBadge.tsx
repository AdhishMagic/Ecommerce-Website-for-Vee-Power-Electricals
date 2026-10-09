import React from "react";
import { OrderStatus } from "../../types/api";

interface OrderStatusBadgeProps {
  status: OrderStatus | string;
  size?: "sm" | "md";
}

interface StatusConfig {
  label: string;
  badgeClass: string;
  dotClass: string;
}

const statusConfigs: Record<string, StatusConfig> = {
  PENDING: {
    label: "Pending",
    badgeClass: "bg-amber-50 text-amber-700 border-amber-200/80",
    dotClass: "bg-amber-500",
  },
  CONFIRMED: {
    label: "Confirmed",
    badgeClass: "bg-blue-50 text-blue-700 border-blue-200/80",
    dotClass: "bg-blue-500",
  },
  PACKED: {
    label: "Packed",
    badgeClass: "bg-indigo-50 text-indigo-700 border-indigo-200/80",
    dotClass: "bg-indigo-500",
  },
  SHIPPED: {
    label: "Shipped",
    badgeClass: "bg-sky-50 text-sky-700 border-sky-200/80",
    dotClass: "bg-sky-500",
  },
  DELIVERED: {
    label: "Delivered",
    badgeClass: "bg-emerald-50 text-emerald-700 border-emerald-200/80",
    dotClass: "bg-emerald-500",
  },
  CANCELLED: {
    label: "Cancelled",
    badgeClass: "bg-rose-50 text-rose-700 border-rose-200/80",
    dotClass: "bg-rose-500",
  },
  RETURN_REQUESTED: {
    label: "Return Requested",
    badgeClass: "bg-orange-50 text-orange-700 border-orange-200/80",
    dotClass: "bg-orange-500",
  },
  RETURN_APPROVED: {
    label: "Return Approved",
    badgeClass: "bg-purple-50 text-purple-700 border-purple-200/80",
    dotClass: "bg-purple-500",
  },
  RETURN_REJECTED: {
    label: "Return Rejected",
    badgeClass: "bg-rose-50 text-rose-700 border-rose-200/80",
    dotClass: "bg-rose-500",
  },
  RETURN_COMPLETED: {
    label: "Return Completed",
    badgeClass: "bg-slate-100 text-slate-700 border-slate-300",
    dotClass: "bg-slate-500",
  },
};

export default function OrderStatusBadge({ status, size = "md" }: OrderStatusBadgeProps) {
  const normalizedKey = (status || "").toString().toUpperCase().replace(/\s+/g, "_");
  const config = statusConfigs[normalizedKey] || {
    label: status || "Unknown",
    badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
    dotClass: "bg-slate-400",
  };

  const sizeClasses = size === "sm"
    ? "px-2 py-0.5 text-[11px] gap-1.5"
    : "px-2.5 py-1 text-xs gap-1.5";

  return (
    <span
      className={`inline-flex items-center font-medium border rounded-full ${sizeClasses} ${config.badgeClass} select-none transition-colors`}
      title={`Order status: ${config.label}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${config.dotClass}`} />
      <span className="truncate">{config.label}</span>
    </span>
  );
}
