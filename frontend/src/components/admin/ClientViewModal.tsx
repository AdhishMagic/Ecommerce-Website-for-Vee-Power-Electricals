import { useState, useEffect } from "react";
import { 
  X, Building2, User, Phone, Mail, FileText, IndianRupee, 
  MapPin, ShieldCheck, ShieldAlert, History, FileSpreadsheet, 
  Receipt, CheckCircle2, Clock
} from "lucide-react";
import { Client } from "./ClientModal";
import { financeApi } from "../../api/finance";
import { Quotation, Invoice } from "../../types/api";

interface ClientViewModalProps {
  isOpen: boolean;
  onClose: () => void;
  client: (Client & { rawId?: number | string; pan?: string; state?: string; address?: string }) | null;
  onClientUpdated?: () => void;
}

export default function ClientViewModal({ isOpen, onClose, client, onClientUpdated }: ClientViewModalProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'quotations' | 'invoices' | 'audit'>('overview');
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (isOpen && client && client.rawId) {
      loadChildData(client.rawId);
    }
  }, [isOpen, client?.rawId]);

  const loadChildData = async (rawId: number | string) => {
    setLoadingData(true);
    try {
      const [quotesRes, invsRes, auditRes] = await Promise.all([
        financeApi.getClientQuotations(rawId).catch(() => []),
        financeApi.getClientInvoices(rawId).catch(() => []),
        financeApi.getClientAuditHistory(rawId).catch(() => []),
      ]);
      setQuotations(quotesRes);
      setInvoices(invsRes);
      setAuditLogs(auditRes);
    } catch (err) {
      console.error("Failed to load client ledger records:", err);
    } finally {
      setLoadingData(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!client || !client.rawId) return;
    setActionLoading(true);
    try {
      if (client.isActive) {
        await financeApi.deactivateClient(client.rawId, "Deactivated from client view profile");
      } else {
        await financeApi.activateClient(client.rawId, "Activated from client view profile");
      }
      if (onClientUpdated) {
        onClientUpdated();
      }
      onClose();
    } catch (err: any) {
      alert(err?.message || "Failed to update client status");
    } finally {
      setActionLoading(false);
    }
  };

  if (!isOpen || !client) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto flex flex-col relative">
        {/* Header */}
        <div className="sticky top-0 bg-[#0A2540] p-6 flex justify-between items-start z-10 text-white rounded-t-xl">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="font-bold text-2xl">{client.companyName}</h2>
              <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                client.isActive 
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' 
                  : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
              }`}>
                {client.isActive ? <ShieldCheck className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3" />}
                {client.isActive ? 'Active B2B Client' : 'Inactive / Frozen'}
              </span>
            </div>
            <div className="flex items-center gap-2 mt-2 text-xs font-mono text-slate-300">
              <span className="bg-white/10 px-2 py-0.5 rounded">Client Code: {client.clientCode || client.id}</span>
              {client.state && <span className="bg-white/10 px-2 py-0.5 rounded">State: {client.state}</span>}
              {client.pan && <span className="bg-white/10 px-2 py-0.5 rounded">PAN: {client.pan}</span>}
            </div>
          </div>
          <button onClick={onClose} type="button" className="p-2 text-white/70 hover:bg-white/10 hover:text-white rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200 px-6 bg-slate-50/50">
          {[
            { id: 'overview', label: 'Financial Overview', icon: <FileText className="w-4 h-4" /> },
            { id: 'quotations', label: `Quotations (${quotations.length})`, icon: <FileSpreadsheet className="w-4 h-4" /> },
            { id: 'invoices', label: `Invoices (${invoices.length})`, icon: <Receipt className="w-4 h-4" /> },
            { id: 'audit', label: `Audit Trail (${auditLogs.length})`, icon: <History className="w-4 h-4" /> },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 py-3 px-4 text-xs font-bold transition-colors border-b-2 -mb-px ${
                activeTab === tab.id
                  ? 'border-[#0A2540] text-[#0A2540] bg-white'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="p-6 space-y-6 flex-1">
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {/* Financial Summary Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <p className="text-xs text-slate-500 font-semibold mb-1">Credit Limit</p>
                  <p className="text-xl font-bold text-[#0A2540]">₹{(client.creditLimit || 0).toLocaleString("en-IN")}</p>
                  <p className="text-[11px] text-slate-400 mt-1">Authorized ceiling</p>
                </div>

                <div className="bg-amber-50/60 border border-amber-200 rounded-xl p-4">
                  <p className="text-xs text-amber-700 font-semibold mb-1">Outstanding Exposure</p>
                  <p className="text-xl font-bold text-amber-800">₹{(client.creditExposure ?? 0).toLocaleString("en-IN")}</p>
                  <p className="text-[11px] text-amber-600 mt-1">Unpaid & overdue balances</p>
                </div>

                <div className="bg-emerald-50/60 border border-emerald-200 rounded-xl p-4">
                  <p className="text-xs text-emerald-700 font-semibold mb-1">Available Credit</p>
                  <p className="text-xl font-bold text-emerald-800">₹{(client.availableCredit ?? Math.max(0, client.creditLimit - (client.creditExposure || 0))).toLocaleString("en-IN")}</p>
                  <p className="text-[11px] text-emerald-600 mt-1">Headroom for new orders</p>
                </div>

                <div className="bg-blue-50/60 border border-blue-200 rounded-xl p-4">
                  <p className="text-xs text-blue-700 font-semibold mb-1">Total Invoiced</p>
                  <p className="text-xl font-bold text-blue-800">₹{(client.totalInvoiced || 0).toLocaleString("en-IN")}</p>
                  <p className="text-[11px] text-blue-600 mt-1">Lifetime non-cancelled</p>
                </div>
              </div>

              {/* Contact & Registration */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-2">
                    Contact Information
                  </h3>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 text-sm">
                      <User className="w-4 h-4 text-slate-400" />
                      <span className="font-semibold text-slate-800">{client.contactPerson}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <Mail className="w-4 h-4 text-slate-400" />
                      <span className="text-slate-700">{client.email}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <Phone className="w-4 h-4 text-slate-400" />
                      <span className="text-slate-700">{client.phone}</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100 pb-2">
                    Statutory & Address Details
                  </h3>
                  <div className="space-y-3 text-sm">
                    <div className="flex items-center justify-between py-1 border-b border-slate-50">
                      <span className="text-slate-500">GSTIN:</span>
                      <span className="font-mono font-bold text-[#0A2540]">{client.gstin}</span>
                    </div>
                    <div className="flex items-center justify-between py-1 border-b border-slate-50">
                      <span className="text-slate-500">PAN:</span>
                      <span className="font-mono font-bold text-slate-700">{client.pan || client.gstin?.slice(2, 12)}</span>
                    </div>
                    <div className="flex items-start gap-2 pt-1">
                      <MapPin className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                      <span className="text-slate-600 text-xs leading-relaxed">{client.address || "Registered address on file"}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'quotations' && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-[#0A2540]">Client Commercial Quotations</h3>
              {loadingData ? (
                <p className="text-sm text-slate-400 py-6 text-center">Loading quotations...</p>
              ) : quotations.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-sm">No quotations issued for this client yet.</div>
              ) : (
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="p-3">Quote #</th>
                        <th className="p-3">Date</th>
                        <th className="p-3">Status</th>
                        <th className="p-3 text-right">Value (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {quotations.map((q) => (
                        <tr key={q.id} className="hover:bg-slate-50">
                          <td className="p-3 font-semibold text-[#0A2540]">{q.quotation_number}</td>
                          <td className="p-3 text-slate-600">{q.quotation_date}</td>
                          <td className="p-3">
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-700">
                              {q.status}
                            </span>
                          </td>
                          <td className="p-3 text-right font-bold">₹{Number(q.total_value).toLocaleString("en-IN")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'invoices' && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-[#0A2540]">Client Tax Invoices & Dispatches</h3>
              {loadingData ? (
                <p className="text-sm text-slate-400 py-6 text-center">Loading invoices...</p>
              ) : invoices.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-sm">No statutory invoices on ledger for this client.</div>
              ) : (
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                      <tr>
                        <th className="p-3">Invoice #</th>
                        <th className="p-3">Date</th>
                        <th className="p-3">Status</th>
                        <th className="p-3">Payment</th>
                        <th className="p-3 text-right">Total Amount (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {invoices.map((inv) => (
                        <tr key={inv.id} className="hover:bg-slate-50">
                          <td className="p-3 font-semibold text-[#0A2540]">{inv.invoice_number}</td>
                          <td className="p-3 text-slate-600">{inv.invoice_date}</td>
                          <td className="p-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              inv.status === 'Paid' ? 'bg-emerald-100 text-emerald-800' :
                              inv.status === 'Overdue' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                            }`}>
                              {inv.status}
                            </span>
                          </td>
                          <td className="p-3 text-slate-600">{inv.payment_status}</td>
                          <td className="p-3 text-right font-bold">₹{Number(inv.total_amount).toLocaleString("en-IN")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {activeTab === 'audit' && (
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-[#0A2540]">Credit & Administrative Audit History</h3>
              {loadingData ? (
                <p className="text-sm text-slate-400 py-6 text-center">Loading audit history...</p>
              ) : auditLogs.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-sm">No audit entries recorded for this client.</div>
              ) : (
                <div className="space-y-3">
                  {auditLogs.map((log) => (
                    <div key={log.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs flex justify-between items-start">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[#0A2540] uppercase">{log.action_type}</span>
                          <span className="text-slate-400">•</span>
                          <span className="text-slate-600 font-medium">{log.domain}</span>
                        </div>
                        <p className="text-slate-700 mt-1">{log.change_reason || "Administrative update"}</p>
                        {log.old_value && log.new_value && (
                          <p className="text-[11px] font-mono text-slate-500 mt-1">
                            {JSON.stringify(log.old_value)} → {JSON.stringify(log.new_value)}
                          </p>
                        )}
                      </div>
                      <div className="text-right text-[11px] text-slate-400">
                        <p className="font-semibold text-slate-600">{log.admin_user}</p>
                        <p>{new Date(log.created_at).toLocaleString()}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-200 flex justify-between items-center bg-slate-50 rounded-b-xl">
          <button
            onClick={handleToggleStatus}
            disabled={actionLoading}
            className={`px-4 py-2 text-xs font-bold rounded-lg border transition-colors ${
              client.isActive
                ? 'border-rose-300 text-rose-700 bg-rose-50 hover:bg-rose-100'
                : 'border-emerald-300 text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
            }`}
          >
            {actionLoading ? "Processing..." : client.isActive ? "Freeze / Deactivate Account" : "Activate Client Account"}
          </button>

          <button onClick={onClose} className="px-5 py-2 text-sm font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-lg transition-colors">
            Close Profile
          </button>
        </div>
      </div>
    </div>
  );
}
