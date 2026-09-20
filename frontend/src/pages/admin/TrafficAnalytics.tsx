import { 
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, 
  Tooltip as RechartsTooltip, ResponsiveContainer, Legend, ComposedChart, Line
} from "recharts";
import { Users, UserPlus, Eye, Package, IndianRupee, Percent, ExternalLink, AlertTriangle, ShoppingCart } from "lucide-react";

// --- Mock Data ---
const trafficTrend = [
  { name: '01 Sep', sessions: 1200, views: 3400, orders: 45 },
  { name: '04 Sep', sessions: 1400, views: 4200, orders: 55 },
  { name: '07 Sep', sessions: 1100, views: 2900, orders: 30 },
  { name: '10 Sep', sessions: 1800, views: 5500, orders: 85 },
  { name: '13 Sep', sessions: 1500, views: 4800, orders: 60 },
  { name: '16 Sep', sessions: 2100, views: 6100, orders: 110 },
  { name: '18 Sep', sessions: 1900, views: 5800, orders: 90 },
];

const sessionsByChannel = [
  { name: 'Organic Search', sessions: 4500 },
  { name: 'Direct', sessions: 3200 },
  { name: 'Social', sessions: 2100 },
  { name: 'Referral', sessions: 1200 },
];

const sessionsBySource = [
  { name: 'Google', sessions: 4100 },
  { name: 'Direct', sessions: 3200 },
  { name: 'Instagram', sessions: 1500 },
  { name: 'veepower.in', sessions: 800 },
];

const visitorType = [
  { name: 'New Visitors', value: 65 },
  { name: 'Returning Visitors', value: 35 },
];

const funnelData = [
  { step: 'Cart Viewed', users: 5000 },
  { step: 'Checkout Started', users: 3200 },
  { step: 'Payment Initiated', users: 2100 },
  { step: 'Payment Failed', users: 400 },
  { step: 'Order Placed', users: 1700 },
];

const mostViewedProducts = [
  { id: 1, name: "Havells Ambrose Ceiling Fan 1200mm", sku: "HVC-1200-AMB", price: 2500, views: 12500 },
  { id: 2, name: "Polycab 1.5 sq mm Wire", sku: "PLY-1.5-WIR", price: 1200, views: 8900 },
  { id: 3, name: "Philips 9W LED Bulb", sku: "PHL-9W-LED", price: 100, views: 6700 },
  { id: 4, name: "Legrand Mylinc Switch 10A", sku: "LEG-10A-SW", price: 90, views: 5400 },
];

const CUSTOMER_COLORS = ['#0A2540', '#F2A900'];

