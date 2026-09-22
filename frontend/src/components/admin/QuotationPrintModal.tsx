import { X, Printer } from "lucide-react";
import { COMPANY_ADDRESS } from "../../constants/companyInfo";

interface QuotationPrintModalProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  quote: any;
  onClose: () => void;
}

export default function QuotationPrintModal({ quote, onClose }: QuotationPrintModalProps) {
  if (!quote) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4 sm:p-6 overflow-y-auto print:p-0 print:bg-white print:block">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-full overflow-y-auto print:shadow-none print:w-full print:max-w-none print:h-auto print:overflow-visible relative flex flex-col">
        
        {/* Modal Controls - Hidden in print */}
        <div className="sticky top-0 bg-slate-50 border-b border-slate-200 p-4 flex justify-between items-center z-10 print:hidden shrink-0">
          <h2 className="font-bold text-[#0A2540] text-lg">Quotation Preview</h2>
          <div className="flex items-center gap-3">
            <button 
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-[#0A2540] text-white rounded-lg text-sm font-semibold hover:bg-[#113860] transition-colors"
            >
              <Printer className="w-4 h-4" />
              Print Quotation
            </button>
            <button onClick={onClose} className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-200 rounded-lg transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Quotation Content */}
        <div className="p-8 sm:p-12 bg-white text-slate-800 print:p-4">
          
          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start border-b-2 border-[#0A2540] pb-6 mb-6">
            <div>
              <h1 className="text-3xl font-black text-[#0A2540] tracking-tight">VEE POWER ELECTRICALS</h1>
              <p className="text-sm mt-2 text-slate-600 max-w-xs">{COMPANY_ADDRESS}</p>
              <p className="text-sm font-medium mt-1">GSTIN: <span className="text-slate-800">33CKXPK4525R1Z9</span></p>
              <p className="text-sm font-medium">Phone: <span className="text-slate-800">+91 8610359797</span></p>
            </div>
            <div className="mt-6 sm:mt-0 text-left sm:text-right">
              <h2 className="text-4xl font-black text-slate-200 uppercase tracking-widest mb-2">Quotation</h2>
              <p className="text-sm font-bold text-slate-800">Quote No: {quote.id}</p>
              <p className="text-sm text-slate-600">Date: {quote.date}</p>
              <p className="text-sm text-slate-600">Valid Until: {quote.expiry}</p>
            </div>
          </div>

          {/* Customer Details */}
          <div className="mb-8">
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Prepared For:</h3>
            <p className="text-lg font-bold text-[#0A2540]">{quote.client}</p>
          </div>

          {/* Itemized Table */}
          <div className="overflow-x-auto mb-8 border border-slate-200 rounded-lg">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-[#0A2540] text-white">
                  <th className="p-3 font-semibold w-12 text-center">S.No</th>
                  <th className="p-3 font-semibold">Description of Goods</th>
                  <th className="p-3 font-semibold text-right">Qty</th>
                  <th className="p-3 font-semibold text-right">Unit Price</th>
                  <th className="p-3 font-semibold text-right">Net Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {quote.items && quote.items.length > 0 ? (
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  quote.items.map((item: any, index: number) => (
                    <tr key={index}>
                      <td className="p-3 text-center text-slate-500">{index + 1}</td>
                      <td className="p-3 font-medium text-slate-800">{item.product}</td>
                      <td className="p-3 text-right font-medium">{item.quantity}</td>
                      <td className="p-3 text-right">₹{item.price.toLocaleString("en-IN")}</td>
                      <td className="p-3 text-right font-bold text-slate-800">₹{(item.quantity * item.price).toLocaleString("en-IN")}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="p-3 text-center text-slate-500">1</td>
                    <td className="p-3 font-medium text-slate-800">Standard Project Estimate / Assorted Goods</td>
                    <td className="p-3 text-right font-medium">1</td>
                    <td className="p-3 text-right">₹{quote.value.toLocaleString("en-IN")}</td>
                    <td className="p-3 text-right font-bold text-slate-800">₹{quote.value.toLocaleString("en-IN")}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Totals */}
          <div className="flex flex-col sm:flex-row justify-end items-end sm:items-start gap-8 mb-12">
            <div className="w-full sm:w-80 space-y-2">
              <div className="flex justify-between text-lg font-black text-[#0A2540] border-t-2 border-[#0A2540] pt-2 mt-2">
                <span>Total Value</span>
                <span>₹{quote.value.toLocaleString("en-IN")}</span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex flex-col sm:flex-row justify-between items-end border-t border-slate-200 pt-8">
            <div className="w-full sm:w-1/2 mb-6 sm:mb-0">
              <h4 className="text-xs font-bold text-slate-800 uppercase mb-1">Notes & Terms</h4>
              <p className="text-xs text-slate-500 max-w-sm whitespace-pre-wrap">{quote.notes || "This is a price quotation and not a final invoice. Prices are valid until the expiry date mentioned above. Subject to Coimbatore jurisdiction only."}</p>
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
