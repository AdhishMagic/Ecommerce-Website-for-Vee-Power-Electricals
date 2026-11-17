import { useEffect, useState, useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import { productService } from "../../services/productService";
import { Product } from "../../types/product";
import ProductCard from "../../components/common/ProductCard";
import Breadcrumbs from "../../components/common/Breadcrumbs";
import SEOHead from "../../components/common/SEOHead";
import { BRAND_SEO_DATA, BrandSeoInfo } from "../../data/brandSeoData";
import { getBrandLogo } from "../../utils/brandLogoResolver";

const slugify = (val: string) => val.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");

export default function BrandDetailPage() {
  const { slug } = useParams<{ slug: string }>();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"featured" | "price-asc" | "price-desc" | "name">("featured");

  const brandInfo: BrandSeoInfo | undefined = useMemo(() => {
    if (!slug) return undefined;
    const cleanSlug = slug.toLowerCase().trim();
    return BRAND_SEO_DATA[cleanSlug] || Object.values(BRAND_SEO_DATA).find(b => slugify(b.name) === cleanSlug);
  }, [slug]);

  useEffect(() => {
    setSelectedCategory("all");
    setSortBy("featured");
  }, [slug]);

  useEffect(() => {
    async function loadProducts() {
      try {
        setLoading(true);
        setError(null);
        const allProducts = await productService.getProducts();
        setProducts(allProducts);
      } catch (err: any) {
        console.error("Failed to load products for brand:", err);
        setError("Unable to load brand catalog. Please check your connection.");
      } finally {
        setLoading(false);
      }
    }
    loadProducts();
  }, [slug]);

  // Match actual inventory in database for this brand
  const matchingProducts = useMemo(() => {
    if (!brandInfo) return [];
    const bSlug = brandInfo.slug.toLowerCase();
    const bName = brandInfo.name.toLowerCase();

    return products.filter((p) => {
      const pBrand = (p.brand || "").toLowerCase().trim();
      const pBrandSlug = slugify(pBrand);
      return pBrand === bName || pBrandSlug === bSlug || pBrand.includes(bName);
    });
  }, [products, brandInfo]);

  // Distinct categories available for this brand
  const availableCategories = useMemo(() => {
    const catsSet = new Set<string>();
    matchingProducts.forEach((p) => {
      if (p.category && typeof p.category === "string" && p.category.trim()) {
        catsSet.add(p.category.trim());
      }
    });
    return Array.from(catsSet).sort();
  }, [matchingProducts]);

  // Filter & sort products
  const displayedProducts = useMemo(() => {
    let list = [...matchingProducts];

    if (selectedCategory !== "all") {
      list = list.filter((p) => (p.category || "").toLowerCase() === selectedCategory.toLowerCase());
    }

    switch (sortBy) {
      case "price-asc":
        return list.sort((a, b) => Number(a.price) - Number(b.price));
      case "price-desc":
        return list.sort((a, b) => Number(b.price) - Number(a.price));
      case "name":
        return list.sort((a, b) => a.name.localeCompare(b.name));
      default:
        return list;
    }
  }, [matchingProducts, selectedCategory, sortBy]);

  // Indexing policy: Brands with substantial content & certified status (brandInfo.isIndexable)
  // or brands with active catalog inventory are indexed. Avoid noindex flash during initial async fetch.
  const hasInventory = matchingProducts.length > 0;
  const isIndexable = brandInfo ? brandInfo.isIndexable : hasInventory;
  const robotsDirective = isIndexable ? "index, follow" : "noindex, follow";

  if (!brandInfo) {
    return (
      <div className="site-container py-12 text-center">
        <SEOHead
          title="Brand Not Found | Vee Power Electricals"
          description="The requested electrical brand could not be found."
          robots="noindex, follow"
        />
        <h1 className="text-2xl font-bold text-[#0B3A63] mb-4">Brand Not Found</h1>
        <p className="text-[#667085] mb-6">We could not find the brand you were looking for.</p>
        <Link
          to="/brands"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#1769AA] text-white rounded-xl text-sm font-semibold hover:bg-[#0B3A63] transition-colors"
        >
          View All Brands
        </Link>
      </div>
    );
  }

  const logoUrl = getBrandLogo(brandInfo.name);

  // Schema.org structured data
  const jsonLdData: any[] = [
    {
      "@context": "https://schema.org",
      "@type": "Brand",
      "name": brandInfo.name,
      "description": brandInfo.companyOverview,
      "url": brandInfo.canonicalUrl,
      ...(logoUrl ? { "logo": logoUrl } : {})
    }
  ];

  if (hasInventory) {
    jsonLdData.push({
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "name": brandInfo.metaTitle,
      "description": brandInfo.metaDescription,
      "url": brandInfo.canonicalUrl,
      "mainEntity": {
        "@type": "ItemList",
        "itemListElement": displayedProducts.map((p, idx) => ({
          "@type": "ListItem",
          "position": idx + 1,
          "name": p.name,
          "url": `https://veepowerelectricals.com/product/${p.slug || p.id}`
        }))
      }
    });
  }

  return (
    <div className="w-full bg-[#F6F8FA] min-h-screen py-6 sm:py-8 lg:py-10">
      <SEOHead
        title={brandInfo.metaTitle}
        description={brandInfo.metaDescription}
        canonicalUrl={brandInfo.canonicalUrl}
        robots={robotsDirective}
        jsonLd={jsonLdData}
      />

      <div className="site-container mx-auto">
        <Breadcrumbs
          items={[
            { label: "Brands", path: "/brands" },
            { label: brandInfo.name }
          ]}
          className="mb-4 sm:mb-6"
        />

        {/* Compact Brand Header: Heading & Brand Logo */}
        <div className="flex items-center justify-between gap-4 mb-6">
          <div>
            <h1
              className="text-2xl sm:text-3xl font-extrabold text-[#0B3A63] tracking-tight leading-tight"
              style={{ fontFamily: "Outfit, sans-serif" }}
            >
              {brandInfo.name}
            </h1>
          </div>
          {logoUrl && (
            <div className="h-10 sm:h-12 w-24 sm:w-32 bg-white border border-[#D9E1E8] rounded-xl px-3 py-1.5 flex items-center justify-center shrink-0 shadow-2xs">
              <img
                src={logoUrl}
                alt={`${brandInfo.name} logo`}
                className="max-h-full max-w-full object-contain"
                loading="eager"
              />
            </div>
          )}
        </div>

        {/* Catalog Controls: Product Count, Category Filter & Sort */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-[#D9E1E8] mb-6">
          <div className="flex items-center gap-3">
            <h2 className="text-base sm:text-lg font-bold text-[#0B3A63]" style={{ fontFamily: "Outfit, sans-serif" }}>
              Available Products ({displayedProducts.length})
            </h2>
            {selectedCategory !== "all" && (
              <button
                type="button"
                onClick={() => setSelectedCategory("all")}
                className="text-xs text-[#1769AA] hover:underline font-semibold cursor-pointer"
              >
                Clear Category Filter
              </button>
            )}
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            {availableCategories.length > 1 && (
              <div className="flex items-center gap-1.5 flex-1 sm:flex-none">
                <label htmlFor="category-filter" className="text-xs font-semibold text-[#667085] whitespace-nowrap">
                  Category:
                </label>
                <select
                  id="category-filter"
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="bg-white border border-[#D9E1E8] rounded-lg px-2.5 py-1.5 text-xs text-[#17212B] focus:outline-none focus:border-[#1769AA] cursor-pointer"
                >
                  <option value="all">All Categories ({matchingProducts.length})</option>
                  {availableCategories.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="flex items-center gap-1.5 flex-1 sm:flex-none">
              <label htmlFor="sort-by" className="text-xs font-semibold text-[#667085] whitespace-nowrap">
                Sort:
              </label>
              <select
                id="sort-by"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-white border border-[#D9E1E8] rounded-lg px-2.5 py-1.5 text-xs text-[#17212B] focus:outline-none focus:border-[#1769AA] cursor-pointer"
              >
                <option value="featured">Featured</option>
                <option value="price-asc">Price: Low to High</option>
                <option value="price-desc">Price: High to Low</option>
                <option value="name">Name: A to Z</option>
              </select>
            </div>
          </div>
        </div>

        {/* Catalog / Products Grid */}
        <div className="mb-10">
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="bg-white border border-[#E2E8F0] rounded-xl p-4 animate-pulse h-72">
                  <div className="w-full h-40 bg-slate-100 rounded-lg mb-3"></div>
                  <div className="h-4 bg-slate-100 rounded w-3/4 mb-2"></div>
                  <div className="h-4 bg-slate-100 rounded w-1/2"></div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="bg-white border border-rose-200 rounded-xl p-8 text-center text-rose-600">
              {error}
            </div>
          ) : displayedProducts.length === 0 ? (
            matchingProducts.length === 0 ? (
              /* Genuine 0-Inventory Notice (Direct procurement for contractor/BOQ orders) */
              <div className="bg-white border border-[#D9E1E8] rounded-2xl p-8 sm:p-12 text-center shadow-xs">
                <div className="w-14 h-14 bg-amber-50 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4 border border-amber-200">
                  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                </div>
                <h3
                  className="text-lg sm:text-xl font-bold text-[#0B3A63] mb-2"
                  style={{ fontFamily: "Outfit, sans-serif" }}
                >
                  Direct Procurement & Project Orders for {brandInfo.name}
                </h3>
                <p className="text-xs sm:text-sm text-[#475467] max-w-xl mx-auto leading-relaxed mb-6">
                  Online retail stock for {brandInfo.name} is currently allocated to on-site contractor orders. However, Vee Power Electricals procures and supplies complete {brandInfo.name} project batches against customer BOQs across Tamil Nadu.
                </p>
                <div className="flex flex-wrap justify-center gap-3">
                  <Link
                    to="/contact"
                    className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-white bg-[#1769AA] hover:bg-[#0B3A63] px-5 py-2.5 rounded-xl transition-all shadow-xs"
                  >
                    Request {brandInfo.name} Price Quotation
                  </Link>
                  <Link
                    to="/shop"
                    className="inline-flex items-center gap-1.5 text-xs sm:text-sm font-semibold text-[#1769AA] bg-white border border-[#D9E1E8] hover:border-[#1769AA] px-5 py-2.5 rounded-xl transition-all"
                  >
                    Browse In-Stock Brands
                  </Link>
                </div>
              </div>
            ) : (
              <div className="bg-white border border-[#D9E1E8] rounded-2xl p-8 sm:p-12 text-center shadow-xs">
                <p className="text-[#667085] text-sm mb-4">No products found matching the selected category filter.</p>
                <button
                  type="button"
                  onClick={() => setSelectedCategory("all")}
                  className="inline-flex items-center px-4 py-2 bg-[#1769AA] text-white rounded-xl text-xs font-semibold hover:bg-[#0B3A63] transition-colors cursor-pointer"
                >
                  Reset Filter
                </button>
              </div>
            )
          ) : (
            <div data-testid="brand-products-grid" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
              {displayedProducts.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
