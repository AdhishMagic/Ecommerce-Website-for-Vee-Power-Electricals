import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useCart } from "../../context/CartContext";
import { useAuth } from "../../context/AuthContext";
import { addressesApi } from "../../api/addresses";
import { ordersApi } from "../../api/orders";
import { paymentsApi } from "../../api/payments";
import { configApi } from "../../api/config";
import { CustomerAddress, DeliveryConfiguration, PaymentIntentResponse } from "../../types/api";
import { resolveProductImage, handleProductImageError } from "../../utils/productImageResolver";
import { loadRazorpayScript, isRazorpayLoaded } from "../../utils/razorpay";
import PaymentVerificationView from "../../components/customer/PaymentVerificationView";

const steps = ["Address", "Review", "Payment", "Confirm"];

type PaymentLifecycle = 'idle' | 'initiating' | 'gateway_open' | 'verifying' | 'cancelled' | 'failed' | 'timeout_pending';

export default function Checkout() {
  const { items: cartItems, subtotal: cartSubtotal, clearCart, removeFromCart } = useCart();
  const { user } = useAuth();
  const [step, setStep] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("upi");
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);

  // Hardened Payment State & Order Persistence
  const [createdOrder, setCreatedOrder] = useState<any | null>(null);
  const [verificationPayload, setVerificationPayload] = useState<any | null>(null);
  const [verifyingOrderId, setVerifyingOrderId] = useState<number | null>(null);
  const [paymentLifecycle, setPaymentLifecycle] = useState<PaymentLifecycle>('idle');
  const [paymentErrorMessage, setPaymentErrorMessage] = useState<string>("");
  const [activePaymentIntent, setActivePaymentIntent] = useState<PaymentIntentResponse | null>(null);
  const [paymentConfig, setPaymentConfig] = useState<{
    key_id: string;
    payment_handle: string;
    is_live: boolean;
    gateway_enabled: boolean;
    currency: string;
  }>({
    key_id: '',
    payment_handle: 'https://razorpay.me/@veepowerelectricals',
    is_live: false,
    gateway_enabled: true,
    currency: 'INR',
  });

  const navigate = useNavigate();
  const location = useLocation();

  // Saved addresses and commercial configuration from database
  const [savedAddresses, setSavedAddresses] = useState<CustomerAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<number | null>(null);
  const [useNewAddress, setUseNewAddress] = useState(false);
  const [deliveryConfig, setDeliveryConfig] = useState<DeliveryConfiguration | null>(null);
  const [shippingRules, setShippingRules] = useState<any[]>([]);
  const [isLoadingInitialData, setIsLoadingInitialData] = useState(true);

  // Address and Validation states
  const [validationError, setValidationError] = useState("");

  const [newAddress, setNewAddress] = useState({
    name: "", phone: "", line1: "", line2: "", city: "Coimbatore", state: "Tamil Nadu", pincode: "",
  });

  // Pre-fill user details into new address if available
  useEffect(() => {
    if (user) {
      setNewAddress(prev => ({
        ...prev,
        name: prev.name || user.name || '',
        phone: prev.phone || user.phone || '',
      }));
    }
  }, [user]);

  // Single Item Checkout Logic
  const singleItemState = location.state as { singleItem: string, quantity: number } | null;
  const isSingleItem = !!singleItemState?.singleItem;

  let checkoutItems = cartItems;
  let checkoutSubtotal = cartSubtotal;

  if (isSingleItem) {
    const foundItem = cartItems.find(i => String(i.product.id) === String(singleItemState.singleItem));
    if (foundItem) {
      checkoutItems = [{ ...foundItem, quantity: singleItemState.quantity }];
      checkoutSubtotal = Number(foundItem.product.price) * singleItemState.quantity;
    } else {
      checkoutItems = [];
      checkoutSubtotal = 0;
    }
  }

  // Load customer addresses and delivery configuration directly from database on mount
  useEffect(() => {
    let isMounted = true;
    const loadInitial = async () => {
      setIsLoadingInitialData(true);
      try {
        const [addrs, configs, payCfg, rules] = await Promise.all([
          addressesApi.getAddresses().catch(() => []),
          configApi.getDeliveryConfig({ forceRefresh: true }).catch(() => []),
          paymentsApi.getPaymentConfig().catch(() => null),
          configApi.getShippingRules({ forceRefresh: true }).catch(() => []),
        ]);
        if (isMounted) {
          if (payCfg) {
            setPaymentConfig(payCfg);
          }
          if (rules) {
            setShippingRules(rules);
          }
          setSavedAddresses(addrs);
          if (addrs.length > 0) {
            const def = addrs.find(a => a.is_default) || addrs[0];
            setSelectedAddressId(def.id);
            setUseNewAddress(false);
          } else {
            setUseNewAddress(true);
          }

          if (configs.length > 0) {
            const active = configs.find(c => c.is_active) || configs[0];
            setDeliveryConfig(active);
          }
        }
      } catch (err) {
        console.error("Failed to load checkout settings:", err);
      } finally {
        if (isMounted) {
          setIsLoadingInitialData(false);
        }
      }
    };

    loadInitial();
    return () => {
      isMounted = false;
    };
  }, []);

  // Preload Razorpay Checkout SDK once on mount for instant opening
  useEffect(() => {
    loadRazorpayScript().catch((err) => {
      console.warn("Background preloading of Razorpay script failed:", err);
    });
  }, []);

  // Check for Razorpay redirect callback parameters in URL (e.g. mobile GPay/UPI redirect return)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const rzpPayId = params.get('razorpay_payment_id');
    const rzpOrdId = params.get('razorpay_order_id');
    const rzpSig = params.get('razorpay_signature');
    const ordId = params.get('order_id');

    if (rzpPayId || ordId) {
      const targetId = Number(ordId);
      if (targetId) {
        if (rzpPayId && rzpSig) {
          setVerificationPayload({
            order_id: targetId,
            razorpay_order_id: rzpOrdId || '',
            razorpay_payment_id: rzpPayId,
            razorpay_signature: rzpSig,
            payment_method: 'UPI',
          });
        }
        setVerifyingOrderId(targetId);
        setPaymentLifecycle('verifying');
      }
    }
  }, [location.search]);

  // Compute display preview estimates (backend will calculate authoritative total on checkout)
  const activeAddr = savedAddresses.find(a => a.id === selectedAddressId) || (useNewAddress ? newAddress : null);
  const destState = (activeAddr?.state || "").trim().toLowerCase();
  const matchedRule = shippingRules.find(r => (r.state || "").trim().toLowerCase() === destState && r.is_active !== false);
  const baseShippingFee = matchedRule ? Number(matchedRule.cost) : (deliveryConfig ? Number(deliveryConfig.base_delivery_charge) : 0);
  const freeThreshold = deliveryConfig ? Number(deliveryConfig.free_delivery_threshold) : 0;
  const isFreeDelivery = deliveryConfig ? (deliveryConfig.free_delivery_enabled !== false && checkoutSubtotal >= freeThreshold) : true;
  const previewShipping = isFreeDelivery ? 0 : baseShippingFee;
  const previewTotal = Math.round((checkoutSubtotal + previewShipping) * 100) / 100;

  // Use authoritative order breakdown if order was created, otherwise preview values
  const displaySubtotal = createdOrder ? Number(createdOrder.subtotal) : checkoutSubtotal;
  const displayShipping = createdOrder ? Number(createdOrder.shipping_fee) : previewShipping;
  const displayTotal = createdOrder ? Number(createdOrder.total_amount) : previewTotal;

  const effectiveTotal = displayTotal;
  const isCOD = false;
  const payableAmount = effectiveTotal;

  const PAYMENT_OPTIONS = [
    {
      id: "upi",
      title: "UPI / QR Code",
      subtitle: "Pay securely using UPI apps or scan a QR code.",
      badge: "Fast & Instant",
      icon: (
        <svg className="w-5 h-5 text-[#1769AA]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <rect x="3" y="3" width="7" height="7" rx="1" />
          <rect x="14" y="3" width="7" height="7" rx="1" />
          <rect x="3" y="14" width="7" height="7" rx="1" />
          <path d="M14 14h3v3h-3z" />
          <path d="M21 14v3h-3" />
          <path d="M14 21h3v-3" />
          <path d="M21 21v.01" />
        </svg>
      ),
    },
    {
      id: "card",
      title: "Credit / Debit Card",
      subtitle: "Pay securely using your credit or debit card.",
      badge: "Cards Accepted",
      icon: (
        <svg className="w-5 h-5 text-[#1769AA]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <rect x="2" y="5" width="20" height="14" rx="2" />
          <line x1="2" y1="10" x2="22" y2="10" />
          <line x1="6" y1="15" x2="10" y2="15" />
        </svg>
      ),
    },
    {
      id: "netbanking",
      title: "Net Banking",
      subtitle: "Pay directly through your bank.",
      badge: "Major Banks",
      icon: (
        <svg className="w-5 h-5 text-[#1769AA]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path d="M3 21h18M3 10h18M5 10v11M9 10v11M15 10v11M19 10v11M12 2L2 7h20L12 2z" />
        </svg>
      ),
    },
  ];

  const handleContinueToReview = async () => {
    setValidationError("");

    if (useNewAddress || savedAddresses.length === 0) {
      if (!newAddress.name || !newAddress.phone || !newAddress.line1 || !newAddress.city || !newAddress.pincode) {
        setValidationError("Please fill out all required delivery address fields.");
        return;
      }

      const pinClean = newAddress.pincode.trim();
      if (!/^[1-9][0-9]{5}$/.test(pinClean)) {
        setValidationError("PIN code must be a valid 6-digit Indian postal code.");
        return;
      }

      // Save address via API
      try {
        const created = await addressesApi.createAddress({
          recipient_name: newAddress.name,
          phone: newAddress.phone,
          address_line1: newAddress.line1,
          address_line2: newAddress.line2,
          city: newAddress.city,
          state: newAddress.state,
          pincode: pinClean,
          address_type: 'home',
          is_default: savedAddresses.length === 0,
        });
        setSavedAddresses(prev => [created, ...prev]);
        setSelectedAddressId(created.id);
        setUseNewAddress(false);
      } catch (err: any) {
        setValidationError(err?.message || "Failed to save address. Please check fields.");
        return;
      }
    } else {
      if (!selectedAddressId) {
        setValidationError("Please select a delivery address.");
        return;
      }
      const addressExists = savedAddresses.some(a => a.id === selectedAddressId);
      if (!addressExists) {
        const fallback = savedAddresses.find(a => a.is_default) || savedAddresses[0];
        if (fallback) {
          setSelectedAddressId(fallback.id);
        } else {
          setValidationError("Please enter or select a valid delivery address.");
          setUseNewAddress(true);
          return;
        }
      }
    }

    setStep(1);
  };

  const handleVerifyPayment = (verifyPayload: {
    order_id: number;
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
    payment_method: string;
  }) => {
    setIsSubmittingOrder(false);
    setVerificationPayload(verifyPayload);
    setVerifyingOrderId(verifyPayload.order_id);
    setPaymentLifecycle('verifying');
  };

  const launchRazorpayCheckout = async (targetOrder: any) => {
    setIsSubmittingOrder(true);
    setPaymentLifecycle('initiating');
    setPaymentErrorMessage("");

    try {
      const backendPaymentMethod = paymentMethod.toUpperCase();
      // Parallelize payment intent initiation with Razorpay SDK script readiness
      const [paymentIntent, isLoaded] = await Promise.all([
        paymentsApi.initiatePayment(
          Number(targetOrder.id),
          backendPaymentMethod
        ),
        loadRazorpayScript(),
      ]);

      setActivePaymentIntent(paymentIntent);

      const effectiveKeyId = paymentIntent.key_id || paymentConfig?.key_id || import.meta.env.VITE_RAZORPAY_KEY_ID || 'rzp_live_U0UDkfEwDcShnF';
      const rzpConstructor = (window as any).Razorpay;

      if (isLoaded && typeof rzpConstructor === 'function') {
        setPaymentLifecycle('gateway_open');
        setIsSubmittingOrder(false);

        const options: any = {
          key: effectiveKeyId,
          amount: paymentIntent.amount, // Authoritative paise calculated server-side
          currency: paymentIntent.currency || "INR",
          name: "Vee Power Electricals",
          description: `Order #${targetOrder.order_number}`,
          prefill: {
            name: paymentIntent.customer_name || targetOrder.customer_name || activeShippingAddr?.recipient_name || '',
            email: paymentIntent.customer_email || targetOrder.customer_email || '',
            contact: paymentIntent.customer_phone || targetOrder.customer_phone || activeShippingAddr?.phone || '',
            ...(paymentMethod === 'upi' ? { method: 'upi' } : {}),
            ...(paymentMethod === 'card' ? { method: 'card' } : {}),
            ...(paymentMethod === 'netbanking' ? { method: 'netbanking' } : {}),
          },
          notes: {
            order_id: String(targetOrder.id),
          },
          theme: {
            color: "#0B3A63",
          },
          handler: (response: any) => {
            handleVerifyPayment({
              order_id: Number(targetOrder.id),
              razorpay_order_id: response.razorpay_order_id || paymentIntent.gateway_order_id || '',
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature || '',
              payment_method: backendPaymentMethod,
            });
          },
          modal: {
            ondismiss: async () => {
              // Customer dismissed or exited Razorpay modal.
              // Perform a rapid non-blocking status check in case payment was confirmed via webhook:
              try {
                const checkRes = await paymentsApi.getOrderPaymentStatus(Number(targetOrder.id));
                const st = (checkRes?.status || '').toUpperCase();
                const defSt = (checkRes?.definitive_status || '').toUpperCase();
                const paySt = (checkRes?.order_payment_status || checkRes?.payment_status || '').toUpperCase();
                if (st === 'SUCCESS' || defSt === 'SUCCESS' || paySt === 'PAID') {
                  setVerifyingOrderId(Number(targetOrder.id));
                  setPaymentLifecycle('verifying');
                  return;
                }
              } catch {
                // Ignore network error on quick check
              }
              // Payment was not completed — customer cleanly exited Razorpay.
              // Return directly to checkout so user can retry or change payment method!
              setIsSubmittingOrder(false);
              setPaymentLifecycle('cancelled');
              setPaymentErrorMessage('Payment was not completed. You can retry or choose another payment method.');
            },
          },
        };

        const gOrderId = paymentIntent.gateway_order_id || paymentIntent.razorpay_order_id;
        if (gOrderId && gOrderId.startsWith('order_')) {
          options.order_id = gOrderId;
        }

        const rzp = new rzpConstructor(options);
        rzp.on('payment.failed', (failRes: any) => {
          const reason = failRes?.error?.description || failRes?.error?.reason || "Payment was declined by your bank or gateway.";
          console.warn("Razorpay payment.failed event received:", reason);
          setIsSubmittingOrder(false);
          setPaymentErrorMessage(reason);
          setPaymentLifecycle('failed');
        });
        rzp.open();
      } else {
        // Razorpay SDK could not load (e.g. adblocker or CDN issue)
        setPaymentLifecycle('failed');
        setIsSubmittingOrder(false);
        setPaymentErrorMessage("Unable to open Razorpay payment gateway. Please check your internet connection or disable ad-blockers and retry.");
      }
    } catch (payErr: any) {
      setPaymentLifecycle('failed');
      setIsSubmittingOrder(false);
      setPaymentErrorMessage(payErr?.message || "Failed to initiate payment gateway intent. Please retry.");
    }
  };

  const handlePlaceOrder = async () => {
    const activeAddress = savedAddresses.find(a => a.id === selectedAddressId);
    if (!selectedAddressId || !activeAddress) {
      setValidationError("A valid shipping address is required. Please select or add your delivery address.");
      setStep(0);
      return;
    }

    setValidationError("");

    // If order was already created previously, reuse it to prevent duplicate orders & stock deductions
    if (createdOrder) {
      await launchRazorpayCheckout(createdOrder);
      return;
    }

    setIsSubmittingOrder(true);

    const orderItems = checkoutItems.map(item => ({
      product_id: Number(item.product.id),
      quantity: item.quantity,
    }));

    try {
      const backendPaymentMethod = paymentMethod.toUpperCase();
      const order = await ordersApi.checkout({
        shipping_address_id: selectedAddressId,
        items: orderItems,
        payment_method: backendPaymentMethod,
      });

      setCreatedOrder(order);

      // Launch official Razorpay standard checkout for all 4 options
      await launchRazorpayCheckout(order);
    } catch (err: any) {
      setValidationError(err?.message || "Order placement failed. Please verify items and available stock.");
      setIsSubmittingOrder(false);
    }
  };

  if (paymentLifecycle === 'verifying' && (createdOrder || verifyingOrderId)) {
    const activeId = Number(createdOrder?.id || verifyingOrderId);
    return (
      <div className="max-w-4xl mx-auto px-4 py-8">
        <PaymentVerificationView
          orderId={activeId}
          orderNumber={createdOrder?.order_number}
          amount={createdOrder?.total_amount || payableAmount}
          paymentMethod={paymentMethod.toUpperCase()}
          verifyPayload={verificationPayload}
          onSuccess={() => {
            if (isSingleItem && singleItemState?.singleItem) {
              removeFromCart(singleItemState.singleItem);
            } else {
              clearCart();
            }
          }}
          onRetryPayment={() => {
            setPaymentLifecycle('idle');
            setVerificationPayload(null);
            if (createdOrder) {
              launchRazorpayCheckout(createdOrder);
            }
          }}
          onReturnToOrders={() => {
            navigate('/account/orders');
          }}
          onCancel={() => {
            setPaymentLifecycle('cancelled');
            setVerificationPayload(null);
            setPaymentErrorMessage("Payment was not completed. You can choose a method below or retry.");
          }}
        />
      </div>
    );
  }

  if (checkoutItems.length === 0 && !createdOrder && !verifyingOrderId) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center">
        <h2 className="text-2xl font-bold text-[#0B3A63] mb-4">Your checkout is empty</h2>
        <Link to="/shop" className="text-[#1769AA] underline">Go to Shop</Link>
      </div>
    );
  }

  const activeShippingAddr = savedAddresses.find(a => a.id === selectedAddressId);

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-[#0B3A63] mb-6">Checkout</h1>

      {/* Steps */}
      <div className="flex items-center mb-8">
        {steps.map((s, i) => (
          <div key={s} className="flex items-center flex-1">
            <div className={`flex items-center gap-2 ${i <= step ? "text-[#1769AA]" : "text-[#667085]"}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 ${i < step ? "bg-[#12773D] border-[#12773D] text-white" : i === step ? "border-[#1769AA] text-[#1769AA]" : "border-[#D9E1E8] text-[#667085]"}`}>
                {i < step ? "✓" : i + 1}
              </div>
              <span className="text-sm font-medium hidden sm:inline">{s}</span>
            </div>
            {i < steps.length - 1 && <div className={`flex-1 h-0.5 mx-2 ${i < step ? "bg-[#12773D]" : "bg-[#D9E1E8]"}`} />}
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Step Content */}
        <div className="lg:col-span-2 min-w-0">
          {validationError && (
            <div className="bg-[#FEF2F2] border border-[#FCA5A5] text-[#C0392B] px-4 py-3 rounded-lg mb-6 text-sm font-medium flex gap-2 items-center">
              <span>⚠️</span> {validationError}
            </div>
          )}

          {step === 0 && (
            <div className="bg-white border border-[#D9E1E8] rounded-xl p-6 shadow-sm">
              <div className="flex flex-wrap gap-4 justify-between items-center mb-6 pb-4 border-b border-[#D9E1E8]">
                <h2 className="font-bold text-[#0B3A63] text-lg">Delivery Information</h2>
              </div>

              {isLoadingInitialData ? (
                <div className="space-y-4 py-2 animate-pulse">
                  <div className="h-4 bg-slate-200 rounded w-1/3 mb-4"></div>
                  <div className="p-4 border-2 border-slate-200 rounded-xl space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="h-4 bg-slate-200 rounded w-1/4"></div>
                      <div className="h-4 bg-slate-200 rounded w-16"></div>
                    </div>
                    <div className="h-3 bg-slate-200 rounded w-3/4"></div>
                    <div className="h-3 bg-slate-200 rounded w-1/2"></div>
                    <div className="h-3 bg-slate-200 rounded w-1/3"></div>
                  </div>
                  <div className="h-12 bg-slate-200 rounded-lg w-full mt-4"></div>
                </div>
              ) : (
                <>
                  {/* Saved Addresses List */}
                  {savedAddresses.length > 0 && !useNewAddress && (
                    <div className="mb-6 space-y-3">
                      <div className="flex justify-between items-center mb-2">
                        <h3 className="font-semibold text-sm text-[#17212B]">Select Delivery Address</h3>
                        <button
                          type="button"
                          onClick={() => setUseNewAddress(true)}
                          className="text-xs text-[#1769AA] hover:underline font-medium"
                        >
                          + Add New Address
                        </button>
                      </div>
                      <div className="grid gap-3">
                        {savedAddresses.map(addr => (
                          <label
                            key={addr.id}
                            className={`block p-4 rounded-xl border-2 cursor-pointer transition-all ${selectedAddressId === addr.id ? 'border-[#1769AA] bg-[#EFF6FF]' : 'border-[#D9E1E8] hover:border-slate-300'}`}
                          >
                            <div className="flex items-start gap-3">
                              <input
                                type="radio"
                                name="saved_address"
                                checked={selectedAddressId === addr.id}
                                onChange={() => setSelectedAddressId(addr.id)}
                                className="mt-1 accent-[#1769AA]"
                              />
                              <div className="text-sm">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-[#17212B]">{addr.recipient_name}</span>
                                  <span className="text-xs bg-slate-100 px-2 py-0.5 rounded text-slate-600 uppercase font-medium">{addr.address_type}</span>
                                  {addr.is_default && <span className="text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded font-semibold">Default</span>}
                                </div>
                                <p className="text-slate-600 mt-1">{addr.address_line1}{addr.address_line2 ? `, ${addr.address_line2}` : ''}</p>
                                <p className="text-slate-600">{addr.city}, {addr.state} - {addr.pincode}</p>
                                <p className="text-slate-500 text-xs mt-1">Phone: {addr.phone}</p>
                              </div>
                            </div>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Enter New Address Form */}
                  {(useNewAddress || savedAddresses.length === 0) && (
                    <div className="border border-[#D9E1E8] rounded-xl p-5 mb-6">
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-[#0B3A63] flex items-center gap-2">
                          <span>📍</span> Enter Delivery Address
                        </h3>
                        {savedAddresses.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setUseNewAddress(false)}
                            className="text-xs text-[#1769AA] hover:underline font-medium"
                          >
                            Select from saved
                          </button>
                        )}
                      </div>
                      <div className="grid gap-4">
                        <div className="grid sm:grid-cols-2 gap-4">
                          <div>
                            <label className="text-sm font-medium text-[#17212B] mb-1.5 block">Full Name *</label>
                            <input value={newAddress.name} onChange={e => setNewAddress(a => ({...a, name: e.target.value}))} className="w-full border border-[#D9E1E8] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1769AA]" placeholder="Rajesh Kumar" />
                          </div>
                          <div>
                            <label className="text-sm font-medium text-[#17212B] mb-1.5 block">Mobile *</label>
                            <input value={newAddress.phone} onChange={e => setNewAddress(a => ({...a, phone: e.target.value}))} className="w-full border border-[#D9E1E8] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1769AA]" placeholder="+91 98765 43210" />
                          </div>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-[#17212B] mb-1.5 block">Address Line 1 *</label>
                          <input value={newAddress.line1} onChange={e => setNewAddress(a => ({...a, line1: e.target.value}))} className="w-full border border-[#D9E1E8] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1769AA]" placeholder="House/Flat No., Street Name" />
                        </div>
                        <div>
                          <label className="text-sm font-medium text-[#17212B] mb-1.5 block">Address Line 2</label>
                          <input value={newAddress.line2} onChange={e => setNewAddress(a => ({...a, line2: e.target.value}))} className="w-full border border-[#D9E1E8] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1769AA]" placeholder="Landmark, Area" />
                        </div>
                        <div className="grid sm:grid-cols-3 gap-4">
                          <div>
                            <label className="text-sm font-medium text-[#17212B] mb-1.5 block">City *</label>
                            <input value={newAddress.city} onChange={e => setNewAddress(a => ({...a, city: e.target.value}))} className="w-full border border-[#D9E1E8] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1769AA]" />
                          </div>
                          <div>
                            <label className="text-sm font-medium text-[#17212B] mb-1.5 block">State *</label>
                            <input value={newAddress.state} onChange={e => setNewAddress(a => ({...a, state: e.target.value}))} className="w-full border border-[#D9E1E8] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1769AA]" />
                          </div>
                          <div>
                            <label className="text-sm font-medium text-[#17212B] mb-1.5 block">Pincode *</label>
                            <input value={newAddress.pincode} onChange={e => setNewAddress(a => ({...a, pincode: e.target.value}))} className="w-full border border-[#D9E1E8] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1769AA]" placeholder="641001" />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <button
                    onClick={handleContinueToReview}
                    className="w-full mt-4 bg-[#0B3A63] hover:bg-[#1769AA] text-white font-semibold px-8 py-3.5 rounded-lg transition-colors flex justify-center items-center gap-2"
                  >
                    Continue to Review
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                  </button>
                </>
              )}
            </div>
          )}

          {step === 1 && (
            <div className="bg-white border border-[#D9E1E8] rounded-xl p-6 shadow-sm">
              <h2 className="font-bold text-[#0B3A63] text-lg mb-5">Review Order</h2>

              <div className="space-y-3 mb-6">
                {checkoutItems.map(item => (
                  <div key={item.product.id} className="flex gap-4 py-4 border-b border-[#D9E1E8] last:border-0">
                    <img
                      src={resolveProductImage(item.product)}
                      alt={item.product.name}
                      className="w-16 h-16 object-contain p-1 rounded-lg bg-[#F8FAFC] border border-[#E2E8F0]"
                      onError={(e) => handleProductImageError(e, item.product.category)}
                    />
                    <div className="flex-1">
                      <p className="font-semibold text-[#17212B] line-clamp-1">{item.product.name}</p>
                      <p className="text-xs text-[#667085] mt-1">{item.product.brand} · Qty: {item.quantity}</p>
                    </div>
                    <p className="font-bold text-[#0B3A63]">₹{(Number(item.product.price) * item.quantity).toLocaleString("en-IN")}</p>
                  </div>
                ))}
              </div>

              {activeShippingAddr && (
                <div className="bg-[#F6F8FA] border border-[#D9E1E8] rounded-xl p-5 text-sm text-[#667085] mb-6">
                  <div className="space-y-1.5">
                    <h4 className="font-bold text-[#17212B] mb-2 border-b border-[#D9E1E8] pb-2 flex items-center gap-2">
                      <span>📍</span> Delivery Address
                    </h4>
                    <p className="font-bold text-[#17212B]">{activeShippingAddr.recipient_name}</p>
                    <p className="text-[#1769AA] font-medium">{activeShippingAddr.phone}</p>
                    <p className="pt-1">{activeShippingAddr.address_line1}{activeShippingAddr.address_line2 ? `, ${activeShippingAddr.address_line2}` : ''}</p>
                    <p>{activeShippingAddr.city}, {activeShippingAddr.state} - {activeShippingAddr.pincode}</p>
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <button onClick={() => setStep(0)} className="px-6 py-3 border border-[#D9E1E8] rounded-lg font-medium text-[#667085] hover:text-[#17212B] hover:bg-[#F6F8FA] transition-colors">← Edit Details</button>
                <button onClick={() => setStep(2)} className="flex-1 bg-[#0B3A63] hover:bg-[#1769AA] text-white font-semibold px-8 py-3 rounded-lg transition-colors text-center">Continue to Payment</button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="bg-white border border-[#D9E1E8] rounded-xl p-6 shadow-sm">
              <h2 className="font-bold text-[#0B3A63] text-lg mb-5">Select Payment Method</h2>

              {/* Status Banner: Cancelled State - Compact Modern E-Commerce Style */}
              {createdOrder && paymentLifecycle === 'cancelled' && (
                <div className="mb-5 px-4 py-3 bg-amber-50/90 border border-amber-200 rounded-xl flex items-center justify-between gap-3 text-amber-900 text-xs sm:text-sm animate-in fade-in duration-150">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-amber-500 text-base shrink-0">⚠️</span>
                    <p className="font-medium truncate">
                      Payment was cancelled. You can choose a method below or retry.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => launchRazorpayCheckout(createdOrder)}
                      disabled={isSubmittingOrder}
                      className="text-xs font-bold text-amber-900 bg-amber-200/80 hover:bg-amber-300 px-3 py-1.5 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                    >
                      Retry
                    </button>
                    <button
                      type="button"
                      onClick={() => setPaymentLifecycle('idle')}
                      className="text-amber-700/60 hover:text-amber-900 text-xs p-1 cursor-pointer"
                      title="Dismiss"
                      aria-label="Dismiss alert"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )}

              {/* Status Banner: Failed State */}
              {createdOrder && paymentLifecycle === 'failed' && (
                <div className="mb-5 px-4 py-3 bg-red-50/90 border border-red-200 rounded-xl flex items-center justify-between gap-3 text-red-900 text-xs sm:text-sm animate-in fade-in duration-150">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-red-500 text-base shrink-0">❌</span>
                    <p className="font-medium truncate">
                      {paymentErrorMessage || "Payment failed or declined. Please choose another method or retry."}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => {
                        setPaymentErrorMessage('');
                        launchRazorpayCheckout(createdOrder);
                      }}
                      disabled={isSubmittingOrder}
                      className="text-xs font-bold text-white bg-red-600 hover:bg-red-700 px-3 py-1.5 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                    >
                      Retry
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPaymentLifecycle('idle');
                        setPaymentErrorMessage('');
                      }}
                      className="text-red-700/60 hover:text-red-900 text-xs p-1 cursor-pointer"
                      title="Dismiss"
                      aria-label="Dismiss alert"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )}

              {/* Status Banner: Verification Delayed / Timeout Pending State */}
              {createdOrder && paymentLifecycle === 'timeout_pending' && (
                <div className="mb-5 px-4 py-3 bg-blue-50/90 border border-blue-200 rounded-xl flex items-center justify-between gap-3 text-blue-900 text-xs sm:text-sm animate-in fade-in duration-150">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="text-blue-500 text-base shrink-0">⏳</span>
                    <p className="font-medium truncate">
                      Payment confirmation pending with bank. Check your bank app before retrying.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Link
                      to="/account/orders"
                      className="text-xs font-bold text-blue-900 bg-blue-200/80 hover:bg-blue-300 px-3 py-1.5 rounded-lg transition-colors whitespace-nowrap"
                    >
                      My Orders
                    </Link>
                    <button
                      type="button"
                      onClick={() => setPaymentLifecycle('idle')}
                      className="text-blue-700/60 hover:text-blue-900 text-xs p-1 cursor-pointer"
                      title="Dismiss"
                      aria-label="Dismiss alert"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )}

              {/* 4 Polished Payment Options */}
              <div className="space-y-3 mb-6">
                {PAYMENT_OPTIONS.map((method) => {
                  const isSelected = paymentMethod === method.id;
                  return (
                    <label
                      key={method.id}
                      htmlFor={`payment-opt-${method.id}`}
                      className={`relative flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all duration-200 select-none ${
                        isSelected
                          ? "border-[#1769AA] bg-[#EFF6FF] shadow-xs"
                          : "border-[#D9E1E8] bg-white hover:border-[#1769AA]/50 hover:bg-slate-50/60"
                      }`}
                    >
                      <input
                        type="radio"
                        id={`payment-opt-${method.id}`}
                        name="payment_selection"
                        value={method.id}
                        checked={isSelected}
                        onChange={(e) => {
                          setPaymentMethod(e.target.value);
                          if (paymentLifecycle === 'cancelled' || paymentLifecycle === 'failed') {
                            setPaymentLifecycle('idle');
                          }
                        }}
                        className="w-4 h-4 text-[#1769AA] accent-[#1769AA] cursor-pointer focus:ring-2 focus:ring-[#1769AA]/40 shrink-0"
                      />
                      <div className="w-10 h-10 rounded-xl bg-white border border-slate-200/80 flex items-center justify-center shrink-0 shadow-2xs">
                        {method.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <p className="font-bold text-[#17212B] text-sm font-['Outfit']">{method.title}</p>
                          {method.badge && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
                              {method.badge}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[#667085] mt-0.5">{method.subtitle}</p>
                      </div>
                    </label>
                  );
                })}
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  disabled={isSubmittingOrder || paymentLifecycle === 'initiating' || paymentLifecycle === 'verifying'}
                  className="px-6 py-3 border border-[#D9E1E8] rounded-lg font-medium text-[#667085] hover:text-[#17212B] hover:bg-[#F6F8FA] transition-colors cursor-pointer disabled:opacity-50"
                >
                  ← Back
                </button>
                <button
                  type="button"
                  onClick={handlePlaceOrder}
                  disabled={isSubmittingOrder || paymentLifecycle === 'initiating' || paymentLifecycle === 'verifying' || paymentLifecycle === 'gateway_open'}
                  className="flex-1 bg-[#F2A900] hover:bg-[#D4920A] text-[#0A2540] font-bold py-3.5 rounded-xl shadow-md transition-all text-center text-lg disabled:opacity-60 cursor-pointer flex justify-center items-center gap-2"
                >
                  {paymentLifecycle === 'initiating' ? (
                    <>
                      <div className="w-5 h-5 border-2 border-[#0A2540] border-t-transparent rounded-full animate-spin"></div>
                      <span>Preparing payment…</span>
                    </>
                  ) : paymentLifecycle === 'gateway_open' ? (
                    <>
                      <div className="w-5 h-5 border-2 border-[#0A2540] border-t-transparent rounded-full animate-spin"></div>
                      <span>Opening payment…</span>
                    </>
                  ) : paymentLifecycle === 'verifying' ? (
                    <>
                      <div className="w-5 h-5 border-2 border-[#0A2540] border-t-transparent rounded-full animate-spin"></div>
                      <span>Verifying payment…</span>
                    </>
                  ) : createdOrder && (paymentLifecycle === 'cancelled' || paymentLifecycle === 'failed') ? (
                    `⚡ Retry Pay ₹${effectiveTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  ) : (
                    `Pay ₹${effectiveTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} & Place Order`
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Floating indicator while standard real Razorpay checkout is open */}
          {paymentLifecycle === 'gateway_open' && activePaymentIntent && (
            <div className="fixed bottom-6 right-6 z-40 bg-[#0B3A63] text-white px-5 py-4 rounded-2xl shadow-2xl border border-blue-400/30 max-w-sm flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin flex-shrink-0"></div>
              <div className="text-xs">
                <p className="font-bold">Razorpay Checkout Active</p>
                <p className="text-blue-100 mt-0.5">Please complete payment in the Razorpay window.</p>
              </div>
            </div>
          )}
        </div>

        {/* Order summary sidebar */}
        <div className="bg-white border border-[#D9E1E8] rounded-xl p-5 h-fit sticky top-24 shadow-sm min-w-0">
          <h3 className="font-bold text-[#0B3A63] mb-4">Estimated Order Summary</h3>
          {isLoadingInitialData ? (
            <div className="space-y-3 py-2 animate-pulse">
              <div className="flex justify-between">
                <div className="h-4 bg-slate-200 rounded w-20"></div>
                <div className="h-4 bg-slate-200 rounded w-16"></div>
              </div>
              <div className="flex justify-between">
                <div className="h-4 bg-slate-200 rounded w-28"></div>
                <div className="h-4 bg-slate-200 rounded w-14"></div>
              </div>
              <div className="border-t border-[#D9E1E8] pt-3 flex justify-between">
                <div className="h-5 bg-slate-200 rounded w-24"></div>
                <div className="h-6 bg-slate-200 rounded w-20"></div>
              </div>
              <div className="h-8 bg-slate-100 rounded-lg w-full mt-2"></div>
            </div>
          ) : (
            <>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-[#667085]">
                  <span>Items ({checkoutItems.length})</span>
                  <span>₹{displaySubtotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
                <div className="flex justify-between text-[#667085]">
                  <span>Delivery Charge</span>
                  <span className={displayShipping === 0 ? "text-[#12773D] font-bold" : "font-medium"}>
                    {displayShipping === 0 ? "FREE" : `₹${displayShipping.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                  </span>
                </div>
                <div className="border-t border-[#D9E1E8] pt-3 mt-1 flex justify-between font-bold text-[#0B3A63] text-base">
                  <span>Order Total</span>
                  <span className="text-[#1769AA] text-xl">
                    ₹{displayTotal.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </div>
              {displayShipping === 0 ? (
                <p className="mt-4 text-xs font-medium text-[#12773D] bg-[#ECFDF5] border border-[#D1FAE5] px-3 py-2.5 rounded-lg flex gap-1.5 items-center">
                  <span>✓</span> You qualify for free shipping! {freeThreshold > 0 ? `(Threshold: ₹${freeThreshold.toLocaleString("en-IN")})` : ''}
                </p>
              ) : (
                <p className="mt-4 text-xs font-medium text-[#B45309] bg-[#FFFBEB] border border-[#FEF3C7] px-3 py-2.5 rounded-lg">
                  Add ₹{(freeThreshold - displaySubtotal).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} more to qualify for free delivery.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
