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
    badgeClass: "bg-amber-50 text-amber-800 border-amber-200/80",
    dotClass: "bg-amber-500",
  },
  PROCESSING: {
    label: "Processing",
    badgeClass: "bg-amber-50 text-amber-800 border-amber-200/80",
    dotClass: "bg-amber-500",
  },
  CONFIRMED: {
    label: "Confirmed",
    badgeClass: "bg-blue-50 text-blue-800 border-blue-200/80",
    dotClass: "bg-blue-500",
  },
  PACKED: {
    label: "Packed",
    badgeClass: "bg-indigo-50 text-indigo-800 border-indigo-200/80",
    dotClass: "bg-indigo-500",
  },
  SHIPPED: {
    label: "Shipped",
    badgeClass: "bg-sky-50 text-sky-800 border-sky-200/80",
    dotClass: "bg-sky-500",
  },
  DELIVERED: {
    label: "Delivered",
    badgeClass: "bg-emerald-50 text-emerald-800 border-emerald-200/80",
    dotClass: "bg-emerald-500",
  },
  CANCELLED: {
    label: "Cancelled",
    badgeClass: "bg-rose-50 text-rose-800 border-rose-200/80",
    dotClass: "bg-rose-500",
  },
  REFUNDED: {
    label: "Refunded",
    badgeClass: "bg-purple-50 text-purple-800 border-purple-200/80",
    dotClass: "bg-purple-500",
  },
  RETURN_REQUESTED: {
    label: "Return Requested",
    badgeClass: "bg-orange-50 text-orange-800 border-orange-200/80",
    dotClass: "bg-orange-500",
  },
  RETURN_APPROVED: {
    label: "Return Approved",
    badgeClass: "bg-purple-50 text-purple-800 border-purple-200/80",
    dotClass: "bg-purple-500",
  },
  RETURN_REJECTED: {
    label: "Return Rejected",
    badgeClass: "bg-rose-50 text-rose-800 border-rose-200/80",
    dotClass: "bg-rose-500",
  },
  RETURN_COMPLETED: {
    label: "Return Completed",
    badgeClass: "bg-slate-100 text-slate-700 border-slate-300",
    dotClass: "bg-slate-500",
  },
};

export default function OrderStatusBadge({ status, size = "md" }: OrderStatusBadgeProps) {
  const rawStatus = (status || "").toString();
  const normalizedKey = rawStatus.toUpperCase().replace(/\s+/g, "_");
  
  // Pretty-print fallback label if not directly in statusConfigs dictionary
  const fallbackLabel = rawStatus
    ? rawStatus
        .replace(/_/g, " ")
        .toLowerCase()
        .replace(/\b\w/g, (char) => char.toUpperCase())
    : "Unknown";

  const config = statusConfigs[normalizedKey] || {
    label: fallbackLabel,
    badgeClass: "bg-slate-100 text-slate-700 border-slate-200",
    dotClass: "bg-slate-400",
  };

  const sizeClasses = size === "sm"
    ? "px-2 py-0.5 text-[11px] gap-1.5"
    : "px-2.5 py-1 text-xs gap-1.5";

  return (
    <span
      className={`inline-flex items-center font-medium border rounded-full ${sizeClasses} ${config.badgeClass} select-none transition-colors duration-150`}
      title={`Order status: ${config.label}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${config.dotClass}`} />
      <span className="truncate max-w-[140px] sm:max-w-none">{config.label}</span>
    </span>
  );
}
