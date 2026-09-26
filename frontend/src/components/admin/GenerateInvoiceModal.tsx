import { useState, useEffect } from "react";
import { X, Plus, Trash2, IndianRupee } from "lucide-react";

import { financeApi } from "../../api/finance";

export interface InvoiceItem {
  id: string;
  product: string;
  quantity: number;
  rate: number;
  taxPercent: number;
}

export interface Invoice {
  id: string;
  orderId: string;
  client: string;
  clientId?: number | string;
  date: string;
  dueDate: string;
  amount: number;
  subtotal?: number;
  taxAmount?: number;
  status: "Paid" | "Unpaid" | "Overdue" | "Cancelled";
  items?: InvoiceItem[];
  notes?: string;
}

interface GenerateInvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: Partial<Invoice>) => void;
}

export default function GenerateInvoiceModal({ isOpen, onClose, onSubmit }: GenerateInvoiceModalProps) {
  const [client, setClient] = useState("");
  const [clientId, setClientId] = useState<number | string>("");
  const [clientList, setClientList] = useState<any[]>([]);
  const [orderId, setOrderId] = useState("");
  const [date, setDate] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<InvoiceItem[]>([
    { id: Date.now().toString(), product: "", quantity: 1, rate: 0, taxPercent: 18 }
  ]);

  useEffect(() => {
    if (isOpen) {
      financeApi.getClients().then(res => {
        setClientList(res || []);
      }).catch(console.error);

      setClient("");
      setClientId("");
      setOrderId("");
      setDate(new Date().toISOString().split("T")[0]);
      setDueDate("");
      setNotes("");
      setItems([{ id: Date.now().toString(), product: "", quantity: 1, rate: 0, taxPercent: 18 }]);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAddItem = () => {
    setItems([...items, { id: Date.now().toString(), product: "", quantity: 1, rate: 0, taxPercent: 18 }]);
  };

  const handleRemoveItem = (id: string) => {
    if (items.length > 1) {
      setItems(items.filter(item => item.id !== id));
    }
  };

  const updateItem = (id: string, field: keyof InvoiceItem, value: any) => {
    setItems(items.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const subtotal = items.reduce((acc, item) => acc + (item.quantity * item.rate), 0);
  const taxAmount = items.reduce((acc, item) => acc + (item.quantity * item.rate * (item.taxPercent / 100)), 0);
  const totalAmount = subtotal + taxAmount;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      client,
      clientId,
      orderId,
      date,
      dueDate,
      notes,
      items,
      subtotal,
      taxAmount,
      amount: totalAmount,
      status: "Unpaid"
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto flex flex-col relative">
        <div className="sticky top-0 bg-white border-b border-slate-200 p-5 flex justify-between items-center z-10">
          <h2 className="font-bold text-[#0A2540] text-xl flex items-center gap-2">
            <IndianRupee className="w-5 h-5 text-emerald-600" />
            Generate Tax Invoice
          </h2>
          <button onClick={onClose} type="button" className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Client Selection</label>
              <select 
                required
                value={clientId ? String(clientId) : client}
                onChange={e => {
                  const val = e.target.value;
                  const found = clientList.find(c => String(c.id) === val);
                  if (found) {
                    setClientId(found.id);
                    setClient(found.company_name);
                  } else {
                    setClientId("");
                    setClient(val);
                  }
                }}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-[#0A2540] text-sm"
              >
                <option value="">Select a client...</option>
                {clientList.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.company_name} ({c.client_code || c.gstin})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Order ID Reference</label>
              <input 
                type="text" 
                required
                value={orderId} 
                onChange={e => setOrderId(e.target.value)}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-[#0A2540] text-sm"
                placeholder="e.g. ORD-9381-IN"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Invoice Date</label>
              <input 
                type="date" 
                required
                value={date} 
                onChange={e => setDate(e.target.value)}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-[#0A2540] text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Due Date</label>
              <input 
                type="date" 
                required
                value={dueDate} 
                onChange={e => setDueDate(e.target.value)}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-[#0A2540] text-sm"
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-3">
              <label className="block text-sm font-semibold text-slate-700">Line Items</label>
              <button type="button" onClick={handleAddItem} className="text-sm text-blue-600 font-semibold flex items-center gap-1 hover:text-blue-700">
                <Plus className="w-4 h-4" /> Add Row
              </button>
            </div>
            
            <div className="hidden md:flex gap-3 mb-2 px-3 text-xs font-bold text-slate-500 uppercase tracking-wider">
              <div className="flex-[2]">Product / Description</div>
              <div className="w-24">Qty</div>
              <div className="w-32">Rate (₹)</div>
              <div className="w-24">Tax %</div>
              <div className="w-32 text-right">Amount</div>
              <div className="w-10"></div>
            </div>

            <div className="space-y-3">
              {items.map((item) => (
                <div key={item.id} className="flex flex-col md:flex-row gap-3 items-start md:items-center bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <div className="flex-[2] w-full">
                    <input 
                      type="text" 
                      required
                      placeholder="Product description" 
                      value={item.product}
                      onChange={e => updateItem(item.id, "product", e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:border-[#0A2540] text-sm"
                    />
                  </div>
                  <div className="w-full md:w-24">
                    <input 
                      type="number" 
                      required
                      min="1"
                      placeholder="Qty" 
                      value={item.quantity}
                      onChange={e => updateItem(item.id, "quantity", Number(e.target.value))}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:border-[#0A2540] text-sm"
                    />
                  </div>
                  <div className="w-full md:w-32">
                    <input 
                      type="number" 
                      required
                      min="0"
                      placeholder="Rate" 
                      value={item.rate}
                      onChange={e => updateItem(item.id, "rate", Number(e.target.value))}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:border-[#0A2540] text-sm"
                    />
                  </div>
                  <div className="w-full md:w-24">
                    <select 
                      value={item.taxPercent}
                      onChange={e => updateItem(item.id, "taxPercent", Number(e.target.value))}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:border-[#0A2540] text-sm"
                    >
                      <option value={0}>0%</option>
                      <option value={5}>5%</option>
                      <option value={12}>12%</option>
                      <option value={18}>18%</option>
                      <option value={28}>28%</option>
                    </select>
                  </div>
                  <div className="w-full md:w-32 text-right pt-2 md:pt-0 font-bold text-slate-800">
                    ₹{(item.quantity * item.rate).toLocaleString("en-IN")}
                  </div>
                  <div className="w-full md:w-10 text-right mt-2 md:mt-0">
                    <button type="button" onClick={() => handleRemoveItem(item.id)} disabled={items.length === 1} className="p-2 text-red-500 hover:bg-red-50 rounded-lg disabled:opacity-50">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 flex flex-col items-end gap-2 bg-slate-50 p-4 rounded-lg border border-slate-200">
              <div className="flex justify-between w-full sm:w-64 text-sm text-slate-600">
                <span>Subtotal:</span>
                <span className="font-medium">₹{subtotal.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between w-full sm:w-64 text-sm text-slate-600">
                <span>Total Tax (GST):</span>
                <span className="font-medium">₹{taxAmount.toLocaleString("en-IN")}</span>
              </div>
              <div className="flex justify-between w-full sm:w-64 text-lg font-black text-[#0A2540] border-t border-slate-300 pt-2 mt-1">
                <span>Total Payable:</span>
                <span>₹{totalAmount.toLocaleString("en-IN")}</span>
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Additional Notes</label>
            <textarea 
              value={notes} 
              onChange={e => setNotes(e.target.value)}
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-[#0A2540] text-sm h-20 resize-none"
              placeholder="Payment terms, bank details, or thank you note..."
            />
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t border-slate-200">
            <button type="button" onClick={onClose} className="px-5 py-2 text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
              Cancel
            </button>
            <button type="submit" className="px-5 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors">
              Generate & Save Invoice
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
