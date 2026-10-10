import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useCart } from "../../context/CartContext";
import { addressesApi } from "../../api/addresses";
import { ordersApi } from "../../api/orders";
import { paymentsApi } from "../../api/payments";
import { configApi } from "../../api/config";
import { CustomerAddress, DeliveryConfiguration, PaymentIntentResponse } from "../../types/api";
import { resolveProductImage, handleProductImageError } from "../../utils/productImageResolver";
import { loadRazorpayScript, isRazorpayLoaded, isMockRazorpayKey } from "../../utils/razorpay";

const steps = ["Address", "Review", "Payment", "Confirm"];

type PaymentLifecycle = 'idle' | 'initiating' | 'gateway_open' | 'verifying' | 'cancelled' | 'failed' | 'timeout_pending';

export default function Checkout() {
  const { items: cartItems, subtotal: cartSubtotal, clearCart, removeFromCart } = useCart();
  const [step, setStep] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("upi");
  const [couponCode, setCouponCode] = useState("");
  const [couponDiscount, setCouponDiscount] = useState<number>(0);
  const [couponMessage, setCouponMessage] = useState<string>("");
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);

  // Hardened Payment State & Order Persistence
  const [createdOrder, setCreatedOrder] = useState<any | null>(null);
  const [paymentLifecycle, setPaymentLifecycle] = useState<PaymentLifecycle>('idle');
  const [paymentErrorMessage, setPaymentErrorMessage] = useState<string>("");
  const [activePaymentIntent, setActivePaymentIntent] = useState<PaymentIntentResponse | null>(null);

  const navigate = useNavigate();
  const location = useLocation();

  // Saved addresses from backend
  const [savedAddresses, setSavedAddresses] = useState<CustomerAddress[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<number | null>(null);
  const [useNewAddress, setUseNewAddress] = useState(false);
  const [deliveryConfig, setDeliveryConfig] = useState<DeliveryConfiguration | null>(null);

  // Address and Business states
  const [isBusinessUser, setIsBusinessUser] = useState(false);
  const [gstInput, setGstInput] = useState("");
  const [isFetchingGST, setIsFetchingGST] = useState(false);
  const [validationError, setValidationError] = useState("");

  const [billingAddress, setBillingAddress] = useState({
    company: "", gstin: "", address: ""
  });

  const [newAddress, setNewAddress] = useState({
    name: "", phone: "", line1: "", line2: "", city: "Coimbatore", state: "Tamil Nadu", pincode: "",
  });

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

  // Load customer addresses and delivery configuration on mount
  useEffect(() => {
    let isMounted = true;
    const loadInitial = async () => {
      try {
        const [addrs, configs] = await Promise.all([
          addressesApi.getAddresses(),
          configApi.getDeliveryConfig(),
        ]);
        if (isMounted) {
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

  // Compute display preview estimates (backend will calculate authoritative total on checkout)
  const freeThreshold = deliveryConfig ? Number(deliveryConfig.free_delivery_threshold) : 999;
  const baseShippingFee = deliveryConfig ? Number(deliveryConfig.base_delivery_charge) : 99;
  const shipping = checkoutSubtotal >= freeThreshold ? 0 : baseShippingFee;
  const estimatedTax = Math.round(checkoutSubtotal * 0.18);
  const previewTotal = Math.max(0, checkoutSubtotal - couponDiscount) + shipping + estimatedTax;

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    setIsApplyingCoupon(true);
    setCouponMessage("");
    try {
      const res = await configApi.validateCoupon(couponCode, checkoutSubtotal);
      if (res.valid) {
        const disc = Number(res.calculated_discount) || 0;
        setCouponDiscount(disc);
        setCouponMessage(`✓ Coupon applied! ₹${disc} discount.`);
      } else {
        setCouponDiscount(0);
        setCouponMessage(res.detail || "Invalid coupon code.");
      }
    } catch (err: any) {
      setCouponDiscount(0);
      setCouponMessage(err?.message || "Coupon is invalid or expired.");
    } finally {
      setIsApplyingCoupon(false);
    }
  };

  const handleGSTBlur = () => {
    if (gstInput.length >= 10) {
      setIsFetchingGST(true);
      setValidationError("");
      setTimeout(() => {
        setBillingAddress({
          company: "Corporate Buyer",
          gstin: gstInput,
          address: "Tamil Nadu, India"
        });
        setIsFetchingGST(false);
      }, 500);
    }
  };

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
    }

    if (isBusinessUser && !billingAddress.company) {
      setValidationError("Please enter a valid GST number and wait for billing details to fetch.");
      return;
    }

    setStep(1);
  };

  // Authoritative background payment status query (never assume timeout means failure)
  const pollOrderPaymentStatus = async (orderId: number, maxAttempts: number = 4): Promise<boolean> => {
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      await new Promise((r) => setTimeout(r, 2000));
      try {
        const txn = await paymentsApi.getOrderPaymentStatus(orderId);
        if (txn.status === 'SUCCESS' || txn.order_status === 'CONFIRMED' || txn.order_payment_status === 'Paid') {
          return true;
        }
      } catch {
        // Safe retry on temporary network glitch
      }
    }
    return false;
  };

  const launchRazorpayCheckout = async (targetOrder: any) => {
    setIsSubmittingOrder(true);
    setPaymentLifecycle('initiating');
    setPaymentErrorMessage("");

    try {
      // Parallelize payment intent initiation with Razorpay SDK script readiness
      const [paymentIntent, isLoaded] = await Promise.all([
        paymentsApi.initiatePayment(
          Number(targetOrder.id),
          paymentMethod.toUpperCase()
        ),
        loadRazorpayScript(),
      ]);

      setActivePaymentIntent(paymentIntent);

      const rzpConstructor = (window as any).Razorpay;
      const isMockKey = Boolean(paymentIntent.is_mock) || isMockRazorpayKey(paymentIntent.key_id);

      if (!isMockKey && isLoaded && typeof rzpConstructor === 'function') {
        setPaymentLifecycle('gateway_open');
        setIsSubmittingOrder(false);

        const options = {
          key: paymentIntent.key_id,
          amount: paymentIntent.amount,
          currency: paymentIntent.currency || "INR",
          name: "Vee Power Electricals",
          description: `Order #${targetOrder.order_number}`,
          order_id: paymentIntent.gateway_order_id,
          prefill: {
            name: paymentIntent.customer_name,
            email: paymentIntent.customer_email,
            contact: paymentIntent.customer_phone,
          },
          notes: {
            order_id: String(targetOrder.id),
          },
          theme: {
            color: "#0B3A63",
          },
          handler: async (response: any) => {
            setIsSubmittingOrder(true);
            setPaymentLifecycle('verifying');
            try {
              await paymentsApi.verifyPayment({
                order_id: Number(targetOrder.id),
                razorpay_order_id: response.razorpay_order_id || paymentIntent.gateway_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                payment_method: paymentMethod.toUpperCase(),
              });

              const freshOrder = await ordersApi.getOrderDetail(targetOrder.id);
              if (isSingleItem && singleItemState?.singleItem) {
                removeFromCart(singleItemState.singleItem);
              } else {
                clearCart();
              }
              navigate("/order-success", { state: { order: freshOrder } });
            } catch (verifyErr: any) {
              console.warn("Direct verify call delayed or network error. Polling authoritative order status...", verifyErr);
              const isConfirmed = await pollOrderPaymentStatus(Number(targetOrder.id));
              if (isConfirmed) {
                const freshOrder = await ordersApi.getOrderDetail(targetOrder.id);
                if (isSingleItem && singleItemState?.singleItem) {
                  removeFromCart(singleItemState.singleItem);
                } else {
                  clearCart();
                }
                navigate("/order-success", { state: { order: freshOrder } });
              } else {
                setPaymentLifecycle('timeout_pending');
                setIsSubmittingOrder(false);
                setPaymentErrorMessage("Payment verification is pending confirmation from your bank. Please do not submit duplicate payments.");
              }
            }
          },
          modal: {
            ondismiss: () => {
              setPaymentLifecycle('cancelled');
              setIsSubmittingOrder(false);
              setPaymentErrorMessage("Payment window was closed. Your items remain reserved. Click Retry Payment to proceed.");
            },
          },
        };

        const rzp = new rzpConstructor(options);
        rzp.on('payment.failed', (failRes: any) => {
          setPaymentLifecycle('failed');
          setIsSubmittingOrder(false);
          setPaymentErrorMessage(failRes?.error?.description || "Payment was declined by your bank or gateway.");
        });
        rzp.open();
      } else if (isMockKey) {
        // Development Sandbox: isolated test mode without hitting real Razorpay CDN
        setPaymentLifecycle('gateway_open');
        setIsSubmittingOrder(false);
      } else {
        // Razorpay SDK could not load (e.g. adblocker or CDN issue)
        setPaymentLifecycle('failed');
        setIsSubmittingOrder(false);
        setPaymentErrorMessage("Unable to open Razorpay payment gateway. Please check your internet connection or ad-blocker.");
      }
    } catch (payErr: any) {
      setPaymentLifecycle('failed');
      setIsSubmittingOrder(false);
      setPaymentErrorMessage(payErr?.message || "Failed to initiate payment gateway intent. Please retry.");
    }
  };

  const handleSimulatePaymentSuccess = async () => {
    if (!createdOrder || !activePaymentIntent) return;
    setPaymentLifecycle('verifying');
    setIsSubmittingOrder(true);
    try {
      await paymentsApi.verifyPayment({
        order_id: Number(createdOrder.id),
        razorpay_order_id: activePaymentIntent.gateway_order_id,
        razorpay_payment_id: `pay_mock_${Date.now()}`,
        razorpay_signature: "mock_test_sig",
        payment_method: paymentMethod.toUpperCase(),
      });

      const freshOrder = await ordersApi.getOrderDetail(createdOrder.id);
      if (isSingleItem && singleItemState?.singleItem) {
        removeFromCart(singleItemState.singleItem);
      } else {
        clearCart();
      }
      navigate("/order-success", { state: { order: freshOrder } });
    } catch (err: any) {
      setPaymentLifecycle('failed');
      setIsSubmittingOrder(false);
      setPaymentErrorMessage(err?.message || "Failed to confirm payment.");
    }
  };

  const handlePlaceOrder = async () => {
    if (!selectedAddressId) {
      setValidationError("A valid shipping address is required.");
      setStep(0);
      return;
    }

    setValidationError("");

    // If order was already created previously, reuse it to prevent duplicate orders & stock deductions
    if (createdOrder) {
      if (paymentMethod.toLowerCase() === 'cod') {
        if (isSingleItem && singleItemState?.singleItem) {
          removeFromCart(singleItemState.singleItem);
        } else {
          clearCart();
        }
        navigate("/order-success", { state: { order: createdOrder } });
        return;
      }
      await launchRazorpayCheckout(createdOrder);
      return;
    }

    setIsSubmittingOrder(true);

    const orderItems = checkoutItems.map(item => ({
      product_id: Number(item.product.id),
      quantity: item.quantity,
    }));

    try {
      const order = await ordersApi.checkout({
        shipping_address_id: selectedAddressId,
        items: orderItems,
        payment_method: paymentMethod.toUpperCase(),
        coupon_code: couponDiscount > 0 ? couponCode : undefined,
        notes: isBusinessUser ? `GSTIN: ${gstInput}` : undefined,
      });

      setCreatedOrder(order);

      // Cash on delivery: completes directly without online gateway
      if (paymentMethod.toLowerCase() === 'cod') {
        if (isSingleItem && singleItemState?.singleItem) {
          removeFromCart(singleItemState.singleItem);
        } else {
          clearCart();
        }
        navigate("/order-success", { state: { order } });
        return;
      }

      await launchRazorpayCheckout(order);
    } catch (err: any) {
      setValidationError(err?.message || "Order placement failed. Please verify items and available stock.");
      setIsSubmittingOrder(false);
    }
  };

  if (checkoutItems.length === 0) {
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
                <label className="flex items-center gap-2 cursor-pointer text-sm font-medium text-[#1769AA] bg-[#EFF6FF] px-3 py-1.5 rounded-lg border border-[#BFDBFE]">
                  <input
                    type="checkbox"
                    checked={isBusinessUser}
                    onChange={e => setIsBusinessUser(e.target.checked)}
                    className="accent-[#1769AA] w-4 h-4 cursor-pointer"
                  />
                  Use GST No. for Business
                </label>
              </div>

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

              {/* Billing Address Section (B2B Only) */}
              {isBusinessUser && (
                <div className="bg-[#F6F8FA] border border-[#D9E1E8] rounded-xl p-5 mb-6">
                  <h3 className="font-bold text-[#0B3A63] mb-4 flex items-center gap-2">
                    <span>🏢</span> Billing Address (B2B)
                  </h3>
                  <div className="mb-4">
                    <label className="text-sm font-medium text-[#17212B] mb-1.5 block">GSTIN / Business Registration Number *</label>
                    <div className="relative">
                      <input
                        value={gstInput}
                        onChange={e => setGstInput(e.target.value.toUpperCase())}
                        onBlur={handleGSTBlur}
                        className="w-full border border-[#D9E1E8] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1769AA] pr-10"
                        placeholder="e.g. 33AABFV1234A1ZX"
                      />
                      {isFetchingGST && (
                        <div className="absolute right-3 top-2.5">
                          <div className="w-5 h-5 border-2 border-[#1769AA] border-t-transparent rounded-full animate-spin"></div>
                        </div>
                      )}
                    </div>
                  </div>

                  {billingAddress.company && (
                    <div className="bg-white border border-[#D9E1E8] rounded-lg p-3 text-sm">
                      <span className="font-semibold text-[#17212B] block">{billingAddress.company}</span>
                      <span className="text-[#667085] text-xs">{billingAddress.address}</span>
                    </div>
                  )}
                </div>
              )}

              <button
                onClick={handleContinueToReview}
                className="w-full mt-4 bg-[#0B3A63] hover:bg-[#1769AA] text-white font-semibold px-8 py-3.5 rounded-lg transition-colors flex justify-center items-center gap-2"
              >
                Continue to Review
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
              </button>
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
                  <div className={`grid ${isBusinessUser ? 'md:grid-cols-2 gap-6' : 'gap-4'}`}>
                    {isBusinessUser && (
                      <div className="space-y-1.5 relative">
                        <h4 className="font-bold text-[#17212B] mb-2 border-b border-[#D9E1E8] pb-2 flex items-center gap-2">
                          <span>🏢</span> Billing Details
                        </h4>
                        <p className="font-bold text-[#0B3A63]">{billingAddress.company}</p>
                        <p className="text-xs uppercase tracking-wider font-semibold text-[#1769AA]">GST: {billingAddress.gstin}</p>
                        <p className="pt-1">{billingAddress.address}</p>
                        <div className="hidden md:block absolute right-[-12px] top-0 bottom-0 w-px bg-[#D9E1E8]"></div>
                      </div>
                    )}
                    <div className="space-y-1.5">
                      <h4 className="font-bold text-[#17212B] mb-2 border-b border-[#D9E1E8] pb-2 flex items-center gap-2">
                        <span>📍</span> Delivery To
                      </h4>
                      <p className="font-bold text-[#17212B]">{activeShippingAddr.recipient_name}</p>
                      <p className="text-[#1769AA] font-medium">{activeShippingAddr.phone}</p>
                      <p className="pt-1">{activeShippingAddr.address_line1}{activeShippingAddr.address_line2 ? `, ${activeShippingAddr.address_line2}` : ''}</p>
                      <p>{activeShippingAddr.city}, {activeShippingAddr.state} - {activeShippingAddr.pincode}</p>
                    </div>
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

              {/* Status Banner: Cancelled State */}
              {createdOrder && paymentLifecycle === 'cancelled' && (
                <div className="mb-6 p-5 bg-[#FFFBEB] border-2 border-[#FCD34D] rounded-xl text-left">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl flex-shrink-0">⚠️</span>
                    <div className="flex-1">
                      <h3 className="font-bold text-[#92400E] text-base font-['Outfit']">Payment Window Closed</h3>
                      <p className="text-sm text-[#B45309] mt-1">
                        The payment window was closed before completion. Your order <strong className="font-mono">#{createdOrder.order_number}</strong> is saved in pending status with stock reserved.
                      </p>
                      <div className="flex flex-wrap gap-3 mt-4 items-center">
                        <button
                          type="button"
                          onClick={() => launchRazorpayCheckout(createdOrder)}
                          disabled={isSubmittingOrder}
                          className="bg-[#1769AA] hover:bg-[#0B3A63] text-white text-sm font-bold px-5 py-2.5 rounded-lg shadow-sm transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
                        >
                          ⚡ Retry Payment Now
                        </button>
                        <button
                          type="button"
                          onClick={() => setPaymentLifecycle('idle')}
                          className="bg-white border border-[#D9E1E8] hover:border-[#1769AA] text-[#17212B] text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors cursor-pointer"
                        >
                          Change Method
                        </button>
                        <Link
                          to="/account/orders"
                          className="text-xs font-semibold text-[#1769AA] hover:underline ml-1"
                        >
                          View in My Orders →
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Status Banner: Failed State */}
              {createdOrder && paymentLifecycle === 'failed' && (
                <div className="mb-6 p-5 bg-[#FEF2F2] border-2 border-[#FCA5A5] rounded-xl text-left">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl flex-shrink-0">❌</span>
                    <div className="flex-1">
                      <h3 className="font-bold text-[#991B1B] text-base font-['Outfit']">Payment Failed or Declined</h3>
                      <p className="text-sm text-[#B91C1C] mt-1">
                        {paymentErrorMessage || "The payment transaction could not be authorized by the issuing bank."}
                      </p>
                      <p className="text-xs text-[#7F1D1D] mt-1">
                        Your order <strong className="font-mono">#{createdOrder.order_number}</strong> is safely preserved. You can retry with another card, UPI, or Net Banking.
                      </p>
                      <div className="flex flex-wrap gap-3 mt-4 items-center">
                        <button
                          type="button"
                          onClick={() => launchRazorpayCheckout(createdOrder)}
                          disabled={isSubmittingOrder}
                          className="bg-[#C0392B] hover:bg-[#A93226] text-white text-sm font-bold px-5 py-2.5 rounded-lg shadow-sm transition-colors flex items-center gap-2 cursor-pointer disabled:opacity-50"
                        >
                          ⚡ Retry Payment
                        </button>
                        <button
                          type="button"
                          onClick={() => setPaymentLifecycle('idle')}
                          className="bg-white border border-[#D9E1E8] hover:border-[#1769AA] text-[#17212B] text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors cursor-pointer"
                        >
                          Switch Payment Method
                        </button>
                        <Link
                          to="/account/orders"
                          className="text-xs font-semibold text-[#1769AA] hover:underline ml-1"
                        >
                          View in My Orders →
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Status Banner: Verification Delayed / Timeout Pending State */}
              {createdOrder && paymentLifecycle === 'timeout_pending' && (
                <div className="mb-6 p-5 bg-[#EFF6FF] border-2 border-[#93C5FD] rounded-xl text-left">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl flex-shrink-0">⏳</span>
                    <div className="flex-1">
                      <h3 className="font-bold text-[#1E40AF] text-base font-['Outfit']">Payment Verification In Progress</h3>
                      <p className="text-sm text-[#1D4ED8] mt-1">
                        Your payment attempt for order <strong className="font-mono">#{createdOrder.order_number}</strong> is currently being confirmed with the bank.
                      </p>
                      <p className="text-xs text-[#2563EB] mt-1">
                        Please do not submit another payment. As soon as settlement is confirmed, your order status will update and you will receive an email confirmation.
                      </p>
                      <div className="flex flex-wrap gap-3 mt-4 items-center">
                        <Link
                          to="/account/orders"
                          className="bg-[#1769AA] hover:bg-[#0B3A63] text-white text-sm font-bold px-5 py-2.5 rounded-lg shadow-sm transition-colors"
                        >
                          Check Status in My Orders
                        </Link>
                        <Link
                          to="/shop"
                          className="bg-white border border-[#D9E1E8] hover:border-[#1769AA] text-[#17212B] text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors"
                        >
                          Continue Shopping
                        </Link>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="space-y-3 mb-6">
                {[
                  { id: "upi", label: "UPI / QR Code", desc: "PhonePe, GPay, Paytm, BHIM UPI", icon: "📱" },
                  { id: "card", label: "Credit / Debit Card", desc: "Visa, Mastercard, RuPay", icon: "💳" },
                  { id: "netbanking", label: "Net Banking", desc: "All major banks supported", icon: "🏦" },
                  { id: "cod", label: "Cash on Delivery", desc: "Pay when your order arrives", icon: "💵" },
                ].map(method => (
                  <label key={method.id} className={`flex items-center gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${paymentMethod === method.id ? "border-[#1769AA] bg-[#EFF6FF]" : "border-[#D9E1E8] hover:border-[#1769AA]/50"}`}>
                    <input type="radio" name="payment" value={method.id} checked={paymentMethod === method.id} onChange={(e) => setPaymentMethod(e.target.value)} className="accent-[#1769AA]" />
                    <span className="text-2xl">{method.icon}</span>
                    <div>
                      <p className="font-semibold text-[#17212B] text-sm">{method.label}</p>
                      <p className="text-xs text-[#667085]">{method.desc}</p>
                    </div>
                  </label>
                ))}
              </div>

              {/* Coupon Code Input */}
              {!createdOrder && (
                <div className="mb-6 p-4 bg-[#F6F8FA] rounded-xl border border-[#D9E1E8]">
                  <h4 className="font-semibold text-xs text-[#0B3A63] uppercase tracking-wider mb-2">Have a Promotional Coupon?</h4>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Enter coupon code (e.g. WELCOME10)"
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                      className="flex-1 px-3 py-2 border border-[#D9E1E8] rounded-lg text-sm uppercase outline-none focus:border-[#1769AA]"
                    />
                    <button
                      type="button"
                      onClick={handleApplyCoupon}
                      disabled={isApplyingCoupon || !couponCode.trim()}
                      className="px-4 py-2 bg-[#1769AA] text-white text-sm font-semibold rounded-lg hover:bg-[#0B3A63] transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {isApplyingCoupon ? "Validating..." : "Apply"}
                    </button>
                  </div>
                  {couponMessage && (
                    <p className={`text-xs mt-2 font-medium ${couponDiscount > 0 ? 'text-[#12773D]' : 'text-[#C0392B]'}`}>
                      {couponMessage}
                    </p>
                  )}
                </div>
              )}

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
                  ) : createdOrder ? (
                    paymentLifecycle === 'cancelled' || paymentLifecycle === 'failed' ? (
                      `⚡ Retry Payment · ₹${Number(createdOrder.total_amount).toLocaleString("en-IN")}`
                    ) : (
                      `Pay Now · ₹${Number(createdOrder.total_amount).toLocaleString("en-IN")}`
                    )
                  ) : (
                    `Place Order · ₹${previewTotal.toLocaleString("en-IN")}`
                  )}
                </button>
              </div>
            </div>
          )}

          {/* Test Mode Mock Sandbox Modal (Shown when mock key is active) */}
          {paymentLifecycle === 'gateway_open' && activePaymentIntent && (Boolean(activePaymentIntent.is_mock) || isMockRazorpayKey(activePaymentIntent.key_id)) && (
            <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs">
              <div className="bg-white rounded-2xl max-w-md w-full p-6 text-center shadow-2xl border border-slate-200 animate-in fade-in zoom-in duration-200">
                <div className="w-16 h-16 bg-[#EFF6FF] rounded-full flex items-center justify-center mx-auto mb-4 border border-[#BFDBFE]">
                  <span className="text-3xl">🛡️</span>
                </div>
                <h3 className="text-xl font-bold text-[#0B3A63] font-['Outfit']">Razorpay Test Sandbox</h3>
                <div className="inline-block px-3 py-1 bg-amber-100 text-amber-900 border border-amber-300 rounded-full text-xs font-semibold my-2">
                  Development Mode · Sandbox Credentials
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  The backend is running with sandbox mock keys. Real online payments require an approved Razorpay Test Key (<code className="bg-slate-100 px-1 py-0.5 rounded text-slate-800">rzp_test_...</code>) in <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-800">backend/.env</code>.
                </p>

                <div className="bg-[#F8FAFC] border border-slate-200 rounded-xl p-4 my-5 text-left text-sm space-y-2">
                  <div className="flex justify-between">
                    <span className="text-slate-500">Order Ref:</span>
                    <span className="font-mono font-semibold text-[#0B3A63]">#{createdOrder?.order_number}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-500">Gateway Order ID:</span>
                    <span className="font-mono text-xs text-slate-600">{activePaymentIntent.gateway_order_id}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-200 pt-2 font-bold">
                    <span className="text-[#17212B]">Payable Amount:</span>
                    <span className="text-[#1769AA] text-base">₹{Number(createdOrder?.total_amount || 0).toLocaleString('en-IN')}</span>
                  </div>
                </div>

                <div className="space-y-2.5">
                  <button
                    type="button"
                    onClick={handleSimulatePaymentSuccess}
                    disabled={isSubmittingOrder}
                    className="w-full bg-[#12773D] hover:bg-[#0E5C2F] text-white font-bold py-3.5 px-4 rounded-xl shadow-md transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <span>✓</span> Simulate Payment Approval (Pay ₹{Number(createdOrder?.total_amount || 0).toLocaleString('en-IN')})
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentLifecycle('cancelled');
                      setPaymentErrorMessage("Sandbox dialog closed. Order items remain saved and reserved. Click Retry Payment to test again.");
                      setIsSubmittingOrder(false);
                    }}
                    className="w-full bg-[#0B3A63] hover:bg-[#07243E] text-white font-semibold py-2.5 px-4 rounded-xl shadow-xs transition-colors cursor-pointer"
                  >
                    Close Sandbox & Return to Checkout
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPaymentLifecycle('failed');
                      setPaymentErrorMessage("Test simulation: Customer card declined by gateway simulator.");
                      setIsSubmittingOrder(false);
                    }}
                    className="w-full bg-[#FEE2E2] hover:bg-[#FECACA] text-[#991B1B] font-semibold py-2 px-4 rounded-xl transition-colors cursor-pointer text-xs"
                  >
                    Simulate Payment Failure
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Floating indicator while standard real Razorpay checkout is open */}
          {paymentLifecycle === 'gateway_open' && activePaymentIntent && !activePaymentIntent.is_mock && !isMockRazorpayKey(activePaymentIntent.key_id) && (
            <div className="fixed bottom-6 right-6 z-40 bg-[#0B3A63] text-white px-5 py-4 rounded-2xl shadow-2xl border border-blue-400/30 max-w-sm flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin flex-shrink-0"></div>
              <div className="text-xs">
                <p className="font-bold">Razorpay Checkout Active</p>
                <p className="text-blue-100 mt-0.5">Please complete payment in the Razorpay window.</p>
              </div>
            </div>
          )}

          {/* Verification in-flight loader */}
          {paymentLifecycle === 'verifying' && (
            <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 backdrop-blur-xs">
              <div className="bg-white rounded-2xl max-w-sm w-full p-8 text-center shadow-2xl border border-slate-200">
                <div className="w-16 h-16 border-4 border-[#1769AA] border-t-transparent rounded-full animate-spin mx-auto mb-5"></div>
                <h3 className="text-lg font-bold text-[#0B3A63] font-['Outfit']">Verifying Payment</h3>
                <p className="text-xs text-slate-600 mt-2">
                  Verifying cryptographic transaction signature and confirming your order...
                </p>
                <p className="text-[11px] text-slate-400 mt-4">Please do not refresh or close this tab.</p>
              </div>
            </div>
          )}
        </div>

        {/* Order summary sidebar */}
        <div className="bg-white border border-[#D9E1E8] rounded-xl p-5 h-fit sticky top-24 shadow-sm min-w-0">
          <h3 className="font-bold text-[#0B3A63] mb-4">Estimated Order Summary</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-[#667085]">
              <span>Items ({checkoutItems.length})</span>
              <span>₹{checkoutSubtotal.toLocaleString("en-IN")}</span>
            </div>
            {couponDiscount > 0 && (
              <div className="flex justify-between text-[#12773D] font-medium">
                <span>Coupon Discount</span>
                <span>−₹{couponDiscount.toLocaleString("en-IN")}</span>
              </div>
            )}
            <div className="flex justify-between text-[#667085]">
              <span>Delivery Charge</span>
              <span className={shipping === 0 ? "text-[#12773D] font-bold" : "font-medium"}>
                {shipping === 0 ? "FREE" : `₹${shipping}`}
              </span>
            </div>
            <div className="flex justify-between text-[#667085]">
              <span>Estimated GST (18%)</span>
              <span>₹{estimatedTax.toLocaleString("en-IN")}</span>
            </div>
            <div className="border-t border-[#D9E1E8] pt-3 mt-1 flex justify-between font-bold text-[#0B3A63] text-base">
              <span>Estimated Total</span>
              <span className="text-[#1769AA] text-xl">₹{previewTotal.toLocaleString("en-IN")}</span>
            </div>
          </div>
          {checkoutSubtotal >= freeThreshold ? (
            <p className="mt-4 text-xs font-medium text-[#12773D] bg-[#ECFDF5] border border-[#D1FAE5] px-3 py-2.5 rounded-lg flex gap-1.5">
              <span>✓</span> You qualify for free shipping! (Threshold: ₹{freeThreshold})
            </p>
          ) : (
            <p className="mt-4 text-xs font-medium text-[#B45309] bg-[#FFFBEB] border border-[#FEF3C7] px-3 py-2.5 rounded-lg">
              Add ₹{(freeThreshold - checkoutSubtotal).toLocaleString("en-IN")} more to qualify for free delivery.
            </p>
          )}
          <p className="text-[11px] text-gray-400 mt-3 text-center">
            * Final tax split and billing calculations are authoritatively computed by Vee Power Electricals backend.
          </p>
        </div>
      </div>
    </div>
  );
}
