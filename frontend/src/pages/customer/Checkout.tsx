import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { useCart } from "../../context/CartContext";
import { COMPANY_ADDRESS } from "../../constants/companyInfo";

const steps = ["Address", "Review", "Payment", "Confirm"];

export default function Checkout() {
  const { items: cartItems, subtotal: cartSubtotal, clearCart, removeFromCart } = useCart();
  const [step, setStep] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("upi");
  const navigate = useNavigate();
  const location = useLocation();

  // Address and Business states
  const [isBusinessUser, setIsBusinessUser] = useState(false);
  const [gstInput, setGstInput] = useState("");
  const [isFetchingGST, setIsFetchingGST] = useState(false);
  const [validationError, setValidationError] = useState("");

  const [billingAddress, setBillingAddress] = useState({ 
    company: "", gstin: "", address: "" 
  });
  
  const [deliveryAddress, setDeliveryAddress] = useState({
    name: "", phone: "", line1: "", line2: "", city: "Coimbatore", state: "Tamil Nadu", pincode: "",
  });

  // Single Item Checkout Logic
  const singleItemState = location.state as { singleItem: string, quantity: number } | null;
  const isSingleItem = !!singleItemState?.singleItem;

  let checkoutItems = cartItems;
  let checkoutSubtotal = cartSubtotal;

  if (isSingleItem) {
    const foundItem = cartItems.find(i => i.product.id === singleItemState.singleItem);
    if (foundItem) {
      checkoutItems = [{ ...foundItem, quantity: singleItemState.quantity }];
      checkoutSubtotal = foundItem.product.price * singleItemState.quantity;
    } else {
      checkoutItems = [];
      checkoutSubtotal = 0;
    }
  }

  const shipping = checkoutSubtotal >= 999 ? 0 : 99;
  const tax = Math.round(checkoutSubtotal * 0.18);
  const total = checkoutSubtotal + shipping + tax;

  const handlePlaceOrder = () => {
    if (isSingleItem) {
      removeFromCart(singleItemState.singleItem);
    } else {
      clearCart();
    }
    navigate("/order-success");
  };

  const handleGSTBlur = () => {
    if (gstInput.length >= 10) {
      setIsFetchingGST(true);
      setValidationError("");
      // Mock API fetch
      setTimeout(() => {
        setBillingAddress({
          company: "Vee Power Electricals Pvt Ltd",
          gstin: gstInput,
          address: COMPANY_ADDRESS
        });
        setIsFetchingGST(false);
      }, 800);
    }
  };

  const handleContinueToReview = () => {
    setValidationError("");
    if (!deliveryAddress.name || !deliveryAddress.phone || !deliveryAddress.line1 || !deliveryAddress.city || !deliveryAddress.pincode) {
      setValidationError("Please fill out all required delivery address fields.");
      return;
    }
    if (isBusinessUser && !billingAddress.company) {
      setValidationError("Please enter a valid GST number and wait for billing details to fetch.");
      return;
    }
    setStep(1);
  };

  if (checkoutItems.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center">
        <h2 className="text-2xl font-bold text-[#0B3A63] mb-4">Your checkout is empty</h2>
        <Link to="/shop" className="text-[#1769AA] underline">Go to Shop</Link>
      </div>
    );
  }

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
          {step === 0 && (
            <div className="bg-white border border-[#D9E1E8] rounded-xl p-6">
              
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

              {validationError && (
                <div className="bg-[#FEF2F2] border border-[#FCA5A5] text-[#C0392B] px-4 py-3 rounded-lg mb-6 text-sm font-medium flex gap-2 items-center">
                  <span>⚠️</span> {validationError}
                </div>
              )}

              <div className="grid gap-6">
                
                {/* Billing Address Section (B2B Only) */}
                {isBusinessUser && (
                  <div className="bg-[#F6F8FA] border border-[#D9E1E8] rounded-xl p-5">
                    <h3 className="font-bold text-[#0B3A63] mb-4 flex items-center gap-2">
                      <span>🏢</span> Billing Address
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
                      <p className="text-xs text-[#667085] mt-1.5">Enter your GST number to automatically fetch company details.</p>
                    </div>

                    {billingAddress.company && (
                      <div className="bg-white border border-[#D9E1E8] rounded-lg p-3 text-sm">
                        <div className="grid gap-2">
                          <div>
                            <span className="text-[#667085] text-xs block mb-0.5">Company Name</span>
                            <span className="font-semibold text-[#17212B]">{billingAddress.company}</span>
                          </div>
                          <div>
                            <span className="text-[#667085] text-xs block mb-0.5">Registered Address</span>
                            <span className="text-[#17212B]">{billingAddress.address}</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Standard Delivery Form */}
                <div className="border border-[#D9E1E8] rounded-xl p-5">
                  <h3 className="font-bold text-[#0B3A63] mb-4 flex items-center gap-2">
                    <span>📍</span> Delivery Address
                  </h3>
                  <div className="grid gap-4">
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <label className="text-sm font-medium text-[#17212B] mb-1.5 block">Full Name *</label>
                        <input value={deliveryAddress.name} onChange={e => setDeliveryAddress(a => ({...a, name: e.target.value}))} className="w-full border border-[#D9E1E8] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1769AA]" placeholder="Rajesh Kumar" />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-[#17212B] mb-1.5 block">Mobile *</label>
                        <input value={deliveryAddress.phone} onChange={e => setDeliveryAddress(a => ({...a, phone: e.target.value}))} className="w-full border border-[#D9E1E8] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1769AA]" placeholder="+91 98765 43210" />
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-[#17212B] mb-1.5 block">Address Line 1 *</label>
                      <input value={deliveryAddress.line1} onChange={e => setDeliveryAddress(a => ({...a, line1: e.target.value}))} className="w-full border border-[#D9E1E8] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1769AA]" placeholder="House/Flat No., Street Name" />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-[#17212B] mb-1.5 block">Address Line 2</label>
                      <input value={deliveryAddress.line2} onChange={e => setDeliveryAddress(a => ({...a, line2: e.target.value}))} className="w-full border border-[#D9E1E8] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1769AA]" placeholder="Landmark, Area" />
                    </div>
                    <div className="grid sm:grid-cols-3 gap-4">
                      <div>
                        <label className="text-sm font-medium text-[#17212B] mb-1.5 block">City *</label>
                        <input value={deliveryAddress.city} onChange={e => setDeliveryAddress(a => ({...a, city: e.target.value}))} className="w-full border border-[#D9E1E8] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1769AA]" />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-[#17212B] mb-1.5 block">State *</label>
                        <input value={deliveryAddress.state} onChange={e => setDeliveryAddress(a => ({...a, state: e.target.value}))} className="w-full border border-[#D9E1E8] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1769AA]" />
                      </div>
                      <div>
                        <label className="text-sm font-medium text-[#17212B] mb-1.5 block">Pincode *</label>
                        <input value={deliveryAddress.pincode} onChange={e => setDeliveryAddress(a => ({...a, pincode: e.target.value}))} className="w-full border border-[#D9E1E8] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1769AA]" placeholder="641001" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <button
                onClick={handleContinueToReview}
                className="w-full mt-6 bg-[#0B3A63] hover:bg-[#1769AA] text-white font-semibold px-8 py-3.5 rounded-lg transition-colors flex justify-center items-center gap-2"
              >
                Continue to Review
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
              </button>
            </div>
          )}

          {step === 1 && (
            <div className="bg-white border border-[#D9E1E8] rounded-xl p-6">
              <h2 className="font-bold text-[#0B3A63] text-lg mb-5">Review Order</h2>
              
              <div className="space-y-3 mb-6">
                {checkoutItems.map(item => (
                  <div key={item.product.id} className="flex gap-4 py-4 border-b border-[#D9E1E8] last:border-0">
                    <img src={item.product.images[0]} alt={item.product.name} className="w-16 h-16 object-cover rounded-lg bg-[#F6F8FA]" />
                    <div className="flex-1">
                      <p className="font-semibold text-[#17212B] line-clamp-1">{item.product.name}</p>
                      <p className="text-xs text-[#667085] mt-1">{item.product.brand} · Qty: {item.quantity}</p>
                    </div>
                    <p className="font-bold text-[#0B3A63]">₹{(item.product.price * item.quantity).toLocaleString("en-IN")}</p>
                  </div>
                ))}
              </div>

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
                      
                      {/* Vertical divider for md screens */}
                      <div className="hidden md:block absolute right-[-12px] top-0 bottom-0 w-px bg-[#D9E1E8]"></div>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    <h4 className="font-bold text-[#17212B] mb-2 border-b border-[#D9E1E8] pb-2 flex items-center gap-2">
                      <span>📍</span> Delivery To
                    </h4>
                    <p className="font-bold text-[#17212B]">{deliveryAddress.name}</p>
                    <p className="text-[#1769AA] font-medium">{deliveryAddress.phone}</p>
                    <p className="pt-1">{deliveryAddress.line1}, {deliveryAddress.line2}</p>
                    <p>{deliveryAddress.city}, {deliveryAddress.state} - {deliveryAddress.pincode}</p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button onClick={() => setStep(0)} className="px-6 py-3 border border-[#D9E1E8] rounded-lg font-medium text-[#667085] hover:text-[#17212B] hover:bg-[#F6F8FA] transition-colors">← Edit Details</button>
                <button onClick={() => setStep(2)} className="flex-1 bg-[#0B3A63] hover:bg-[#1769AA] text-white font-semibold px-8 py-3 rounded-lg transition-colors text-center">Continue to Payment</button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="bg-white border border-[#D9E1E8] rounded-xl p-6">
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
              <div className="flex gap-3">
                <button onClick={() => setStep(1)} className="px-6 py-3 border border-[#D9E1E8] rounded-lg font-medium text-[#667085] hover:text-[#17212B] hover:bg-[#F6F8FA] transition-colors">← Back</button>
                <button onClick={handlePlaceOrder} className="flex-1 bg-[#F2A900] hover:bg-[#D4920A] text-[#0B3A63] font-bold py-3 rounded-xl shadow-md transition-all text-center text-lg">
                  Place Order · ₹{total.toLocaleString("en-IN")}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Order summary */}
        <div className="bg-white border border-[#D9E1E8] rounded-xl p-5 h-fit sticky top-24 shadow-sm">
          <h3 className="font-bold text-[#0B3A63] mb-4">Order Total</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-[#667085]"><span>Items ({checkoutItems.length})</span><span>₹{checkoutSubtotal.toLocaleString("en-IN")}</span></div>
            <div className="flex justify-between text-[#667085]"><span>Shipping</span><span className={shipping === 0 ? "text-[#12773D] font-bold" : "font-medium"}>{shipping === 0 ? "FREE" : `₹${shipping}`}</span></div>
            <div className="flex justify-between text-[#667085]"><span>GST (18%)</span><span>₹{tax.toLocaleString("en-IN")}</span></div>
            <div className="border-t border-[#D9E1E8] pt-3 mt-1 flex justify-between font-bold text-[#0B3A63] text-base">
              <span>Total</span><span className="text-[#1769AA] text-xl">₹{total.toLocaleString("en-IN")}</span>
            </div>
          </div>
          {checkoutSubtotal >= 999 && (
            <p className="mt-4 text-xs font-medium text-[#12773D] bg-[#ECFDF5] border border-[#D1FAE5] px-3 py-2.5 rounded-lg flex gap-1.5">
              <span>✓</span> You qualify for free shipping!
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
