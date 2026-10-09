import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { productService } from "../../services/productService";
import { Category, Product } from "../../types/product";
import { getCategoryDefaultImage, handleProductImageError } from "../../utils/productImageResolver";

export default function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const fetchCategories = async () => {
    try {
      setLoading(true);
      setError(null);
      const [cats, prods] = await Promise.all([
        productService.getCategories(),
        productService.getProducts(),
      ]);
      setCategories(cats);
      setProducts(prods);
    } catch (err: any) {
      console.error("Failed to load electrical categories:", err);
      setError("Unable to load electrical categories. Please check your connection and try again.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  // Compute product count per category
  const productCountMap = useMemo(() => {
    const map: Record<string, number> = {};
    products.forEach((p) => {
      const catKey = (p.category || "").toLowerCase().trim();
      map[catKey] = (map[catKey] || 0) + 1;
    });
    return map;
  }, [products]);

  const getProductCountForCategory = (cat: Category): number => {
    const catNameKey = (cat.name || "").toLowerCase().trim();
    const catSlugKey = (cat.slug || "").toLowerCase().trim();
    const catIdKey = String(cat.id);
    return productCountMap[catNameKey] || productCountMap[catSlugKey] || productCountMap[catIdKey] || 0;
  };

  // Filter categories by search query
  const filteredCategories = useMemo(() => {
    if (!searchQuery.trim()) return categories;
    const q = searchQuery.toLowerCase().trim();
    return categories.filter((cat) => {
      const nameMatch = cat.name.toLowerCase().includes(q);
      const slugMatch = (cat.slug || "").toLowerCase().includes(q);
      const subMatch = Array.isArray(cat.subcategories) && cat.subcategories.some((sub) => sub.toLowerCase().includes(q));
      return nameMatch || slugMatch || subMatch;
    });
  }, [categories, searchQuery]);

  return (
    <div className="w-full bg-[#F6F8FA] min-h-[calc(100vh-140px)] py-6 sm:py-8 lg:py-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Breadcrumb */}
        <nav
          className="flex items-center gap-2 text-xs font-medium text-[#667085] mb-5 sm:mb-6 flex-wrap"
          aria-label="Breadcrumb"
        >
          <Link to="/" className="hover:text-[#1769AA] transition-colors">
            Home
          </Link>
          <span>/</span>
          <span className="text-[#17212B]">Categories</span>
        </nav>

        {/* Page Header Block */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-6 sm:pb-8 border-b border-[#D9E1E8] mb-6 sm:mb-8 animate-dashboard-header">
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1
                className="text-2xl sm:text-3xl lg:text-4xl font-bold text-[#0B3A63] tracking-tight"
                style={{ fontFamily: "Outfit, sans-serif" }}
              >
                Explore Electrical Categories
              </h1>
              {!loading && !error && categories.length > 0 && (
                <span className="px-3 py-1 text-xs font-bold bg-[#EFF6FF] text-[#1769AA] border border-[#BFDBFE] rounded-full">
                  {categories.length} {categories.length === 1 ? "Category" : "Categories"}
                </span>
              )}
            </div>
            <p className="text-xs sm:text-sm text-[#667085] mt-1.5 max-w-2xl leading-relaxed">
              Find the right electrical products for your home, business, or project.
            </p>
          </div>

          {/* Search Input Bar */}
          {!loading && !error && categories.length > 0 && (
            <div className="w-full md:w-80 shrink-0">
              <div className="relative">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search electrical categories..."
                  className="w-full pl-10 pr-9 py-2.5 bg-white border border-[#D9E1E8] rounded-xl text-xs sm:text-sm text-[#17212B] placeholder-[#667085] focus:outline-none focus:border-[#1769AA] focus:ring-2 focus:ring-[#1769AA]/15 transition-all shadow-2xs"
                  aria-label="Search electrical categories"
                />
                <svg
                  className="w-4 h-4 text-[#667085] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                  />
                </svg>
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#667085] hover:text-[#0B3A63] p-1 rounded-full hover:bg-slate-100 transition-colors"
                    title="Clear search"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* STATE 1: Loading Skeleton */}
        {loading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 sm:gap-6">
            {[1, 2, 3, 4, 5, 6, 7, 8].map((n) => (
              <div
                key={n}
                className="bg-white border border-[#D9E1E8] rounded-2xl overflow-hidden shadow-2xs animate-pulse flex flex-col"
              >
                <div className="h-48 bg-slate-200 w-full" />
                <div className="p-5 space-y-3 flex-1 flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="h-5 bg-slate-200 rounded w-3/4" />
                    <div className="h-3 bg-slate-100 rounded w-full" />
                    <div className="h-3 bg-slate-100 rounded w-2/3" />
                  </div>
                  <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
                    <div className="h-4 bg-slate-200 rounded w-20" />
                    <div className="h-4 bg-slate-200 rounded w-16" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* STATE 2: API Failure */}
        {!loading && error && (
          <div className="bg-white border border-rose-200 rounded-2xl p-8 sm:p-12 text-center shadow-xs max-w-xl mx-auto my-6">
            <div className="w-14 h-14 bg-rose-50 text-rose-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-rose-100">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-[#0B3A63] mb-2" style={{ fontFamily: "Outfit, sans-serif" }}>
              Unable to Load Categories
            </h3>
            <p className="text-xs sm:text-sm text-[#667085] mb-6">{error}</p>
            <button
              type="button"
              onClick={fetchCategories}
              className="inline-flex items-center gap-2 bg-[#1769AA] hover:bg-[#0B3A63] text-white px-6 py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-colors shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-[#1769AA]"
            >
              <span>Retry</span>
            </button>
          </div>
        )}

        {/* STATE 3: Search Empty State */}
        {!loading && !error && categories.length > 0 && filteredCategories.length === 0 && (
          <div className="bg-white border border-[#D9E1E8] rounded-2xl p-8 sm:p-12 text-center shadow-xs max-w-md mx-auto my-6">
            <div className="w-14 h-14 bg-[#EFF6FF] text-[#1769AA] rounded-full flex items-center justify-center mx-auto mb-4 border border-[#BFDBFE]">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <h3 className="text-base sm:text-lg font-bold text-[#0B3A63] mb-1.5" style={{ fontFamily: "Outfit, sans-serif" }}>
              No categories found matching "{searchQuery}"
            </h3>
            <p className="text-xs text-[#667085] mb-5">
              Check for spelling errors or try searching for generic category names like switches, cables, or lighting.
            </p>
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1769AA] hover:text-[#0B3A63] bg-white border border-[#D9E1E8] hover:border-[#1769AA] px-4 py-2 rounded-xl transition-all"
            >
              Clear Search
            </button>
          </div>
        )}

        {/* STATE 4: Category Grid */}
        {!loading && !error && filteredCategories.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 sm:gap-6">
            {filteredCategories.map((cat, idx) => {
              const defaultImg = getCategoryDefaultImage(cat);
              const cardImage = cat.image || defaultImg;
              const count = getProductCountForCategory(cat);
              const subcatsText = Array.isArray(cat.subcategories) && cat.subcategories.length > 0
                ? cat.subcategories.slice(0, 3).join(" • ")
                : cat.subtitle || "Genuine Commercial Grade Electrical Products";

              return (
                <article
                  key={cat.id || cat.slug || idx}
                  className="bg-white border border-[#D9E1E8] hover:border-[#1769AA]/40 rounded-2xl overflow-hidden shadow-2xs hover:shadow-md transition-all duration-200 group flex flex-col justify-between card-interactive"
                  style={{ animationDelay: `${idx * 50}ms` }}
                >
                  <Link
                    to={`/shop?category=${encodeURIComponent(cat.slug || String(cat.id))}`}
                    className="block relative bg-[#F8FAFC] border-b border-[#F1F5F9] overflow-hidden group/img focus-visible:outline-none"
                    tabIndex={-1}
                  >
                    <div className="w-full h-44 sm:h-48 p-4 flex items-center justify-center">
                      <img
                        src={cardImage}
                        alt={`${cat.name} Category`}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-300"
                        onError={(e) => handleProductImageError(e, cat)}
                      />
                    </div>
                    {count > 0 && (
                      <span className="absolute top-3 right-3 text-[11px] font-bold bg-white/90 backdrop-blur-xs text-[#0B3A63] px-2.5 py-0.5 rounded-full border border-[#D9E1E8] shadow-2xs">
                        {count} {count === 1 ? "Product" : "Products"}
                      </span>
                    )}
                  </Link>

                  <div className="p-4 sm:p-5 flex flex-col flex-1 justify-between gap-4">
                    <div>
                      <Link
                        to={`/shop?category=${encodeURIComponent(cat.slug || String(cat.id))}`}
                        className="block text-base sm:text-lg font-bold text-[#0B3A63] hover:text-[#1769AA] transition-colors leading-snug"
                        style={{ fontFamily: "Outfit, sans-serif" }}
                      >
                        {cat.name}
                      </Link>
                      <p className="text-xs text-[#667085] mt-1.5 leading-relaxed line-clamp-2" title={subcatsText}>
                        {subcatsText}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-[#F1F5F9] flex items-center justify-between">
                      <Link
                        to={`/shop?category=${encodeURIComponent(cat.slug || String(cat.id))}`}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1769AA] group-hover:text-[#0B3A63] transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#1769AA] rounded"
                      >
                        <span>Explore Category</span>
                        <svg
                          className="w-4 h-4 group-hover:translate-x-1 transition-transform duration-200 shrink-0 text-[#1769AA] group-hover:text-[#0B3A63]"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                          aria-hidden="true"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                        </svg>
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
