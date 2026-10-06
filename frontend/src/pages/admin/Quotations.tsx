import { useState, useEffect, useCallback } from "react";
import { FileText, Clock, CheckCircle2, IndianRupee, Plus, Download, Edit, ArrowRightCircle, Send, XCircle, RefreshCw, AlertCircle } from "lucide-react";
import QuotationModal, { Quotation } from "../../components/admin/QuotationModal";
import QuotationPrintModal from "../../components/admin/QuotationPrintModal";
import { financeApi, QuotationsSummary } from "../../api/finance";
import AdminPagination from "../../components/common/AdminPagination";

const STATUS_COLORS: Record<string, string> = {
  "Draft": "bg-slate-100 text-slate-700",
  "Sent": "bg-blue-100 text-blue-700",
  "Approved": "bg-emerald-100 text-emerald-700",
  "Rejected": "bg-red-100 text-red-700",
  "Converted": "bg-purple-100 text-purple-700",
};

const money = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "—";
  const num = Number(value);
  return Number.isFinite(num) ? `₹${num.toLocaleString("en-IN")}` : "—";
};

export default function QuotationsPage() {
  const [quotes, setQuotes] = useState<(Quotation & { rawId?: number | string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("All");

  // Server-side pagination state driven by the backend envelope.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Database-wide aggregates for the KPI cards.
  const [summary, setSummary] = useState<QuotationsSummary | null>(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingQuote, setEditingQuote] = useState<(Quotation & { rawId?: number | string }) | null>(null);
  const [printingQuote, setPrintingQuote] = useState<Quotation | null>(null);

  const fetchSummary = useCallback(async () => {
    try {
      setSummary(await financeApi.getQuotationsSummary());
    } catch (err) {
      console.error("Failed to load quotation summary:", err);
      setSummary(null);
    }
  }, []);

  const fetchQuotations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await financeApi.getQuotationsPaginated({
        page,
        page_size: pageSize,
        status: statusFilter === "All" ? undefined : statusFilter,
      });
      const data = res.results || [];
      const mapped = (data || []).map((q: any) => ({
        id: q.quotation_number || `QT-${q.id}`,
        rawId: q.id,
        client: q.client_name || `Client #${q.client}`,
        clientId: q.client,
        date: q.quotation_date || '',
        expiry: q.expiry_date || '',
        value: Number(q.total_value || 0),
        status: (q.status === 'APPROVED' ? 'Approved' : q.status === 'REJECTED' ? 'Rejected' : q.status === 'CONVERTED' ? 'Converted' : q.status === 'SENT' ? 'Sent' : 'Draft') as any,
        notes: q.notes || '',
        items: (q.items || []).map((it: any) => ({
          id: String(it.id),
          product: it.product_name || it.item_name || 'Item',
          quantity: it.quantity,
          price: Number(it.unit_price || 0),
        })),
      }));
      setQuotes(mapped);
      setTotalCount(typeof res.count === "number" ? res.count : mapped.length);
      setTotalPages(res.total_pages || Math.ceil((res.count || 1) / pageSize) || 1);
    } catch (err: any) {
      console.error("Failed to load quotations:", err);
      setError(err?.message || "Failed to load quotations from API.");
      setQuotes([]);
      setTotalCount(0);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, statusFilter]);

  useEffect(() => {
    fetchQuotations();
  }, [fetchQuotations]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const refreshAll = async () => {
    await Promise.all([fetchQuotations(), fetchSummary()]);
  };

  const handleCreateNew = () => {
    setEditingQuote(null);
    setIsModalOpen(true);
  };

  const handleEditQuotation = (quote: Quotation & { rawId?: number | string }) => {
    setEditingQuote(quote);
    setIsModalOpen(true);
  };

  const handleDownloadPDF = (quote: Quotation) => {
    setPrintingQuote(quote);
  };

  const handleUpdateStatus = async (quote: Quotation & { rawId?: number | string }, newStatus: string) => {
    try {
      const targetId = quote.rawId || quote.id;
      await financeApi.updateQuotationStatus(String(targetId), newStatus);
      await refreshAll();
    } catch (err: any) {
      console.error(`Failed to update quotation to ${newStatus}:`, err);
      alert(err?.message || `Failed to update quotation status to ${newStatus}.`);
    }
  };

  const handleConvertToInvoice = async (quote: Quotation & { rawId?: number | string }) => {
    if (window.confirm(`Convert Quotation ${quote.id} to an Invoice?`)) {
      try {
        const targetId = quote.rawId || quote.id;
        await financeApi.convertQuotationToInvoice(String(targetId));
        alert(`Success! Invoice generated for ${quote.client}. You can view it in the Invoices panel.`);
        await refreshAll();
      } catch (err: any) {
        console.error("Failed to convert quotation to invoice:", err);
        alert(err?.message || "Failed to convert quotation to invoice.");
      }
    }
  };

  const handleModalSubmit = async (data: Partial<Quotation>) => {
    try {
      if (editingQuote && editingQuote.rawId) {
        await financeApi.updateQuotation(editingQuote.rawId, {
          notes: data.notes,
          expiry_date: data.expiry,
        });
      } else {
        await financeApi.createQuotation({
          client: (data as any).clientId || data.client,
          expiry_date: data.expiry,
          notes: data.notes,
          items: (data.items || []).map(i => ({
            item_name: i.product,
            quantity: i.quantity,
            unit_price: i.price,
          })),
        });
      }
      setIsModalOpen(false);
      await refreshAll();
    } catch (err: any) {
      console.error("Failed to save quotation:", err);
      alert(err?.message || "Failed to save quotation.");
    }
  };

  const convertedCount = summary ? (summary.converted_count || 0) + (summary.approved_count || 0) : null;

  const kpis = [
    { title: "Total Quotes Issued", value: summary ? summary.total_count.toLocaleString("en-IN") : "—", icon: <FileText className="w-5 h-5 text-blue-600" />, bg: "bg-blue-100" },
    { title: "Pending Approval", value: summary ? summary.pending_count.toLocaleString("en-IN") : "—", icon: <Clock className="w-5 h-5 text-amber-600" />, bg: "bg-amber-100" },
    { title: "Converted to Orders", value: convertedCount === null ? "—" : convertedCount.toLocaleString("en-IN"), icon: <CheckCircle2 className="w-5 h-5 text-emerald-600" />, bg: "bg-emerald-100" },
    { title: "Total Quoted Value", value: money(summary?.total_value), icon: <IndianRupee className="w-5 h-5 text-[#0A2540]" />, bg: "bg-[#0A2540]/10" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0A2540]">Quotations</h1>
        <p className="text-sm text-slate-500 mt-1">Manage B2B quotations and price estimations.</p>
      </div>

      {/* KPI Cards — authoritative database-wide aggregates. */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, idx) => (
          <div key={idx} className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-500 mb-1">{kpi.title}</p>
              <p className="text-2xl font-bold text-[#0A2540]" data-testid={`quotation-kpi-${idx}`}>{kpi.value}</p>
            </div>
            <div className={`w-12 h-12 shrink-0 rounded-full flex items-center justify-center ${kpi.bg}`}>
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
              onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              className="border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 text-sm text-[#0A2540] font-medium outline-none focus:border-[#0A2540] flex-1 sm:flex-none"
            >
              <option value="All">All Statuses</option>
              <option value="Draft">Draft</option>
              <option value="Sent">Sent</option>
              <option value="Approved">Approved</option>
              <option value="Rejected">Rejected</option>
              <option value="Converted">Converted</option>
            </select>
            <button
              onClick={refreshAll}
              disabled={loading}
              className="p-2 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg transition-colors disabled:opacity-50"
              title="Refresh quotations"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={handleCreateNew}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-[#F2A900] text-[#0A2540] text-sm font-bold rounded-lg hover:bg-[#e09b00] transition-colors shadow-sm whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              Create Quotation
            </button>
          </div>
        </div>

        {error && (
          <div className="m-5 p-4 bg-rose-50 border border-rose-200 rounded-lg flex items-center justify-between text-rose-700 text-sm">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
            <button onClick={fetchQuotations} className="text-xs font-bold underline hover:no-underline">Retry</button>
          </div>
        )}

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
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-[#0A2540]" />
                    <p className="text-sm font-medium">Loading quotations...</p>
                  </td>
                </tr>
              ) : quotes.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-slate-500">
                    {error ? "Unable to load quotations." : "No quotations found."}
                  </td>
                </tr>
              ) : (
                quotes.map(quote => (
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
                        {(quote.status === "Draft" || quote.status === "Sent") && (
                          <button onClick={() => handleEditQuotation(quote)} className="p-1.5 text-slate-400 hover:text-[#0A2540] hover:bg-slate-100 rounded transition-colors" title="Edit">
                            <Edit className="w-4 h-4" />
                          </button>
                        )}
                        {quote.status === "Draft" && (
                          <button onClick={() => handleUpdateStatus(quote, "SENT")} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="Send Quotation">
                            <Send className="w-4 h-4" />
                          </button>
                        )}
                        {quote.status === "Sent" && (
                          <>
                            <button onClick={() => handleUpdateStatus(quote, "APPROVED")} className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors" title="Approve Quotation">
                              <CheckCircle2 className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleUpdateStatus(quote, "REJECTED")} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="Reject Quotation">
                              <XCircle className="w-4 h-4" />
                            </button>
                          </>
                        )}
                        {quote.status === "Approved" && (
                          <button onClick={() => handleConvertToInvoice(quote)} className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors" title="Convert to Invoice">
                            <ArrowRightCircle className="w-4 h-4" />
                          </button>
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
          label="quotations"
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          disabled={loading || !!error}
        />
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
