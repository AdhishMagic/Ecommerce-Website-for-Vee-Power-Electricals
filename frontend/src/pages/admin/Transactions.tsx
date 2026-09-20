import { 
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer, Legend
} from "recharts";
import { CreditCard, Truck, Receipt, TrendingUp } from "lucide-react";

// Mock Data
const revenueTrend = [
  { name: 'Mon', revenue: 40000 },
  { name: 'Tue', revenue: 30000 },
  { name: 'Wed', revenue: 20000 },
  { name: 'Thu', revenue: 27800 },
  { name: 'Fri', revenue: 18900 },
  { name: 'Sat', revenue: 23900 },
  { name: 'Sun', revenue: 34900 },
];

const statusBreakdown = [
  { name: 'Paid', count: 120 },
  { name: 'Unpaid', count: 15 },
  { name: 'Delivered', count: 95 },
];

const transactions = [
  { id: "ORD-9381-IN", date: "Sep 18, 2026", time: "10:45 AM", method: "Razorpay (UPI)", paid: "Paid", delivered: "Pending", items: 3, tax: 1800, shipping: 0, total: 12500 },
  { id: "ORD-9380-IN", date: "Sep 17, 2026", time: "02:20 PM", method: "Credit Card", paid: "Paid", delivered: "Delivered", items: 1, tax: 800, shipping: 150, total: 8900 },
  { id: "ORD-9379-IN", date: "Sep 16, 2026", time: "09:15 AM", method: "Razorpay (NetBanking)", paid: "Paid", delivered: "Shipped", items: 5, tax: 4500, shipping: 0, total: 45000 },
  { id: "ORD-9378-IN", date: "Sep 15, 2026", time: "04:30 PM", method: "Cash on Delivery", paid: "Unpaid", delivered: "Pending", items: 2, tax: 350, shipping: 50, total: 3400 },
];

const STATUS_COLORS: Record<string, string> = {
  "Paid": "bg-emerald-100 text-emerald-700",
  "Unpaid": "bg-amber-100 text-amber-700",
  "Delivered": "bg-emerald-100 text-emerald-700",
  "Shipped": "bg-indigo-100 text-indigo-700",
  "Pending": "bg-slate-100 text-slate-700",
};

export default function Transactions() {
  const kpis = [
    { title: "Total Revenue", value: "₹1,24,500", icon: <TrendingUp className="w-5 h-5 text-[#0B3A63]" />, bg: "bg-[#0B3A63]/10" },
    { title: "Tax Collected", value: "₹14,500", icon: <Receipt className="w-5 h-5 text-amber-600" />, bg: "bg-amber-100" },
    { title: "Shipping Collected", value: "₹2,450", icon: <Truck className="w-5 h-5 text-indigo-600" />, bg: "bg-indigo-100" },
    { title: "Avg Order Value", value: "₹4,250", icon: <CreditCard className="w-5 h-5 text-emerald-600" />, bg: "bg-emerald-100" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0B3A63]">Transactions & Finance</h1>
        <p className="text-sm text-slate-500 mt-1">Monitor revenue, taxes, and shipping fees.</p>
      </div>

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
          <h2 className="text-lg font-bold text-[#0B3A63] mb-6">Revenue Trend</h2>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={revenueTrend}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} tickFormatter={(val) => `₹${val/1000}k`} />
                <RechartsTooltip 
                  contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  formatter={(value: number) => [`₹${value.toLocaleString()}`, 'Revenue']}
                />
                <Line type="monotone" dataKey="revenue" stroke="#F2A900" strokeWidth={3} dot={{ r: 4, fill: '#F2A900', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Order Status Bar Chart */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
          <h2 className="text-lg font-bold text-[#0B3A63] mb-6">Order Status Breakdown</h2>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusBreakdown} barSize={40}>
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

      {/* Transactions Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        <div className="p-5 border-b border-slate-200">
          <h2 className="font-bold text-[#0B3A63]">Recent Transactions</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[800px]">
            <thead>
              <tr className="bg-slate-50/80">
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Order ID</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Date & Time</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Method</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Paid</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Delivery</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Tax</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Shipping</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {transactions.map(txn => (
                <tr key={txn.id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-5 py-4 text-sm font-bold text-[#0B3A63]">{txn.id}</td>
                  <td className="px-5 py-4">
                    <p className="text-sm font-medium text-slate-700">{txn.date}</p>
                    <p className="text-xs text-slate-500">{txn.time}</p>
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-600">{txn.method}</td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex px-2 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider ${STATUS_COLORS[txn.paid]}`}>
                      {txn.paid}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex px-2 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider ${STATUS_COLORS[txn.delivered]}`}>
                      {txn.delivered}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-500 text-right">₹{txn.tax.toLocaleString("en-IN")}</td>
                  <td className="px-5 py-4 text-sm text-slate-500 text-right">₹{txn.shipping.toLocaleString("en-IN")}</td>
                  <td className="px-5 py-4 text-sm font-bold text-[#0B3A63] text-right">₹{txn.total.toLocaleString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
