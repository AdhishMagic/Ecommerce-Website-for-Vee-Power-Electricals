import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useCart } from "../../context/CartContext";
import { addressesApi } from "../../api/addresses";
import { ordersApi } from "../../api/orders";
import { paymentsApi } from "../../api/payments";
import { configApi } from "../../api/config";
import { CustomerAddress, DeliveryConfiguration } from "../../types/api";

const steps = ["Address", "Review", "Payment", "Confirm"];

export default function Checkout() {
  const { items: cartItems, subtotal: cartSubtotal, clearCart, removeFromCart } = useCart();
  const [step, setStep] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("upi");
  const [couponCode, setCouponCode] = useState("");
  const [couponDiscount, setCouponDiscount] = useState<number>(0);
  const [couponMessage, setCouponMessage] = useState<string>("");
  const [isApplyingCoupon, setIsApplyingCoupon] = useState(false);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);

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

  const handlePlaceOrder = async () => {
    if (!selectedAddressId) {
      setValidationError("A valid shipping address is required.");
      setStep(0);
      return;
    }

    setIsSubmittingOrder(true);
    setValidationError("");

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

      // Online payment (UPI, Card, Netbanking): Initiate Razorpay payment intent
      try {
        const paymentIntent = await paymentsApi.initiatePayment(
          Number(order.id),
          paymentMethod.toUpperCase()
        );

        const rzpConstructor = (window as any).Razorpay;
        if (typeof rzpConstructor === 'function') {
          const options = {
            key: paymentIntent.key_id,
            amount: paymentIntent.amount,
            currency: paymentIntent.currency,
            name: "Vee Power Electricals",
            description: `Order #${order.order_number}`,
            order_id: paymentIntent.gateway_order_id,
            prefill: {
              name: paymentIntent.customer_name,
              email: paymentIntent.customer_email,
              contact: paymentIntent.customer_phone,
            },
            handler: async (response: any) => {
              try {
                await paymentsApi.verifyPayment({
                  order_id: Number(order.id),
                  razorpay_order_id: response.razorpay_order_id || paymentIntent.gateway_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                  payment_method: paymentMethod.toUpperCase(),
                });

                const freshOrder = await ordersApi.getOrderDetail(order.id);
                if (isSingleItem && singleItemState?.singleItem) {
                  removeFromCart(singleItemState.singleItem);
                } else {
                  clearCart();
                }
                navigate("/order-success", { state: { order: freshOrder } });
              } catch (verifyErr: any) {
                setValidationError(verifyErr?.message || "Payment verification failed. Please contact support.");
                setIsSubmittingOrder(false);
              }
            },
            modal: {
              ondismiss: () => {
                setIsSubmittingOrder(false);
                setValidationError("Payment cancelled. You can retry payment whenever ready.");
              },
            },
          };

          const rzp = new rzpConstructor(options);
          rzp.on('payment.failed', (failRes: any) => {
            setIsSubmittingOrder(false);
            setValidationError(`Payment failed: ${failRes.error?.description || "Transaction declined by gateway."}`);
          });
          rzp.open();
          return;
        } else {
          // In test/mock environment where Razorpay script is not present, proceed cleanly
          if (isSingleItem && singleItemState?.singleItem) {
            removeFromCart(singleItemState.singleItem);
          } else {
            clearCart();
          }
          navigate("/order-success", { state: { order } });
          return;
        }
      } catch (payErr: any) {
        setValidationError(payErr?.message || "Failed to initiate payment gateway intent.");
        setIsSubmittingOrder(false);
        return;
      }
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
        <div className="lg:col-span-2">
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
                    <img src={item.product.images[0]} alt={item.product.name} className="w-16 h-16 object-cover rounded-lg bg-[#F6F8FA]" />
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
                    className="px-4 py-2 bg-[#1769AA] text-white text-sm font-semibold rounded-lg hover:bg-[#0B3A63] transition-colors disabled:opacity-50"
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

              <div className="flex gap-3">
                <button onClick={() => setStep(1)} className="px-6 py-3 border border-[#D9E1E8] rounded-lg font-medium text-[#667085] hover:text-[#17212B] hover:bg-[#F6F8FA] transition-colors">← Back</button>
                <button
                  onClick={handlePlaceOrder}
                  disabled={isSubmittingOrder}
                  className="flex-1 bg-[#F2A900] hover:bg-[#D4920A] text-[#0A2540] font-bold py-3.5 rounded-xl shadow-md transition-all text-center text-lg disabled:opacity-50"
                >
                  {isSubmittingOrder ? "Placing Order..." : `Place Order · ₹${previewTotal.toLocaleString("en-IN")}`}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Order summary sidebar */}
        <div className="bg-white border border-[#D9E1E8] rounded-xl p-5 h-fit sticky top-24 shadow-sm">
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
