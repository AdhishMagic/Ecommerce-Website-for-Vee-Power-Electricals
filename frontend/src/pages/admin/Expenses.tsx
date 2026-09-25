import { useState, useEffect, useMemo } from "react";
import { Plus, IndianRupee, Clock, Tag, X, Edit, Trash2, Loader2, AlertCircle } from "lucide-react";
import { financeApi } from "../../api/finance";
import { ExpenseItem } from "../../types/api";

type Expense = {
  id: number;
  date: string;
  category: string;
  description: string;
  vendor: string;
  amount: number;
  status: "Paid" | "Pending";
};

const STATUS_COLORS: Record<string, string> = {
  "Paid": "bg-emerald-100 text-emerald-700",
  "Pending": "bg-amber-100 text-amber-700",
};

export default function ExpensesPage() {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState("All");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState<Partial<Expense>>({
    date: "", category: "Operations", description: "", vendor: "", amount: 0, status: "Pending"
  });

  const fetchExpenses = async () => {
    setLoading(true);
    setError(null);
    try {
      const data: ExpenseItem[] = await financeApi.getExpenses();
      const mapped: Expense[] = data.map(e => ({
          id: e.id,
          date: e.expense_date || e.date || "",
          category: e.category,
          description: e.description,
          vendor: e.vendor,
          amount: Number(e.amount) || 0,
          status: (e.status === "Paid" ? "Paid" : "Pending") as "Paid" | "Pending",
        }));
      setExpenses(mapped);
    } catch (err: unknown) {
      setExpenses([]);
      setError(err instanceof Error ? err.message : "Unable to load expenses. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchExpenses();
  }, []);

  const filteredExpenses = categoryFilter === "All"
    ? expenses
    : expenses.filter(e => e.category === categoryFilter);

  // Dynamic KPI Metrics
  const { totalAmount, pendingCount, topCategory } = useMemo(() => {
    const total = expenses.reduce((acc, curr) => acc + (curr.amount || 0), 0);
    const pending = expenses.filter(e => e.status === "Pending").length;

    const catCounts: Record<string, number> = {};
    expenses.forEach(e => {
      catCounts[e.category] = (catCounts[e.category] || 0) + 1;
    });
    let topCat = "General";
    let maxCount = 0;
    Object.entries(catCounts).forEach(([cat, cnt]) => {
      if (cnt > maxCount) {
        maxCount = cnt;
        topCat = cat;
      }
    });

    return {
      totalAmount: total,
      pendingCount: pending,
      topCategory: topCat
    };
  }, [expenses]);

  const handleOpenModal = (expense?: Expense) => {
    if (expense) {
      setEditingExpense(expense);
      setFormData(expense);
    } else {
      setEditingExpense(null);
      setFormData({
        date: new Date().toISOString().split("T")[0],
        category: "Operations",
        description: "",
        vendor: "",
        amount: 0,
        status: "Pending"
      });
    }
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setEditingExpense(null);
  };

  const handleSaveExpense = async () => {
    if (!formData.date || !formData.description || !formData.amount) return;

    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        expense_date: formData.date,
        category: formData.category || "Operations",
        description: formData.description,
        vendor: formData.vendor || "Direct",
        amount: Number(formData.amount),
        status: formData.status || "Pending",
      };

      if (editingExpense) {
        const updated = await financeApi.updateExpense(editingExpense.id, payload);
        setExpenses(prev => prev.map(e => e.id === editingExpense.id ? {
            ...e,
            date: updated.expense_date || updated.date || formData.date!,
            category: updated.category,
            description: updated.description,
            vendor: updated.vendor,
            amount: Number(updated.amount),
            status: updated.status as "Paid" | "Pending",
        } : e));
      } else {
        const created = await financeApi.createExpense(payload);
        setExpenses(prev => [{
            id: created.id,
            date: created.expense_date || created.date || formData.date!,
            category: created.category,
            description: created.description,
            vendor: created.vendor,
            amount: Number(created.amount),
            status: created.status as "Paid" | "Pending",
        }, ...prev]);
      }
      handleCloseModal();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to save the expense. Please review the form and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteExpense = async (id: number) => {
    if (confirm("Are you sure you want to delete this expense?")) {
      try {
        await financeApi.deleteExpense(id);
        setExpenses(prev => prev.filter(e => e.id !== id));
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Unable to delete the expense. Please try again.");
      }
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0A2540]">Expenses Management</h1>
        <p className="text-sm text-slate-500 mt-1">Track and log operational expenses and vendor payments.</p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl flex items-center gap-3 text-red-700 text-sm">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          {
            title: "Total Expenses",
            value: `₹${totalAmount.toLocaleString("en-IN")}`,
            icon: <IndianRupee className="w-6 h-6 text-red-600" />,
            bg: "bg-red-100"
          },
          {
            title: "Pending Approvals",
            value: String(pendingCount),
            icon: <Clock className="w-6 h-6 text-amber-600" />,
            bg: "bg-amber-100"
          },
          {
            title: "Top Category",
            value: topCategory,
            icon: <Tag className="w-6 h-6 text-[#0A2540]" />,
            bg: "bg-[#0A2540]/10"
          },
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
        
        {loading ? (
          <div className="p-12 flex flex-col items-center justify-center text-slate-400 gap-2">
            <Loader2 className="w-8 h-8 animate-spin text-[#0A2540]" />
            <p className="text-sm font-medium">Loading expenses...</p>
          </div>
        ) : filteredExpenses.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <p className="text-base font-semibold text-slate-600">No expenses found</p>
            <p className="text-sm mt-1">There are no expense records for the selected filter.</p>
          </div>
        ) : (
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
        )}
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
                disabled={submitting || !formData.date || !formData.description || !formData.amount}
                className="px-4 py-2 bg-[#F2A900] text-[#0A2540] text-sm font-bold rounded-lg hover:bg-[#e09b00] disabled:opacity-50 transition-colors shadow-sm flex items-center gap-2"
              >
                {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
                Save Expense
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
