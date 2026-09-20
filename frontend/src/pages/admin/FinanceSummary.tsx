import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend
} from "recharts";
import { IndianRupee, TrendingDown, TrendingUp, Percent } from "lucide-react";

// --- Mock Data ---
const plTrendData = [
  { month: "Apr", revenue: 450000, expenses: 320000 },
  { month: "May", revenue: 520000, expenses: 350000 },
  { month: "Jun", revenue: 480000, expenses: 340000 },
  { month: "Jul", revenue: 610000, expenses: 390000 },
  { month: "Aug", revenue: 590000, expenses: 380000 },
  { month: "Sep", revenue: 750000, expenses: 420000 },
];

const plTableData = [
  { month: "Sep 2026", revenue: 750000, cogs: 300000, net: 330000 },
  { month: "Aug 2026", revenue: 590000, cogs: 240000, net: 210000 },
  { month: "Jul 2026", revenue: 610000, cogs: 250000, net: 220000 },
  { month: "Jun 2026", revenue: 480000, cogs: 200000, net: 140000 },
];

const initialPayouts = [
  { id: "setl_94829", date: "2026-09-18", gross: 125000, fee: 2500, net: 122500, status: "Settled" },
  { id: "setl_94830", date: "2026-09-17", gross: 85000, fee: 1700, net: 83300, status: "Settled" },
  { id: "setl_94831", date: "2026-09-16", gross: 210000, fee: 4200, net: 205800, status: "Processing" },
  { id: "setl_94832", date: "2026-09-15", gross: 45000, fee: 900, net: 44100, status: "Failed" },
];

const STATUS_COLORS: Record<string, string> = {
  "Settled": "bg-emerald-100 text-emerald-700",
  "Processing": "bg-amber-100 text-amber-700",
  "Failed": "bg-red-100 text-red-700",
};

export default function FinanceSummaryPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0A2540]">Finance Summary</h1>
        <p className="text-sm text-slate-500 mt-1">High-level Executive Financial Overview & P&L Analysis.</p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { title: "Total Revenue", value: "₹34,00,000", icon: <TrendingUp className="w-5 h-5 text-emerald-600" />, bg: "bg-emerald-100" },
          { title: "Total Expenses", value: "₹22,00,000", icon: <TrendingDown className="w-5 h-5 text-red-600" />, bg: "bg-red-100" },
          { title: "Net Profit", value: "₹12,00,000", icon: <IndianRupee className="w-5 h-5 text-[#0A2540]" />, bg: "bg-[#0A2540]/10" },
          { title: "Operating Margin", value: "35.2%", icon: <Percent className="w-5 h-5 text-[#F2A900]" />, bg: "bg-[#F2A900]/20" },
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

      {/* Main Visuals Grid (Side-by-Side) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Monthly P&L Trend Chart */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-lg font-bold text-[#0A2540] mb-6">Monthly P&L Trend</h2>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={plTrendData} margin={{ left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} tickFormatter={(val) => `₹${val/1000}k`} />
                <RechartsTooltip 
                  cursor={{ fill: '#F1F5F9' }}
                  contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: number) => [`₹${value.toLocaleString()}`, '']}
                />
                <Legend verticalAlign="top" height={36} />
                <Bar dataKey="revenue" name="Revenue" fill="#0A2540" radius={[4, 4, 0, 0]} barSize={30} />
                <Bar dataKey="expenses" name="Expenses" fill="#F2A900" radius={[4, 4, 0, 0]} barSize={30} />
              </BarChart>
            </ResponsiveContainer>
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
                  <th className="px-5 py-3 text-xs font-semibold text-slate-500 uppercase text-right">Net Income</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {plTableData.map((row, i) => (
                  <tr key={i} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3">
                      <p className="text-sm font-bold text-[#0A2540]">{row.month}</p>
                      <p className="text-xs text-slate-500 mt-1">Rev: ₹{row.revenue/1000}k | COGS: ₹{row.cogs/1000}k</p>
                    </td>
                    <td className="px-5 py-3 text-sm font-bold text-emerald-600 text-right">
                      ₹{row.net.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Bottom Section: Payouts & Settlements */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-200">
          <h2 className="text-lg font-bold text-[#0A2540]">Gateway Payouts & Cash Flow Summary</h2>
          <p className="text-sm text-slate-500 mt-1">Track payment gateway settlements and bank deposits.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-slate-50/80">
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Payout ID</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Settlement Date</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Gross Amount</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Gateway Fees</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Net Payout</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {initialPayouts.map(payout => (
                <tr key={payout.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-4 text-sm font-bold text-[#0A2540] font-mono">{payout.id}</td>
                  <td className="px-5 py-4 text-sm font-medium text-slate-700">{payout.date}</td>
                  <td className="px-5 py-4 text-sm text-slate-600 text-right">₹{payout.gross.toLocaleString("en-IN")}</td>
                  <td className="px-5 py-4 text-sm text-red-500 text-right">-₹{payout.fee.toLocaleString("en-IN")}</td>
                  <td className="px-5 py-4 text-sm font-bold text-emerald-600 text-right">₹{payout.net.toLocaleString("en-IN")}</td>
                  <td className="px-5 py-4 text-center">
                    <span className={`inline-flex px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider ${STATUS_COLORS[payout.status]}`}>
                      {payout.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
