import { useState, useEffect, useCallback, useMemo } from "react";
import { 
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer
} from "recharts";
import { CreditCard, TrendingUp, AlertCircle, RefreshCw, CheckCircle2, XCircle } from "lucide-react";
import { financeApi, PaymentsSummary } from "../../api/finance";
import { PaymentTransaction } from "../../types/api";
import AdminPagination from "../../components/common/AdminPagination";

const STATUS_COLORS: Record<string, string> = {
  "SUCCESS": "bg-emerald-100 text-emerald-700",
  "FAILED": "bg-red-100 text-red-700",
  "INITIATED": "bg-amber-100 text-amber-700",
  "REFUNDED": "bg-indigo-100 text-indigo-700",
};

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [summaryData, setSummaryData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("All");

  // Server-side pagination state driven by the backend envelope.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Database-wide payment aggregates for the KPI cards and status chart.
  const [paymentSummary, setPaymentSummary] = useState<PaymentsSummary | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [txns, finSummary, paySummary] = await Promise.all([
        financeApi.getPaymentsPaginated({
          page,
          page_size: pageSize,
          status: statusFilter === "All" ? undefined : statusFilter,
        }),
        financeApi.getFinanceSummary({ filter_type: 'current_month' }),
        financeApi.getPaymentsSummary(),
      ]);
      const results = txns.results || [];
      setTransactions(results);
      setTotalCount(typeof txns.count === "number" ? txns.count : results.length);
      setTotalPages(txns.total_pages || Math.ceil((txns.count || 1) / pageSize) || 1);
      setSummaryData(finSummary);
      setPaymentSummary(paySummary);
    } catch (err: any) {
      console.error("Failed to load transactions:", err);
      setError(err?.message || "Failed to load transactions.");
      setTransactions([]);
      setTotalCount(0);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, statusFilter]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const totalCollected = paymentSummary ? Number(paymentSummary.total_collected) : null;
  const successCount = paymentSummary?.success_count ?? null;
  const avgValue = totalCollected !== null && successCount
    ? totalCollected / successCount
    : null;

  const kpis = [
    { title: "Total Collected", value: totalCollected === null ? "—" : `₹${totalCollected.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, icon: <TrendingUp className="w-5 h-5 text-[#0B3A63]" />, bg: "bg-[#0B3A63]/10" },
    { title: "Avg Transaction Value", value: avgValue === null ? "—" : `₹${avgValue.toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, icon: <CreditCard className="w-5 h-5 text-emerald-600" />, bg: "bg-emerald-100" },
    { title: "Successful Payments", value: successCount === null ? "—" : `${successCount}`, icon: <CheckCircle2 className="w-5 h-5 text-emerald-600" />, bg: "bg-emerald-100" },
    { title: "Failed Attempts", value: paymentSummary ? `${paymentSummary.failed_count}` : "—", icon: <XCircle className="w-5 h-5 text-red-600" />, bg: "bg-red-100" },
  ];

  // Authoritative status breakdown across the complete payments table, never the page.
  const statusBreakdownData = useMemo(() => {
    const byStatus = paymentSummary?.by_status || {};
    return [
      { name: 'Success', count: byStatus.SUCCESS?.count || 0 },
      { name: 'Failed', count: byStatus.FAILED?.count || 0 },
      { name: 'Initiated', count: byStatus.INITIATED?.count || 0 },
    ];
  }, [paymentSummary]);

  const trendData = summaryData?.monthly_trend || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0B3A63]">Transactions & Inbound Payments</h1>
          <p className="text-sm text-slate-500 mt-1">Audit customer payments across orders and tax invoices.</p>
        </div>
        <button
          onClick={fetchData}
          className="inline-flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-700 text-sm font-semibold transition-colors"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={fetchData} className="px-3 py-1 bg-red-600 text-white rounded text-xs font-bold hover:bg-red-700">
            Retry
          </button>
        </div>
      )}

      {/* KPI Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, idx) => (
          <div key={idx} className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-500 mb-1">{kpi.title}</p>
              <p className="text-2xl font-bold text-[#0B3A63]">{kpi.value}</p>
            </div>
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${kpi.bg}`}>
              {kpi.icon}
            </div>
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Revenue Line Chart */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-lg font-bold text-[#0B3A63] mb-6">Revenue Trend (Monthly)</h2>
          <div className="h-72 w-full">
            {trendData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                No trend data available.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} tickFormatter={(val) => `₹${val/1000}k`} />
                  <RechartsTooltip 
                    contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    formatter={(value: any) => [`₹${Number(value || 0).toLocaleString("en-IN")}`, 'Revenue']}
                  />
                  <Line type="monotone" dataKey="revenue" stroke="#F2A900" strokeWidth={3} dot={{ r: 4, fill: '#F2A900', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Order Status Bar Chart */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-lg font-bold text-[#0B3A63] mb-6">Payment Status Breakdown</h2>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusBreakdownData} barSize={40}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} />
                <RechartsTooltip 
                  cursor={{ fill: '#F1F5F9' }}
                  contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                />
                <Bar dataKey="count" fill="#0B3A63" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Transactions Table with Filter */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="font-bold text-[#0B3A63]">Recent Payment Transactions</h2>
            <p className="text-xs text-slate-500 mt-0.5">Authoritative transaction records from Razorpay and bank entries.</p>
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {["All", "SUCCESS", "FAILED", "INITIATED"].map((st) => (
              <button
                key={st}
                onClick={() => { setStatusFilter(st); setPage(1); }}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                  statusFilter === st
                    ? "bg-[#0B3A63] text-white"
                    : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-slate-50/80">
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Transaction ID</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Order / Invoice</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Method</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Gateway</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Amount</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-5 py-8 text-center text-sm text-slate-400">
                    {loading ? "Loading transactions..." : (error ? "Unable to load transactions." : "No payment transactions found.")}
                  </td>
                </tr>
              ) : (
                transactions.map(txn => (
                  <tr key={txn.id} className="hover:bg-slate-50/50 transition-colors">
                    <td className="px-5 py-4 text-sm font-bold text-[#0B3A63] font-mono">
                      {txn.gateway_transaction_id || `TXN-${txn.id}`}
                      <p className="text-xs text-slate-400 font-sans font-normal mt-0.5">
                        {txn.created_at ? new Date(txn.created_at).toLocaleString("en-IN") : ''}
                      </p>
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-700">
                      {txn.order_number ? (
                        <span className="font-semibold text-blue-700">Order #{txn.order_number}</span>
                      ) : txn.invoice_number ? (
                        <span className="font-semibold text-purple-700">Invoice #{txn.invoice_number}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-sm text-slate-600">{txn.payment_method || 'UPI'}</td>
                    <td className="px-5 py-4 text-sm text-slate-600 font-mono text-xs">{txn.gateway}</td>
                    <td className="px-5 py-4 text-sm font-bold text-[#0B3A63] text-right">
                      ₹{Number(txn.amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-5 py-4 text-center">
                      <span className={`inline-flex px-2 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider ${STATUS_COLORS[txn.status] || "bg-slate-100 text-slate-700"}`}>
                        {txn.status}
                      </span>
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
          label="payment transactions"
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          disabled={loading || !!error}
        />
      </div>
    </div>
  );
}
