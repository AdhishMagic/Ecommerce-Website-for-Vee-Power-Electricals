import { useState } from "react";
import { Search, Calendar, FileText, Truck, Package, CheckCircle2 } from "lucide-react";
import InvoiceModal from "../../components/admin/InvoiceModal";

// Mock Data
const MOCK_ORDERS = [
  {
    id: "ORD-9381-IN",
    invoiceId: "INV-2026-891",
    customer: "Rajesh Kumar",
    date: "2026-09-18T10:42:00",
    total: 12500,
    status: "Confirmed",
    thumbnail: "https://via.placeholder.com/60?text=Product",
    trackingNo: "",
  },
  {
    id: "ORD-9380-IN",
    invoiceId: "INV-2026-890",
    customer: "Priya Sharma",
    date: "2026-09-17T14:20:00",
    total: 8900,
    status: "Packed",
    thumbnail: "https://via.placeholder.com/60?text=Product",
    trackingNo: "",
  },
  {
    id: "ORD-9379-IN",
    invoiceId: "INV-2026-889",
    customer: "Amit Patel",
    date: "2026-09-16T09:15:00",
    total: 45000,
    status: "Shipped",
    thumbnail: "https://via.placeholder.com/60?text=Product",
    trackingNo: "AWB123456789",
  },
  {
    id: "ORD-9378-IN",
    invoiceId: "INV-2026-888",
    customer: "Sneha Reddy",
    date: "2026-09-15T16:45:00",
    total: 3400,
    status: "Delivered",
    thumbnail: "https://via.placeholder.com/60?text=Product",
    trackingNo: "AWB987654321",
  },
];

const STATUS_TABS = ["All", "Confirmed", "Packed", "Shipped", "Delivered", "Return Approved", "Return Completed", "Cancelled"];

const STATUS_COLORS: Record<string, string> = {
  "Confirmed": "bg-blue-100 text-blue-700",
  "Packed": "bg-amber-100 text-amber-700",
  "Shipped": "bg-indigo-100 text-indigo-700",
  "Delivered": "bg-emerald-100 text-emerald-700",
  "Return Approved": "bg-orange-100 text-orange-700",
  "Return Completed": "bg-slate-100 text-slate-700",
  "Cancelled": "bg-red-100 text-red-700",
};

export default function AdminOrders() {
  const [orders, setOrders] = useState(MOCK_ORDERS);
  const [activeTab, setActiveTab] = useState("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [trackingInputs, setTrackingInputs] = useState<Record<string, string>>({});
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [selectedInvoiceOrder, setSelectedInvoiceOrder] = useState<any>(null);

  const updateOrderStatus = (orderId: string, newStatus: string) => {
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: newStatus } : o));
  };

  const filteredOrders = orders.filter(o => {
    const matchesSearch = o.id.toLowerCase().includes(searchQuery.toLowerCase()) || o.invoiceId.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTab = activeTab === "All" || o.status === activeTab;
    return matchesSearch && matchesTab;
  });

  const getNextAction = (status: string) => {
    switch (status) {
      case "Confirmed": return { label: "Mark as PACKED", nextStatus: "Packed", icon: <Package className="w-4 h-4" /> };
      case "Packed": return { label: "Mark as SHIPPED", nextStatus: "Shipped", icon: <Truck className="w-4 h-4" /> };
      case "Shipped": return { label: "Mark as DELIVERED", nextStatus: "Delivered", icon: <CheckCircle2 className="w-4 h-4" /> };
      default: return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0B3A63]">All Orders</h1>
          <p className="text-sm text-slate-500 mt-1">Manage and track customer orders here.</p>
        </div>
      </div>

      {/* Header Filters */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm flex flex-col lg:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search by Order ID or Invoice ID..." 
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#0B3A63] text-sm"
          />
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center border border-slate-200 rounded-lg px-3 py-2 bg-slate-50">
            <Calendar className="w-4 h-4 text-slate-400 mr-2" />
            <input type="date" className="bg-transparent text-sm outline-none text-slate-600" />
          </div>
          <span className="text-slate-400 text-sm">to</span>
          <div className="flex items-center border border-slate-200 rounded-lg px-3 py-2 bg-slate-50">
            <Calendar className="w-4 h-4 text-slate-400 mr-2" />
            <input type="date" className="bg-transparent text-sm outline-none text-slate-600" />
          </div>
        </div>
      </div>

      {/* Status Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
        {STATUS_TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`whitespace-nowrap px-4 py-2 rounded-full text-sm font-semibold transition-colors ${
              activeTab === tab 
                ? "bg-[#0B3A63] text-white shadow-sm" 
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Order Cards */}
      <div className="space-y-4">
        {filteredOrders.length === 0 ? (
          <div className="bg-white p-8 rounded-xl border border-slate-200 text-center">
            <p className="text-slate-500">No orders found matching your criteria.</p>
          </div>
        ) : (
          filteredOrders.map(order => {
            const action = getNextAction(order.status);
            return (
              <div key={order.id} className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-5 flex flex-col md:flex-row gap-5">
                  <div className="flex flex-1 gap-4">
                    <img src={order.thumbnail} alt="Product" className="w-16 h-16 object-cover rounded-lg border border-slate-100" />
                    <div>
                      <h3 className="font-bold text-[#0B3A63] text-lg">{order.id}</h3>
                      <p className="text-sm font-medium text-slate-700">{order.customer}</p>
                      <p className="text-xs text-slate-500 mt-1">{new Date(order.date).toLocaleString("en-IN")}</p>
                    </div>
                  </div>
                  
                  <div className="flex flex-col md:items-end justify-center gap-2">
                    <p className="text-xl font-bold text-[#0B3A63]">₹{order.total.toLocaleString("en-IN")}</p>
                    <span className={`inline-flex px-3 py-1 rounded-full text-xs font-bold ${STATUS_COLORS[order.status] || "bg-slate-100 text-slate-700"}`}>
                      {order.status}
                    </span>
                  </div>
                </div>

                <div className="bg-slate-50 px-5 py-4 border-t border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-4">
                  <div className="flex-1 w-full flex gap-3">
                    <input 
                      type="text" 
                      placeholder="Add tracking details..." 
                      value={trackingInputs[order.id] || order.trackingNo}
                      onChange={(e) => setTrackingInputs({...trackingInputs, [order.id]: e.target.value})}
                      className="flex-1 max-w-xs px-3 py-2 text-sm border border-slate-200 rounded-lg outline-none focus:border-[#F2A900]"
                    />
                  </div>
                  <div className="flex w-full sm:w-auto gap-3">
                    <button 
                      onClick={() => setSelectedInvoiceOrder(order)}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 border border-slate-200 bg-white text-[#0B3A63] text-sm font-semibold rounded-lg hover:bg-slate-100 transition-colors"
                    >
                      <FileText className="w-4 h-4" />
                      View Invoice
                    </button>
                    {action && (
                      <button 
                        onClick={() => updateOrderStatus(order.id, action.nextStatus)}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-4 py-2 bg-[#F2A900] text-[#0B3A63] text-sm font-bold rounded-lg hover:bg-[#e09b00] transition-colors shadow-sm"
                      >
                        {action.icon}
                        {action.label}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {selectedInvoiceOrder && (
        <InvoiceModal order={selectedInvoiceOrder} onClose={() => setSelectedInvoiceOrder(null)} />
      )}
    </div>
  );
}
