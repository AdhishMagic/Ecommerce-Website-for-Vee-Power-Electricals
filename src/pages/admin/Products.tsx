import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { products as initialProducts } from "../../data/products";

export default function AdminProducts() {
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const navigate = useNavigate();

  const filtered = initialProducts.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) || p.sku.toLowerCase().includes(search.toLowerCase()) || p.brand.toLowerCase().includes(search.toLowerCase());
    const matchCat = !categoryFilter || p.category === categoryFilter;
    return matchSearch && matchCat;
  });

  return (
    <div>
      <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
        <div>
          <h1 className="text-xl font-bold text-[#0B3A63]">Products</h1>
          <p className="text-sm text-[#667085]">{initialProducts.length} total products</p>
        </div>
        <div className="flex gap-2">
          <Link to="/admin/import" className="border border-[#D9E1E8] bg-white hover:bg-[#F6F8FA] text-[#17212B] text-sm font-medium px-4 py-2.5 rounded-lg transition-colors">
            📤 Import
          </Link>
          <Link to="/admin/products/add" className="bg-[#0B3A63] hover:bg-[#1769AA] text-white text-sm font-medium px-4 py-2.5 rounded-lg transition-colors">
            + Add Product
          </Link>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-[#D9E1E8] rounded-xl p-4 mb-5 flex flex-wrap gap-3">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, SKU, brand..."
          className="flex-1 min-w-[200px] border border-[#D9E1E8] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#1769AA]"
        />
        <select
          value={categoryFilter}
          onChange={e => setCategoryFilter(e.target.value)}
          className="border border-[#D9E1E8] rounded-lg px-3 py-2 text-sm outline-none focus:border-[#1769AA] bg-white"
        >
          <option value="">All Categories</option>
          <option value="fans">Fans</option>
          <option value="wires">Wires & Cables</option>
          <option value="switches">Switches</option>
          <option value="lighting">LED & Lighting</option>
          <option value="mcb">MCB & Protection</option>
          <option value="accessories">Accessories</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white border border-[#D9E1E8] rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-[#F6F8FA] border-b border-[#D9E1E8]">
              <tr>
                <th className="text-left text-xs font-semibold text-[#667085] px-5 py-3 uppercase tracking-wider">Product</th>
                <th className="text-left text-xs font-semibold text-[#667085] px-3 py-3 uppercase tracking-wider">SKU</th>
                <th className="text-left text-xs font-semibold text-[#667085] px-3 py-3 uppercase tracking-wider">Brand</th>
                <th className="text-left text-xs font-semibold text-[#667085] px-3 py-3 uppercase tracking-wider">Price</th>
                <th className="text-left text-xs font-semibold text-[#667085] px-3 py-3 uppercase tracking-wider">Stock</th>
                <th className="text-left text-xs font-semibold text-[#667085] px-3 py-3 uppercase tracking-wider">Status</th>
                <th className="text-left text-xs font-semibold text-[#667085] px-3 py-3 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#D9E1E8]">
              {filtered.map(p => (
                <tr key={p.id} className="hover:bg-[#F6F8FA] transition-colors">
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <img src={p.images[0]} alt={p.name} className="w-10 h-10 object-cover rounded-lg bg-[#F6F8FA] flex-shrink-0" />
                      <p className="text-sm font-medium text-[#17212B] line-clamp-2 max-w-[220px]">{p.name}</p>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-xs font-mono text-[#667085]">{p.sku}</td>
                  <td className="px-3 py-3 text-sm text-[#667085]">{p.brand}</td>
                  <td className="px-3 py-3">
                    <p className="text-sm font-bold text-[#0B3A63]">₹{p.price.toLocaleString("en-IN")}</p>
                    <p className="text-xs text-[#667085] line-through">₹{p.mrp.toLocaleString("en-IN")}</p>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${p.stock === 0 ? "bg-[#FEF2F2] text-[#C0392B]" : p.stock <= p.lowStockThreshold ? "bg-[#FFFBEB] text-[#B45309]" : "bg-[#ECFDF5] text-[#12773D]"}`}>
                      {p.stock === 0 ? "Out of Stock" : `${p.stock} units`}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full ${p.active ? "bg-[#ECFDF5] text-[#12773D]" : "bg-[#F3F4F6] text-[#667085]"}`}>
                      {p.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex gap-1">
                      <Link to={`/product/${p.id}`} className="text-xs text-[#667085] hover:text-[#1769AA] px-2 py-1 rounded hover:bg-[#EFF6FF]">View</Link>
                      <Link to={`/admin/products/edit/${p.id}`} className="text-xs text-[#1769AA] hover:text-[#0B3A63] px-2 py-1 rounded hover:bg-[#EFF6FF]">Edit</Link>
                      <button className="text-xs text-[#C0392B] hover:text-red-700 px-2 py-1 rounded hover:bg-[#FEF2F2]">Delete</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && (
          <div className="text-center py-12 text-[#667085]">
            <p className="text-4xl mb-2">📦</p>
            <p className="font-medium">No products found</p>
          </div>
        )}
      </div>
    </div>
  );
}
