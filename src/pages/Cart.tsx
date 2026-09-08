import { Link, useNavigate } from "react-router-dom";
import { useCart } from "../context/CartContext";

export default function Cart() {
  const { items, removeFromCart, updateQty, subtotal, totalItems } = useCart();
  const navigate = useNavigate();

  const shipping = subtotal >= 999 ? 0 : 99;
  const tax = Math.round(subtotal * 0.18);
  const total = subtotal + shipping + tax;

  if (items.length === 0) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-20 text-center">
        <div className="text-6xl mb-4">🛒</div>
        <h2 className="text-2xl font-bold text-[#0B3A63] mb-2">Your Cart is Empty</h2>
        <p className="text-[#667085] mb-6">Add products to your cart to get started.</p>
        <Link to="/shop" className="bg-[#0B3A63] text-white px-6 py-3 rounded-lg font-semibold hover:bg-[#1769AA] transition-colors">
          Browse Products
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-[#0B3A63] mb-6">Shopping Cart ({totalItems} items)</h1>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Items */}
        <div className="lg:col-span-2 space-y-3">
          {items.map(item => {
            const disc = Math.round(((item.product.mrp - item.product.price) / item.product.mrp) * 100);
            return (
              <div key={item.product.id} className="bg-white border border-[#D9E1E8] rounded-xl p-4 flex gap-4">
                <img src={item.product.images[0]} alt={item.product.name} className="w-20 h-20 object-cover rounded-lg bg-[#F6F8FA] flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex justify-between gap-2">
                    <div>
                      <p className="text-xs text-[#1769AA] font-semibold">{item.product.brand}</p>
                      <Link to={`/product/${item.product.id}`} className="text-sm font-medium text-[#17212B] hover:text-[#1769AA] line-clamp-2">{item.product.name}</Link>
                      <p className="text-xs text-[#667085] font-mono mt-0.5">SKU: {item.product.sku}</p>
                    </div>
                    <button onClick={() => removeFromCart(item.product.id)} className="text-[#667085] hover:text-[#C0392B] flex-shrink-0">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center border border-[#D9E1E8] rounded-lg overflow-hidden">
                      <button onClick={() => updateQty(item.product.id, item.quantity - 1)} className="px-2.5 py-1 text-[#17212B] hover:bg-[#F6F8FA] text-sm">−</button>
                      <span className="px-3 py-1 text-sm font-semibold border-x border-[#D9E1E8]">{item.quantity}</span>
                      <button onClick={() => updateQty(item.product.id, item.quantity + 1)} disabled={item.quantity >= item.product.stock} className="px-2.5 py-1 text-[#17212B] hover:bg-[#F6F8FA] text-sm disabled:opacity-40">+</button>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-[#0B3A63]">₹{(item.product.price * item.quantity).toLocaleString("en-IN")}</p>
                      {disc > 0 && <p className="text-xs text-[#667085] line-through">₹{(item.product.mrp * item.quantity).toLocaleString("en-IN")}</p>}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Summary */}
        <div className="lg:col-span-1">
          <div className="bg-white border border-[#D9E1E8] rounded-xl p-5 sticky top-24">
            <h2 className="font-bold text-[#0B3A63] text-lg mb-4">Order Summary</h2>
            <div className="space-y-2.5 text-sm">
              <div className="flex justify-between text-[#667085]">
                <span>Subtotal ({totalItems} items)</span>
                <span>₹{subtotal.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between text-[#667085]">
                <span>Shipping</span>
                {shipping === 0 ? (
                  <span className="text-[#12773D] font-medium">FREE</span>
                ) : (
                  <span>₹{shipping}</span>
                )}
              </div>
              <div className="flex justify-between text-[#667085]">
                <span>GST (18%)</span>
                <span>₹{tax.toLocaleString("en-IN")}</span>
              </div>
              {subtotal < 999 && (
                <p className="text-xs text-[#B45309] bg-[#FFFBEB] px-3 py-2 rounded-lg">
                  Add ₹{(999 - subtotal).toLocaleString("en-IN")} more for free shipping
                </p>
              )}
              <div className="border-t border-[#D9E1E8] pt-2.5 flex justify-between font-bold text-[#0B3A63]">
                <span>Total</span>
                <span>₹{total.toLocaleString("en-IN")}</span>
              </div>
            </div>
            <button
              onClick={() => navigate("/checkout")}
              className="w-full mt-5 bg-[#F2A900] hover:bg-[#D4920A] text-[#0B3A63] font-bold py-3.5 rounded-lg transition-colors"
            >
              Proceed to Checkout →
            </button>
            <Link to="/shop" className="block mt-3 text-center text-sm text-[#1769AA] hover:text-[#0B3A63]">
              ← Continue Shopping
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
