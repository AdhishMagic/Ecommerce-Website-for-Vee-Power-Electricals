import { useState, useEffect } from "react";
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend
} from "recharts";
import { IndianRupee, TrendingDown, TrendingUp, Percent, Clock, AlertCircle, RefreshCw, Landmark } from "lucide-react";
import { financeApi } from "../../api/finance";
import { PayoutSettlement } from "../../types/api";

const STATUS_COLORS: Record<string, string> = {
  "Settled": "bg-emerald-100 text-emerald-700",
  "Processing": "bg-amber-100 text-amber-700",
  "Failed": "bg-red-100 text-red-700",
};

export default function FinanceSummaryPage() {
  const [filterType, setFilterType] = useState<string>("current_month");
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [summaryData, setSummaryData] = useState<any>(null);
  const [payouts, setPayouts] = useState<PayoutSettlement[]>([]);

  const fetchData = async (filter: string) => {
    setLoading(true);
    setError(null);
    try {
      const [sumRes, settlementsRes] = await Promise.all([
        financeApi.getFinanceSummary({ filter_type: filter }),
        financeApi.getSettlements()
      ]);
      setSummaryData(sumRes);
      setPayouts(settlementsRes || []);
    } catch (err: any) {
      console.error("Failed to load finance summary:", err);
      setError(err?.message || "Failed to load financial data from server.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(filterType);
  }, [filterType]);

  const kpis = summaryData?.kpis;
  const plTrendData = summaryData?.monthly_trend || [];

  return (
    <div className="space-y-6">
      {/* Header and Filter Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0A2540]">Finance Summary</h1>
          <p className="text-sm text-slate-500 mt-1">High-level Executive Financial Overview & P&L Analysis.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
            {[
              { id: "today", label: "Today" },
              { id: "current_month", label: "This Month" },
              { id: "previous_month", label: "Last Month" },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setFilterType(tab.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                  filterType === tab.id
                    ? "bg-[#0A2540] text-white shadow-sm"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => fetchData(filterType)}
            className="p-2 border border-slate-200 rounded-lg hover:bg-slate-50 text-slate-600 transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 flex items-center justify-between text-sm">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button 
            onClick={() => fetchData(filterType)}
            className="px-3 py-1 bg-red-600 text-white rounded text-xs font-bold hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      )}

      {/* KPI Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { 
            title: "Total Revenue", 
            value: loading ? "..." : `₹${Number(kpis?.total_paid || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, 
            subtitle: `Invoiced: ₹${Number(kpis?.total_invoiced || 0).toLocaleString("en-IN")}`,
            icon: <TrendingUp className="w-5 h-5 text-emerald-600" />, 
            bg: "bg-emerald-100" 
          },
          { 
            title: "Total Outstanding", 
            value: loading ? "..." : `₹${Number(kpis?.total_outstanding || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, 
            subtitle: `B2B Credit: ₹${Number(kpis?.b2b_outstanding || 0).toLocaleString("en-IN")}`,
            icon: <Clock className="w-5 h-5 text-amber-600" />, 
            bg: "bg-amber-100" 
          },
          { 
            title: "Total Expenses", 
            value: loading ? "..." : `₹${Number(kpis?.total_expenses || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, 
            subtitle: `Settled: ₹${Number(kpis?.paid_expenses || 0).toLocaleString("en-IN")}`,
            icon: <TrendingDown className="w-5 h-5 text-red-600" />, 
            bg: "bg-red-100" 
          },
          { 
            title: "Net Income", 
            value: loading ? "..." : `₹${Number(kpis?.net_profit || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`, 
            subtitle: `Margin: ${kpis?.operating_margin || 0}%`,
            icon: <Percent className="w-5 h-5 text-[#F2A900]" />, 
            bg: "bg-[#F2A900]/20" 
          },
        ].map((kpi, idx) => (
          <div key={idx} className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-500 mb-1">{kpi.title}</p>
              <p className="text-2xl font-bold text-[#0A2540]">{kpi.value}</p>
              <p className="text-xs text-slate-400 mt-1">{kpi.subtitle}</p>
            </div>
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${kpi.bg}`}>
              {kpi.icon}
            </div>
          </div>
        ))}
      </div>

      {/* Main Visuals Grid (Side-by-Side) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Monthly P&L Trend Chart */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-bold text-[#0A2540]">Monthly Revenue & Expense Trend</h2>
            <span className="text-xs text-slate-500 font-medium">Last 6 Months (Authoritative)</span>
          </div>
          <div className="h-72 w-full">
            {plTrendData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-400 text-sm">
                No trend data available for the period.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={plTrendData} margin={{ left: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                  <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} tickFormatter={(val) => `₹${val/1000}k`} />
                  <RechartsTooltip 
                    cursor={{ fill: '#F1F5F9' }}
                    contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    formatter={(value: any) => [`₹${Number(value || 0).toLocaleString("en-IN")}`, '']}
                  />
                  <Legend verticalAlign="top" height={36} />
                  <Bar dataKey="revenue" name="Revenue (Paid)" fill="#0A2540" radius={[4, 4, 0, 0]} barSize={26} />
                  <Bar dataKey="expenses" name="Expenses" fill="#F2A900" radius={[4, 4, 0, 0]} barSize={26} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Right: P&L Breakdown Table */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-5 border-b border-slate-200">
            <h2 className="font-bold text-[#0A2540]">P&L Breakdown</h2>
          </div>
          <div className="flex-1 overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[300px]">
              <thead>
                <tr className="bg-slate-50/80">
                  <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase">Month</th>
                  <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase text-right">Net Margin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {plTrendData.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="px-5 py-6 text-center text-sm text-slate-400">
                      No monthly records found.
                    </td>
                  </tr>
                ) : (
                  plTrendData.map((row: any, i: number) => (
                    <tr key={i} className="hover:bg-slate-50 transition-colors">
                      <td className="px-5 py-3">
                        <p className="text-sm font-bold text-[#0A2540]">{row.month_label || row.month}</p>
                        <p className="text-xs text-slate-500 mt-0.5">
                          Rev: ₹{Number(row.revenue).toLocaleString("en-IN")} | Exp: ₹{Number(row.expenses).toLocaleString("en-IN")}
                        </p>
                      </td>
                      <td className={`px-5 py-3 text-sm font-bold text-right ${row.net >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        ₹{Number(row.net).toLocaleString("en-IN")}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Bottom Section: Payouts & Settlements */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-[#0A2540]">Gateway Payouts & Merchant Settlements</h2>
            <p className="text-sm text-slate-500 mt-1">Authoritative gateway settlement records deposited into merchant account.</p>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
            <Landmark className="w-4 h-4 text-emerald-600" />
            <span>Bank Reconciliation</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-slate-50/80">
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Settlement ID</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Date</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Bank Ref / UTR</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Gross Amount</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Fees & Tax</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Net Payout</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {payouts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-sm text-slate-400">
                    No gateway payout settlements recorded yet.
                  </td>
                </tr>
              ) : (
                payouts.map((payout: any) => (
                  <tr key={payout.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-4 text-sm font-bold text-[#0A2540] font-mono">{payout.settlement_id}</td>
                    <td className="px-5 py-4 text-sm font-medium text-slate-700">{payout.settlement_date}</td>
                    <td className="px-5 py-4 text-sm text-slate-600 font-mono">{payout.utr || payout.bank_reference || '—'}</td>
                    <td className="px-5 py-4 text-sm text-slate-600 text-right">₹{Number(payout.gross_amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                    <td className="px-5 py-4 text-sm text-red-500 text-right">-₹{Number(payout.gateway_fee || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                    <td className="px-5 py-4 text-sm font-bold text-emerald-600 text-right">₹{Number(payout.net_amount || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</td>
                    <td className="px-5 py-4 text-center">
                      <span className={`inline-flex px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider ${STATUS_COLORS[payout.status] || "bg-slate-100 text-slate-700"}`}>
                        {payout.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
