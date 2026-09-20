import { X, Printer } from "lucide-react";

interface InvoiceModalProps {
  order: any;
  onClose: () => void;
}

export default function InvoiceModal({ order, onClose }: InvoiceModalProps) {
  if (!order) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 sm:p-6 overflow-y-auto print:p-0 print:bg-white print:block">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-full overflow-y-auto print:shadow-none print:w-full print:max-w-none print:h-auto print:overflow-visible relative flex flex-col">
        
        {/* Modal Controls - Hidden in print */}
        <div className="sticky top-0 bg-slate-50 border-b border-slate-200 p-4 flex justify-between items-center z-10 print:hidden shrink-0">
          <h2 className="font-bold text-[#0B3A63] text-lg">Invoice Preview</h2>
          <div className="flex items-center gap-3">
            <button 
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-[#0B3A63] text-white rounded-lg text-sm font-semibold hover:bg-[#1769AA] transition-colors"
            >
              <Printer className="w-4 h-4" />
              Print Invoice
            </button>
            <button onClick={onClose} className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Invoice Content */}
        <div className="p-8 sm:p-12 bg-white text-slate-800 print:p-4">
          
          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start border-b-2 border-[#0B3A63] pb-6 mb-6">
            <div>
              <h1 className="text-3xl font-black text-[#0B3A63] tracking-tight">VEE POWER ELECTRICALS</h1>
              <p className="text-sm mt-2 text-slate-600">No 28/1, 2nd floor, MTP Road</p>
              <p className="text-sm text-slate-600">NSN Palayam, Coimbatore - 641031</p>
              <p className="text-sm font-medium mt-1">GSTIN: <span className="text-slate-800">33CKXPK4525R1Z9</span></p>
              <p className="text-sm font-medium">Phone: <span className="text-slate-800">+91 8610359797</span></p>
            </div>
            <div className="mt-6 sm:mt-0 text-left sm:text-right">
              <h2 className="text-4xl font-black text-slate-200 uppercase tracking-widest mb-2">Invoice</h2>
              <p className="text-sm font-bold text-slate-800">Invoice No: {order.invoiceId || "INV-XXXXX"}</p>
              <p className="text-sm text-slate-600">Order ID: {order.id}</p>
              <p className="text-sm text-slate-600">Date: {new Date(order.date).toLocaleString("en-IN")}</p>
            </div>
          </div>

          {/* Customer Details */}
          <div className="mb-8">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Billed To / Shipped To:</h3>
            <p className="text-lg font-bold text-[#0B3A63]">{order.customer}</p>
            <p className="text-sm text-slate-600 w-full max-w-sm">Standard Delivery Address (Placeholder), Coimbatore, Tamil Nadu, 641001</p>
            <p className="text-sm text-slate-600 mt-1">Mobile: +91 9876543210</p>
          </div>

          {/* Itemized Table */}
          <div className="overflow-x-auto mb-8 border border-slate-200 rounded-lg">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-[#0B3A63] text-white">
                  <th className="p-3 font-semibold w-12 text-center">S.No</th>
                  <th className="p-3 font-semibold">Description of Goods</th>
                  <th className="p-3 font-semibold">SKU/HSN</th>
                  <th className="p-3 font-semibold text-right">Qty</th>
                  <th className="p-3 font-semibold text-right">Unit Price</th>
                  <th className="p-3 font-semibold text-right">CGST (9%)</th>
                  <th className="p-3 font-semibold text-right">SGST (9%)</th>
                  <th className="p-3 font-semibold text-right">Net Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {/* Mock single item for layout since order details aren't deep in MOCK_ORDERS */}
                <tr>
                  <td className="p-3 text-center text-slate-500">1</td>
                  <td className="p-3 font-medium text-slate-800">Electrical Goods / Assorted Items (As per Order)</td>
                  <td className="p-3 text-slate-500">8536</td>
                  <td className="p-3 text-right font-medium">1</td>
                  <td className="p-3 text-right">₹{((order.total * 100) / 118).toFixed(2)}</td>
                  <td className="p-3 text-right">₹{((order.total * 9) / 118).toFixed(2)}</td>
                  <td className="p-3 text-right">₹{((order.total * 9) / 118).toFixed(2)}</td>
                  <td className="p-3 text-right font-bold text-slate-800">₹{order.total.toLocaleString("en-IN")}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="flex flex-col sm:flex-row justify-end items-end sm:items-start gap-8 mb-12">
            <div className="w-full sm:w-80 space-y-2">
              <div className="flex justify-between text-sm text-slate-600">
                <span>Subtotal (Excl. Tax)</span>
                <span>₹{((order.total * 100) / 118).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm text-slate-600">
                <span>Total CGST (9%)</span>
                <span>₹{((order.total * 9) / 118).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-sm text-slate-600">
                <span>Total SGST (9%)</span>
                <span>₹{((order.total * 9) / 118).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-lg font-black text-[#0B3A63] border-t-2 border-[#0B3A63] pt-2 mt-2">
                <span>Grand Total</span>
                <span>₹{order.total.toLocaleString("en-IN")}</span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex flex-col sm:flex-row justify-between items-end border-t border-slate-200 pt-8">
            <div className="w-full sm:w-1/2 mb-6 sm:mb-0">
              <h4 className="text-xs font-bold text-slate-800 uppercase mb-1">Terms & Conditions</h4>
              <p className="text-xs text-slate-500 max-w-sm">Goods once sold can be returned per store return policy within 7 days. Subject to Coimbatore jurisdiction only. This is a computer generated invoice.</p>
            </div>
            <div className="text-center w-48">
              <div className="h-16 border-b border-dashed border-slate-300 mb-2 flex items-end justify-center">
                <span className="text-slate-200 italic font-serif">Signature</span>
              </div>
              <p className="text-xs font-bold text-[#0B3A63]">Authorized Signatory</p>
              <p className="text-[10px] text-slate-500">Vee Power Electricals</p>
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}
