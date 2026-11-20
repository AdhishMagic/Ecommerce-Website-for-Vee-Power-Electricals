import { useState, useEffect, useRef, useCallback } from "react";
import { Link, useLocation } from "react-router-dom";
import { COMPANY_NAME } from "../../constants/companyInfo";
import { ordersApi } from "../../api/orders";
import { paymentsApi } from "../../api/payments";
import { useCart } from "../../context/CartContext";

type ViewState = 'verifying' | 'paid' | 'failed';

const POLLING_INTERVAL_MS = 1500; // Query verification endpoint every 1.5 seconds
const MAX_POLLING_ATTEMPTS = 13; // 13 * 1.5s = 19.5 seconds max (up to 15-20s)

export default function OrderSuccess() {
  const location = useLocation();
  const { clearCart } = useCart();
  const initialOrder = location.state?.order;

  const params = new URLSearchParams(location.search);
  const orderIdParam = params.get('order_id');
  const rzpPaymentId = params.get('razorpay_payment_id');
  const rzpOrderId = params.get('razorpay_order_id');
  const rzpSignature = params.get('razorpay_signature');

  // Determine target order ID
  const targetOrderId = orderIdParam ? Number(orderIdParam) : (initialOrder?.id ? Number(initialOrder.id) : null);

  // Check if initial order is already known to be COD or confirmed paid
  const isInitialPaid = initialOrder?.payment_status === 'COMPLETED' ||
    initialOrder?.payment_status === 'PAID' ||
    initialOrder?.payment_status === 'Paid';
  const isInitialCod = Boolean(initialOrder?.is_cod || initialOrder?.payment_method?.toUpperCase() === 'COD');

  // If returning from payment gateway (order_id query param) or unconfirmed online order, start in 'verifying'
  const shouldVerifyInitial = Boolean(
    orderIdParam ||
    rzpPaymentId ||
    (initialOrder && !isInitialPaid && !isInitialCod)
  );

  const [viewState, setViewState] = useState<ViewState>(() => shouldVerifyInitial ? 'verifying' : 'paid');
  const [order, setOrder] = useState<any>(initialOrder || null);
  const [statusMessage, setStatusMessage] = useState<string>('Verifying your payment...');
  const [errorMessage, setErrorMessage] = useState<string>('');
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

  // Poll Django payment status endpoint
  const pollBackendStatus = useCallback(async (): Promise<boolean> => {
    if (isPollingBusyRef.current || hasFinishedRef.current || !isMountedRef.current || !targetOrderId) {
      return false;
    }

    isPollingBusyRef.current = true;
    try {
      const res = await paymentsApi.getOrderPaymentStatus(targetOrderId);
      if (!isMountedRef.current || hasFinishedRef.current) return false;

      const st = (res?.status || '').toUpperCase();
      const defSt = (res?.definitive_status || '').toUpperCase();
      const paySt = (res?.order_payment_status || res?.payment_status || '').toUpperCase();
      const ordSt = (res?.order_status || '').toUpperCase();

      const isPaidConfirmed =
        st === 'SUCCESS' ||
        defSt === 'SUCCESS' ||
        paySt === 'PAID' ||
        paySt === 'PARTIALLY PAID' ||
        paySt === 'PARTIALLY_PAID' ||
        ['CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED'].includes(ordSt);

      if (isPaidConfirmed) {
        hasFinishedRef.current = true;
        stopPolling();
        clearCart();

        try {
          const fresh = await ordersApi.getOrderDetail(targetOrderId);
          if (isMountedRef.current) {
            setOrder(fresh);
            sessionStorage.setItem('last_confirmed_order', JSON.stringify(fresh));
          }
        } catch {
          if (isMountedRef.current) {
            setOrder((prev: any) => ({
              ...(prev || {}),
              ...res,
              id: targetOrderId,
              payment_status: 'Paid',
              status: ordSt || 'CONFIRMED',
            }));
          }
        }

        if (isMountedRef.current) {
          setViewState('paid');
        }
        return true;
      }

      // Check if response indicates definitive final failure
      const isExplicitlyFailed =
        res?.is_final === true &&
        (paySt === 'FAILED' || st === 'FAILED' || ordSt === 'CANCELLED');

      if (isExplicitlyFailed) {
        hasFinishedRef.current = true;
        stopPolling();
        if (isMountedRef.current) {
          setErrorMessage(res?.error_message || 'Payment was declined by your bank or gateway.');
          setViewState('failed');
        }
        return true;
      }

      // Payment still pending verification
      if (isMountedRef.current) {
        setStatusMessage('Payment confirmation is being processed with your bank...');
      }
      return false;
    } catch (err: any) {
      // Temporary network error must never be treated as failure
      console.warn('Network glitch during payment status verification. Retrying...', err);
      if (isMountedRef.current && !hasFinishedRef.current) {
        setStatusMessage('Re-establishing connection with payment server...');
      }
      return false;
    } finally {
      isPollingBusyRef.current = false;
    }
  }, [targetOrderId, stopPolling, clearCart]);

  // Main verification lifecycle
  useEffect(() => {
    isMountedRef.current = true;
    hasFinishedRef.current = false;

    // Direct visit without params or already paid COD order: load cached order if available
    if (!shouldVerifyInitial || !targetOrderId) {
      if (initialOrder) {
        try {
          sessionStorage.setItem('last_confirmed_order', JSON.stringify(initialOrder));
        } catch {}
      } else {
        try {
          const cached = sessionStorage.getItem('last_confirmed_order');
          if (cached) {
            setOrder(JSON.parse(cached));
          }
        } catch {}
      }
      return () => {
        isMountedRef.current = false;
        stopPolling();
      };
    }

    // Returning from payment gateway: run verification and polling
    const runVerification = async () => {
      // Step 1: If Razorpay signature is present in URL params, attempt direct verify signature
      if (rzpPaymentId && rzpSignature) {
        try {
          const verifyRes = await paymentsApi.verifyPayment({
            order_id: targetOrderId,
            razorpay_order_id: rzpOrderId || '',
            razorpay_payment_id: rzpPaymentId,
            razorpay_signature: rzpSignature,
            payment_method: 'UPI',
          });

          if (!isMountedRef.current) return;

          const vSt = (verifyRes?.status || '').toUpperCase();
          const vPaySt = ((verifyRes as any)?.payment_status || '').toUpperCase();
          if (vSt === 'SUCCESS' || vPaySt === 'PAID') {
            hasFinishedRef.current = true;
            stopPolling();
            clearCart();
            try {
              const fresh = await ordersApi.getOrderDetail(targetOrderId);
              if (isMountedRef.current) {
                setOrder(fresh);
                sessionStorage.setItem('last_confirmed_order', JSON.stringify(fresh));
              }
            } catch {
              if (isMountedRef.current) {
                setOrder((prev: any) => ({
                  ...(prev || {}),
                  ...verifyRes,
                  id: targetOrderId,
                  payment_status: 'Paid',
                  status: 'CONFIRMED',
                }));
              }
            }
            if (isMountedRef.current) {
              setViewState('paid');
            }
            return;
          }
        } catch (verifyErr) {
          console.warn('Direct signature verify delayed. Continuing status polling...', verifyErr);
        }
      }

      if (!isMountedRef.current || hasFinishedRef.current) return;

      // Step 2: Immediate check
      const immediateConfirmed = await pollBackendStatus();
      if (immediateConfirmed || !isMountedRef.current || hasFinishedRef.current) return;

      // Step 3: Start polling every 1.5 seconds for up to 13 attempts (19.5s)
      let attempts = 0;
      timerRef.current = setInterval(async () => {
        if (!isMountedRef.current || hasFinishedRef.current) {
          stopPolling();
          return;
        }

        attempts++;
        if (isMountedRef.current) {
          setPollCount(attempts);
        }

        if (attempts >= MAX_POLLING_ATTEMPTS) {
          stopPolling();
          hasFinishedRef.current = true;
          if (isMountedRef.current) {
            setErrorMessage('Your payment verification is taking longer than expected. If money was debited from your account, please check your order history before attempting another payment.');
            setViewState('failed');
          }
          return;
        }

        const confirmed = await pollBackendStatus();
        if (confirmed) {
          stopPolling();
        }
      }, POLLING_INTERVAL_MS);
    };

    runVerification();

    return () => {
      isMountedRef.current = false;
      stopPolling();
    };
  }, [shouldVerifyInitial, targetOrderId, rzpPaymentId, rzpOrderId, rzpSignature, initialOrder, pollBackendStatus, stopPolling, clearCart]);

  // Derived order details
  const orderNumber = order?.order_number || order?.orderNumber || (targetOrderId ? `#${targetOrderId}` : "Order Confirmed");
  const orderId = order?.id || targetOrderId || '';
  const paymentMethod = order?.payment_method || 'UPI / Online';
  const isPaid = order?.payment_status === 'COMPLETED' || order?.payment_status === 'PAID' || order?.payment_status === 'Paid';
  const orderDate = order?.created_at
    ? new Date(order.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })
    : new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });

  const totalAmount = order?.total_amount !== undefined
    ? Number(order.total_amount).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : null;

  // =========================================================================
  // STATE 1: VERIFYING YOUR PAYMENT (Clean loading state with spinner)
  // =========================================================================
  if (viewState === 'verifying') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center animate-in fade-in duration-200">
        <div className="bg-white border border-[#D9E1E8] rounded-2xl p-10 shadow-sm text-center">
          <div className="relative w-20 h-20 mx-auto mb-6 flex items-center justify-center">
            <div className="w-20 h-20 border-4 border-[#D9E1E8] border-t-[#1769AA] rounded-full animate-spin"></div>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-2xl">⚡</span>
            </div>
          </div>

          <h1 className="text-3xl font-bold text-[#0B3A63] mb-2 font-['Outfit']">
            Verifying your payment...
          </h1>
          <p className="text-base text-[#17212B] font-medium mb-2">
            Please wait while we confirm your payment with your bank. Do not refresh or close this page.
          </p>
          <p className="text-xs text-[#667085] mb-6">
            {statusMessage}
            {pollCount > 0 && ` (Checking: ${Math.round(pollCount * 1.5)}s / 20s)`}
          </p>

          {/* Order Reference Box */}
          {targetOrderId && (
            <div className="bg-[#F6F8FA] border border-[#D9E1E8] rounded-xl p-4 text-xs sm:text-sm text-[#17212B] max-w-md mx-auto space-y-2 mb-6 text-left">
              <div className="flex justify-between items-center">
                <span className="text-[#667085] font-medium">Order Reference:</span>
                <span className="font-mono font-bold text-[#0B3A63]">#{targetOrderId}</span>
              </div>
              {totalAmount && (
                <div className="flex justify-between items-center border-t border-slate-200/60 pt-2">
                  <span className="text-[#667085] font-medium">Payable Amount:</span>
                  <span className="font-bold text-[#1769AA]">₹{totalAmount}</span>
                </div>
              )}
              <div className="flex justify-between items-center border-t border-slate-200/60 pt-2">
                <span className="text-[#667085] font-medium">Payment Mode:</span>
                <span className="font-semibold text-slate-700 uppercase">{paymentMethod}</span>
              </div>
            </div>
          )}

          <div className="flex items-center justify-center gap-2 text-[11px] text-[#667085]">
            <span className="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
            <span>Secure Gateway Verification in Progress</span>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // STATE 2: PAYMENT FAILED
  // =========================================================================
  if (viewState === 'failed') {
    return (
      <div className="max-w-2xl mx-auto px-4 py-16 text-center animate-in zoom-in-95 duration-200">
        <div className="bg-white border border-[#D9E1E8] rounded-2xl p-10 shadow-sm text-center">
          <div className="w-20 h-20 bg-red-50 border-2 border-red-200 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
            <svg className="w-10 h-10 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </div>

          <h1 className="text-3xl font-bold text-[#0B3A63] mb-2 font-['Outfit']">
            Payment Failed
          </h1>
          <p className="text-base text-red-600 font-medium mb-2">
            {errorMessage || 'Your payment was declined by your bank or the gateway.'}
          </p>
          <p className="text-xs text-[#667085] mb-6">
            Your order items and reserved cart have been preserved safely. No duplicate charges occurred.
          </p>

          <div className="bg-[#F6F8FA] rounded-xl p-5 mb-6 text-left max-w-md mx-auto">
            {targetOrderId && (
              <div className="flex justify-between items-center mb-3">
                <span className="text-sm font-semibold text-[#17212B]">Order Reference</span>
                <span className="text-sm font-bold text-[#1769AA] font-mono">#{targetOrderId}</span>
              </div>
            )}
            {totalAmount && (
              <div className="flex justify-between items-center mb-3 border-t border-slate-200/60 pt-2">
                <span className="text-sm font-semibold text-[#17212B]">Amount</span>
                <span className="text-sm font-bold text-[#0B3A63]">₹{totalAmount}</span>
              </div>
            )}
            <div className="flex justify-between items-center border-t border-slate-200/60 pt-2">
              <span className="text-sm font-semibold text-[#17212B]">Payment Status</span>
              <span className="inline-flex items-center gap-1.5 font-bold text-red-700 bg-red-50 px-2.5 py-0.5 rounded-full border border-red-200 text-xs">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span> Failed
              </span>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3 justify-center max-w-md mx-auto">
            <Link
              to="/checkout"
              className="flex-1 bg-[#F2A900] hover:bg-[#D4920A] text-[#0A2540] font-bold py-3.5 px-6 rounded-xl transition-all shadow-md text-sm text-center"
            >
              ⚡ Retry Payment
            </Link>
            <Link
              to="/account/orders"
              className="flex-1 bg-white border border-[#D9E1E8] hover:border-[#1769AA] text-[#17212B] font-semibold py-3.5 px-6 rounded-xl transition-all text-center text-sm"
            >
              View Order History
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // =========================================================================
  // STATE 3: ORDER PLACED / PAYMENT CONFIRMED (Canonical Success Screen)
  // =========================================================================
  return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center animate-in zoom-in-95 duration-200">
      <div className="bg-white border border-[#D9E1E8] rounded-2xl p-10 shadow-sm">
        <div className="w-20 h-20 bg-[#ECFDF5] rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-[#12773D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-[#0B3A63] mb-2" style={{ fontFamily: "Outfit" }}>
          {isPaid ? "Payment Successful" : "Order Placed!"}
        </h1>
        <p className="text-lg font-semibold text-[#12773D] mb-1">Your order has been placed successfully.</p>
        <p className="text-[#667085] mb-2">Thank you for shopping with {COMPANY_NAME}.</p>
        <p className="text-sm text-[#667085] mb-6">Your order confirmation has been recorded successfully.</p>

        <div className="bg-[#F6F8FA] rounded-xl p-5 mb-6 text-left">
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm font-semibold text-[#17212B]">Order Number</span>
            <span className="text-sm font-bold text-[#1769AA] font-mono">{orderNumber}</span>
          </div>
          {orderId && (
            <div className="flex justify-between items-center mb-3 border-t border-slate-200/60 pt-2">
              <span className="text-sm font-semibold text-[#17212B]">Order ID</span>
              <span className="text-sm font-medium text-slate-700 font-mono">#{orderId}</span>
            </div>
          )}
          {paymentMethod && (
            <div className="flex justify-between items-center mb-3 border-t border-slate-200/60 pt-2">
              <span className="text-sm font-semibold text-[#17212B]">Payment Method</span>
              <span className="text-sm font-medium text-slate-700 uppercase bg-slate-100 px-2 py-0.5 rounded">{paymentMethod}</span>
            </div>
          )}
          {totalAmount && (
            <div className="flex justify-between items-center mb-3 border-t border-slate-200/60 pt-2">
              <span className="text-sm font-semibold text-[#17212B]">
                {isPaid ? 'Total Paid' : 'Total Payable'}
              </span>
              <div className="text-right">
                <span className="text-sm font-bold text-[#0B3A63]">₹{totalAmount}</span>
                {order?.payment_status && (
                  <span className={`ml-2 text-xs px-2 py-0.5 rounded font-semibold ${
                    isPaid ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                  }`}>
                    {order.payment_status}
                  </span>
                )}
              </div>
            </div>
          )}
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm font-semibold text-[#17212B]">Order Date</span>
            <span className="text-sm text-[#667085]">{orderDate}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm font-semibold text-[#17212B]">Expected Delivery</span>
            <span className="text-sm text-[#667085]">3–5 business days</span>
          </div>
        </div>

        {/* Server-Controlled Razorpay Payment Handle Fallback Banner */}
        {(order?.payment_method?.toUpperCase().includes('HANDLE') || location.state?.isPaymentHandle) && order?.payment_status !== 'Paid' && (
          <div className="bg-[#FFFBEB] border-2 border-[#FCD34D] rounded-xl p-6 mb-8 text-left shadow-xs">
            <div className="flex items-start gap-3.5">
              <span className="text-3xl flex-shrink-0">🔗</span>
              <div className="flex-1">
                <h3 className="font-bold text-[#92400E] text-lg font-['Outfit']">Complete Payment via Razorpay</h3>
                <p className="text-sm text-[#B45309] mt-1.5 leading-relaxed">
                  Your order has been recorded in <strong className="font-semibold">Pending Payment</strong> status and your items are reserved.
                  Please complete the payment of <strong className="text-[#0B3A63] font-bold">₹{totalAmount}</strong> using our verified Razorpay payment handle.
                </p>

                <div className="bg-white border border-[#FCD34D] rounded-xl p-4 my-4 space-y-2 text-xs">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-slate-500 font-medium">Payment Destination:</span>
                    <a
                      href={location.state?.paymentHandleUrl || "https://razorpay.me/@veepowerelectricals"}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-mono font-bold text-[#1769AA] hover:underline flex items-center gap-1"
                    >
                      {location.state?.paymentHandleUrl || "https://razorpay.me/@veepowerelectricals"} ↗
                    </a>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2">
                    <span className="text-slate-500 font-medium">Reference to enter on Razorpay:</span>
                    <span className="font-mono font-bold text-[#0B3A63] bg-slate-100 px-2 py-0.5 rounded">{orderNumber}</span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-2">
                    <span className="text-slate-500 font-medium">Payable Amount:</span>
                    <span className="font-bold text-[#12773D] text-sm">₹{totalAmount}</span>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <a
                    href={location.state?.paymentHandleUrl || "https://razorpay.me/@veepowerelectricals"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 bg-[#1769AA] hover:bg-[#0B3A63] text-white font-bold text-sm px-6 py-3 rounded-xl transition-colors shadow-sm"
                  >
                    <span>💳</span> Open Razorpay Payment Link ↗
                  </a>
                </div>

                <div className="mt-4 p-3 bg-amber-50/80 rounded-lg border border-amber-200/60 text-[11px] text-amber-900 space-y-1">
                  <p className="font-bold flex items-center gap-1">
                    <span>⚠️</span> Notice Regarding Payment Reconciliation:
                  </p>
                  <p>
                    Opening this link or submitting a payment screenshot does not automatically mark your order as paid.
                    Our accounts team verifies and reconciles handle payments against order number <span className="font-mono font-bold">{orderNumber}</span> before order packing and dispatch.
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Canonical timeline preview */}
        <div className="flex items-center justify-center gap-0 mb-8">
          {["Placed", "Confirmed", "Packed", "Shipped", "Delivered"].map((status, i) => (
            <div key={status} className="flex items-center">
              <div className="flex flex-col items-center gap-1">
                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? "bg-[#12773D] text-white" : "bg-[#D9E1E8] text-[#667085]"}`}>
                  {i === 0 ? "✓" : i + 1}
                </div>
                <span className="text-[9px] text-[#667085] text-center max-w-[50px]">{status}</span>
              </div>
              {i < 4 && <div className="w-6 sm:w-10 h-0.5 bg-[#D9E1E8] mb-4 flex-shrink-0" />}
            </div>
          ))}
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link to="/account/orders" className="bg-[#0B3A63] hover:bg-[#1769AA] text-white font-semibold px-6 py-3 rounded-lg transition-colors">
            View Order
          </Link>
          <Link to="/shop" className="bg-white border border-[#D9E1E8] hover:border-[#1769AA] text-[#17212B] font-semibold px-6 py-3 rounded-lg transition-colors">
            Continue Shopping
          </Link>
        </div>
      </div>
    </div>
  );
}
