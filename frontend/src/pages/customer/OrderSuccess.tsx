import { Link, useLocation } from "react-router-dom";
import { COMPANY_NAME } from "../../constants/companyInfo";

export default function OrderSuccess() {
  const location = useLocation();
  const order = location.state?.order;

  const orderNumber = order?.order_number || order?.orderNumber || "Order Confirmed";
  const orderDate = order?.created_at
    ? new Date(order.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" })
    : new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "long", year: "numeric" });

  const totalAmount = order?.total_amount !== undefined
    ? Number(order.total_amount).toLocaleString("en-IN")
    : null;

  return (
    <div className="max-w-2xl mx-auto px-4 py-16 text-center">
      <div className="bg-white border border-[#D9E1E8] rounded-2xl p-10 shadow-sm">
        <div className="w-20 h-20 bg-[#ECFDF5] rounded-full flex items-center justify-center mx-auto mb-6">
          <svg className="w-10 h-10 text-[#12773D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h1 className="text-3xl font-bold text-[#0B3A63] mb-2" style={{ fontFamily: "Outfit" }}>Order Placed!</h1>
        <p className="text-[#667085] mb-2">Thank you for shopping with {COMPANY_NAME}.</p>
        <p className="text-sm text-[#667085] mb-6">Your order confirmation has been recorded successfully.</p>

        <div className="bg-[#F6F8FA] rounded-xl p-5 mb-6 text-left">
          <div className="flex justify-between items-center mb-3">
            <span className="text-sm font-semibold text-[#17212B]">Order Number</span>
            <span className="text-sm font-bold text-[#1769AA] font-mono">{orderNumber}</span>
          </div>
          {totalAmount && (
            <div className="flex justify-between items-center mb-3">
              <span className="text-sm font-semibold text-[#17212B]">Total Paid</span>
              <span className="text-sm font-bold text-[#0B3A63]">₹{totalAmount}</span>
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
            View My Orders
          </Link>
          <Link to="/shop" className="bg-white border border-[#D9E1E8] hover:border-[#1769AA] text-[#17212B] font-semibold px-6 py-3 rounded-lg transition-colors">
            Continue Shopping
          </Link>
        </div>
      </div>
    </div>
  );
}
