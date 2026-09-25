import { useState, useEffect } from "react";
import { Users, Building2, IndianRupee, Search, Plus, Eye, Edit } from "lucide-react";
import ClientModal, { Client } from "../../components/admin/ClientModal";
import ClientViewModal from "../../components/admin/ClientViewModal";
import { financeApi } from "../../api/finance";
import { ClientItem } from "../../types/api";

export default function ClientsPage() {
  const [clients, setClients] = useState<(Client & { rawId?: number | string })[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<(Client & { rawId?: number | string }) | null>(null);

  const fetchClients = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await financeApi.getClients();
      const mapped = data.map((c: ClientItem) => ({
        id: String(c.client_code || `CLI-${c.id}`),
        rawId: c.id,
        companyName: c.company_name,
        contactPerson: c.contact_person,
        gstin: c.gstin,
        email: c.email,
        phone: c.phone,
        creditLimit: Number(c.credit_limit || 0),
        totalInvoiced: 0,
      }));
      setClients(mapped);
    } catch (err: any) {
      console.error("Failed to fetch clients from backend:", err);
      setError(err?.message || "Failed to load clients from API.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);

  const handleCreateNew = () => {
    setSelectedClient(null);
    setIsEditModalOpen(true);
  };

  const handleEditClient = (client: Client & { rawId?: number | string }) => {
    setSelectedClient(client);
    setIsEditModalOpen(true);
  };

  const handleViewClient = (client: Client & { rawId?: number | string }) => {
    setSelectedClient(client);
    setIsViewModalOpen(true);
  };

  const handleModalSubmit = async (data: Partial<Client>) => {
    try {
      if (selectedClient && selectedClient.rawId) {
        await financeApi.updateClient(selectedClient.rawId, {
          company_name: data.companyName,
          contact_person: data.contactPerson,
          gstin: data.gstin,
          email: data.email,
          phone: data.phone,
          credit_limit: data.creditLimit,
        });
      } else {
        await financeApi.createClient({
          company_name: data.companyName,
          contact_person: data.contactPerson,
          gstin: data.gstin,
          email: data.email,
          phone: data.phone,
          credit_limit: data.creditLimit || 0,
        });
      }
      await fetchClients();
    } catch (err: any) {
      console.error("Failed to save client:", err);
      alert(err?.message || "Failed to save client to backend API.");
    } finally {
      setIsEditModalOpen(false);
    }
  };

  const filteredClients = clients.filter(c => 
    c.companyName.toLowerCase().includes(search.toLowerCase()) || 
    c.contactPerson.toLowerCase().includes(search.toLowerCase()) ||
    c.gstin.toLowerCase().includes(search.toLowerCase())
  );

  const totalCreditLimit = clients.reduce((sum, c) => sum + c.creditLimit, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0A2540]">Clients Directory</h1>
        <p className="text-sm text-slate-500 mt-1">Manage B2B corporate buyers and their credit limits.</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {[
          { title: "Total Clients", value: clients.length.toString(), icon: <Users className="w-6 h-6 text-blue-600" />, bg: "bg-blue-100" },
          { title: "Active B2B Accounts", value: clients.length.toString(), icon: <Building2 className="w-6 h-6 text-emerald-600" />, bg: "bg-emerald-100" },
          { title: "Total Outstanding Credit", value: `₹${totalCreditLimit.toLocaleString("en-IN")}`, icon: <IndianRupee className="w-6 h-6 text-amber-600" />, bg: "bg-amber-100" },
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
          <h2 className="font-bold text-[#0A2540]">Client List</h2>
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                placeholder="Search clients..." 
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#0A2540] text-sm"
              />
            </div>
            <button onClick={handleCreateNew} className="flex items-center justify-center gap-2 px-4 py-2 bg-[#F2A900] text-[#0A2540] text-sm font-bold rounded-lg hover:bg-[#e09b00] transition-colors shadow-sm whitespace-nowrap">
              <Plus className="w-4 h-4" />
              Add New Client
            </button>
          </div>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead>
              <tr className="bg-slate-50/80">
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase">Company Name</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase">Contact Person</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase">GSTIN</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase">Contact Info</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase text-right">Credit Limit (₹)</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase text-right">Total Invoiced (₹)</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase text-center">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredClients.map(client => (
                <tr key={client.id} className="hover:bg-slate-50 transition-colors">
                  <td className="px-5 py-4">
                    <p className="text-sm font-bold text-[#0A2540]">{client.companyName}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{client.id}</p>
                  </td>
                  <td className="px-5 py-4 text-sm font-medium text-slate-700">{client.contactPerson}</td>
                  <td className="px-5 py-4 text-sm font-mono text-slate-600">{client.gstin}</td>
                  <td className="px-5 py-4">
                    <p className="text-sm text-slate-700">{client.email}</p>
                    <p className="text-xs text-slate-500">{client.phone}</p>
                  </td>
                  <td className="px-5 py-4 text-sm font-bold text-[#0A2540] text-right">₹{client.creditLimit.toLocaleString("en-IN")}</td>
                  <td className="px-5 py-4 text-sm font-bold text-emerald-600 text-right">₹{client.totalInvoiced.toLocaleString("en-IN")}</td>
                  <td className="px-5 py-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={() => handleViewClient(client)} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="View Details">
                        <Eye className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleEditClient(client)} className="p-1.5 text-slate-400 hover:text-[#0A2540] hover:bg-slate-100 rounded transition-colors" title="Edit Client">
                        <Edit className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredClients.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-slate-500">No clients found matching your search.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
      
      <ClientModal 
        isOpen={isEditModalOpen} 
        onClose={() => setIsEditModalOpen(false)} 
        onSubmit={handleModalSubmit} 
        initialData={selectedClient} 
      />

      <ClientViewModal 
        isOpen={isViewModalOpen} 
        onClose={() => setIsViewModalOpen(false)} 
        client={selectedClient} 
      />
    </div>
  );
}
