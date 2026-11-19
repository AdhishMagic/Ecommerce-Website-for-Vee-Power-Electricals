import React, { useState, useEffect, useId } from "react";
import { AlertCircle, AlertTriangle, CheckCircle2, Loader2, X } from "lucide-react";
import { OrderDetailData, OrderSummary } from "../../types/api";

export interface OrderCancellationModalProps {
  isOpen: boolean;
  order: OrderDetailData | OrderSummary | null;
  onClose: () => void;
  onConfirm: (reason: string, reasonCode: string, reasonNotes?: string) => Promise<void>;
  isSubmitting: boolean;
  error?: string | null;
}

export const CANCELLATION_REASONS = [
  { code: "ordered_by_mistake", label: "Ordered by mistake" },
  { code: "better_price", label: "Found a better price elsewhere" },
  { code: "delivery_delay", label: "Delivery taking too long" },
  { code: "incorrect_products", label: "Ordered incorrect products" },
  { code: "changed_mind", label: "Changed my mind" },
  { code: "other", label: "Other" },
] as const;

export type CancellationReasonCode = typeof CANCELLATION_REASONS[number]["code"];

export default function OrderCancellationModal({
  isOpen,
  order,
  onClose,
  onConfirm,
  isSubmitting,
  error,
}: OrderCancellationModalProps) {
  const [selectedReasonCode, setSelectedReasonCode] = useState<CancellationReasonCode>("ordered_by_mistake");
  const [reasonNotes, setReasonNotes] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const titleId = useId();
  const descId = useId();

  // Reset form when modal opens with a new order
  useEffect(() => {
    if (isOpen) {
      setSelectedReasonCode("ordered_by_mistake");
      setReasonNotes("");
      setLocalError(null);
    }
  }, [isOpen, order?.id]);

  // Lock background scroll when modal is open
  useEffect(() => {
    if (!isOpen) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen]);

  // Handle ESC key to close modal without cancelling
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isSubmitting) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen || !order) {
    return null;
  }

  const itemsCount =
    (order as OrderSummary).items_count ||
    (order as OrderDetailData).items?.length ||
    1;

  const formattedTotal = Number(order.total_amount || 0).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const isOnlinePaid =
    order.payment_status === "Paid" ||
    (!order.is_cod && Number(order.amount_paid || 0) > 0);

  const isAdvanceCod =
    order.is_cod && Number(order.cod_advance_amount || order.amount_paid || 0) > 0;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // Only close if user clicked directly on the outer backdrop, not inside modal
    if (e.target === e.currentTarget && !isSubmitting) {
      onClose();
    }
  };

  const handleConfirmSubmit = async () => {
    if (isSubmitting) return;

    const selectedOption = CANCELLATION_REASONS.find(
      (r) => r.code === selectedReasonCode
    );
    const baseLabel = selectedOption?.label || "Cancelled by customer";

    let finalReason = baseLabel;
    if (selectedReasonCode === "other") {
      if (reasonNotes.trim().length > 0) {
        finalReason = `Other: ${reasonNotes.trim()}`;
      } else {
        finalReason = "Other";
      }
    } else if (reasonNotes.trim().length > 0) {
      finalReason = `${baseLabel} (${reasonNotes.trim()})`;
    }

    setLocalError(null);
    try {
      await onConfirm(finalReason, selectedReasonCode, reasonNotes.trim() || undefined);
    } catch (err: any) {
      setLocalError(err?.message || "Failed to cancel order. Please try again.");
    }
  };

  const displayError = error || localError;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      onClick={handleBackdropClick}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-slate-900/60 backdrop-blur-xs transition-opacity duration-200 overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden transform transition-all duration-200 my-8 flex flex-col max-h-[90vh]"
      >
        {/* Modal Header */}
        <div className="p-5 sm:p-6 pb-4 border-b border-slate-100 flex items-start justify-between gap-4 shrink-0 bg-slate-50/50">
          <div className="flex items-start gap-3.5">
            <div className="w-10 h-10 rounded-full bg-red-100 text-red-600 flex items-center justify-center shrink-0 border border-red-200 shadow-2xs">
              <AlertTriangle className="w-5 h-5" aria-hidden="true" />
            </div>
            <div>
              <h2
                id={titleId}
                className="text-lg sm:text-xl font-bold text-[#0B3A63] tracking-tight"
                style={{ fontFamily: "Outfit, sans-serif" }}
              >
                Cancel Your Order?
              </h2>
              <p
                id={descId}
                className="text-xs sm:text-sm text-[#667085] mt-1"
              >
                Are you sure you want to cancel this order? This action may not be reversible.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            aria-label="Close modal"
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#1769AA]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body / Scrollable Area */}
        <div className="p-5 sm:p-6 space-y-5 overflow-y-auto min-w-0">
          {/* Order Details Preview Box */}
          <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-4 text-xs sm:text-sm">
            <div className="grid grid-cols-2 gap-3 sm:gap-4">
              <div>
                <span className="text-[11px] font-semibold text-[#667085] uppercase tracking-wider block">
                  Order ID
                </span>
                <span
                  className="font-mono font-bold text-[#0B3A63] text-sm block mt-0.5 select-all truncate"
                  style={{ fontFamily: "JetBrains Mono, monospace" }}
                >
                  #{order.order_number}
                </span>
              </div>

              <div>
                <span className="text-[11px] font-semibold text-[#667085] uppercase tracking-wider block">
                  Order Total
                </span>
                <span className="font-bold text-[#0B3A63] text-sm sm:text-base block mt-0.5">
                  ₹{formattedTotal}
                </span>
              </div>

              <div>
                <span className="text-[11px] font-semibold text-[#667085] uppercase tracking-wider block">
                  Items
                </span>
                <span className="font-medium text-[#17212B] block mt-0.5">
                  {itemsCount} {itemsCount === 1 ? "item" : "items"}
                </span>
              </div>

              <div>
                <span className="text-[11px] font-semibold text-[#667085] uppercase tracking-wider block">
                  Payment Mode
                </span>
                <span className="font-medium text-[#17212B] block mt-0.5 truncate">
                  {order.payment_method || (order.is_cod ? "Cash on Delivery" : "Online")}
                </span>
              </div>
            </div>

            {/* Refund & Inventory Notice */}
            <div className="mt-3.5 pt-3 border-t border-slate-200/80 text-[11px] text-[#475569] space-y-1">
              {isOnlinePaid && (
                <div className="flex items-start gap-1.5 text-blue-800 bg-blue-50/80 p-2 rounded-lg border border-blue-100">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5 text-blue-600" />
                  <span>
                    <strong>Online Paid Order:</strong> A refund of ₹{formattedTotal} will be queued to your original payment method within 5–7 business days after cancellation confirmation.
                  </span>
                </div>
              )}
              {isAdvanceCod && (
                <div className="flex items-start gap-1.5 text-blue-800 bg-blue-50/80 p-2 rounded-lg border border-blue-100">
                  <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5 text-blue-600" />
                  <span>
                    <strong>Advance COD Order:</strong> Your paid advance of ₹{Number(order.cod_advance_amount || 0).toLocaleString("en-IN")} will be queued for refund to your original payment method.
                  </span>
                </div>
              )}
              {order.is_cod && !isAdvanceCod && (
                <div className="flex items-start gap-1.5 text-slate-700 bg-slate-100 p-2 rounded-lg border border-slate-200">
                  <span className="font-semibold">Cash on Delivery:</span>
                  <span>No payment was deducted; this order will be cancelled with no refund required.</span>
                </div>
              )}
            </div>
          </div>

          {/* Cancellation Reason Selection */}
          <div className="space-y-3">
            <label className="block text-xs font-bold text-[#0B3A63] uppercase tracking-wider">
              Reason for Cancellation <span className="text-red-500">*</span>
            </label>

            <div className="space-y-2">
              {CANCELLATION_REASONS.map((option) => {
                const isSelected = selectedReasonCode === option.code;
                return (
                  <label
                    key={option.code}
                    className={`flex items-center gap-3 p-3 rounded-xl border text-xs sm:text-sm cursor-pointer transition-all duration-150 select-none ${
                      isSelected
                        ? "bg-[#EFF6FF] border-[#1769AA] text-[#0B3A63] font-semibold shadow-2xs ring-1 ring-[#1769AA]/40"
                        : "bg-white border-slate-200 text-[#17212B] hover:bg-slate-50 hover:border-slate-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="cancellation_reason"
                      value={option.code}
                      checked={isSelected}
                      disabled={isSubmitting}
                      onChange={() => setSelectedReasonCode(option.code)}
                      className="w-4 h-4 text-[#1769AA] border-slate-300 focus:ring-[#1769AA] focus:ring-offset-0 cursor-pointer"
                    />
                    <span>{option.label}</span>
                  </label>
                );
              })}
            </div>

            {/* Optional / Detailed Note (especially for 'Other') */}
            {selectedReasonCode === "other" && (
              <div className="mt-3 pt-1 animate-fade-in">
                <label
                  htmlFor="cancel-reason-notes"
                  className="block text-xs font-semibold text-[#0B3A63] mb-1.5"
                >
                  Please tell us more (optional)
                </label>
                <textarea
                  id="cancel-reason-notes"
                  rows={3}
                  value={reasonNotes}
                  disabled={isSubmitting}
                  onChange={(e) => setReasonNotes(e.target.value.slice(0, 300))}
                  placeholder="Share details to help us improve our service..."
                  className="w-full text-xs sm:text-sm p-3 border border-slate-300 rounded-xl focus:border-[#1769AA] focus:ring-2 focus:ring-[#1769AA]/20 outline-none transition-all placeholder:text-slate-400 disabled:bg-slate-50 disabled:text-slate-500 resize-none"
                />
                <div className="flex justify-between items-center text-[10px] text-slate-400 mt-1">
                  <span>Your feedback helps us improve</span>
                  <span>{reasonNotes.length} / 300</span>
                </div>
              </div>
            )}
          </div>

          {/* Error Message Alert */}
          {displayError && (
            <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs sm:text-sm flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium">{displayError}</p>
              </div>
            </div>
          )}
        </div>

        {/* Modal Actions / Footer */}
        <div className="p-4 sm:p-5 border-t border-slate-100 bg-slate-50 flex flex-col-reverse sm:flex-row items-center justify-end gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="w-full sm:w-auto px-5 py-2.5 rounded-xl border border-slate-300 text-slate-700 hover:bg-white hover:border-slate-400 text-xs sm:text-sm font-semibold transition-colors disabled:opacity-50 disabled:pointer-events-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-slate-400 shadow-2xs"
          >
            Keep Order
          </button>

          <button
            type="button"
            onClick={handleConfirmSubmit}
            disabled={isSubmitting}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-xs sm:text-sm font-semibold transition-colors shadow-xs hover:shadow-md disabled:opacity-60 disabled:pointer-events-none cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-red-500"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                <span>Cancelling Order...</span>
              </>
            ) : (
              <span>Confirm Cancellation</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
