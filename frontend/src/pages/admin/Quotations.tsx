import { useState } from "react";
import { FileText, Clock, CheckCircle2, IndianRupee, Plus, Download, Edit, ArrowRightCircle } from "lucide-react";
import QuotationModal, { Quotation } from "../../components/admin/QuotationModal";
import QuotationPrintModal from "../../components/admin/QuotationPrintModal";

const INITIAL_QUOTES: Quotation[] = [
  { id: "QT-2026-001", client: "L&T Construction", date: "2026-09-15", expiry: "2026-10-15", value: 450000, status: "Approved", items: [{id: '1', product: '1.5 sq mm Wire', quantity: 100, price: 4500}] },
  { id: "QT-2026-002", client: "Reliance Retail", date: "2026-09-12", expiry: "2026-10-12", value: 1250000, status: "Sent" },
  { id: "QT-2026-003", client: "Tata Projects", date: "2026-09-10", expiry: "2026-10-10", value: 850000, status: "Draft" },
  { id: "QT-2026-004", client: "Shapoorji Pallonji", date: "2026-09-05", expiry: "2026-10-05", value: 320000, status: "Rejected" },
  { id: "QT-2026-005", client: "Godrej Properties", date: "2026-09-02", expiry: "2026-10-02", value: 540000, status: "Sent" },
];

const STATUS_COLORS: Record<string, string> = {
  "Draft": "bg-slate-100 text-slate-700",
  "Sent": "bg-blue-100 text-blue-700",
  "Approved": "bg-emerald-100 text-emerald-700",
  "Rejected": "bg-red-100 text-red-700",
};

export default function QuotationsPage() {
  const [quotes, setQuotes] = useState<Quotation[]>(INITIAL_QUOTES);
  const [statusFilter, setStatusFilter] = useState("All");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingQuote, setEditingQuote] = useState<Quotation | null>(null);
  const [printingQuote, setPrintingQuote] = useState<Quotation | null>(null);

  const handleCreateNew = () => {
    setEditingQuote(null);
    setIsModalOpen(true);
  };

  const handleEditQuotation = (quote: Quotation) => {
    setEditingQuote(quote);
    setIsModalOpen(true);
  };

  const handleDownloadPDF = (quote: Quotation) => {
    setPrintingQuote(quote);
  };

  const handleConvertToInvoice = (quote: Quotation) => {
    if (window.confirm(`Convert Quotation ${quote.id} to an Invoice?`)) {
      setQuotes(quotes.map(q => q.id === quote.id ? { ...q, status: "Converted" } : q));
      alert(`Success! Invoice generated for ${quote.client}. You can view it in the Invoices panel.`);
    }
  };

  const handleModalSubmit = (data: Partial<Quotation>) => {
    if (editingQuote) {
      setQuotes(quotes.map(q => q.id === editingQuote.id ? { ...q, ...data } as Quotation : q));
    } else {
      const newQuote: Quotation = {
        id: `QT-2026-${String(quotes.length + 1).padStart(3, '0')}`,
        date: new Date().toISOString().split('T')[0],
        ...data
      } as Quotation;
      setQuotes([newQuote, ...quotes]);
    }
    setIsModalOpen(false);
  };

  const filteredQuotes = statusFilter === "All" 
    ? quotes 
    : quotes.filter(q => q.status === statusFilter);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0A2540]">Quotations</h1>
        <p className="text-sm text-slate-500 mt-1">Manage B2B quotations and price estimations.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { title: "Total Quotes Issued", value: "45", icon: <FileText className="w-5 h-5 text-blue-600" />, bg: "bg-blue-100" },
          { title: "Pending Approval", value: "12", icon: <Clock className="w-5 h-5 text-amber-600" />, bg: "bg-amber-100" },
          { title: "Converted to Orders", value: "28", icon: <CheckCircle2 className="w-5 h-5 text-emerald-600" />, bg: "bg-emerald-100" },
          { title: "Total Quoted Value", value: "₹45,20,000", icon: <IndianRupee className="w-5 h-5 text-[#0A2540]" />, bg: "bg-[#0A2540]/10" },
        ].map((kpi, idx) => (
          <div key={idx} className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-500 mb-1">{kpi.title}</p>
              <p className="text-2xl font-bold text-[#0A2540]">{kpi.value}</p>
            </div>
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${kpi.bg}`}>
              {kpi.icon}
            </div>
          </div>
        ))}
      </div>

      {/* Action Header & Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h2 className="font-bold text-[#0A2540]">All Quotations</h2>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <select 
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 text-sm text-[#0A2540] font-medium outline-none focus:border-[#0A2540] flex-1 sm:flex-none"
            >
              <option value="All">All Statuses</option>
              <option value="Draft">Draft</option>
              <option value="Sent">Sent</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
            </select>
            <button 
              onClick={handleCreateNew}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-[#F2A900] text-[#0A2540] text-sm font-bold rounded-lg hover:bg-[#e09b00] transition-colors shadow-sm whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              Create Quotation
            </button>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-slate-50/80">
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase">Quote ID</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase">Client Name</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase">Date Created</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase">Expiry Date</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase text-right">Total Value (₹)</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase text-center">Status</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredQuotes.map(quote => (
                <tr key={quote.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-4 text-sm font-bold text-[#0A2540] font-mono">{quote.id}</td>
                  <td className="px-5 py-4 text-sm font-medium text-slate-700">{quote.client}</td>
                  <td className="px-5 py-4 text-sm text-slate-600">{quote.date}</td>
                  <td className="px-5 py-4 text-sm text-slate-600">{quote.expiry}</td>
                  <td className="px-5 py-4 text-sm font-bold text-[#0A2540] text-right">₹{quote.value.toLocaleString("en-IN")}</td>
                  <td className="px-5 py-4 text-center">
                    <span className={`inline-flex px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider ${STATUS_COLORS[quote.status]}`}>
                      {quote.status}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={() => handleDownloadPDF(quote)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="Download PDF">
                        <Download className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleEditQuotation(quote)} className="p-1.5 text-slate-400 hover:text-[#0A2540] hover:bg-slate-100 rounded transition-colors" title="Edit">
                        <Edit className="w-4 h-4" />
                      </button>
                      {quote.status === "Approved" && (
                        <button onClick={() => handleConvertToInvoice(quote)} className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors" title="Convert to Invoice">
                          <ArrowRightCircle className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredQuotes.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-slate-500">No quotations found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <QuotationModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSubmit={handleModalSubmit}
        initialData={editingQuote}
      />

      {printingQuote && (
        <QuotationPrintModal 
          quote={printingQuote} 
          onClose={() => setPrintingQuote(null)} 
        />
      )}
    </div>
  );
}
