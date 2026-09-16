import { useEffect, useState, useMemo } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { products, categories, brands } from "../../data/mock/products";
import ProductCard from "../../components/common/ProductCard";

const sortOptions = [
  { value: "featured", label: "Featured" },
  { value: "price-asc", label: "Price: Low to High" },
  { value: "price-desc", label: "Price: High to Low" },
  { value: "name-asc", label: "Name: A to Z" },
];

export default function Shop() {
  const [searchParams] = useSearchParams();
  const [filterOpen, setFilterOpen] = useState(false);
  const [sort, setSort] = useState("featured");
  const [priceRange, setPriceRange] = useState<[number, number]>([0, 50000]);

  const slugifyBrand = (value: string) => value.trim().toLowerCase();
  const findBrandLabel = (value: string) => brands.find(brand => slugifyBrand(brand) === slugifyBrand(value)) || value;

  const selectedCategory = searchParams.get("category") || "";
  const selectedBrand = searchParams.get("brand") || "";
  const searchQuery = searchParams.get("q") || "";
  const view = searchParams.get("view") || "";

  const [localBrands, setLocalBrands] = useState<string[]>(selectedBrand ? [findBrandLabel(selectedBrand)] : []);
  const [localCategory, setLocalCategory] = useState(selectedCategory);
  const [stockFilter, setStockFilter] = useState(false);

  useEffect(() => {
    setLocalCategory(selectedCategory);
  }, [selectedCategory]);

  useEffect(() => {
    setLocalBrands(selectedBrand ? [findBrandLabel(selectedBrand)] : []);
  }, [selectedBrand]);

  const filtered = useMemo(() => {
    let list = [...products];
    if (localCategory) list = list.filter(p => p.category === localCategory);
    if (localBrands.length) {
      const activeBrandSlugs = localBrands.map(slugifyBrand);
      list = list.filter(p => activeBrandSlugs.includes(slugifyBrand(p.brand)));
    }
    if (stockFilter) list = list.filter(p => p.stock > 0);
    if (searchQuery) list = list.filter(p =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.brand.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.category.toLowerCase().includes(searchQuery.toLowerCase())
    );
    list = list.filter(p => p.price >= priceRange[0] && p.price <= priceRange[1]);

    switch (sort) {
      case "price-asc": return list.sort((a, b) => a.price - b.price);
      case "price-desc": return list.sort((a, b) => b.price - a.price);
      case "name-asc": return list.sort((a, b) => a.name.localeCompare(b.name));
      default: return list.sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0));
    }
  }, [localCategory, localBrands, searchQuery, sort, priceRange, stockFilter]);

  const toggleBrand = (brand: string) => {
    setLocalBrands(prev => prev.includes(brand) ? prev.filter(b => b !== brand) : [...prev, brand]);
  };

  if (view === "categories") {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-[#0B3A63] mb-2">All Categories</h1>
        <p className="text-[#667085] text-sm mb-8">Browse our complete electrical product range by category</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {categories.map(cat => (
            <div key={cat.id} className="bg-white border border-[#D9E1E8] rounded-xl overflow-hidden">
              <div className="bg-[#0B3A63] px-5 py-4 flex items-center gap-3">
                <span className="text-3xl">{cat.icon}</span>
                <h3 className="text-lg font-bold text-white">{cat.name}</h3>
              </div>
              <div className="p-4">
                <ul className="space-y-1">
                  {cat.subcategories.map(sub => (
                    <li key={sub}>
                      <Link
                        to={`/shop?category=${cat.id}&subcategory=${encodeURIComponent(sub)}`}
                        className="flex items-center gap-2 text-sm text-[#17212B] hover:text-[#1769AA] py-1 px-2 rounded hover:bg-[#F6F8FA] transition-colors"
                      >
                        <span className="w-1.5 h-1.5 bg-[#F2A900] rounded-full flex-shrink-0"></span>
                        {sub}
                      </Link>
                    </li>
                  ))}
                </ul>
                <Link
                  to={`/shop?category=${cat.id}`}
                  className="mt-3 block text-center text-sm text-[#1769AA] hover:text-[#0B3A63] font-medium border border-[#D9E1E8] rounded-lg py-2 hover:bg-[#F6F8FA] transition-colors"
                >
                  View All {cat.name}
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (view === "brands") {
    return (
      <div className="max-w-7xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold text-[#0B3A63] mb-2">Shop by Brand</h1>
        <p className="text-[#667085] text-sm mb-8">Authorised dealer for India's leading electrical brands</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          {brands.map(brand => (
            <Link
              key={brand}
              to={`/shop?brand=${encodeURIComponent(brand.toLowerCase())}`}
              className="bg-white border border-[#D9E1E8] rounded-xl p-5 text-center transition-all duration-300 ease-in-out group hover:-translate-y-2 hover:scale-105 hover:shadow-2xl hover:bg-[#0B3A63] hover:border-[#0B3A63]"
            >
              <div className="w-12 h-12 bg-[#0B3A63] rounded-full flex items-center justify-center mx-auto mb-3 transition-colors duration-300 group-hover:bg-white/15">
                <span className="text-white font-bold text-lg transition-colors duration-300 group-hover:text-white" style={{ fontFamily: "Outfit" }}>{brand[0]}</span>
              </div>
              <div className="font-semibold text-[#17212B] transition-colors duration-300 group-hover:text-white">{brand}</div>
              <div className="text-xs text-[#667085] mt-1 transition-colors duration-300 group-hover:text-white/80">
                {products.filter(p => p.brand === brand).length} products
              </div>
            </Link>
          ))}
        </div>
      </div>
    );
  }

  const FilterPanel = () => (
    <div className="space-y-6">
      <div>
        <h4 className="text-sm font-semibold text-[#0B3A63] mb-3 uppercase tracking-wider">Category</h4>
        <div className="space-y-1.5">
          <label className="flex items-center gap-2 cursor-pointer group">
            <input type="radio" name="cat" checked={!localCategory} onChange={() => setLocalCategory("")} className="accent-[#1769AA]" />
            <span className="text-sm text-[#17212B] group-hover:text-[#1769AA]">All Categories</span>
          </label>
          {categories.map(cat => (
            <label key={cat.id} className="flex items-center gap-2 cursor-pointer group">
              <input type="radio" name="cat" checked={localCategory === cat.id} onChange={() => setLocalCategory(cat.id)} className="accent-[#1769AA]" />
              <span className="text-sm text-[#17212B] group-hover:text-[#1769AA]">{cat.name}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-[#0B3A63] mb-3 uppercase tracking-wider">Brand</h4>
        <div className="space-y-1.5">
          {brands.map(brand => (
            <label key={brand} className="flex items-center gap-2 cursor-pointer group">
              <input type="checkbox" checked={localBrands.includes(brand)} onChange={() => toggleBrand(brand)} className="accent-[#1769AA]" />
              <span className="text-sm text-[#17212B] group-hover:text-[#1769AA]">{brand}</span>
              <span className="ml-auto text-xs text-[#667085]">{products.filter(p => p.brand === brand).length}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-[#0B3A63] mb-3 uppercase tracking-wider">Price Range</h4>
        <div className="space-y-2">
          {[[0, 500], [500, 2000], [2000, 10000], [10000, 50000]].map(([min, max]) => (
            <label key={`${min}-${max}`} className="flex items-center gap-2 cursor-pointer group">
              <input
                type="radio"
                name="price"
                checked={priceRange[0] === min && priceRange[1] === max}
                onChange={() => setPriceRange([min, max])}
                className="accent-[#1769AA]"
              />
              <span className="text-sm text-[#17212B] group-hover:text-[#1769AA]">
                ₹{min.toLocaleString("en-IN")} – ₹{max.toLocaleString("en-IN")}
              </span>
            </label>
          ))}
          <label className="flex items-center gap-2 cursor-pointer group">
            <input type="radio" name="price" checked={priceRange[0] === 0 && priceRange[1] === 50000} onChange={() => setPriceRange([0, 50000])} className="accent-[#1769AA]" />
            <span className="text-sm text-[#17212B] group-hover:text-[#1769AA]">Any Price</span>
          </label>
        </div>
      </div>

      <div>
        <h4 className="text-sm font-semibold text-[#0B3A63] mb-3 uppercase tracking-wider">Availability</h4>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={stockFilter} onChange={(e) => setStockFilter(e.target.checked)} className="accent-[#1769AA]" />
          <span className="text-sm text-[#17212B]">In Stock Only</span>
        </label>
      </div>

      {(localCategory || localBrands.length || stockFilter) && (
        <button
          onClick={() => { setLocalCategory(""); setLocalBrands([]); setStockFilter(false); setPriceRange([0, 50000]); }}
          className="w-full py-2 text-sm text-[#C0392B] border border-[#C0392B]/30 rounded-lg hover:bg-[#FEF2F2] transition-colors"
        >
          Clear All Filters
        </button>
      )}
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 py-6">
      {/* Breadcrumb */}
      <nav className="text-xs text-[#667085] mb-4 flex items-center gap-1.5">
        <Link to="/" className="hover:text-[#1769AA]">Home</Link>
        <span>/</span>
        <span className="text-[#17212B]">{localCategory ? categories.find(c => c.id === localCategory)?.name : "All Products"}</span>
      </nav>

      <div className="flex gap-6">
        {/* Desktop Sidebar */}
        <aside className="hidden lg:block w-56 flex-shrink-0">
          <div className="bg-white border border-[#D9E1E8] rounded-xl p-5 sticky top-24">
            <h3 className="font-bold text-[#0B3A63] mb-4">Filters</h3>
            <FilterPanel />
          </div>
        </aside>

        {/* Main */}
        <div className="flex-1 min-w-0">
          {searchQuery && (
            <div className="mb-4 p-3 bg-[#EFF6FF] border border-[#BFDBFE] rounded-lg text-sm text-[#1769AA]">
              Showing results for: <strong>"{searchQuery}"</strong>
            </div>
          )}

          {/* Toolbar */}
          <div className="flex items-center justify-between gap-3 mb-5">
            <div>
              <h1 className="text-xl font-bold text-[#0B3A63]">
                {localCategory ? categories.find(c => c.id === localCategory)?.name : "All Products"}
              </h1>
              <p className="text-sm text-[#667085]">{filtered.length} products</p>
            </div>
            <div className="flex items-center gap-2">
              {/* Mobile filter button */}
              <button
                className="lg:hidden flex items-center gap-2 bg-white border border-[#D9E1E8] rounded-lg px-3 py-2 text-sm font-medium text-[#17212B]"
                onClick={() => setFilterOpen(true)}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2a1 1 0 01-.293.707L13 13.414V19a1 1 0 01-.553.894l-4 2A1 1 0 017 21v-7.586L3.293 6.707A1 1 0 013 6V4z" /></svg>
                Filter
              </button>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className="bg-white border border-[#D9E1E8] rounded-lg px-3 py-2 text-sm text-[#17212B] outline-none focus:border-[#1769AA]"
              >
                {sortOptions.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
              </select>
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-xl border border-[#D9E1E8]">
              <div className="text-5xl mb-4">🔍</div>
              <h3 className="text-lg font-bold text-[#0B3A63] mb-2">No Products Found</h3>
              <p className="text-[#667085] text-sm">Try adjusting your filters or search term.</p>
              <button onClick={() => { setLocalCategory(""); setLocalBrands([]); setPriceRange([0, 50000]); }} className="mt-4 text-sm text-[#1769AA] underline">Clear Filters</button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
              {filtered.map(p => <ProductCard key={p.id} product={p} />)}
            </div>
          )}
        </div>
      </div>

      {/* Mobile Filter Drawer */}
      {filterOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setFilterOpen(false)} />
          <div className="absolute right-0 top-0 h-full w-80 bg-white overflow-y-auto p-5">
            <div className="flex justify-between items-center mb-5">
              <h3 className="font-bold text-[#0B3A63] text-lg">Filters</h3>
              <button onClick={() => setFilterOpen(false)} className="text-[#667085] hover:text-[#17212B]">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <FilterPanel />
            <button onClick={() => setFilterOpen(false)} className="w-full mt-6 bg-[#0B3A63] text-white py-3 rounded-lg font-semibold">
              Apply Filters ({filtered.length} products)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
