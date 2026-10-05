import { useState, useEffect, useCallback, useRef } from "react";
import {
  Users, UserCheck, UserX, UserPlus, Search, X, 
  IndianRupee, ArrowUpDown, ChevronLeft, ChevronRight,
  Eye, Edit, Ban, CheckCircle2, RefreshCw, AlertTriangle,
  MapPin, ShoppingCart, Filter, Plus, ShieldCheck, ShieldAlert
} from "lucide-react";
import { customersApi } from "../../api/customers";
import { 
  Customer, 
  CustomerSummary, 
  CustomerDetail, 
  CustomerFilters, 
  CustomerCreateInput, 
  CustomerUpdateInput,
  PaginatedResponse 
} from "../../types/api";
import CustomerModal from "../../components/admin/CustomerModal";
import CustomerViewModal from "../../components/admin/CustomerViewModal";

const SORT_OPTIONS = [
  { label: "Newest First", value: "newest" },
  { label: "Oldest First", value: "oldest" },
  { label: "Name (A-Z)", value: "name_asc" },
  { label: "Name (Z-A)", value: "name_desc" },
  { label: "Highest Total Spent", value: "spent_desc" },
  { label: "Lowest Total Spent", value: "spent_asc" },
  { label: "Most Orders", value: "orders_desc" },
  { label: "Highest Outstanding", value: "outstanding_desc" },
];

