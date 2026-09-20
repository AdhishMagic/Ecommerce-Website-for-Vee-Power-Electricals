import { X, Printer } from "lucide-react";
import { Invoice } from "./GenerateInvoiceModal";

interface InvoicePrintModalProps {
  invoice: Invoice | null;
  onClose: () => void;
}

export default function InvoicePrintModal({ invoice, onClose }: InvoicePrintModalProps) {
  if (!invoice) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 sm:p-6 overflow-y-auto print:p-0 print:bg-white print:block">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-full overflow-y-auto print:shadow-none print:w-full print:max-w-none print:h-auto print:overflow-visible relative flex flex-col">
        
        {/* Modal Controls - Hidden in print */}
        <div className="sticky top-0 bg-slate-50 border-b border-slate-200 p-4 flex justify-between items-center z-10 print:hidden shrink-0">
          <h2 className="font-bold text-[#0A2540] text-lg">Invoice Preview</h2>
          <div className="flex items-center gap-3">
            <button 
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-[#0A2540] text-white rounded-lg text-sm font-semibold hover:bg-[#113860] transition-colors"
            >
              <Printer className="w-4 h-4" />
              Print PDF
            </button>
            <button onClick={onClose} className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Invoice Content */}
        <div className="p-8 sm:p-12 bg-white text-slate-800 print:p-4">
          
          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start border-b-2 border-emerald-600 pb-6 mb-6">
            <div>
              <h1 className="text-3xl font-black text-[#0A2540] tracking-tight">VEE POWER ELECTRICALS</h1>
              <p className="text-sm mt-2 text-slate-600">No 28/1, 2nd floor, MTP Road</p>
              <p className="text-sm text-slate-600">NSN Palayam, Coimbatore - 641031</p>
              <p className="text-sm font-medium mt-1">GSTIN: <span className="text-slate-800">33CKXPK4525R1Z9</span></p>
              <p className="text-sm font-medium">Phone: <span className="text-slate-800">+91 8610359797</span></p>
            </div>
            <div className="mt-6 sm:mt-0 text-left sm:text-right">
              <h2 className="text-4xl font-black text-slate-200 uppercase tracking-widest mb-2">TAX INVOICE</h2>
              <p className="text-sm font-bold text-slate-800">Invoice No: {invoice.id}</p>
              <p className="text-sm text-slate-600">Order ID: {invoice.orderId}</p>
              <p className="text-sm text-slate-600">Date: {invoice.date}</p>
              <p className="text-sm font-bold text-red-600 mt-1">Due Date: {invoice.dueDate}</p>
            </div>
          </div>

          {/* Customer Details */}
          <div className="mb-8">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Billed To:</h3>
            <p className="text-lg font-bold text-[#0A2540]">{invoice.client}</p>
          </div>

          {/* Itemized Table */}
          <div className="overflow-x-auto mb-8 border border-slate-200 rounded-lg">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-[#0A2540] text-white">
                  <th className="p-3 font-semibold w-12 text-center">#</th>
                  <th className="p-3 font-semibold">Product Description</th>
                  <th className="p-3 font-semibold text-right">Qty</th>
                  <th className="p-3 font-semibold text-right">Rate</th>
                  <th className="p-3 font-semibold text-right">GST %</th>
                  <th className="p-3 font-semibold text-right">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {invoice.items && invoice.items.length > 0 ? (
                  invoice.items.map((item, index) => (
                    <tr key={item.id || index}>
                      <td className="p-3 text-center text-slate-500">{index + 1}</td>
                      <td className="p-3 font-medium text-slate-800">{item.product}</td>
                      <td className="p-3 text-right font-medium">{item.quantity}</td>
                      <td className="p-3 text-right">₹{item.rate.toLocaleString("en-IN")}</td>
                      <td className="p-3 text-right text-slate-500">{item.taxPercent}%</td>
                      <td className="p-3 text-right font-bold text-slate-800">₹{(item.quantity * item.rate).toLocaleString("en-IN")}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="p-3 text-center text-slate-500">1</td>
                    <td className="p-3 font-medium text-slate-800">Standard Order Supply / Assorted Goods</td>
                    <td className="p-3 text-right font-medium">1</td>
                    <td className="p-3 text-right">₹{invoice.amount.toLocaleString("en-IN")}</td>
                    <td className="p-3 text-right text-slate-500">18%</td>
                    <td className="p-3 text-right font-bold text-slate-800">₹{invoice.amount.toLocaleString("en-IN")}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="flex flex-col sm:flex-row justify-end items-end sm:items-start gap-8 mb-12">
            <div className="w-full sm:w-80 space-y-3">
              {invoice.subtotal !== undefined && (
                <div className="flex justify-between text-sm text-slate-600">
                  <span>Subtotal</span>
                  <span className="font-medium">₹{invoice.subtotal.toLocaleString("en-IN")}</span>
                </div>
              )}
              {invoice.taxAmount !== undefined && (
                <div className="flex justify-between text-sm text-slate-600">
                  <span>Tax Amount (GST)</span>
                  <span className="font-medium">₹{invoice.taxAmount.toLocaleString("en-IN")}</span>
                </div>
              )}
              <div className="flex justify-between text-xl font-black text-emerald-700 border-t-2 border-emerald-600 pt-2 mt-2">
                <span>Total Payable</span>
                <span>₹{invoice.amount.toLocaleString("en-IN")}</span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex flex-col sm:flex-row justify-between items-end border-t border-slate-200 pt-8 mt-12">
            <div className="w-full sm:w-1/2 mb-6 sm:mb-0">
              <h4 className="text-xs font-bold text-slate-800 uppercase mb-1">Notes & Terms</h4>
              <p className="text-xs text-slate-500 max-w-sm whitespace-pre-wrap">{invoice.notes || "Please process the payment within the due date mentioned above. Subject to Coimbatore jurisdiction only. Thank you for your business!"}</p>
            </div>
            <div className="text-center w-48">
              <div className="h-16 border-b border-dashed border-slate-300 mb-2 flex items-end justify-center">
                <span className="text-slate-200 italic font-serif">Signature</span>
              </div>
              <p className="text-xs font-bold text-[#0A2540]">Authorized Signatory</p>
              <p className="text-[10px] text-slate-500">Vee Power Electricals</p>
            </div>
          </div>
          
        </div>
      </div>
    </div>
  );
}
