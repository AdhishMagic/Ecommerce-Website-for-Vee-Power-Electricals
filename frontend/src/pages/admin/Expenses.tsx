import { useState } from "react";
import { Plus, IndianRupee, Clock, Tag, X, Edit, Trash2 } from "lucide-react";

type Expense = {
  id: number;
  date: string;
  category: string;
  description: string;
  vendor: string;
  amount: number;
  status: "Paid" | "Pending";
};

const INITIAL_EXPENSES: Expense[] = [
  { id: 1, date: "2026-09-15", category: "Logistics", description: "Delhivery Monthly Bill", vendor: "Delhivery", amount: 45000, status: "Paid" },
  { id: 2, date: "2026-09-12", category: "Marketing", description: "Google Ads Campaign", vendor: "Google India", amount: 25000, status: "Paid" },
  { id: 3, date: "2026-09-10", category: "Software", description: "Shopify Subscription", vendor: "Shopify", amount: 8000, status: "Paid" },
  { id: 4, date: "2026-09-05", category: "Inventory", description: "Wire Restock", vendor: "Polycab", amount: 150000, status: "Pending" },
  { id: 5, date: "2026-09-02", category: "Utilities", description: "Warehouse Electricity", vendor: "State Electricity Board", amount: 12000, status: "Pending" },
];

