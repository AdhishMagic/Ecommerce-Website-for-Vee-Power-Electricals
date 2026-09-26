import { useState, useEffect } from "react";
import { FileText, IndianRupee, AlertCircle, CreditCard, Plus, Download, CheckCircle2, Send } from "lucide-react";
import GenerateInvoiceModal, { Invoice } from "../../components/admin/GenerateInvoiceModal";
import InvoicePrintModal from "../../components/admin/InvoicePrintModal";
import { financeApi } from "../../api/finance";

const STATUS_TABS = ["All", "Paid", "Unpaid", "Overdue", "Cancelled"];

const STATUS_COLORS: Record<string, string> = {
  "Paid": "bg-emerald-100 text-emerald-700",
  "Unpaid": "bg-amber-100 text-amber-700",
  "Overdue": "bg-red-100 text-red-700",
  "Cancelled": "bg-slate-100 text-slate-700",
};

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<(Invoice & { rawId?: number | string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("All");

  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [printingInvoice, setPrintingInvoice] = useState<Invoice | null>(null);

  const fetchInvoices = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await financeApi.getInvoices();
      const mapped = (data || []).map((inv: any) => ({
        id: inv.invoice_number || `INV-${inv.id}`,
        rawId: inv.id,
        orderId: inv.order_number || '',
        client: inv.client_name || (inv.client ? `Client #${inv.client}` : 'General Order'),
        date: inv.invoice_date || '',
        dueDate: inv.due_date || '',
        amount: Number(inv.total_amount || 0),
        subtotal: Number(inv.subtotal || 0),
        taxAmount: Number(inv.tax_amount || 0),
        status: (inv.status === 'PAID' ? 'Paid' : inv.status === 'OVERDUE' ? 'Overdue' : inv.status === 'CANCELLED' ? 'Cancelled' : 'Unpaid') as any,
        items: (inv.items || []).map((it: any) => ({
          id: String(it.id),
          product: it.item_name || 'Item',
          quantity: it.quantity,
          rate: Number(it.rate || 0),
          taxPercent: Number(it.tax_percent || 18),
        })),
      }));
      setInvoices(mapped);
    } catch (err: any) {
      console.error("Failed to load invoices:", err);
      setError(err?.message || "Failed to load invoices from API.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInvoices();
  }, []);

  const handleGenerateInvoice = async (data: Partial<Invoice>) => {
    try {
      if (data.clientId) {
        await financeApi.createInvoice({
          client: data.clientId,
          invoice_date: data.date,
          due_date: data.dueDate,
          notes: data.notes,
          subtotal: data.subtotal,
          tax_amount: data.taxAmount,
          total_amount: data.amount,
        });
      }
      setIsGenerateModalOpen(false);
      await fetchInvoices();
    } catch (err: any) {
      console.error("Failed to generate invoice:", err);
      alert(err?.message || "Failed to generate invoice.");
    }
  };

  const handleMarkAsPaid = async (invoice: Invoice & { rawId?: number | string }) => {
    try {
      const targetId = invoice.rawId || invoice.id;
      await financeApi.updateInvoiceStatus(String(targetId), 'PAID');
      await fetchInvoices();
    } catch (err: any) {
      console.error("Failed to mark invoice as paid:", err);
      alert(err?.message || "Failed to update invoice status.");
    }
  };

  const handleSendReminder = (invoice: Invoice) => {
    alert(`Reminder sent to ${invoice.client} successfully.`);
  };

  const handleDownloadPDF = (invoice: Invoice) => {
    setPrintingInvoice(invoice);
  };

  const filteredInvoices = activeTab === "All" 
    ? invoices 
    : invoices.filter(i => i.status === activeTab);

  const totalInvoiced = invoices.reduce((sum, inv) => sum + inv.amount, 0);
  const totalPaid = invoices.filter(i => i.status === "Paid").reduce((sum, inv) => sum + inv.amount, 0);
  const totalOverdue = invoices.filter(i => i.status === "Overdue").reduce((sum, inv) => sum + inv.amount, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0A2540]">Invoices & Payments</h1>
        <p className="text-sm text-slate-500 mt-1">Track tax invoices, client payments, and overdue amounts.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { title: "Total Invoiced", value: `₹${totalInvoiced.toLocaleString("en-IN")}`, icon: <FileText className="w-5 h-5 text-blue-600" />, bg: "bg-blue-100" },
          { title: "Paid Invoices", value: `₹${totalPaid.toLocaleString("en-IN")}`, icon: <IndianRupee className="w-5 h-5 text-emerald-600" />, bg: "bg-emerald-100" },
          { title: "Overdue Invoices", value: `₹${totalOverdue.toLocaleString("en-IN")}`, icon: <AlertCircle className="w-5 h-5 text-red-600" />, bg: "bg-red-100" },
          { title: "Gateway Settlements", value: "₹5,20,000", icon: <CreditCard className="w-5 h-5 text-indigo-600" />, bg: "bg-indigo-100" },
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

      {/* Action Header & Tabs */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h2 className="font-bold text-[#0A2540]">Invoice Ledger</h2>
          <button onClick={() => setIsGenerateModalOpen(true)} className="flex items-center justify-center gap-2 px-4 py-2 bg-[#F2A900] text-[#0A2540] text-sm font-bold rounded-lg hover:bg-[#e09b00] transition-colors shadow-sm whitespace-nowrap">
            <Plus className="w-4 h-4" />
            Generate Invoice
          </button>
        </div>
        
        {/* Status Tabs */}
        <div className="px-5 pt-3 border-b border-slate-200">
          <div className="flex items-center gap-4 overflow-x-auto pb-3 scrollbar-hide">
            {STATUS_TABS.map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`whitespace-nowrap px-4 py-1.5 rounded-full text-sm font-semibold transition-colors ${
                  activeTab === tab 
                    ? "bg-[#0A2540] text-white shadow-sm" 
                    : "bg-transparent text-slate-500 hover:text-[#0A2540] hover:bg-slate-100"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead>
              <tr className="bg-slate-50/80">
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase">Invoice #</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase">Order ID</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase">Client / Customer</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase">Date</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase">Due Date</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase text-right">Amount (₹)</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase text-center">Status</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredInvoices.map(invoice => (
                <tr key={invoice.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-4 text-sm font-bold text-[#0A2540] font-mono">{invoice.id}</td>
                  <td className="px-5 py-4 text-sm text-slate-500 font-mono">{invoice.orderId}</td>
                  <td className="px-5 py-4 text-sm font-medium text-slate-700">{invoice.client}</td>
                  <td className="px-5 py-4 text-sm text-slate-600">{invoice.date}</td>
                  <td className="px-5 py-4 text-sm text-slate-600">{invoice.dueDate}</td>
                  <td className="px-5 py-4 text-sm font-bold text-[#0A2540] text-right">₹{invoice.amount.toLocaleString("en-IN")}</td>
                  <td className="px-5 py-4 text-center">
                    <span className={`inline-flex px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider ${STATUS_COLORS[invoice.status]}`}>
                      {invoice.status}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={() => handleDownloadPDF(invoice)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors cursor-pointer" title="Download PDF">
                        <Download className="w-4 h-4" />
                      </button>
                      {(invoice.status === "Unpaid" || invoice.status === "Overdue") && (
                        <>
                          <button onClick={() => handleMarkAsPaid(invoice)} className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors cursor-pointer" title="Mark as Paid">
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                          <button onClick={() => handleSendReminder(invoice)} className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors cursor-pointer" title="Send Reminder">
                            <Send className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {filteredInvoices.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-slate-500">No invoices found for this status.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <GenerateInvoiceModal 
        isOpen={isGenerateModalOpen} 
        onClose={() => setIsGenerateModalOpen(false)} 
        onSubmit={handleGenerateInvoice} 
      />

      <InvoicePrintModal 
        invoice={printingInvoice} 
        onClose={() => setPrintingInvoice(null)} 
      />
    </div>
  );
}
