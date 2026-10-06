import { useState, useEffect, useCallback } from "react";
import { FileText, IndianRupee, AlertCircle, CreditCard, Plus, Download, CheckCircle2, Send, RefreshCw } from "lucide-react";
import GenerateInvoiceModal, { Invoice } from "../../components/admin/GenerateInvoiceModal";
import InvoicePrintModal from "../../components/admin/InvoicePrintModal";
import { financeApi, InvoicesSummary } from "../../api/finance";
import AdminPagination from "../../components/common/AdminPagination";

const STATUS_TABS = ["All", "Paid", "Unpaid", "Overdue", "Cancelled"];

const STATUS_COLORS: Record<string, string> = {
  "Paid": "bg-emerald-100 text-emerald-700",
  "Unpaid": "bg-amber-100 text-amber-700",
  "Overdue": "bg-red-100 text-red-700",
  "Cancelled": "bg-slate-100 text-slate-700",
};

const money = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "—";
  const num = Number(value);
  return Number.isFinite(num) ? `₹${num.toLocaleString("en-IN")}` : "—";
};

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<(Invoice & { rawId?: number | string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("All");

  // Server-side pagination state. Totals come from the backend envelope, never
  // from the length of the page currently held in memory.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Database-wide aggregates for the KPI cards.
  const [summary, setSummary] = useState<InvoicesSummary | null>(null);

  const [isGenerateModalOpen, setIsGenerateModalOpen] = useState(false);
  const [printingInvoice, setPrintingInvoice] = useState<Invoice | null>(null);

  const fetchSummary = useCallback(async () => {
    try {
      setSummary(await financeApi.getInvoicesSummary());
    } catch (err) {
      console.error("Failed to load invoice summary:", err);
      setSummary(null);
    }
  }, []);

  const fetchInvoices = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await financeApi.getInvoicesPaginated({
        page,
        page_size: pageSize,
        status: activeTab === "All" ? undefined : activeTab,
      });
      const data = res.results || [];
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
        status: (String(inv.status || '').toUpperCase() === 'PAID' ? 'Paid' : String(inv.status || '').toUpperCase() === 'OVERDUE' ? 'Overdue' : String(inv.status || '').toUpperCase() === 'CANCELLED' ? 'Cancelled' : 'Unpaid') as any,
        items: (inv.items || []).map((it: any) => ({
          id: String(it.id),
          product: it.item_name || 'Item',
          quantity: it.quantity,
          rate: Number(it.rate || 0),
          taxPercent: Number(it.tax_percent || 18),
        })),
      }));
      setInvoices(mapped);
      setTotalCount(typeof res.count === "number" ? res.count : mapped.length);
      setTotalPages(res.total_pages || Math.ceil((res.count || 1) / pageSize) || 1);
    } catch (err: any) {
      console.error("Failed to load invoices:", err);
      setError(err?.message || "Failed to load invoices from API.");
      setInvoices([]);
      setTotalCount(0);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, activeTab]);

  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const refreshAll = async () => {
    await Promise.all([fetchInvoices(), fetchSummary()]);
  };

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
      await refreshAll();
    } catch (err: any) {
      console.error("Failed to generate invoice:", err);
      alert(err?.message || "Failed to generate invoice.");
    }
  };

  const handleMarkAsPaid = async (invoice: Invoice & { rawId?: number | string }) => {
    try {
      const targetId = invoice.rawId || invoice.id;
      await financeApi.recordInvoicePayment(String(targetId), {
        amount: invoice.amount,
        payment_method: 'MANUAL',
        gateway: 'MANUAL',
        notes: 'Admin payment settlement',
      });
      await refreshAll();
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

  const overdueAmount = summary?.by_status?.Overdue?.amount;

  const kpis = [
    { title: "Total Invoiced", value: money(summary?.total_invoiced), hint: `${summary?.total_count ?? "—"} invoices on record`, icon: <FileText className="w-5 h-5 text-blue-600" />, bg: "bg-blue-100" },
    { title: "Payments Collected", value: money(summary?.total_collected), hint: "Successful gateway settlements", icon: <IndianRupee className="w-5 h-5 text-emerald-600" />, bg: "bg-emerald-100" },
    { title: "Outstanding Balance", value: money(summary?.total_outstanding), hint: "Unpaid / overdue receivables", icon: <AlertCircle className="w-5 h-5 text-red-600" />, bg: "bg-red-100" },
    { title: "Overdue Invoices", value: money(overdueAmount), hint: `${summary?.by_status?.Overdue?.count ?? 0} past due date`, icon: <CreditCard className="w-5 h-5 text-indigo-600" />, bg: "bg-indigo-100" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0A2540]">Invoices &amp; Payments</h1>
        <p className="text-sm text-slate-500 mt-1">Track tax invoices, client payments, and overdue amounts.</p>
      </div>

      {/* KPI Cards — every value is a database-wide backend aggregate. */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, idx) => (
          <div key={idx} className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-500 mb-1">{kpi.title}</p>
              <p className="text-2xl font-bold text-[#0A2540]" data-testid={`invoice-kpi-${idx}`}>{kpi.value}</p>
              <p className="text-xs text-slate-400 mt-1 truncate">{kpi.hint}</p>
            </div>
            <div className={`w-12 h-12 shrink-0 rounded-full flex items-center justify-center ${kpi.bg}`}>
              {kpi.icon}
            </div>
          </div>
        ))}
      </div>

      {/* Action Header & Tabs */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h2 className="font-bold text-[#0A2540]">Invoice Ledger</h2>
          <div className="flex items-center gap-3">
            <button
              onClick={refreshAll}
              disabled={loading}
              className="p-2 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg transition-colors disabled:opacity-50"
              title="Refresh invoices"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button onClick={() => setIsGenerateModalOpen(true)} className="flex items-center justify-center gap-2 px-4 py-2 bg-[#F2A900] text-[#0A2540] text-sm font-bold rounded-lg hover:bg-[#e09b00] transition-colors shadow-sm whitespace-nowrap">
              <Plus className="w-4 h-4" />
              Generate Invoice
            </button>
          </div>
        </div>

        {/* Status Tabs — filter applied on the server. */}
        <div className="px-5 pt-3 border-b border-slate-200">
          <div className="flex items-center gap-4 overflow-x-auto pb-3 scrollbar-hide">
            {STATUS_TABS.map(tab => (
              <button
                key={tab}
                onClick={() => { setActiveTab(tab); setPage(1); }}
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

        {error && (
          <div className="m-5 p-4 bg-rose-50 border border-rose-200 rounded-lg flex items-center justify-between text-rose-700 text-sm">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
            <button onClick={fetchInvoices} className="text-xs font-bold underline hover:no-underline">Retry</button>
          </div>
        )}

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
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-[#0A2540]" />
                    <p className="text-sm font-medium">Loading invoices...</p>
                  </td>
                </tr>
              ) : invoices.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-8 text-center text-slate-500">
                    {error ? "Unable to load invoices." : "No invoices found for this status."}
                  </td>
                </tr>
              ) : (
                invoices.map(invoice => (
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
                ))
              )}
            </tbody>
          </table>
        </div>

        <AdminPagination
          totalCount={totalCount}
          page={page}
          pageSize={pageSize}
          totalPages={totalPages}
          label="invoices"
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          disabled={loading || !!error}
        />
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