const STATUS_COLORS: Record<string, string> = {
  "Paid": "bg-emerald-100 text-emerald-700",
  "Pending": "bg-amber-100 text-amber-700",
};

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>(INITIAL_EXPENSES);
  const [categoryFilter, setCategoryFilter] = useState("All");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [formData, setFormData] = useState<Partial<Expense>>({
    date: "", category: "Operations", description: "", vendor: "", amount: 0, status: "Pending"
  });

  const filteredExpenses = categoryFilter === "All" 
    ? expenses 
    : expenses.filter(e => e.category === categoryFilter);

  const handleOpenModal = (expense?: Expense) => {
    if (expense) {
      setEditingExpense(expense);
      setFormData(expense);
    } else {
      setEditingExpense(null);
      setFormData({ date: "", category: "Operations", description: "", vendor: "", amount: 0, status: "Pending" });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingExpense(null);
  };

  const handleSaveExpense = () => {
    if (editingExpense) {
      setExpenses(expenses.map(e => e.id === editingExpense.id ? { ...e, ...formData } as Expense : e));
    } else {
      setExpenses([{ id: Date.now(), ...formData } as Expense, ...expenses]);
    }
    handleCloseModal();
  };

  const handleDeleteExpense = (id: number) => {
    if (confirm("Are you sure you want to delete this expense?")) {
      setExpenses(expenses.filter(e => e.id !== id));
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0A2540]">Expenses Management</h1>
        <p className="text-sm text-slate-500 mt-1">Track and log operational expenses and vendor payments.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { title: "Total Expenses (Month)", value: "₹2,40,000", icon: <IndianRupee className="w-6 h-6 text-red-600" />, bg: "bg-red-100" },
          { title: "Pending Approvals", value: "2", icon: <Clock className="w-6 h-6 text-amber-600" />, bg: "bg-amber-100" },
          { title: "Top Category", value: "Inventory", icon: <Tag className="w-6 h-6 text-[#0A2540]" />, bg: "bg-[#0A2540]/10" },
        ].map((kpi, idx) => (
          <div key={idx} className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-500 mb-1">{kpi.title}</p>
              <p className="text-2xl font-bold text-[#0A2540]">{kpi.value}</p>
            </div>
            <div className={`w-14 h-14 rounded-full flex items-center justify-center ${kpi.bg}`}>
              {kpi.icon}
            </div>
          </div>
        ))}
      </div>

      {/* Action Header & Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h2 className="font-bold text-[#0A2540]">Recent Expenses</h2>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <select 
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 text-sm text-[#0A2540] font-medium outline-none focus:border-[#0A2540] flex-1 sm:flex-none"
            >
              <option value="All">All Categories</option>
              <option value="Inventory">Inventory</option>
              <option value="Logistics">Logistics</option>
              <option value="Marketing">Marketing</option>
              <option value="Operations">Operations</option>
              <option value="Software">Software</option>
              <option value="Utilities">Utilities</option>
            </select>
            <button 
              onClick={() => handleOpenModal()}
              className="flex items-center justify-center gap-2 px-4 py-2 bg-[#F2A900] text-[#0A2540] text-sm font-bold rounded-lg hover:bg-[#e09b00] transition-colors shadow-sm whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              Add Expense
            </button>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[900px]">
            <thead>
              <tr className="bg-slate-50/80">
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase">Date</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase">Category</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase">Description</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase">Vendor</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase text-right">Amount (₹)</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase text-center">Status</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredExpenses.map(expense => (
                <tr key={expense.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-4 text-sm font-medium text-slate-700">{expense.date}</td>
                  <td className="px-5 py-4 text-sm">
                    <span className="bg-slate-100 text-slate-600 px-2.5 py-1 rounded-md text-xs font-semibold">{expense.category}</span>
                  </td>
                  <td className="px-5 py-4 text-sm text-[#0A2540] font-medium">{expense.description}</td>
                  <td className="px-5 py-4 text-sm text-slate-600">{expense.vendor}</td>
                  <td className="px-5 py-4 text-sm font-bold text-[#0A2540] text-right">₹{expense.amount.toLocaleString("en-IN")}</td>
                  <td className="px-5 py-4 text-center">
                    <span className={`inline-flex px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider ${STATUS_COLORS[expense.status]}`}>
                      {expense.status}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={() => handleOpenModal(expense)} className="p-1.5 text-slate-400 hover:text-[#0A2540] hover:bg-slate-100 rounded transition-colors" title="Edit">
                        <Edit className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDeleteExpense(expense.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="Delete">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0A2540]/40 backdrop-blur-sm">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden flex flex-col">
            <div className="p-5 border-b border-slate-200 flex justify-between items-center bg-slate-50">
              <h3 className="font-bold text-[#0A2540]">{editingExpense ? "Edit Expense" : "Add New Expense"}</h3>
              <button onClick={handleCloseModal} className="text-slate-400 hover:text-slate-600 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Date</label>
                <input 
                  type="date" 
                  value={formData.date}
                  onChange={e => setFormData({...formData, date: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#0A2540] text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Category</label>
                  <select
                    value={formData.category}
                    onChange={e => setFormData({...formData, category: e.target.value})}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#0A2540] text-sm bg-white"
                  >
                    <option value="Inventory">Inventory</option>
                    <option value="Logistics">Logistics</option>
                    <option value="Marketing">Marketing</option>
                    <option value="Operations">Operations</option>
                    <option value="Software">Software</option>
                    <option value="Utilities">Utilities</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1">Status</label>
                  <select
                    value={formData.status}
                    onChange={e => setFormData({...formData, status: e.target.value as "Paid" | "Pending"})}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#0A2540] text-sm bg-white"
                  >
                    <option value="Paid">Paid</option>
                    <option value="Pending">Pending</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Description</label>
                <input 
                  type="text" 
                  placeholder="e.g. Monthly cloud hosting"
                  value={formData.description}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#0A2540] text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Vendor</label>
                <input 
                  type="text" 
                  placeholder="e.g. AWS"
                  value={formData.vendor}
                  onChange={e => setFormData({...formData, vendor: e.target.value})}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#0A2540] text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1">Amount (₹)</label>
                <input 
                  type="number" 
                  placeholder="0.00"
                  value={formData.amount || ""}
                  onChange={e => setFormData({...formData, amount: Number(e.target.value)})}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#0A2540] text-sm"
                />
              </div>
            </div>
            <div className="p-5 border-t border-slate-200 flex gap-3 justify-end bg-slate-50">
              <button 
                onClick={handleCloseModal}
                className="px-4 py-2 border border-slate-200 bg-white text-slate-600 text-sm font-semibold rounded-lg hover:bg-slate-100 transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={handleSaveExpense}
                disabled={!formData.date || !formData.description || !formData.amount}
                className="px-4 py-2 bg-[#F2A900] text-[#0A2540] text-sm font-bold rounded-lg hover:bg-[#e09b00] disabled:opacity-50 transition-colors shadow-sm"
              >
                Save Expense
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
