import React, { useState, useEffect } from "react";
import { AlertTriangle, Trash2, XCircle, ArrowLeft, ArrowRight, Loader2, X } from "lucide-react";

export interface TwoStepConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  actionType?: "delete" | "cancel";
  title?: string;
  itemTitle?: string;
  itemSubtitle?: string;
  step1Question?: string;
  step2Warning?: string;
  confirmButtonText?: string;
  isLoading?: boolean;
}

export default function TwoStepConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  actionType = "delete",
  title,
  itemTitle,
  itemSubtitle,
  step1Question,
  step2Warning = "This action cannot be undone. Click below to permanently confirm.",
  confirmButtonText,
  isLoading = false,
}: TwoStepConfirmationModalProps) {
  const [step, setStep] = useState<1 | 2>(1);

  // Reset to Step 1 whenever modal opens
  useEffect(() => {
    if (isOpen) {
      setStep(1);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const defaultTitle = actionType === "cancel" ? "Confirm Order Cancellation" : "Confirm Deletion";
  const defaultConfirmText = actionType === "cancel" ? "Yes, Cancel Order" : "Yes, Delete Permanently";
  const loadingText = actionType === "cancel" ? "Cancelling..." : "Deleting...";

  const handleFinalConfirm = async () => {
    await onConfirm();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-150"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Top Bar */}
        <div className="px-6 pt-5 pb-3 flex items-center justify-between border-b border-slate-100">
          <div className="flex items-center gap-2">
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
                step === 1 ? "bg-amber-100 text-amber-800" : "bg-rose-100 text-rose-800"
              }`}
            >
              Step {step} of 2 {step === 2 && "• Final Step"}
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-40 cursor-pointer"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6">
          {step === 1 ? (
            /* ================= STEP 1: INITIAL CONFIRMATION ================= */
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center border border-rose-100">
                {actionType === "cancel" ? (
                  <XCircle className="w-6 h-6" />
                ) : (
                  <Trash2 className="w-6 h-6" />
                )}
              </div>

              <div>
                <h3 className="text-base font-bold text-[#0A2540]">
                  {title || defaultTitle}
                </h3>
                <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
                  {step1Question || (
                    <>
                      Are you sure you want to {actionType === "cancel" ? "cancel" : "delete"}{" "}
                      {itemTitle && <strong className="text-slate-900">{itemTitle}</strong>}?
                    </>
                  )}
                </p>
                {itemSubtitle && (
                  <div className="mt-2.5 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-600 font-mono">
                    {itemSubtitle}
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* ================= STEP 2: FINAL CONFIRMATION ================= */
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center border border-rose-200 animate-pulse">
                <AlertTriangle className="w-6 h-6" />
              </div>

              <div>
                <h3 className="text-base font-bold text-rose-700">
                  Final Confirmation
                </h3>
                <div className="mt-2 p-3.5 bg-rose-50 border border-rose-200/80 rounded-xl text-xs text-rose-900 leading-relaxed font-medium">
                  {step2Warning}
                </div>

                {itemTitle && (
                  <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-0.5">
                      Target {actionType === "cancel" ? "Order" : "Item"}
                    </span>
                    <span className="font-bold text-slate-900">{itemTitle}</span>
                    {itemSubtitle && <span className="text-slate-500 block text-[11px] mt-0.5">{itemSubtitle}</span>}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Modal Actions Footer */}
        <div className="bg-slate-50 px-6 py-4 border-t border-slate-200 flex items-center justify-end gap-3">
          {step === 1 ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Go Back
              </button>
              <button
                type="button"
                onClick={() => setStep(2)}
                className="flex items-center gap-1.5 px-5 py-2 text-xs font-bold text-white bg-[#0A2540] hover:bg-[#153e66] rounded-xl transition-all shadow-xs cursor-pointer"
              >
                <span>Continue</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setStep(1)}
                disabled={isLoading}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-100 transition-colors disabled:opacity-50 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Go Back</span>
              </button>
              <button
                type="button"
                onClick={handleFinalConfirm}
                disabled={isLoading}
                className="flex items-center gap-2 px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-all shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>{loadingText}</span>
                  </>
                ) : (
                  <>
                    {actionType === "cancel" ? (
                      <XCircle className="w-3.5 h-3.5" />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" />
                    )}
                    <span>{confirmButtonText || defaultConfirmText}</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