export default function TrafficAnalytics() {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
        <div>
          <h1 className="text-2xl font-bold text-[#0A2540]">Traffic Analytics</h1>
          <p className="text-sm text-slate-500 mt-1">Understand your store visitors, acquisition channels, and conversion funnels.</p>
        </div>
      </div>

      {/* 1. KPI Summary Row */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        {[
          { title: "Sessions", value: "11,000", icon: <Users className="w-5 h-5 text-blue-600" />, bg: "bg-blue-100" },
          { title: "New Visitors", value: "6,500", icon: <UserPlus className="w-5 h-5 text-indigo-600" />, bg: "bg-indigo-100" },
          { title: "Product Views", value: "32,700", icon: <Eye className="w-5 h-5 text-purple-600" />, bg: "bg-purple-100" },
          { title: "Orders", value: "475", icon: <Package className="w-5 h-5 text-[#0A2540]" />, bg: "bg-[#0A2540]/10" },
          { title: "Revenue", value: "₹4,25,000", icon: <IndianRupee className="w-5 h-5 text-[#F2A900]" />, bg: "bg-[#F2A900]/20" },
          { title: "Conversion Rate", value: "4.3%", icon: <Percent className="w-5 h-5 text-emerald-600" />, bg: "bg-emerald-100" },
        ].map((kpi, idx) => (
          <div key={idx} className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm flex flex-col justify-between">
            <div className="flex justify-between items-start mb-2">
              <p className="text-xs font-semibold text-slate-500">{kpi.title}</p>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${kpi.bg}`}>
                {kpi.icon}
              </div>
            </div>
            <p className="text-xl font-bold text-[#0A2540]">{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* 2. Main Traffic Chart */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
        <h2 className="text-lg font-bold text-[#0A2540] mb-6">Sessions, Views & Orders Over Time</h2>
        <div className="h-80 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={trafficTrend}>
              <defs>
                <linearGradient id="colorViews" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0A2540" stopOpacity={0.1}/>
                  <stop offset="95%" stopColor="#0A2540" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} dy={10} />
              <YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} />
              <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#64748B' }} />
              <RechartsTooltip 
                contentStyle={{ borderRadius: '8px', border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
              />
              <Legend verticalAlign="top" height={36} />
              <Area yAxisId="left" type="monotone" name="Page Views" dataKey="views" stroke="#0A2540" fill="url(#colorViews)" strokeWidth={2} />
              <Line yAxisId="left" type="monotone" name="Sessions" dataKey="sessions" stroke="#1E4B7A" strokeWidth={2} dot={false} />
              <Line yAxisId="right" type="monotone" name="Orders" dataKey="orders" stroke="#F2A900" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 3. Acquisition Channel Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="text-base font-bold text-[#0A2540] mb-4">Sessions by Channel</h2>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sessionsByChannel} layout="vertical" margin={{ left: 40 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                <RechartsTooltip cursor={{ fill: '#F1F5F9' }} />
                <Bar dataKey="sessions" fill="#0A2540" radius={[0, 4, 4, 0]} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="text-base font-bold text-[#0A2540] mb-4">Sessions by Source</h2>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={sessionsBySource} layout="vertical" margin={{ left: 20 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                <RechartsTooltip cursor={{ fill: '#F1F5F9' }} />
                <Bar dataKey="sessions" fill="#F2A900" radius={[0, 4, 4, 0]} barSize={24} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 4. Social & Visitor Composition Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col">
          <h2 className="text-base font-bold text-[#0A2540] mb-4">Social Apps</h2>
          <p className="text-sm text-slate-500 mb-4">In-app browser sessions</p>
          <div className="flex-1 space-y-3">
            {[
              { name: "Instagram", value: 1200, color: "text-pink-600" },
              { name: "Twitter/X", value: 450, color: "text-slate-800" },
              { name: "LinkedIn", value: 300, color: "text-blue-600" },
            ].map(app => (
              <div key={app.name} className="flex justify-between items-center p-3 border border-slate-100 rounded-lg bg-slate-50">
                <span className={`text-sm font-semibold ${app.color}`}>{app.name}</span>
                <span className="text-sm font-bold text-[#0A2540]">{app.value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col justify-center items-center text-center">
          <div className="w-16 h-16 bg-[#F2A900]/20 rounded-full flex items-center justify-center mb-4">
            <ExternalLink className="w-8 h-8 text-[#F2A900]" />
          </div>
          <h2 className="text-base font-bold text-[#0A2540] mb-2">Social Revenue</h2>
          <p className="text-3xl font-bold text-[#0A2540] mb-2">₹1,24,000</p>
          <p className="text-sm text-slate-500 font-medium">From 145 orders</p>
          <span className="mt-3 inline-flex bg-emerald-100 text-emerald-700 text-xs font-bold px-2.5 py-1 rounded-full">
            +12% vs last period
          </span>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="text-base font-bold text-[#0A2540] mb-4">New vs Returning</h2>
          <div className="h-48 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={visitorType} innerRadius={50} outerRadius={70} paddingAngle={5} dataKey="value">
                  {visitorType.map((entry, index) => <Cell key={`cell-${index}`} fill={CUSTOMER_COLORS[index % CUSTOMER_COLORS.length]} />)}
                </Pie>
                <RechartsTooltip formatter={(value: number) => `${value}%`} />
                <Legend layout="vertical" verticalAlign="middle" align="right" />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* 5. Conversion & Checkout Performance Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5">
          <h2 className="text-base font-bold text-[#0A2540] mb-4">Checkout Conversion Funnel</h2>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={funnelData} layout="vertical" margin={{ left: 40 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#E2E8F0" />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                <YAxis dataKey="step" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 12 }} />
                <RechartsTooltip cursor={{ fill: '#F1F5F9' }} />
                <Bar dataKey="users" fill="#0A2540" radius={[0, 4, 4, 0]}>
                  {
                    funnelData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={index === funnelData.length - 1 ? '#F2A900' : index === funnelData.length - 2 ? '#ef4444' : '#0A2540'} />
                    ))
                  }
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 flex flex-col justify-center gap-6">
          <div className="flex items-start gap-4 p-5 rounded-xl border border-amber-200 bg-amber-50">
            <div className="w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
              <ShoppingCart className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-600 mb-1">Abandoned Carts</p>
              <p className="text-3xl font-bold text-[#0A2540]">1,500</p>
            </div>
          </div>
          
          <div className="flex items-start gap-4 p-5 rounded-xl border border-red-200 bg-red-50">
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-600 mb-1">Value At Risk</p>
              <p className="text-3xl font-bold text-red-600">₹8,45,000</p>
              <p className="text-xs text-slate-500 mt-1">Potential revenue lost to abandonment</p>
            </div>
          </div>
        </div>
      </div>

      {/* 6. "Most Viewed Products" Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="p-5 border-b border-slate-200">
          <h2 className="font-bold text-[#0A2540]">Most Viewed Products</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-50/80">
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Product Name</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">SKU</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Price (₹)</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Total Page Views</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {mostViewedProducts.map(product => (
                <tr key={product.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-4 text-sm font-bold text-[#0A2540]">{product.name}</td>
                  <td className="px-5 py-4 text-sm text-slate-500">{product.sku}</td>
                  <td className="px-5 py-4 text-sm font-bold text-slate-700 text-right">₹{product.price.toLocaleString("en-IN")}</td>
                  <td className="px-5 py-4 text-sm font-bold text-[#0A2540] text-right">{product.views.toLocaleString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
