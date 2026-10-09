import { useEffect, useState, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import { productService } from "../../services/productService";
import { catalogApi } from "../../api/catalog";
import { Product } from "../../types/product";
import BrandCard, { BrandItem } from "../../components/brand/BrandCard";
import BrandSearch, { BrandSortOption } from "../../components/brand/BrandSearch";
import BrandGridSkeleton from "../../components/brand/BrandGridSkeleton";

const DEFAULT_BRANDS: string[] = [
  "Anchor",
  "Crompton",
  "Finolex",
  "Gloster",
  "Havells",
  "Jaquar",
  "Khaitan",
  "Legrand",
  "Philips",
  "Polycab",
  "Schneider Electric",
];

const slugifyBrand = (val: string) => val.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");

export default function BrandsPage() {
  const [rawBrands, setRawBrands] = useState<BrandItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [sortBy, setSortBy] = useState<BrandSortOption>("name-asc");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch both brand definitions and all products in parallel
      const [brandRes, prods] = await Promise.all([
        catalogApi.getBrands().catch(() => null),
        productService.getProducts().catch(() => []),
      ]);

      setProducts(prods);

      let fetchedBrands: BrandItem[] = [];

      if (brandRes) {
        const brandList = Array.isArray(brandRes) ? brandRes : brandRes.results || [];
        if (brandList.length > 0) {
          fetchedBrands = brandList.map((b: any) => {
            if (typeof b === "string") {
              return { name: b, slug: slugifyBrand(b) };
            }
            return {
              id: b.id,
              name: b.name,
              slug: b.slug || slugifyBrand(b.name),
              logoUrl: b.logo || b.logo_url || null,
            };
          });
        }
      }

      // Merge with default approved brands if backend returned none or partial list
      const mergedMap = new Map<string, BrandItem>();

      // First populate default brands
      DEFAULT_BRANDS.forEach((bName) => {
        const key = slugifyBrand(bName);
        mergedMap.set(key, {
          name: bName,
          slug: key,
        });
      });

      // Override / append with backend brands
      fetchedBrands.forEach((bItem) => {
        const key = slugifyBrand(bItem.name);
        const existing = mergedMap.get(key);
        mergedMap.set(key, {
          ...existing,
          ...bItem,
          name: bItem.name || existing?.name || bItem.slug || "",
        });
      });

      // Also discover any brands attached directly to backend products
      prods.forEach((p) => {
        if (p.brand && typeof p.brand === "string" && p.brand.trim()) {
          const key = slugifyBrand(p.brand);
          if (!mergedMap.has(key)) {
            mergedMap.set(key, {
              name: p.brand.trim(),
              slug: key,
            });
          }
        }
      });

      setRawBrands(Array.from(mergedMap.values()));
    } catch (err: any) {
      console.error("Failed to load brands:", err);
      setError(err?.message || "Failed to load brands catalog. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Compute accurate product counts per brand
  const brandsWithCounts = useMemo(() => {
    return rawBrands.map((brand) => {
      const bSlug = slugifyBrand(brand.name);
      const matchingCount = products.filter((p) => slugifyBrand(p.brand) === bSlug).length;
      return {
        ...brand,
        productCount: matchingCount,
      };
    });
  }, [rawBrands, products]);

  // Filter & Sort
  const processedBrands = useMemo(() => {
    let list = [...brandsWithCounts];

    if (searchQuery.trim()) {
      const term = searchQuery.toLowerCase().trim();
      list = list.filter(
        (b) => b.name.toLowerCase().includes(term) || (b.slug && b.slug.toLowerCase().includes(term))
      );
    }

    switch (sortBy) {
      case "name-asc":
        return list.sort((a, b) => a.name.localeCompare(b.name));
      case "name-desc":
        return list.sort((a, b) => b.name.localeCompare(a.name));
      case "products-desc":
        return list.sort((a, b) => (b.productCount ?? 0) - (a.productCount ?? 0));
      default:
        return list;
    }
  }, [brandsWithCounts, searchQuery, sortBy]);

  return (
    <div className="site-container py-8 sm:py-10">
      {/* Breadcrumb */}
      <nav className="text-xs text-slate-500 mb-6 flex items-center gap-2 font-medium" aria-label="Breadcrumb">
        <Link to="/" className="hover:text-[#1769AA] transition-colors">
          Home
        </Link>
        <span>/</span>
        <Link to="/shop" className="hover:text-[#1769AA] transition-colors">
          Shop
        </Link>
        <span>/</span>
        <span className="text-[#0B3A63] font-semibold">Shop by Brand</span>
      </nav>

      {/* Page Header */}
      <div className="mb-8 animate-fadeIn">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-2">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#0B3A63] tracking-tight" style={{ fontFamily: "Outfit, sans-serif" }}>
              Shop by Brand
            </h1>
            {!loading && brandsWithCounts.length > 0 && (
              <span className="bg-[#EFF6FF] border border-[#BFDBFE] text-[#1769AA] text-xs font-bold px-2.5 py-1 rounded-full whitespace-nowrap">
                {brandsWithCounts.length} Authorized Brands
              </span>
            )}
          </div>
        </div>
        <p className="text-slate-600 text-sm sm:text-base max-w-2xl leading-relaxed">
          Explore trusted electrical brands for lighting, fans, switches, cables, and more.
        </p>
      </div>

      {/* API Error State */}
      {error ? (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-center max-w-lg mx-auto my-8">
          <div className="text-red-500 text-3xl mb-2">⚠️</div>
          <h3 className="text-base font-bold text-red-800 mb-1">Unable to Load Brands</h3>
          <p className="text-xs text-red-600 mb-4">{error}</p>
          <button
            onClick={loadData}
            className="px-4 py-2 bg-[#0B3A63] text-white text-xs font-semibold rounded-lg hover:bg-[#1769AA] transition-colors"
          >
            Retry Loading
          </button>
        </div>
      ) : (
        <>
          {/* Controls Bar */}
          <BrandSearch
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            sortBy={sortBy}
            onSortChange={setSortBy}
            totalResults={processedBrands.length}
          />

          {/* Main Brand Grid or Skeleton / Empty state */}
          {loading ? (
            <BrandGridSkeleton count={10} />
          ) : processedBrands.length === 0 ? (
            <div className="bg-white border border-[#E2E8F0] rounded-xl p-10 sm:p-16 text-center shadow-xs my-4">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400 text-2xl">
                🔍
              </div>
              <h3 className="text-lg font-bold text-[#0B3A63] mb-1" style={{ fontFamily: "Outfit, sans-serif" }}>
                No brands found
              </h3>
              <p className="text-sm text-slate-500 mb-6">
                No electrical brands matched "{searchQuery}". Try another search term.
              </p>
              <button
                onClick={() => setSearchQuery("")}
                className="px-5 py-2.5 bg-[#0B3A63] text-white text-sm font-semibold rounded-lg hover:bg-[#1769AA] transition-colors shadow-xs"
              >
                Clear Search
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4 sm:gap-5 lg:gap-6">
              {processedBrands.map((brand, idx) => (
                <BrandCard key={brand.slug || brand.name} brand={brand} index={idx} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
