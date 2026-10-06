import { useState, useEffect, useCallback } from "react";
import {
  Users, Building2, IndianRupee, Search, Plus, Eye, Edit,
  ShieldCheck, ShieldAlert, CheckCircle, Ban, AlertCircle, RefreshCw
} from "lucide-react";
import ClientModal, { Client } from "../../components/admin/ClientModal";
import ClientViewModal from "../../components/admin/ClientViewModal";
import { financeApi, ClientsSummary } from "../../api/finance";
import { ClientItem } from "../../types/api";
import AdminPagination from "../../components/common/AdminPagination";

const money = (value: unknown): string => {
  if (value === null || value === undefined || value === "") return "—";
  const num = Number(value);
  return Number.isFinite(num) ? `₹${num.toLocaleString("en-IN")}` : "—";
};

const mapClient = (c: ClientItem): Client => ({
  id: String(c.client_code || `CLI-${c.id}`),
  rawId: c.id,
  clientCode: c.client_code,
  companyName: c.company_name,
  contactPerson: c.contact_person,
  gstin: c.gstin,
  pan: c.pan || (c.gstin ? c.gstin.slice(2, 12) : ''),
  state: c.state,
  email: c.email,
  phone: c.phone,
  creditLimit: Number(c.credit_limit || 0),
  creditExposure: Number(c.credit_exposure || 0),
  availableCredit: Number(c.available_credit ?? 0),
  totalInvoiced: Number(c.total_invoiced || 0),
  address: c.address || c.billing_address || '',
  isActive: c.is_active,
});

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');

  // Server-side pagination state driven by the backend envelope.
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [totalCount, setTotalCount] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // Database-wide aggregates for the KPI cards and tab counts.
  const [summary, setSummary] = useState<ClientsSummary | null>(null);

  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  // Debounce the search box so a request is not issued on every keystroke.
  useEffect(() => {
    const handle = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(handle);
  }, [search]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, pageSize]);

  const fetchSummary = useCallback(async () => {
    try {
      setSummary(await financeApi.getClientsSummary());
    } catch (err) {
      console.error("Failed to load client summary:", err);
      setSummary(null);
    }
  }, []);

  const fetchClients = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await financeApi.getClientsPaginated({
        search: debouncedSearch || undefined,
        is_active: statusFilter === 'all' ? undefined : statusFilter === 'active',
        page,
        page_size: pageSize,
      });
      const mapped: Client[] = (res.results || []).map(mapClient);
      setClients(mapped);
      setTotalCount(typeof res.count === "number" ? res.count : mapped.length);
      setTotalPages(res.total_pages || Math.ceil((res.count || 1) / pageSize) || 1);
    } catch (err: any) {
      console.error("Failed to fetch clients from backend:", err);
      setError(err?.message || "Failed to load clients from API.");
      setClients([]);
      setTotalCount(0);
      setTotalPages(1);
    } finally {
      setLoading(false);
    }
  }, [debouncedSearch, statusFilter, page, pageSize]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  useEffect(() => {
    fetchSummary();
  }, [fetchSummary]);

  const refreshAll = async () => {
    await Promise.all([fetchClients(), fetchSummary()]);
  };

  const handleCreateNew = () => {
    setSelectedClient(null);
    setIsEditModalOpen(true);
  };

  const handleEditClient = (client: Client) => {
    setSelectedClient(client);
    setIsEditModalOpen(true);
  };

  const handleViewClient = (client: Client) => {
    setSelectedClient(client);
    setIsViewModalOpen(true);
  };

  const handleToggleActive = async (client: Client, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!client.rawId) return;
    try {
      if (client.isActive) {
        await financeApi.deactivateClient(client.rawId, "Quick deactivation from directory");
      } else {
        await financeApi.activateClient(client.rawId, "Quick activation from directory");
      }
      await refreshAll();
    } catch (err: any) {
      alert(err?.message || "Failed to toggle client status.");
    }
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
          address: data.address,
        });

        // If credit limit changed and reason provided, adjust through dedicated audited endpoint
        if (data.creditLimit !== undefined && data.creditLimit !== selectedClient.creditLimit) {
          await financeApi.adjustCreditLimit(selectedClient.rawId, data.creditLimit, data.reason || "Credit limit adjusted via Admin UI");
        }
      } else {
        await financeApi.createClient({
          company_name: data.companyName,
          contact_person: data.contactPerson,
          gstin: data.gstin,
          email: data.email,
          phone: data.phone,
          credit_limit: data.creditLimit || 0,
          address: data.address || '',
        });
      }
      setIsEditModalOpen(false);
      await refreshAll();
    } catch (err: any) {
      console.error("Failed to save client:", err);
      alert(err?.message || "Failed to save client to backend API.");
    }
  };

  const activeCount = summary?.active_count ?? null;
  const inactiveCount = summary?.inactive_count ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0A2540]">Clients Directory</h1>
          <p className="text-sm text-slate-500 mt-1">Manage B2B corporate buyers, legal GSTIN registration, and authoritative credit headroom.</p>
        </div>
        <button
          onClick={handleCreateNew}
          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-[#F2A900] text-[#0A2540] text-sm font-bold rounded-lg hover:bg-[#e09b00] transition-colors shadow-sm whitespace-nowrap self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          Add New Client
        </button>
      </div>

      {/* KPI Cards — database-wide backend aggregates. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Total Clients</p>
            <p className="text-2xl font-bold text-[#0A2540]" data-testid="client-kpi-total">
              {summary ? summary.total_count.toLocaleString("en-IN") : "—"}
            </p>
            <p className="text-xs text-slate-400 mt-1">{activeCount === null ? "—" : `${activeCount.toLocaleString("en-IN")} active corporate accounts`}</p>
          </div>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-blue-50 text-blue-600">
            <Users className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Active Accounts</p>
            <p className="text-2xl font-bold text-emerald-600">{activeCount === null ? "—" : activeCount.toLocaleString("en-IN")}</p>
            <p className="text-xs text-slate-400 mt-1">{inactiveCount === null ? "—" : `${inactiveCount.toLocaleString("en-IN")} accounts deactivated`}</p>
          </div>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-emerald-50 text-emerald-600">
            <Building2 className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Total Credit Facility</p>
            <p className="text-2xl font-bold text-[#0A2540]">{money(summary?.total_credit_limit)}</p>
            <p className="text-xs text-slate-400 mt-1">Aggregated approved ceiling</p>
          </div>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-indigo-50 text-indigo-600">
            <IndianRupee className="w-6 h-6" />
          </div>
        </div>

        <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">Outstanding Exposure</p>
            <p className="text-2xl font-bold text-amber-600">{money(summary?.total_exposure)}</p>
            <p className="text-xs text-slate-400 mt-1">Real-time unpaid invoices</p>
          </div>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-amber-50 text-amber-600">
            <IndianRupee className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Main Content Card */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
        {/* Controls Header */}
        <div className="p-5 border-b border-slate-200 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div className="flex items-center gap-2">
            {(['all', 'active', 'inactive'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setStatusFilter(tab)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition-colors ${
                  statusFilter === tab
                    ? 'bg-[#0A2540] text-white shadow-sm'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {tab} ({tab === 'all'
                  ? (summary ? summary.total_count : '—')
                  : tab === 'active'
                    ? (activeCount ?? '—')
                    : (inactiveCount ?? '—')})
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="relative flex-1 md:w-72">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search company, code, GSTIN..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg outline-none focus:border-[#0A2540] text-sm"
              />
            </div>
            <button
              onClick={refreshAll}
              className="p-2 border border-slate-200 text-slate-600 hover:bg-slate-50 rounded-lg transition-colors"
              title="Refresh Directory"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="m-5 p-4 bg-rose-50 border border-rose-200 rounded-lg flex items-center justify-between text-rose-700 text-sm">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
            <button onClick={fetchClients} className="text-xs font-bold underline hover:no-underline">
              Retry
            </button>
          </div>
        )}

        {/* Table View */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1050px]">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200">
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase">Company &amp; Code</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase">Contact Person</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase">GSTIN / State</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase text-right">Credit Limit</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase text-right">Outstanding</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase text-right">Available Credit</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase text-center">Status</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-[#0A2540]" />
                    <p className="text-sm font-medium">Loading authoritative B2B client records...</p>
                  </td>
                </tr>
              ) : clients.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-slate-500">
                    {error ? "Unable to load clients." : "No clients found matching current filter criteria."}
                  </td>
                </tr>
              ) : (
                clients.map(client => (
                  <tr key={client.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-5 py-4">
                      <p className="text-sm font-bold text-[#0A2540]">{client.companyName}</p>
                      <p className="text-xs font-mono text-slate-400 mt-0.5">{client.clientCode || client.id}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-sm font-medium text-slate-800">{client.contactPerson}</p>
                      <p className="text-xs text-slate-500">{client.email}</p>
                    </td>
                    <td className="px-5 py-4">
                      <p className="text-sm font-mono text-slate-700 font-semibold">{client.gstin}</p>
                      <p className="text-xs text-slate-400">{client.state || "State Registered"}</p>
                    </td>
                    <td className="px-5 py-4 text-sm font-bold text-[#0A2540] text-right">
                      ₹{(client.creditLimit || 0).toLocaleString("en-IN")}
                    </td>
                    <td className="px-5 py-4 text-sm font-bold text-amber-700 text-right">
                      ₹{(client.creditExposure || 0).toLocaleString("en-IN")}
                    </td>
                    <td className="px-5 py-4 text-sm font-bold text-emerald-700 text-right">
                      ₹{(client.availableCredit ?? 0).toLocaleString("en-IN")}
                    </td>
                    <td className="px-5 py-4 text-center">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                        client.isActive
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}>
                        {client.isActive ? <ShieldCheck className="w-3 h-3" /> : <ShieldAlert className="w-3 h-3" />}
                        {client.isActive ? 'Active' : 'Frozen'}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button
                          onClick={() => handleViewClient(client)}
                          className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          title="View Ledger & Profile"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleEditClient(client)}
                          className="p-1.5 text-slate-400 hover:text-[#0A2540] hover:bg-slate-100 rounded transition-colors"
                          title="Edit Client Terms"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => handleToggleActive(client, e)}
                          className={`p-1.5 rounded transition-colors ${
                            client.isActive
                              ? 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                              : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                          }`}
                          title={client.isActive ? "Freeze / Deactivate" : "Activate Client"}
                        >
                          {client.isActive ? <Ban className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <AdminPagination
          totalCount={totalCount}
          page={page}
          pageSize={pageSize}
          totalPages={totalPages}
          label="clients"
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          disabled={loading || !!error}
        />
      </div>

      {/* Edit / Create Modal */}
      <ClientModal
        isOpen={isEditModalOpen}
        onClose={() => setIsEditModalOpen(false)}
        onSubmit={handleModalSubmit}
        initialData={selectedClient}
      />

      {/* Detail Profile Modal */}
      <ClientViewModal
        isOpen={isViewModalOpen}
        onClose={() => setIsViewModalOpen(false)}
        client={selectedClient}
        onClientUpdated={refreshAll}
      />
    </div>
  );
}
