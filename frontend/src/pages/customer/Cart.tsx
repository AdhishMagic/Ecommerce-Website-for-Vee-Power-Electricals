import { Link, useNavigate } from "react-router-dom";
import { useCart } from "../../context/CartContext";

export default function Cart() {
  const { items, removeFromCart, updateQty, subtotal, totalItems } = useCart();
  const navigate = useNavigate();

  const shipping = subtotal >= 999 ? 0 : 99;
  const tax = Math.round(subtotal * 0.18);
  const total = subtotal + shipping + tax;

  if (items.length === 0) {
    return (
      <div className="site-container py-20 text-center">
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
    <div className="site-container py-6">
      <h1 className="text-2xl font-bold text-[#0B3A63] mb-6">Shopping Cart ({totalItems} items)</h1>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Items */}
        <div className="lg:col-span-2 space-y-4">
          {items.map(item => {
            const disc = Math.round(((item.product.mrp - item.product.price) / item.product.mrp) * 100);
            return (
              <div key={item.product.id} className="bg-white border border-[#D9E1E8] rounded-xl p-5 flex flex-col sm:flex-row gap-5 hover:-translate-y-1 hover:shadow-lg transition-all duration-300">
                <img src={item.product.images[0]} alt={item.product.name} className="w-24 h-24 object-cover rounded-xl bg-[#F6F8FA] flex-shrink-0" />
                <div className="flex-1 min-w-0 flex flex-col justify-between">
                  <div className="flex justify-between gap-3">
                    <div>
                      <p className="text-xs text-[#1769AA] font-bold mb-1 uppercase tracking-wider">{item.product.brand}</p>
                      <Link to={`/product/${item.product.id}`} className="text-base font-semibold text-[#17212B] hover:text-[#1769AA] line-clamp-2 leading-snug">{item.product.name}</Link>
                      <p className="text-xs text-[#667085] font-mono mt-1.5">SKU: {item.product.sku}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="font-bold text-lg text-[#0B3A63]">₹{(item.product.price * item.quantity).toLocaleString("en-IN")}</p>
                      {disc > 0 && <p className="text-xs text-[#667085] line-through mt-0.5">₹{(item.product.mrp * item.quantity).toLocaleString("en-IN")}</p>}
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-4">
                    <div className="flex items-center gap-4">
                      <div className="flex items-center border border-[#D9E1E8] rounded-lg overflow-hidden bg-white shadow-sm">
                        <button onClick={() => updateQty(item.product.id, item.quantity - 1)} className="px-3 py-1.5 text-[#17212B] hover:bg-[#F6F8FA] font-medium transition-colors">−</button>
                        <span className="px-4 py-1.5 text-sm font-bold border-x border-[#D9E1E8] bg-[#F6F8FA]">{item.quantity}</span>
                        <button onClick={() => updateQty(item.product.id, item.quantity + 1)} disabled={item.quantity >= item.product.stock} className="px-3 py-1.5 text-[#17212B] hover:bg-[#F6F8FA] font-medium transition-colors disabled:opacity-40">+</button>
                      </div>
                      <button onClick={() => removeFromCart(item.product.id)} className="text-[#C0392B] hover:bg-[#FEF2F2] p-2 rounded-lg transition-colors flex items-center justify-center">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                      </button>
                    </div>
                    <button 
                      onClick={() => navigate("/checkout", { state: { singleItem: item.product.id, quantity: item.quantity } })}
                      className="text-xs sm:text-sm font-semibold bg-[#EFF6FF] text-[#1769AA] hover:bg-[#1769AA] hover:text-white px-4 py-2 rounded-lg transition-colors"
                    >
                      Buy This Item Only
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Summary */}
        <div className="lg:col-span-1">
          <div className="bg-white border border-[#D9E1E8] rounded-2xl p-6 sticky top-24 shadow-sm">
            <h2 className="font-bold text-[#0B3A63] text-xl mb-5" style={{ fontFamily: "Outfit" }}>Order Summary</h2>
            
            {/* Detailed Line-by-Line Breakdown */}
            <div className="space-y-3 mb-6 pb-6 border-b border-dashed border-[#D9E1E8]">
              {items.map(item => (
                <div key={item.product.id} className="flex justify-between text-sm items-start gap-3">
                  <div className="text-[#667085] pr-2">
                    <span className="font-semibold text-[#17212B]">{item.product.brand}</span> - <span className="line-clamp-1 inline-block align-bottom">{item.product.name}</span> <span className="font-semibold text-[#1769AA] whitespace-nowrap">(x{item.quantity})</span>
                  </div>
                  <span className="font-medium text-[#17212B] whitespace-nowrap">₹{(item.product.price * item.quantity).toLocaleString("en-IN")}</span>
                </div>
              ))}
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex justify-between text-[#667085]">
                <span>Subtotal ({totalItems} items)</span>
                <span className="font-medium text-[#17212B]">₹{subtotal.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between text-[#667085]">
                <span>Shipping</span>
                {shipping === 0 ? (
                  <span className="text-[#12773D] font-bold">FREE</span>
                ) : (
                  <span className="font-medium text-[#17212B]">₹{shipping}</span>
                )}
              </div>
              <div className="flex justify-between text-[#667085]">
                <span>GST (18%)</span>
                <span className="font-medium text-[#17212B]">₹{tax.toLocaleString("en-IN")}</span>
              </div>
              
              {subtotal < 999 && (
                <div className="bg-[#FFFBEB] border border-[#FDE68A] rounded-lg p-3 mt-3 flex items-start gap-2">
                  <span className="text-[#B45309]">ℹ️</span>
                  <p className="text-xs text-[#B45309] font-medium leading-snug">
                    Add ₹{(999 - subtotal).toLocaleString("en-IN")} more to your cart to qualify for free shipping!
                  </p>
                </div>
              )}
              
              <div className="border-t border-[#D9E1E8] pt-4 mt-2 flex justify-between items-end">
                <span className="font-bold text-[#0B3A63] text-base">Total</span>
                <span className="font-bold text-[#1769AA] text-2xl">₹{total.toLocaleString("en-IN")}</span>
              </div>
            </div>
            
            <button
              onClick={() => navigate("/checkout")}
              className="w-full mt-6 bg-[#F2A900] hover:bg-[#D4920A] text-[#0B3A63] font-bold py-4 rounded-xl transition-all shadow-md hover:shadow-lg flex justify-center items-center gap-2 text-lg"
            >
              Proceed to Checkout
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
            </button>
            
            <Link to="/shop" className="flex items-center justify-center gap-2 mt-4 text-sm font-medium text-[#1769AA] hover:text-[#0B3A63] transition-colors">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
              Continue Shopping
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