export default function CustomersPage() {
  // Data states
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [summary, setSummary] = useState<CustomerSummary | null>(null);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [totalPages, setTotalPages] = useState(1);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'b2b' | 'b2c'>('all');
  const [ordering, setOrdering] = useState("newest");

  // Loading & error states
  const [loadingList, setLoadingList] = useState(true);
  const [loadingSummary, setLoadingSummary] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Modal states
  const [isCreateEditModalOpen, setIsCreateEditModalOpen] = useState(false);
  const [isViewModalOpen, setIsViewModalOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<number | null>(null);
  const [customerToEdit, setCustomerToEdit] = useState<Customer | null>(null);

  // Request race condition guard
  const listRequestIdRef = useRef(0);

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Debounce search input by 300ms
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery);
      setPage(1);
    }, 300);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Load database-wide customer summary
  const loadSummary = useCallback(async () => {
    setLoadingSummary(true);
    setSummaryError(null);
    try {
      const data = await customersApi.getCustomerSummary();
      setSummary(data);
    } catch (err: any) {
      console.error("Failed to load customer summary:", err);
      setSummaryError(err?.message || "Failed to load summary metrics from database.");
    } finally {
      setLoadingSummary(false);
    }
  }, []);

  // Load paginated customer list
  const loadCustomers = useCallback(async () => {
    const requestId = ++listRequestIdRef.current;
    setLoadingList(true);
    setListError(null);

    const filterPayload: CustomerFilters = {
      search: debouncedSearch || undefined,
      status: statusFilter,
      customer_type: typeFilter,
      ordering,
      page,
      page_size: pageSize,
    };

    try {
      const res: PaginatedResponse<Customer> = await customersApi.getCustomers(filterPayload);
      if (requestId !== listRequestIdRef.current) return;

      setCustomers(res.results || []);
      setTotalCount(res.count ?? (res.results ? res.results.length : 0));
      setTotalPages(res.total_pages || Math.ceil((res.count || 1) / pageSize) || 1);
    } catch (err: any) {
      if (requestId !== listRequestIdRef.current) return;
      console.error("Failed to load customer records:", err);
      setListError(err?.message || "Failed to load customer records from server.");
    } finally {
      if (requestId === listRequestIdRef.current) {
        setLoadingList(false);
      }
    }
  }, [debouncedSearch, statusFilter, typeFilter, ordering, page, pageSize]);

  useEffect(() => {
    loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);

  // Handle status filter change
  const handleStatusFilterChange = (status: 'all' | 'active' | 'inactive') => {
    setStatusFilter(status);
    setPage(1);
  };

  // Handle type filter change
  const handleTypeFilterChange = (type: 'all' | 'b2b' | 'b2c') => {
    setTypeFilter(type);
    setPage(1);
  };

  // Handle sort change
  const handleSortChange = (newOrder: string) => {
    setOrdering(newOrder);
    setPage(1);
  };

  // Reset all filters
  const handleClearFilters = () => {
    setSearchQuery("");
    setDebouncedSearch("");
    setStatusFilter('all');
    setTypeFilter('all');
    setOrdering("newest");
    setPage(1);
  };

  // Create customer submission
  const handleCreateCustomer = async (data: CustomerCreateInput) => {
    await customersApi.createCustomer(data);
    showToast("Customer account created successfully.");
    loadCustomers();
    loadSummary();
  };

  // Update customer submission
  const handleUpdateCustomer = async (id: number, data: CustomerUpdateInput) => {
    await customersApi.updateCustomer(id, data);
    showToast("Customer profile updated successfully.");
    loadCustomers();
    loadSummary();
  };

  // Quick toggle customer status
  const handleQuickToggleStatus = async (customer: Customer, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const updated = await customersApi.toggleCustomerStatus(customer.id, !customer.is_active);
      setCustomers(prev => prev.map(c => c.id === customer.id ? { ...c, is_active: updated.is_active } : c));
      showToast(`Customer account ${updated.is_active ? "activated" : "deactivated"} successfully.`);
      loadSummary();
    } catch (err: any) {
      alert(err?.message || "Failed to toggle customer status.");
    }
  };

  // Open view modal
  const handleViewCustomer = (customerId: number) => {
    setSelectedCustomerId(customerId);
    setIsViewModalOpen(true);
  };

  // Open edit modal
  const handleEditCustomer = (customer: Customer, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setCustomerToEdit(customer);
    setIsCreateEditModalOpen(true);
  };

  // Open create modal
  const handleOpenCreateModal = () => {
    setCustomerToEdit(null);
    setIsCreateEditModalOpen(true);
  };

  const hasActiveFilters = searchQuery !== "" || statusFilter !== 'all' || typeFilter !== 'all' || ordering !== 'newest';

  // Calculate pagination slice range for user display
  const startItem = totalCount === 0 || totalCount === null ? 0 : (page - 1) * pageSize + 1;
  const endItem = totalCount === null ? 0 : Math.min(page * pageSize, totalCount);

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-[#0B3A63] text-white px-5 py-3 rounded-xl shadow-2xl flex items-center gap-3 text-sm animate-in fade-in slide-in-from-bottom-3 duration-200">
          <span className="text-amber-400 font-bold">⚡</span>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0A2540]">Customer Management</h1>
          <p className="text-sm text-slate-500 mt-1">
            Authoritative directory of registered retail buyers, commercial clients, address books, and transaction records.
          </p>
        </div>

        <div className="flex items-center gap-3 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => {
              loadCustomers();
              loadSummary();
            }}
            disabled={loadingList || loadingSummary}
            className="p-2.5 text-slate-600 bg-white border border-[#D9E1E8] hover:bg-slate-50 hover:text-slate-900 rounded-xl transition-colors shadow-2xs"
            title="Refresh database records"
            aria-label="Refresh customer data"
          >
            <RefreshCw className={`w-4 h-4 ${loadingList || loadingSummary ? "animate-spin text-[#0B3A63]" : ""}`} />
          </button>

          <button
            type="button"
            onClick={handleOpenCreateModal}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#F2A900] hover:bg-[#d99800] text-[#0A2540] text-sm font-bold rounded-xl transition-colors shadow-2xs whitespace-nowrap cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Customer</span>
          </button>
        </div>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {/* Total Customers */}
        <div className="bg-white rounded-xl border border-[#D9E1E8] p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Total</span>
            <Users className="w-4 h-4 text-[#0B3A63]" />
          </div>
          <span className="text-2xl font-bold text-[#0A2540] block">
            {loadingSummary ? "—" : summary?.total_customers?.toLocaleString("en-IN") ?? "—"}
          </span>
          <span className="text-[11px] text-slate-400 mt-1 block">Registered accounts</span>
        </div>

        {/* Active Customers */}
        <div className="bg-white rounded-xl border border-[#D9E1E8] p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Active</span>
            <UserCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <span className="text-2xl font-bold text-emerald-600 block">
            {loadingSummary ? "—" : summary?.active_customers?.toLocaleString("en-IN") ?? "—"}
          </span>
          <span className="text-[11px] text-slate-400 mt-1 block">Enabled logins</span>
        </div>

        {/* Inactive Customers */}
        <div className="bg-white rounded-xl border border-[#D9E1E8] p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Inactive</span>
            <UserX className="w-4 h-4 text-rose-500" />
          </div>
          <span className="text-2xl font-bold text-rose-600 block">
            {loadingSummary ? "—" : summary?.inactive_customers?.toLocaleString("en-IN") ?? "—"}
          </span>
          <span className="text-[11px] text-slate-400 mt-1 block">Suspended accounts</span>
        </div>

        {/* New in 30 Days */}
        <div className="bg-white rounded-xl border border-[#D9E1E8] p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">New (30d)</span>
            <UserPlus className="w-4 h-4 text-blue-600" />
          </div>
          <span className="text-2xl font-bold text-blue-600 block">
            {loadingSummary ? "—" : summary?.new_customers_30d?.toLocaleString("en-IN") ?? "—"}
          </span>
          <span className="text-[11px] text-slate-400 mt-1 block">Recent sign-ups</span>
        </div>

        {/* Total Order Spent */}
        <div className="bg-white rounded-xl border border-[#D9E1E8] p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Sales</span>
            <IndianRupee className="w-4 h-4 text-emerald-600" />
          </div>
          <span className="text-xl font-bold text-[#0A2540] block truncate">
            {loadingSummary ? "—" : `₹${Number(summary?.total_spent || 0).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
          </span>
          <span className="text-[11px] text-slate-400 mt-1 block truncate">Completed orders</span>
        </div>

        {/* Outstanding Balance */}
        <div className="bg-white rounded-xl border border-[#D9E1E8] p-4 shadow-2xs">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Outstanding</span>
            <IndianRupee className="w-4 h-4 text-amber-500" />
          </div>
          <span className="text-xl font-bold text-amber-600 block truncate">
            {loadingSummary ? "—" : `₹${Number(summary?.total_outstanding || 0).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`}
          </span>
          <span className="text-[11px] text-slate-400 mt-1 block truncate">Pending settlement</span>
        </div>
      </div>

      {summaryError && (
        <div className="p-3 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
          <span>Notice: Metric KPIs could not sync ({summaryError}). Table records below remain available.</span>
        </div>
      )}

      {/* Search & Filter Toolbar */}
      <div className="bg-white rounded-xl border border-[#D9E1E8] p-4 shadow-2xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Server-Side Search with Debounce */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by name, email, phone, or customer ID..."
              className="w-full pl-9 pr-9 py-2 text-sm rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-[#0B3A63]/20 focus:border-[#0B3A63] transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                aria-label="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Filters and Sorters */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* Status Filter */}
            <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50 text-xs font-semibold">
              <button
                type="button"
                onClick={() => handleStatusFilterChange('all')}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  statusFilter === 'all' ? "bg-white text-[#0B3A63] shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => handleStatusFilterChange('active')}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  statusFilter === 'active' ? "bg-white text-emerald-700 shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Active
              </button>
              <button
                type="button"
                onClick={() => handleStatusFilterChange('inactive')}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  statusFilter === 'inactive' ? "bg-white text-rose-700 shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Inactive
              </button>
            </div>

            {/* Customer Type Filter */}
            <div className="inline-flex rounded-lg border border-slate-200 p-0.5 bg-slate-50 text-xs font-semibold">
              <button
                type="button"
                onClick={() => handleTypeFilterChange('all')}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  typeFilter === 'all' ? "bg-white text-[#0B3A63] shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                All Types
              </button>
              <button
                type="button"
                onClick={() => handleTypeFilterChange('b2c')}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  typeFilter === 'b2c' ? "bg-white text-blue-700 shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Retail (B2C)
              </button>
              <button
                type="button"
                onClick={() => handleTypeFilterChange('b2b')}
                className={`px-3 py-1.5 rounded-md transition-colors ${
                  typeFilter === 'b2b' ? "bg-white text-amber-700 shadow-xs" : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Business (B2B)
              </button>
            </div>

            {/* Sort Selector */}
            <div className="relative">
              <select
                value={ordering}
                onChange={e => handleSortChange(e.target.value)}
                className="pl-3 pr-8 py-1.5 text-xs font-semibold rounded-lg border border-slate-300 bg-white text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-[#0B3A63]/20 focus:border-[#0B3A63]"
                aria-label="Sort customers"
              >
                {SORT_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    Sort: {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Clear Filters Button */}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleClearFilters}
                className="text-xs font-semibold text-rose-600 hover:text-rose-800 px-2 py-1.5 hover:bg-rose-50 rounded-lg transition-colors flex items-center gap-1"
              >
                <X className="w-3.5 h-3.5" /> Clear Filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Customer Table Surface */}
      <div className="bg-white rounded-xl border border-[#D9E1E8] shadow-2xs overflow-hidden">
        {/* Error State */}
        {listError && !loadingList && (
          <div className="p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-slate-800 text-base">Unable to load customer directory</h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">{listError}</p>
            <button
              type="button"
              onClick={loadCustomers}
              className="px-4 py-2 bg-[#0B3A63] text-white text-xs font-semibold rounded-lg hover:bg-[#082a47] transition-colors"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Loading Skeletons */}
        {loadingList && (
          <div className="p-6 space-y-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="flex items-center gap-4 animate-pulse">
                <div className="w-10 h-10 rounded-full bg-slate-200 shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-slate-200 rounded w-1/4" />
                  <div className="h-3 bg-slate-100 rounded w-1/3" />
                </div>
                <div className="w-24 h-4 bg-slate-200 rounded hidden sm:block" />
                <div className="w-16 h-6 bg-slate-200 rounded-full" />
                <div className="w-16 h-4 bg-slate-200 rounded hidden md:block" />
              </div>
            ))}
          </div>
        )}

        {/* Table Content */}
        {!loadingList && !listError && customers.length > 0 && (
          <>
            {/* Desktop & Tablet Table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-[#E5E9EB] bg-[#F8FAFC] text-slate-600 font-semibold uppercase tracking-wider">
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-4">Customer ID</th>
                    <th className="py-3 px-4">Contact</th>
                    <th className="py-3 px-4">Type</th>
                    <th className="py-3 px-4 text-center">Orders</th>
                    <th className="py-3 px-4 text-right">Total Spent</th>
                    <th className="py-3 px-4 text-right">Outstanding</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4">Created Date</th>
                    <th className="py-3 px-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#E5E9EB]">
                  {customers.map(cust => (
                    <tr 
                      key={cust.id}
                      onClick={() => handleViewCustomer(cust.id)}
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                    >
                      {/* Customer Name & Avatar */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-[#0B3A63]/10 border border-[#0B3A63]/20 flex items-center justify-center font-bold text-[#0B3A63] text-sm shrink-0">
                            {cust.first_name ? cust.first_name[0].toUpperCase() : "C"}
                          </div>
                          <div className="min-w-0">
                            <span className="font-bold text-slate-800 text-sm block truncate group-hover:text-[#0B3A63] transition-colors">
                              {cust.name}
                            </span>
                            <span className="text-[11px] text-slate-400 block truncate">{cust.email}</span>
                          </div>
                        </div>
                      </td>

                      {/* Customer ID */}
                      <td className="py-3 px-4 font-mono font-medium text-slate-600">
                        {cust.customer_id}
                      </td>

                      {/* Phone & Contact */}
                      <td className="py-3 px-4 text-slate-600">
                        {cust.phone ? (
                          <span>{cust.phone}</span>
                        ) : (
                          <span className="text-slate-400 italic">No phone</span>
                        )}
                      </td>

                      {/* Customer Type Badge */}
                      <td className="py-3 px-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          cust.customer_type === 'B2B'
                            ? "bg-amber-100 text-amber-800 border border-amber-200"
                            : "bg-blue-50 text-blue-700 border border-blue-200"
                        }`}>
                          {cust.customer_type}
                        </span>
                      </td>

                      {/* Orders Count */}
                      <td className="py-3 px-4 text-center font-semibold text-slate-700">
                        {cust.orders_count}
                      </td>

                      {/* Total Spent */}
                      <td className="py-3 px-4 text-right font-bold text-slate-900">
                        ₹{Number(cust.total_spent || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </td>

                      {/* Outstanding */}
                      <td className="py-3 px-4 text-right font-semibold">
                        <span className={Number(cust.outstanding_balance || 0) > 0 ? "text-amber-600 font-bold" : "text-slate-500"}>
                          ₹{Number(cust.outstanding_balance || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                        </span>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 text-center">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                          cust.is_active
                            ? "bg-emerald-100 text-emerald-800"
                            : "bg-rose-100 text-rose-800"
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${cust.is_active ? "bg-emerald-600" : "bg-rose-600"}`} />
                          {cust.is_active ? "Active" : "Inactive"}
                        </span>
                      </td>

                      {/* Created Date */}
                      <td className="py-3 px-4 text-slate-500 text-[11px]">
                        {cust.created_at ? new Date(cust.created_at).toLocaleDateString("en-IN", {
                          year: "numeric",
                          month: "short",
                          day: "numeric",
                        }) : "—"}
                      </td>

                      {/* Row Actions */}
                      <td className="py-3 px-4 text-center" onClick={e => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleViewCustomer(cust.id)}
                            className="p-1.5 text-slate-500 hover:text-[#0B3A63] hover:bg-slate-100 rounded-lg transition-colors"
                            title="View Profile Details"
                            aria-label={`View ${cust.name}`}
                          >
                            <Eye className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={e => handleEditCustomer(cust, e)}
                            className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-slate-100 rounded-lg transition-colors"
                            title="Edit Customer"
                            aria-label={`Edit ${cust.name}`}
                          >
                            <Edit className="w-4 h-4" />
                          </button>

                          <button
                            type="button"
                            onClick={e => handleQuickToggleStatus(cust, e)}
                            className={`p-1.5 rounded-lg transition-colors ${
                              cust.is_active
                                ? "text-slate-500 hover:text-amber-600 hover:bg-slate-100"
                                : "text-slate-500 hover:text-emerald-600 hover:bg-slate-100"
                            }`}
                            title={cust.is_active ? "Deactivate Customer" : "Activate Customer"}
                            aria-label={cust.is_active ? `Deactivate ${cust.name}` : `Activate ${cust.name}`}
                          >
                            {cust.is_active ? <Ban className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Mobile Card Layout (Prevents Broken Horizontal Overflow) */}
            <div className="md:hidden divide-y divide-slate-100">
              {customers.map(cust => (
                <div
                  key={cust.id}
                  onClick={() => handleViewCustomer(cust.id)}
                  className="p-4 space-y-3 hover:bg-slate-50/80 transition-colors cursor-pointer"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#0B3A63]/10 border border-[#0B3A63]/20 flex items-center justify-center font-bold text-[#0B3A63] text-sm shrink-0">
                        {cust.first_name ? cust.first_name[0].toUpperCase() : "C"}
                      </div>
                      <div>
                        <span className="font-bold text-slate-800 text-sm block">{cust.name}</span>
                        <span className="text-xs text-slate-400 block">{cust.email}</span>
                      </div>
                    </div>

                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-semibold ${
                      cust.is_active ? "bg-emerald-100 text-emerald-800" : "bg-rose-100 text-rose-800"
                    }`}>
                      {cust.is_active ? "Active" : "Inactive"}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-100 text-slate-600">
                    <div>
                      <span className="text-slate-400 block text-[11px]">ID & Type</span>
                      <span className="font-mono font-medium">{cust.customer_id}</span> ({cust.customer_type})
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Phone</span>
                      <span>{cust.phone || "—"}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Orders</span>
                      <span className="font-semibold text-slate-800">{cust.orders_count} orders</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[11px]">Total Spent</span>
                      <span className="font-bold text-slate-900">
                        ₹{Number(cust.total_spent || 0).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t border-slate-100" onClick={e => e.stopPropagation()}>
                    <button
                      type="button"
                      onClick={() => handleViewCustomer(cust.id)}
                      className="px-3 py-1.5 text-xs font-semibold text-[#0B3A63] bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1"
                    >
                      <Eye className="w-3.5 h-3.5" /> View
                    </button>
                    <button
                      type="button"
                      onClick={e => handleEditCustomer(cust, e)}
                      className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1"
                    >
                      <Edit className="w-3.5 h-3.5" /> Edit
                    </button>
                    <button
                      type="button"
                      onClick={e => handleQuickToggleStatus(cust, e)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1 ${
                        cust.is_active
                          ? "text-amber-700 bg-amber-50 hover:bg-amber-100"
                          : "text-emerald-700 bg-emerald-50 hover:bg-emerald-100"
                      }`}
                    >
                      {cust.is_active ? <Ban className="w-3.5 h-3.5" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                      {cust.is_active ? "Suspend" : "Activate"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        {/* Empty States (Differentiated) */}
        {!loadingList && !listError && customers.length === 0 && (
          <div className="py-16 text-center space-y-3">
            <div className="w-14 h-14 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <Users className="w-7 h-7" />
            </div>

            {searchQuery ? (
              <>
                <h3 className="font-bold text-slate-800 text-base">No customers found for "{searchQuery}"</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  We couldn't find any customer matching your search. Check for typos or try searching with an email, phone, or numeric ID.
                </p>
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors"
                >
                  Clear Search
                </button>
              </>
            ) : hasActiveFilters ? (
              <>
                <h3 className="font-bold text-slate-800 text-base">No customers match active filters</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Try adjusting or clearing your status and customer type filter settings.
                </p>
                <button
                  type="button"
                  onClick={handleClearFilters}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors"
                >
                  Reset Filters
                </button>
              </>
            ) : (
              <>
                <h3 className="font-bold text-slate-800 text-base">No customer accounts registered</h3>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Get started by onboarding your first retail buyer or corporate customer.
                </p>
                <button
                  type="button"
                  onClick={handleOpenCreateModal}
                  className="px-4 py-2 bg-[#F2A900] hover:bg-[#d99800] text-[#0A2540] text-xs font-bold rounded-lg transition-colors shadow-2xs"
                >
                  + Add First Customer
                </button>
              </>
            )}
          </div>
        )}

        {/* Server-Side Pagination Footer */}
        {!loadingList && !listError && totalCount !== null && totalCount > 0 && (
          <div className="bg-[#F8FAFC] border-t border-[#E5E9EB] p-4 px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-600">
            <div>
              Showing <strong className="text-slate-800">{startItem}</strong> to{" "}
              <strong className="text-slate-800">{endItem}</strong> of{" "}
              <strong className="text-slate-800">{totalCount.toLocaleString("en-IN")}</strong> customers
            </div>

            <div className="flex items-center gap-4">
              {/* Page size picker */}
              <div className="flex items-center gap-2">
                <span className="text-slate-500">Per page:</span>
                <select
                  value={pageSize}
                  onChange={e => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                  className="px-2 py-1 bg-white border border-slate-300 rounded text-xs font-semibold text-slate-700 focus:outline-hidden"
                >
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
              </div>

              {/* Prev / Page / Next controls */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage(prev => Math.max(1, prev - 1))}
                  disabled={page <= 1}
                  className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                <span className="px-3 py-1 font-semibold text-slate-700">
                  Page {page} of {totalPages}
                </span>

                <button
                  type="button"
                  onClick={() => setPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={page >= totalPages}
                  className="p-1.5 rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  aria-label="Next page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Create / Edit Customer Modal */}
      <CustomerModal
        isOpen={isCreateEditModalOpen}
        onClose={() => setIsCreateEditModalOpen(false)}
        onSubmitCreate={handleCreateCustomer}
        onSubmitUpdate={handleUpdateCustomer}
        initialCustomer={customerToEdit}
      />

      {/* Customer Detail View Drawer/Modal */}
      <CustomerViewModal
        isOpen={isViewModalOpen}
        onClose={() => {
          setIsViewModalOpen(false);
          setSelectedCustomerId(null);
        }}
        customerId={selectedCustomerId}
        onCustomerUpdated={() => {
          loadCustomers();
          loadSummary();
        }}
        onEditRequested={cust => {
          setIsViewModalOpen(false);
          handleEditCustomer(cust);
        }}
      />
    </div>
  );
}
