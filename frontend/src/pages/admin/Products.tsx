import { useState } from "react";
import { Link } from "react-router-dom";
import { Search, Plus, Upload, Eye, Edit, Trash2, RefreshCw, ChevronLeft, ChevronRight } from "lucide-react";
import { useShop } from "../../context/ShopContext";
import { resolveProductImage, handleProductImageError } from "../../utils/productImageResolver";
import ProductBulkImportModal from "../../components/admin/ProductBulkImportModal";

export default function AdminProducts() {
  const { products, loading, deleteProduct, refreshProducts } = useShop();
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [showImportModal, setShowImportModal] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  const filteredProducts = products.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) || 
                        p.sku.toLowerCase().includes(search.toLowerCase()) || 
                        p.brand.toLowerCase().includes(search.toLowerCase());
    const matchCategory = categoryFilter === "All" || p.category === categoryFilter;
    return matchSearch && matchCategory;
  });

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const paginatedProducts = filteredProducts.slice((safePage - 1) * pageSize, safePage * pageSize);

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshProducts();
      setCurrentPage(1);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleImportSuccess = () => {
    refreshProducts();
    setCurrentPage(1);
  };

  const handleCloseImportModal = () => {
    setShowImportModal(false);
    refreshProducts();
    setCurrentPage(1);
  };

  const handleDelete = (id: string) => {
    if (window.confirm("Are you sure you want to delete this product?")) {
      deleteProduct(id);
    }
  };

  return (
    <div className="space-y-6">
      {/* 2. Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#0A2540]">Products</h1>
          <p className="text-sm text-slate-500 mt-1">{filteredProducts.length} total products</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={isRefreshing || loading}
            title="Refresh product list"
            className="flex items-center gap-2 px-3 py-2 border border-slate-200 bg-white text-[#0A2540] text-sm font-semibold rounded-lg hover:bg-slate-50 transition-colors shadow-xs cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing || loading ? 'animate-spin text-blue-600' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button 
            type="button"
            onClick={() => setShowImportModal(true)}
            className="flex items-center gap-2 px-4 py-2 border border-slate-200 bg-white text-[#0A2540] text-sm font-semibold rounded-lg hover:bg-slate-50 transition-colors shadow-xs cursor-pointer"
          >
            <Upload className="w-4 h-4" />
            Import
          </button>
          <Link 
            to="/admin/products/add" 
            className="flex items-center gap-2 px-4 py-2 bg-[#F2A900] text-[#0A2540] text-sm font-bold rounded-lg hover:bg-[#e09b00] transition-colors shadow-xs"
          >
            <Plus className="w-4 h-4" />
            Add Product
          </Link>
        </div>
      </div>

      {/* 3. Search & Filter Toolbar */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            type="text" 
            placeholder="Search by name, SKU, or brand..." 
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-9 pr-3 py-2 border border-slate-200 rounded-lg outline-hidden focus:border-[#0A2540] text-sm"
          />
        </div>
        <select 
          value={categoryFilter}
          onChange={(e) => {
            setCategoryFilter(e.target.value);
            setCurrentPage(1);
          }}
          className="border border-slate-200 rounded-lg px-3 py-2 bg-slate-50 text-sm text-[#0A2540] font-medium outline-hidden focus:border-[#0A2540] sm:w-48"
        >
          <option value="All">All Categories</option>
          <option value="Fans">Fans</option>
          <option value="Wires & Cables">Wires & Cables</option>
          <option value="Switches">Switches</option>
          <option value="Lighting">Lighting</option>
          <option value="MCB & Protection">MCB & Protection</option>
        </select>
      </div>

      {/* 4. Products Data Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1000px]">
            <thead>
              <tr className="bg-slate-50/80">
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Product</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">SKU</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Brand</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider text-right">Price</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider">Stock</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">Status</th>
                <th className="px-5 py-3.5 text-xs font-semibold text-slate-500 uppercase tracking-wider text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {paginatedProducts.map(product => (
                <tr key={product.id} className="hover:bg-slate-50 transition-colors group">
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-center shrink-0 p-0.5 overflow-hidden">
                        <img
                          src={resolveProductImage(product)}
                          alt={product.name}
                          className="w-full h-full object-contain"
                          onError={(e) => handleProductImageError(e, product.category)}
                        />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-[#0A2540] line-clamp-1">{product.name}</p>
                        <p className="text-xs text-slate-500 mt-0.5">{product.category}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 text-sm font-mono text-slate-600">{product.sku}</td>
                  <td className="px-5 py-4 text-sm font-medium text-slate-700">{product.brand}</td>
                  <td className="px-5 py-4 text-sm font-bold text-[#0A2540] text-right">₹{product.price.toLocaleString("en-IN")}</td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold ${
                      product.stock === 0 ? "bg-red-100 text-red-700" : 
                      product.stock < 15 ? "bg-amber-100 text-amber-700" : 
                      "bg-slate-100 text-slate-700"
                    }`}>
                      {product.stock} units
                    </span>
                  </td>
                  <td className="px-5 py-4 text-center">
                    <span className={`inline-flex px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${
                      product.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
                    }`}>
                      {product.active ? "Active" : "Draft"}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-center">
                    <div className="flex items-center justify-center gap-2 transition-opacity">
                      <Link to={`/product/${product.id}`} className="p-1.5 text-slate-400 hover:text-[#0A2540] hover:bg-slate-100 rounded transition-colors" title="View">
                        <Eye className="w-4 h-4" />
                      </Link>
                      <Link to={`/admin/products/edit/${product.id}`} className="p-1.5 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors" title="Edit">
                        <Edit className="w-4 h-4" />
                      </Link>
                      <button onClick={() => handleDelete(product.id)} className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors" title="Delete">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-slate-500">
                    {loading ? "Loading products..." : "No products found matching your filters."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {filteredProducts.length > pageSize && (
          <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50/50 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-xs text-slate-500">
              Showing <span className="font-semibold text-slate-700">{(safePage - 1) * pageSize + 1}</span> to{" "}
              <span className="font-semibold text-slate-700">{Math.min(safePage * pageSize, filteredProducts.length)}</span> of{" "}
              <span className="font-semibold text-slate-700">{filteredProducts.length}</span> products
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={safePage <= 1}
                className="flex items-center gap-1 px-3 py-1.5 border border-slate-200 bg-white text-xs font-semibold rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Previous</span>
              </button>
              <span className="text-xs font-medium text-slate-600 px-2">
                Page {safePage} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={safePage >= totalPages}
                className="flex items-center gap-1 px-3 py-1.5 border border-slate-200 bg-white text-xs font-semibold rounded-lg text-slate-700 hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 5. Bulk Product Import Modal */}
      <ProductBulkImportModal
        isOpen={showImportModal}
        onClose={handleCloseImportModal}
        onSuccess={handleImportSuccess}
      />
    </div>
  );
}
