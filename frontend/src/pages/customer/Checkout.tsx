import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useCart } from "../../context/CartContext";

const steps = ["Address", "Review", "Payment", "Confirm"];

export default function Checkout() {
  const { items, subtotal, clearCart } = useCart();
  const [step, setStep] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("upi");
  const navigate = useNavigate();

  const shipping = subtotal >= 999 ? 0 : 99;
  const tax = Math.round(subtotal * 0.18);
  const total = subtotal + shipping + tax;

  const [address, setAddress] = useState({
    name: "", phone: "", line1: "", line2: "", city: "Coimbatore", state: "Tamil Nadu", pincode: "",
  });

  const handlePlaceOrder = () => {
    clearCart();
    navigate("/order-success");
  };

  if (items.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center">
        <h2 className="text-2xl font-bold text-[#0B3A63] mb-4">Your cart is empty</h2>
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
              <h2 className="font-bold text-[#0B3A63] text-lg mb-5">Delivery Address</h2>
              <div className="grid gap-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-[#17212B] mb-1.5 block">Full Name *</label>
                    <input value={address.name} onChange={e => setAddress(a => ({...a, name: e.target.value}))} className="w-full border border-[#D9E1E8] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1769AA]" placeholder="Rajesh Kumar" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-[#17212B] mb-1.5 block">Mobile *</label>
                    <input value={address.phone} onChange={e => setAddress(a => ({...a, phone: e.target.value}))} className="w-full border border-[#D9E1E8] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1769AA]" placeholder="+91 98765 43210" />
                  </div>
                </div>
                <div>
                  <label className="text-sm font-medium text-[#17212B] mb-1.5 block">Address Line 1 *</label>
                  <input value={address.line1} onChange={e => setAddress(a => ({...a, line1: e.target.value}))} className="w-full border border-[#D9E1E8] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1769AA]" placeholder="House/Flat No., Street Name" />
                </div>
                <div>
                  <label className="text-sm font-medium text-[#17212B] mb-1.5 block">Address Line 2</label>
                  <input value={address.line2} onChange={e => setAddress(a => ({...a, line2: e.target.value}))} className="w-full border border-[#D9E1E8] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1769AA]" placeholder="Landmark, Area" />
                </div>
                <div className="grid sm:grid-cols-3 gap-4">
                  <div>
                    <label className="text-sm font-medium text-[#17212B] mb-1.5 block">City *</label>
                    <input value={address.city} onChange={e => setAddress(a => ({...a, city: e.target.value}))} className="w-full border border-[#D9E1E8] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1769AA]" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-[#17212B] mb-1.5 block">State *</label>
                    <input value={address.state} className="w-full border border-[#D9E1E8] rounded-lg px-3 py-2.5 text-sm outline-none bg-[#F6F8FA]" readOnly />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-[#17212B] mb-1.5 block">Pincode *</label>
                    <input value={address.pincode} onChange={e => setAddress(a => ({...a, pincode: e.target.value}))} className="w-full border border-[#D9E1E8] rounded-lg px-3 py-2.5 text-sm outline-none focus:border-[#1769AA]" placeholder="641001" />
                  </div>
                </div>
              </div>
              <button
                onClick={() => setStep(1)}
                className="mt-6 bg-[#0B3A63] hover:bg-[#1769AA] text-white font-semibold px-8 py-3 rounded-lg transition-colors"
              >
                Continue to Review →
              </button>
            </div>
          )}

          {step === 1 && (
            <div className="bg-white border border-[#D9E1E8] rounded-xl p-6">
              <h2 className="font-bold text-[#0B3A63] text-lg mb-5">Review Order</h2>
              <div className="space-y-3 mb-5">
                {items.map(item => (
                  <div key={item.product.id} className="flex gap-3 py-3 border-b border-[#D9E1E8] last:border-0">
                    <img src={item.product.images[0]} alt={item.product.name} className="w-14 h-14 object-cover rounded-lg bg-[#F6F8FA]" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-[#17212B]">{item.product.name}</p>
                      <p className="text-xs text-[#667085]">{item.product.brand} · Qty: {item.quantity}</p>
                    </div>
                    <p className="font-semibold text-[#0B3A63] text-sm">₹{(item.product.price * item.quantity).toLocaleString("en-IN")}</p>
                  </div>
                ))}
              </div>
              <div className="bg-[#F6F8FA] rounded-lg p-4 text-sm text-[#667085] mb-5">
                <h4 className="font-semibold text-[#17212B] mb-1">Delivery to:</h4>
                <p>{address.name || "John Doe"}, {address.phone || "+91 98765 43210"}</p>
                <p>{address.line1 || "45, Nehru Street"}, {address.line2}</p>
                <p>{address.city}, {address.state} - {address.pincode || "641001"}</p>
              </div>
              <div className="flex gap-3">
                <button onClick={() => setStep(0)} className="px-5 py-2.5 border border-[#D9E1E8] rounded-lg text-sm text-[#667085] hover:text-[#17212B]">← Back</button>
                <button onClick={() => setStep(2)} className="bg-[#0B3A63] hover:bg-[#1769AA] text-white font-semibold px-8 py-2.5 rounded-lg transition-colors">Continue to Payment →</button>
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
                <button onClick={() => setStep(1)} className="px-5 py-2.5 border border-[#D9E1E8] rounded-lg text-sm text-[#667085] hover:text-[#17212B]">← Back</button>
                <button onClick={handlePlaceOrder} className="flex-1 bg-[#F2A900] hover:bg-[#D4920A] text-[#0B3A63] font-bold py-3 rounded-lg transition-colors">
                  Place Order · ₹{total.toLocaleString("en-IN")}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Order summary */}
        <div className="bg-white border border-[#D9E1E8] rounded-xl p-5 h-fit sticky top-24">
          <h3 className="font-bold text-[#0B3A63] mb-4">Order Total</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between text-[#667085]"><span>Items ({items.length})</span><span>₹{subtotal.toLocaleString("en-IN")}</span></div>
            <div className="flex justify-between text-[#667085]"><span>Shipping</span><span className={shipping === 0 ? "text-[#12773D] font-medium" : ""}>{shipping === 0 ? "FREE" : `₹${shipping}`}</span></div>
            <div className="flex justify-between text-[#667085]"><span>GST (18%)</span><span>₹{tax.toLocaleString("en-IN")}</span></div>
            <div className="border-t border-[#D9E1E8] pt-2 flex justify-between font-bold text-[#0B3A63]">
              <span>Total</span><span>₹{total.toLocaleString("en-IN")}</span>
            </div>
          </div>
          {subtotal >= 999 && (
            <p className="mt-3 text-xs text-[#12773D] bg-[#ECFDF5] px-3 py-2 rounded-lg">✓ You qualify for free shipping!</p>
          )}
        </div>
      </div>
    </div>
  );
}
