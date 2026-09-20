import { useState, useEffect } from "react";
import { X } from "lucide-react";

export type Client = {
  id: string;
  companyName: string;
  contactPerson: string;
  gstin: string;
  email: string;
  phone: string;
  creditLimit: number;
  totalInvoiced: number;
};

interface ClientModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: Partial<Client>) => void;
  initialData?: Client | null;
}

export default function ClientModal({ isOpen, onClose, onSubmit, initialData }: ClientModalProps) {
  const [formData, setFormData] = useState({
    companyName: "",
    contactPerson: "",
    gstin: "",
    email: "",
    phone: "",
    creditLimit: 0,
  });

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setFormData({
          companyName: initialData.companyName || "",
          contactPerson: initialData.contactPerson || "",
          gstin: initialData.gstin || "",
          email: initialData.email || "",
          phone: initialData.phone || "",
          creditLimit: initialData.creditLimit || 0,
        });
      } else {
        setFormData({
          companyName: "",
          contactPerson: "",
          gstin: "",
          email: "",
          phone: "",
          creditLimit: 0,
        });
      }
    }
  }, [isOpen, initialData]);

  if (!isOpen) return null;

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: name === "creditLimit" ? Number(value) : value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col relative">
        <div className="sticky top-0 bg-white border-b border-slate-200 p-5 flex justify-between items-center z-10">
          <h2 className="font-bold text-[#0A2540] text-xl">{initialData ? "Edit Client" : "Add New Client"}</h2>
          <button onClick={onClose} type="button" className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-slate-700 mb-2">Company Name</label>
              <input 
                type="text" 
                name="companyName"
                required
                value={formData.companyName} 
                onChange={handleChange}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-[#0A2540] text-sm"
                placeholder="Enter company name"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Contact Person Name</label>
              <input 
                type="text" 
                name="contactPerson"
                required
                value={formData.contactPerson} 
                onChange={handleChange}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-[#0A2540] text-sm"
                placeholder="Full name"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">GSTIN</label>
              <input 
                type="text" 
                name="gstin"
                required
                value={formData.gstin} 
                onChange={handleChange}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-[#0A2540] text-sm uppercase"
                placeholder="22AAAAA0000A1Z5"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Email Address</label>
              <input 
                type="email" 
                name="email"
                required
                value={formData.email} 
                onChange={handleChange}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-[#0A2540] text-sm"
                placeholder="contact@company.com"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">Phone Number</label>
              <input 
                type="text" 
                name="phone"
                required
                value={formData.phone} 
                onChange={handleChange}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-[#0A2540] text-sm"
                placeholder="+91 9876543210"
              />
            </div>

            <div className="md:col-span-2 border-t border-slate-200 pt-6">
              <label className="block text-sm font-semibold text-slate-700 mb-2">Credit Limit (₹)</label>
              <input 
                type="number" 
                name="creditLimit"
                required
                min="0"
                value={formData.creditLimit} 
                onChange={handleChange}
                className="w-full px-4 py-2 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:border-[#0A2540] text-sm font-bold text-[#0A2540]"
              />
              <p className="text-xs text-slate-500 mt-1">Maximum allowable credit line for this client.</p>
            </div>
            
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t border-slate-200">
            <button type="button" onClick={onClose} className="px-5 py-2 text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
              Cancel
            </button>
            <button type="submit" className="px-5 py-2 text-sm font-semibold text-white bg-[#0A2540] hover:bg-[#113860] rounded-lg transition-colors">
              {initialData ? "Save Changes" : "Create Client"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
