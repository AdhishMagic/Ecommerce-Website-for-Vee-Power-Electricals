import { useState, useEffect } from "react";
import { X, Plus, Trash2 } from "lucide-react";

interface QuotationItem {
  id: string; // local id for list rendering
  product: string;
  quantity: number;
  price: number;
}

export interface Quotation {
  id: string;
  client: string;
  date: string;
  expiry: string;
  value: number;
  status: "Draft" | "Sent" | "Approved" | "Rejected" | "Converted";
  items?: QuotationItem[];
  notes?: string;
}

interface QuotationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: Partial<Quotation>) => void;
  initialData?: Quotation | null;
}

export default function QuotationModal({ isOpen, onClose, onSubmit, initialData }: QuotationModalProps) {
  const [client, setClient] = useState("");
  const [expiry, setExpiry] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<QuotationItem[]>([{ id: Date.now().toString(), product: "", quantity: 1, price: 0 }]);

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setClient(initialData.client || "");
        setExpiry(initialData.expiry || "");
        setNotes(initialData.notes || "");
        setItems(initialData.items?.length ? initialData.items : [{ id: Date.now().toString(), product: "", quantity: 1, price: 0 }]);
      } else {
        setClient("");
        setExpiry("");
        setNotes("");
        setItems([{ id: Date.now().toString(), product: "", quantity: 1, price: 0 }]);
      }
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  const handleAddItem = () => {
    setItems([...items, { id: Date.now().toString(), product: "", quantity: 1, price: 0 }]);
  };

  const handleRemoveItem = (id: string) => {
    if (items.length > 1) {
      setItems(items.filter(item => item.id !== id));
    }
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const updateItem = (id: string, field: keyof QuotationItem, value: any) => {
    setItems(items.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const totalValue = items.reduce((acc, item) => acc + (item.quantity * item.price), 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({
      client,
      expiry,
      notes,
      items,
      value: totalValue,
      status: initialData ? initialData.status : "Draft"
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto flex flex-col relative">
        <div className="sticky top-0 bg-white border-b border-slate-200 p-5 flex justify-between items-center z-10">
          <h2 className="font-bold text-[#0A2540] text-xl">{initialData ? "Edit Quotation" : "Create Quotation"}</h2>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Client Name</label>
              <input 
                type="text" 
                required
                value={client} 
                onChange={e => setClient(e.target.value)}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-[#0A2540] text-sm"
                placeholder="Enter client name"
              />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Expiry Date</label>
              <input 
                type="date" 
                required
                value={expiry} 
                onChange={e => setExpiry(e.target.value)}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-[#0A2540] text-sm"
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-3">
              <label className="block text-sm font-semibold text-slate-700">Product Line Items</label>
              <button type="button" onClick={handleAddItem} className="text-sm text-blue-600 font-semibold flex items-center gap-1 hover:text-blue-700">
                <Plus className="w-4 h-4" /> Add Item
              </button>
            </div>
            <div className="space-y-3">
              {items.map((item) => (
                <div key={item.id} className="flex flex-col sm:flex-row gap-3 items-start sm:items-center bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <div className="flex-1 w-full">
                    <input 
                      type="text" 
                      required
                      placeholder="Product description" 
                      value={item.product}
                      onChange={e => updateItem(item.id, "product", e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:border-[#0A2540] text-sm"
                    />
                  </div>
                  <div className="w-full sm:w-24">
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
                  <div className="w-full sm:w-32">
                    <input 
                      type="number" 
                      required
                      min="0"
                      placeholder="Unit Price" 
                      value={item.price}
                      onChange={e => updateItem(item.id, "price", Number(e.target.value))}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg outline-none focus:border-[#0A2540] text-sm"
                    />
                  </div>
                  <button type="button" onClick={() => handleRemoveItem(item.id)} disabled={items.length === 1} className="p-2 text-red-500 hover:bg-red-50 rounded-lg disabled:opacity-50 mt-1 sm:mt-0">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-4 text-right">
              <p className="text-lg font-bold text-[#0A2540]">Total: ₹{totalValue.toLocaleString("en-IN")}</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-2">Notes (Optional)</label>
            <textarea 
              value={notes} 
              onChange={e => setNotes(e.target.value)}
              className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-[#0A2540] text-sm h-24 resize-none"
              placeholder="Terms, conditions, or any additional notes..."
            />
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t border-slate-200">
            <button type="button" onClick={onClose} className="px-5 py-2 text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
              Cancel
            </button>
            <button type="submit" className="px-5 py-2 text-sm font-semibold text-white bg-[#0A2540] hover:bg-[#113860] rounded-lg transition-colors">
              {initialData ? "Save Changes" : "Create Quotation"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
