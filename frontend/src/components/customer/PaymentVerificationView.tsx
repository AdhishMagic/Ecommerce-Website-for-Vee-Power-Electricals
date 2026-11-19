import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { paymentsApi } from '../../api/payments';
import { ordersApi } from '../../api/orders';
import { PaymentVerifyPayload } from '../../types/api';

export type PaymentVerificationStatus = 'VERIFYING' | 'PENDING' | 'SUCCESS' | 'FAILED' | 'UNKNOWN';

export interface PaymentVerificationViewProps {
  orderId: number;
  orderNumber?: string;
  amount?: number | string;
  paymentMethod?: string;
  verifyPayload?: PaymentVerifyPayload | null;
  initialStatus?: PaymentVerificationStatus;
  onSuccess?: (confirmedOrder: any) => void;
  onRetryPayment?: () => void;
  onReturnToOrders?: () => void;
}

const MAX_POLLING_ATTEMPTS = 15; // 15 attempts * 2 seconds = 30 seconds
const POLLING_INTERVAL_MS = 2000;

export const PaymentVerificationView: React.FC<PaymentVerificationViewProps> = ({
  orderId,
  orderNumber,
  amount,
  paymentMethod = 'UPI',
  verifyPayload,
  initialStatus = 'VERIFYING',
  onSuccess,
  onRetryPayment,
  onReturnToOrders,
}) => {
  const [status, setStatus] = useState<PaymentVerificationStatus>(initialStatus);
  const [statusMessage, setStatusMessage] = useState<string>('Verifying your payment...');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [confirmedOrder, setConfirmedOrder] = useState<any | null>(null);
  const [confirmedPaymentMethod, setConfirmedPaymentMethod] = useState<string>(paymentMethod);
  const [confirmedAmount, setConfirmedAmount] = useState<string | number | undefined>(amount);
  const [pollCount, setPollCount] = useState<number>(0);

  const isMountedRef = useRef<boolean>(true);
  const isPollingBusyRef = useRef<boolean>(false);
  const timerRef = useRef<any>(null);
  const hasFinishedRef = useRef<boolean>(false);

  // Stop polling helper
  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Check if a payment response indicates definitive success
  const isDefinitiveSuccess = useCallback((res: any): boolean => {
    if (!res) return false;
    const st = (res.status || '').toUpperCase();
    const defSt = (res.definitive_status || '').toUpperCase();
    const ordSt = (res.order_status || '').toUpperCase();
    const paySt = (res.order_payment_status || res.payment_status || '').toUpperCase();

    return (
      st === 'SUCCESS' ||
      defSt === 'SUCCESS' ||
      paySt === 'PAID' ||
      paySt === 'PARTIALLY PAID' ||
      paySt === 'PARTIALLY_PAID' ||
      ['CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED'].includes(ordSt)
    );
  }, []);

  // Check if response indicates definitive failure
  const isDefinitiveFailure = useCallback((res: any): boolean => {
    if (!res) return false;
    const ordSt = (res.order_status || '').toUpperCase();
    const paySt = (res.order_payment_status || res.payment_status || '').toUpperCase();
    return res.is_final === true && (paySt === 'FAILED' || ordSt === 'CANCELLED');
  }, []);

  // Single poll iteration against backend order payment status endpoint
  const pollBackendStatus = useCallback(async (): Promise<boolean> => {
    if (isPollingBusyRef.current || hasFinishedRef.current || !isMountedRef.current) {
      return false;
    }

    isPollingBusyRef.current = true;
    try {
      const res = await paymentsApi.getOrderPaymentStatus(orderId);
      if (!isMountedRef.current || hasFinishedRef.current) return false;

      if (isDefinitiveSuccess(res)) {
        hasFinishedRef.current = true;
        stopPolling();
        setStatus('SUCCESS');
        if (res.payment_method) setConfirmedPaymentMethod(res.payment_method);
        if (res.amount) setConfirmedAmount(res.amount);

        try {
          const fresh = await ordersApi.getOrderDetail(orderId);
          if (isMountedRef.current) {
            setConfirmedOrder(fresh);
            onSuccess?.(fresh);
          }
        } catch {
          if (isMountedRef.current) {
            onSuccess?.(res);
          }
        }
        return true;
      }

      if (isDefinitiveFailure(res)) {
        hasFinishedRef.current = true;
        stopPolling();
        setStatus('FAILED');
        setErrorMessage(res.error_message || 'Payment was declined by your bank or gateway.');
        return true;
      }

      // Still pending
      setStatus('PENDING');
      setStatusMessage('Payment confirmation is still being processed with your bank...');
      return false;
    } catch (err: any) {
      // Network interruption must NEVER be treated as a definitive failure!
      console.warn('Temporary network error during payment status check. Retrying...', err);
      if (isMountedRef.current && !hasFinishedRef.current) {
        setStatus('PENDING');
        setStatusMessage('Re-establishing connection with payment server...');
      }
      return false;
    } finally {
      isPollingBusyRef.current = false;
    }
  }, [orderId, isDefinitiveSuccess, isDefinitiveFailure, stopPolling, onSuccess]);

  // Main verification lifecycle
  const runVerificationFlow = useCallback(async () => {
    hasFinishedRef.current = false;
    stopPolling();
    setStatus('VERIFYING');
    setStatusMessage('Verifying your payment...');
    setErrorMessage('');
    setPollCount(0);

    // Step 1: If verifyPayload is provided, attempt direct backend signature verification
    if (verifyPayload && verifyPayload.razorpay_payment_id && verifyPayload.razorpay_signature) {
      try {
        const verifyRes = await paymentsApi.verifyPayment(verifyPayload);
        if (!isMountedRef.current) return;

        if (isDefinitiveSuccess(verifyRes)) {
          hasFinishedRef.current = true;
          setStatus('SUCCESS');
          try {
            const fresh = await ordersApi.getOrderDetail(orderId);
            if (isMountedRef.current) {
              setConfirmedOrder(fresh);
              onSuccess?.(fresh);
            }
          } catch {
            if (isMountedRef.current) {
              onSuccess?.(verifyRes);
            }
          }
          return;
        }
      } catch (verifyErr: any) {
        console.warn('Direct verify signature call delayed or rejected. Falling back to status polling...', verifyErr);
        // Do NOT fail! Webhook might be processing asynchronously
      }
    }

    if (!isMountedRef.current || hasFinishedRef.current) return;

    // Step 2: Immediate status check
    const immediateSuccess = await pollBackendStatus();
    if (immediateSuccess || !isMountedRef.current || hasFinishedRef.current) return;

    // Step 3: Start controlled polling every 2 seconds for up to 30 seconds
    let attempts = 0;
    timerRef.current = setInterval(async () => {
      attempts++;
      if (isMountedRef.current) {
        setPollCount(attempts);
      }

      if (attempts >= MAX_POLLING_ATTEMPTS) {
        stopPolling();
        if (isMountedRef.current && !hasFinishedRef.current) {
          setStatus('UNKNOWN');
        }
        return;
      }

      const confirmed = await pollBackendStatus();
      if (confirmed) {
        stopPolling();
      }
    }, POLLING_INTERVAL_MS);
  }, [orderId, verifyPayload, pollBackendStatus, stopPolling, isDefinitiveSuccess, onSuccess]);

  // Launch verification lifecycle on mount or when orderId changes
  useEffect(() => {
    isMountedRef.current = true;
    runVerificationFlow();

    return () => {
      isMountedRef.current = false;
      stopPolling();
    };
  }, [runVerificationFlow, stopPolling]);

  const effectiveOrderNumber = orderNumber || confirmedOrder?.order_number || `#${orderId}`;
  const effectiveAmount = confirmedAmount || confirmedOrder?.total_amount || amount;
  const formattedAmount = effectiveAmount !== undefined && effectiveAmount !== null
    ? Number(effectiveAmount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-12 text-center animate-in fade-in duration-200">
      <div className="bg-white border border-[#D9E1E8] rounded-2xl p-6 sm:p-10 shadow-sm text-left">
        {/* ========================================================================= */}
        {/* STATE 1 & 2: VERIFYING / PENDING                                          */}
        {/* ========================================================================= */}
        {(status === 'VERIFYING' || status === 'PENDING') && (
          <div className="text-center py-4">
            <div className="relative w-20 h-20 mx-auto mb-6 flex items-center justify-center">
              <div className="w-20 h-20 border-4 border-[#D9E1E8] border-t-[#1769AA] rounded-full animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-2xl">⚡</span>
              </div>
            </div>

            <h2 className="text-2xl sm:text-3xl font-bold text-[#0B3A63] mb-2 font-['Outfit']">
              {status === 'VERIFYING' ? 'Verifying your payment...' : 'Confirming Payment with Bank'}
            </h2>

            <p className="text-sm sm:text-base text-[#17212B] font-medium mb-2">
              Please wait while we confirm your payment. Do not refresh or close this page.
            </p>

            <p className="text-xs text-[#667085] mb-6">
              {statusMessage}
              {pollCount > 0 && ` (Checking: ${pollCount * 2}s / 30s)`}
            </p>

            {/* Order Details Preview Box */}
            <div className="bg-[#F6F8FA] border border-[#D9E1E8] rounded-xl p-4 text-xs sm:text-sm text-[#17212B] max-w-md mx-auto space-y-2 mb-6 text-left">
              <div className="flex justify-between items-center">
                <span className="text-[#667085] font-medium">Order Reference:</span>
                <span className="font-mono font-bold text-[#0B3A63]">{effectiveOrderNumber}</span>
              </div>
              {formattedAmount && (
                <div className="flex justify-between items-center border-t border-slate-200/60 pt-2">
                  <span className="text-[#667085] font-medium">Payable Amount:</span>
                  <span className="font-bold text-[#1769AA]">₹{formattedAmount}</span>
                </div>
              )}
              <div className="flex justify-between items-center border-t border-slate-200/60 pt-2">
                <span className="text-[#667085] font-medium">Payment Mode:</span>
                <span className="font-semibold text-slate-700 uppercase">{confirmedPaymentMethod}</span>
              </div>
            </div>

            <div className="flex items-center justify-center gap-2 text-[11px] text-[#667085]">
              <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
              <span>Encrypted Razorpay Gateway Verification in Progress</span>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* STATE 3: SUCCESS (Section 6 Requirements)                                 */}
        {/* ========================================================================= */}
        {status === 'SUCCESS' && (
          <div className="text-center py-2 animate-in zoom-in-95 duration-200">
            {/* Clear Success Indicator */}
            <div className="w-20 h-20 bg-[#ECFDF5] border-2 border-emerald-300 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
              <svg className="w-10 h-10 text-[#12773D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
              </svg>
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold text-[#0B3A63] mb-2 font-['Outfit']">
              Payment Successful
            </h1>
            <p className="text-base text-[#12773D] font-semibold mb-1">
              Your order has been placed successfully.
            </p>
            <p className="text-xs text-[#667085] mb-6">
              Thank you for shopping with Vee Power Electricals. A tax invoice and confirmation email have been sent to your registered address.
            </p>

            {/* Confirmed Details Summary Box */}
            <div className="bg-[#F6F8FA] border border-[#D9E1E8] rounded-xl p-5 mb-8 text-left space-y-3 max-w-lg mx-auto text-xs sm:text-sm">
              <div className="flex justify-between items-center">
                <span className="text-[#667085] font-medium">Order ID / Reference</span>
                <span className="font-mono font-bold text-[#0B3A63] text-sm sm:text-base">{effectiveOrderNumber}</span>
              </div>
              {formattedAmount && (
                <div className="flex justify-between items-center border-t border-[#D9E1E8] pt-2.5">
                  <span className="text-[#667085] font-medium">Confirmed Amount Paid</span>
                  <span className="text-sm sm:text-base font-bold text-[#12773D]">₹{formattedAmount}</span>
                </div>
              )}
              <div className="flex justify-between items-center border-t border-[#D9E1E8] pt-2.5">
                <span className="text-[#667085] font-medium">Payment Method</span>
                <span className="font-semibold text-slate-800 uppercase bg-slate-100 px-2 py-0.5 rounded">
                  {confirmedPaymentMethod || 'Razorpay Online'}
                </span>
              </div>
              <div className="flex justify-between items-center border-t border-[#D9E1E8] pt-2.5">
                <span className="text-[#667085] font-medium">Payment Status</span>
                <span className="inline-flex items-center gap-1.5 font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Paid
                </span>
              </div>
              <div className="flex justify-between items-center border-t border-[#D9E1E8] pt-2.5">
                <span className="text-[#667085] font-medium">Estimated Delivery</span>
                <span className="font-medium text-slate-700">3–5 Business Days</span>
              </div>
            </div>

            {/* Action Buttons: View Order & Continue Shopping */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center max-w-md mx-auto">
              <Link
                to="/account/orders"
                onClick={onReturnToOrders}
                className="flex-1 bg-[#0B3A63] hover:bg-[#1769AA] text-white font-bold py-3.5 px-6 rounded-xl transition-all shadow-sm text-center text-sm"
              >
                View Order
              </Link>
              <Link
                to="/shop"
                className="flex-1 bg-white border border-[#D9E1E8] hover:border-[#1769AA] text-[#17212B] hover:text-[#0B3A63] font-semibold py-3.5 px-6 rounded-xl transition-all shadow-2xs text-center text-sm"
              >
                Continue Shopping
              </Link>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* STATE 4: FAILED (Section 7 Requirements)                                  */}
        {/* ========================================================================= */}
        {status === 'FAILED' && (
          <div className="text-center py-2 animate-in zoom-in-95 duration-200">
            <div className="w-20 h-20 bg-red-50 border-2 border-red-200 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
              <svg className="w-10 h-10 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>

            <h1 className="text-2xl sm:text-3xl font-bold text-[#0B3A63] mb-2 font-['Outfit']">
              Payment Failed
            </h1>
            <p className="text-sm sm:text-base text-red-600 font-medium mb-2">
              {errorMessage || 'Your payment was declined by your bank or the gateway.'}
            </p>
            <p className="text-xs text-[#667085] mb-6">
              Your order items and reserved cart have been preserved safely. No duplicate charges occurred.
            </p>

            {/* Order Reference Details */}
            <div className="bg-[#F6F8FA] border border-[#D9E1E8] rounded-xl p-4 text-xs sm:text-sm text-[#17212B] max-w-md mx-auto space-y-2 mb-6 text-left">
              <div className="flex justify-between items-center">
                <span className="text-[#667085] font-medium">Order Reference:</span>
                <span className="font-mono font-bold text-[#0B3A63]">{effectiveOrderNumber}</span>
              </div>
              {formattedAmount && (
                <div className="flex justify-between items-center border-t border-slate-200/60 pt-2">
                  <span className="text-[#667085] font-medium">Payable Amount:</span>
                  <span className="font-bold text-[#0B3A63]">₹{formattedAmount}</span>
                </div>
              )}
              <div className="flex justify-between items-center border-t border-slate-200/60 pt-2">
                <span className="text-[#667085] font-medium">Payment Status:</span>
                <span className="inline-flex items-center gap-1.5 font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded-full border border-red-200">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span> Failed
                </span>
              </div>
            </div>

            {/* Action Buttons: Safe Retry Payment & Return to My Orders */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center max-w-md mx-auto">
              {onRetryPayment && (
                <button
                  type="button"
                  onClick={onRetryPayment}
                  className="flex-1 bg-[#F2A900] hover:bg-[#D4920A] text-[#0A2540] font-bold py-3.5 px-6 rounded-xl transition-all shadow-md text-sm cursor-pointer"
                >
                  ⚡ Retry Payment
                </button>
              )}
              <Link
                to="/account/orders"
                onClick={onReturnToOrders}
                className="flex-1 bg-white border border-[#D9E1E8] hover:border-[#1769AA] text-[#17212B] font-semibold py-3.5 px-6 rounded-xl transition-all text-center text-sm"
              >
                Return to My Orders
              </Link>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* STATE 5: UNKNOWN / TIMEOUT (Section 4 Requirements)                       */}
        {/* ========================================================================= */}
        {status === 'UNKNOWN' && (
          <div className="text-center py-2 animate-in zoom-in-95 duration-200">
            <div className="w-20 h-20 bg-amber-50 border-2 border-amber-200 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
              <span className="text-3xl">⏳</span>
            </div>

            <h2 className="text-2xl sm:text-3xl font-bold text-[#0B3A63] mb-2 font-['Outfit']">
              Payment Status Pending
            </h2>

            <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-xl mb-6 text-left max-w-lg mx-auto">
              <p className="text-sm font-semibold text-amber-900 mb-1.5">
                Your payment is taking longer than expected. We are still checking its status. Please check your order history before attempting another payment.
              </p>
              <p className="text-xs text-amber-800 leading-relaxed">
                If money was debited from your bank or UPI app, please do not make a second payment. Our automated reconciliation service continuously verifies pending transactions and will automatically confirm your order as soon as bank confirmation arrives.
              </p>
            </div>

            {/* Order Reference */}
            <div className="bg-[#F6F8FA] border border-[#D9E1E8] rounded-xl p-4 text-xs sm:text-sm text-[#17212B] max-w-md mx-auto space-y-2 mb-6 text-left">
              <div className="flex justify-between items-center">
                <span className="text-[#667085] font-medium">Order Reference:</span>
                <span className="font-mono font-bold text-[#0B3A63]">{effectiveOrderNumber}</span>
              </div>
              {formattedAmount && (
                <div className="flex justify-between items-center border-t border-slate-200/60 pt-2">
                  <span className="text-[#667085] font-medium">Payable Amount:</span>
                  <span className="font-bold text-[#0B3A63]">₹{formattedAmount}</span>
                </div>
              )}
            </div>

            {/* Action Buttons: Retry Verification & Check My Orders */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center max-w-md mx-auto">
              <button
                type="button"
                onClick={runVerificationFlow}
                className="flex-1 bg-[#1769AA] hover:bg-[#0B3A63] text-white font-bold py-3.5 px-6 rounded-xl transition-all shadow-sm text-sm cursor-pointer flex items-center justify-center gap-2"
              >
                <span>🔄</span> Retry Verification
              </button>
              <Link
                to="/account/orders"
                onClick={onReturnToOrders}
                className="flex-1 bg-white border border-[#D9E1E8] hover:border-[#1769AA] text-[#17212B] font-semibold py-3.5 px-6 rounded-xl transition-all text-center text-sm"
              >
                View Order History
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default PaymentVerificationView;
