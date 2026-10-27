import React, { useState } from 'react';
import { loadRazorpayScript, isRazorpayLoaded } from '../../utils/razorpay';
import { paymentsApi } from '../../api/payments';

export interface RazorpayCheckoutButtonProps {
  amount: number; // in rupees (e.g. 500) or paise if isAmountInPaise is true
  isAmountInPaise?: boolean;
  currency?: string;
  receipt?: string;
  orderId?: number; // optional internal DB order ID
  buttonText?: string;
  className?: string;
  prefill?: {
    name?: string;
    email?: string;
    contact?: string;
  };
  onSuccess?: (response: {
    razorpay_payment_id: string;
    razorpay_order_id: string;
    razorpay_signature: string;
  }) => void;
  onError?: (error: string) => void;
  onDismiss?: () => void;
}

export const RazorpayCheckoutButton: React.FC<RazorpayCheckoutButtonProps> = ({
  amount,
  isAmountInPaise = false,
  currency = 'INR',
  receipt,
  orderId,
  buttonText,
  className = '',
  prefill = {},
  onSuccess,
  onError,
  onDismiss,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const amountInPaise = isAmountInPaise ? Math.round(amount) : Math.round(amount * 100);

  const handleCheckout = async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      // 1. Ensure Razorpay script is loaded
      const scriptReady = await loadRazorpayScript();
      if (!scriptReady || !isRazorpayLoaded()) {
        const error = 'Failed to load Razorpay SDK. Please check your internet connection.';
        setErrorMessage(error);
        setIsLoading(false);
        onError?.(error);
        return;
      }

      // 2. Call backend create-order endpoint
      const orderData = await paymentsApi.createOrder({
        amount: amountInPaise,
        currency,
        receipt,
        order_id: orderId,
      });

      const keyId = orderData.key_id || (import.meta as any).env.VITE_RAZORPAY_KEY_ID;

      // 3. Configure Razorpay modal options
      const options = {
        key: keyId,
        amount: orderData.amount,
        currency: orderData.currency || 'INR',
        name: 'Vee Power Electricals',
        description: receipt ? `Receipt #${receipt}` : 'Online Order Payment',
        order_id: orderData.order_id,
        prefill: {
          name: prefill.name || '',
          email: prefill.email || '',
          contact: prefill.contact || '',
        },
        theme: {
          color: '#0B3A63',
        },
        handler: async (response: {
          razorpay_payment_id: string;
          razorpay_order_id: string;
          razorpay_signature: string;
        }) => {
          setIsLoading(true);
          try {
            // 4. Verify payment signature on backend
            await paymentsApi.verifyPaymentSignature({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });

            setIsLoading(false);
            onSuccess?.(response);
          } catch (verifyErr: any) {
            setIsLoading(false);
            const msg = verifyErr?.message || 'Payment signature verification failed.';
            setErrorMessage(msg);
            onError?.(msg);
          }
        },
        modal: {
          ondismiss: () => {
            setIsLoading(false);
            const cancelMsg = 'Payment window was closed.';
            setErrorMessage(cancelMsg);
            onDismiss?.();
          },
        },
      };

      // 4. Open Razorpay checkout modal
      const RazorpayConstructor = (window as any).Razorpay;
      const rzpInstance = new RazorpayConstructor(options);

      rzpInstance.on('payment.failed', (failResponse: any) => {
        setIsLoading(false);
        const failMsg = failResponse?.error?.description || 'Payment failed at gateway.';
        setErrorMessage(failMsg);
        onError?.(failMsg);
      });

      rzpInstance.open();
    } catch (err: any) {
      setIsLoading(false);
      const msg = err?.message || 'Failed to initiate payment.';
      setErrorMessage(msg);
      onError?.(msg);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {errorMessage && (
        <div className="text-xs text-red-600 bg-red-50 border border-red-200 p-3 rounded-xl space-y-1.5">
          <div className="flex items-center gap-1.5 font-medium">
            <span>⚠️</span> {errorMessage}
          </div>
          <div className="pt-1 border-t border-red-100 flex items-center justify-between">
            <span className="text-slate-600">Alternative:</span>
            <a
              href="https://razorpay.me/@veepowerelectricals"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-[#1769AA] hover:underline"
            >
              Pay via Razorpay Handle (@veepowerelectricals) ↗
            </a>
          </div>
        </div>
      )}
      <button
        type="button"
        onClick={handleCheckout}
        disabled={isLoading || amountInPaise < 100}
        className={
          className ||
          'w-full bg-[#F2A900] hover:bg-[#D4920A] text-[#0A2540] font-bold py-3.5 px-6 rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60'
        }
      >
        {isLoading ? (
          <>
            <div className="w-5 h-5 border-2 border-[#0A2540] border-t-transparent rounded-full animate-spin" />
            <span>Processing...</span>
          </>
        ) : (
          buttonText || `Pay with Razorpay · ₹${(amountInPaise / 100).toLocaleString('en-IN')}`
        )}
      </button>
    </div>
  );
};
