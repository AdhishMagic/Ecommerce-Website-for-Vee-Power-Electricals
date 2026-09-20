import { X, Building2, User, Phone, Mail, FileText, IndianRupee } from "lucide-react";
import { Client } from "./ClientModal";

interface ClientViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  client: Client | null;
}

export default function ClientViewModal({ isOpen, onClose, client }: ClientViewModalProps) {
  if (!isOpen || !client) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto flex flex-col relative">
        <div className="sticky top-0 bg-[#0A2540] p-6 flex justify-between items-start z-10 text-white rounded-t-xl">
          <div>
            <h2 className="font-bold text-2xl mb-1">{client.companyName}</h2>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded bg-white/20 text-xs font-mono font-medium">
              <Building2 className="w-3 h-3" />
              ID: {client.id}
            </div>
          </div>
          <button onClick={onClose} type="button" className="p-2 text-white/70 hover:bg-white/10 hover:text-white rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-8">
          
          {/* Contact Details */}
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">Contact Details</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-lg shrink-0">
                  <User className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-medium">Contact Person</p>
                  <p className="text-sm font-bold text-slate-800">{client.contactPerson}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-lg shrink-0">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-medium">Email Address</p>
                  <p className="text-sm font-bold text-slate-800">{client.email}</p>
                </div>
              </div>
              <div className="flex items-start gap-3">
                <div className="p-2 bg-blue-50 text-blue-600 rounded-lg shrink-0">
                  <Phone className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-medium">Phone Number</p>
                  <p className="text-sm font-bold text-slate-800">{client.phone}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Registration */}
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">Registration</h3>
            <div className="flex items-start gap-3">
              <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg shrink-0">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-medium">GSTIN</p>
                <p className="text-sm font-bold font-mono text-slate-800">{client.gstin}</p>
              </div>
            </div>
          </div>

          {/* Financial Summary */}
          <div>
            <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 border-b border-slate-100 pb-2">Financial Summary</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center gap-4">
                <div className="p-3 bg-white border border-slate-200 shadow-sm rounded-lg shrink-0">
                  <IndianRupee className="w-6 h-6 text-amber-600" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-medium mb-0.5">Credit Limit</p>
                  <p className="text-xl font-bold text-[#0A2540]">₹{client.creditLimit.toLocaleString("en-IN")}</p>
                </div>
              </div>
              
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center gap-4">
                <div className="p-3 bg-white border border-slate-200 shadow-sm rounded-lg shrink-0">
                  <IndianRupee className="w-6 h-6 text-emerald-600" />
                </div>
                <div>
                  <p className="text-xs text-slate-500 font-medium mb-0.5">Total Invoiced</p>
                  <p className="text-xl font-bold text-emerald-600">₹{client.totalInvoiced.toLocaleString("en-IN")}</p>
                </div>
              </div>
            </div>
          </div>

        </div>

        <div className="p-4 border-t border-slate-200 flex justify-end">
          <button onClick={onClose} className="px-5 py-2 text-sm font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors">
            Close Profile
          </button>
        </div>
      </div>
    </div>
  );
}
