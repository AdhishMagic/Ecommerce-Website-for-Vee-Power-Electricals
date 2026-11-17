import { useEffect, useState, useMemo } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { productService } from "../../services/productService";
import { Product } from "../../types/product";
import ProductCard from "../../components/common/ProductCard";
import Breadcrumbs from "../../components/common/Breadcrumbs";
import SEOHead from "../../components/common/SEOHead";
import { CATEGORY_SEO_DATA, CategorySeoInfo } from "../../data/categorySeoData";

export default function CategoryDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();

  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & sorting
  const [selectedBrand, setSelectedBrand] = useState<string>("all");
  const [sortBy, setSortBy] = useState<"featured" | "price-asc" | "price-desc" | "name">("featured");

  const categoryInfo: CategorySeoInfo | undefined = useMemo(() => {
    if (!slug) return undefined;
    return CATEGORY_SEO_DATA[slug.toLowerCase()] || undefined;
  }, [slug]);

  useEffect(() => {
    async function loadCategoryProducts() {
      try {
        setLoading(true);
        setError(null);
        const allProducts = await productService.getProducts();
        setProducts(allProducts);
      } catch (err: any) {
        console.error("Failed to load products for category:", err);
        setError("Unable to load products. Please check your internet connection.");
      } finally {
        setLoading(false);
      }
    }
    loadCategoryProducts();
  }, [slug]);

  // Match products belonging to this category
  const matchingProducts = useMemo(() => {
    if (!categoryInfo) return [];
    const validSlugs = categoryInfo.dbCategorySlugs.map(s => s.toLowerCase());

    return products.filter((p) => {
      // Check product category name
      const pCat = (p.category || "").toLowerCase();
      const pCatSlug = (p.categorySlug || "").toLowerCase();

      return validSlugs.some((target) => {
        return (
          pCat === target ||
          pCatSlug === target ||
          pCat.includes(target) ||
          target.includes(pCat)
        );
      });
    });
  }, [products, categoryInfo]);

  // Distinct brands available in this category
  const availableBrands = useMemo(() => {
    const brandsSet = new Set<string>();
    matchingProducts.forEach((p) => {
      if (p.brand && typeof p.brand === "string" && p.brand.trim()) {
        brandsSet.add(p.brand.trim());
      }
    });
    return Array.from(brandsSet).sort();
  }, [matchingProducts]);

  // Filter & sort products
  const displayedProducts = useMemo(() => {
    let list = [...matchingProducts];

    if (selectedBrand !== "all") {
      list = list.filter((p) => (p.brand || "").toLowerCase() === selectedBrand.toLowerCase());
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
  }, [matchingProducts, selectedBrand, sortBy]);

  // If unknown category slug
  if (!categoryInfo) {
    return (
      <div className="site-container py-12 text-center">
        <SEOHead
          title="Category Not Found | Vee Power Electricals"
          description="The requested electrical category could not be found."
          robots="noindex, follow"
        />
        <h1 className="text-2xl font-bold text-[#0B3A63] mb-4">Category Not Found</h1>
        <p className="text-[#667085] mb-6">We couldn't find the category you requested.</p>
        <Link
          to="/categories"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#1769AA] text-white rounded-xl text-sm font-semibold hover:bg-[#0B3A63] transition-colors"
        >
          Browse All Categories
        </Link>
      </div>
    );
  }

  // Schema.org structured data
  const jsonLdData = [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "name": categoryInfo.metaTitle,
      "description": categoryInfo.metaDescription,
      "url": categoryInfo.canonicalUrl,
      "mainEntity": {
        "@type": "ItemList",
        "itemListElement": displayedProducts.map((p, idx) => ({
          "@type": "ListItem",
          "position": idx + 1,
          "name": p.name,
          "url": `https://veepowerelectricals.com/product/${p.slug || p.id}`
        }))
      }
    },
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": categoryInfo.faqs.map((faq) => ({
        "@type": "Question",
        "name": faq.question,
        "acceptedAnswer": {
          "@type": "Answer",
          "text": faq.answer
        }
      }))
    }
  ];

  return (
    <div className="w-full bg-[#F6F8FA] min-h-screen py-6 sm:py-8 lg:py-10">
      <SEOHead
        title={categoryInfo.metaTitle}
        description={categoryInfo.metaDescription}
        canonicalUrl={categoryInfo.canonicalUrl}
        jsonLd={jsonLdData}
      />

      <div className="site-container mx-auto">
        <Breadcrumbs
          items={[
            { label: "Categories", path: "/categories" },
            { label: categoryInfo.name }
          ]}
          className="mb-4 sm:mb-6"
        />

        {/* Compact Category Title */}
        <div className="mb-6">
          <h1
            className="text-2xl sm:text-3xl font-extrabold text-[#0B3A63] tracking-tight leading-tight"
            style={{ fontFamily: "Outfit, sans-serif" }}
          >
            {categoryInfo.name}
          </h1>
        </div>

        {/* Product Catalog Controls (Brand Filter & Sort) */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-[#D9E1E8] mb-6">
          <div className="flex items-center gap-3">
            <h2 className="text-base sm:text-lg font-bold text-[#0B3A63]" style={{ fontFamily: "Outfit, sans-serif" }}>
              Available Products ({displayedProducts.length})
            </h2>
            {selectedBrand !== "all" && (
              <button
                type="button"
                onClick={() => setSelectedBrand("all")}
                className="text-xs text-[#1769AA] hover:underline font-semibold cursor-pointer"
              >
                Clear Brand Filter
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            {/* Brand Filter Dropdown */}
            {availableBrands.length > 0 && (
              <div className="flex items-center gap-2 text-xs">
                <label htmlFor="brand-filter" className="text-[#667085] font-semibold">
                  Brand:
                </label>
                <select
                  id="brand-filter"
                  value={selectedBrand}
                  onChange={(e) => setSelectedBrand(e.target.value)}
                  className="bg-white border border-[#D9E1E8] rounded-lg px-2.5 py-1.5 text-xs text-[#17212B] focus:outline-none focus:border-[#1769AA] cursor-pointer"
                >
                  <option value="all">All Brands ({matchingProducts.length})</option>
                  {availableBrands.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Sort Dropdown */}
            <div className="flex items-center gap-2 text-xs">
              <label htmlFor="sort-by" className="text-[#667085] font-semibold">
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
                <option value="name">Alphabetical</option>
              </select>
            </div>
          </div>
        </div>

        {/* Product Grid */}
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6 my-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="bg-white border border-[#E2E8F0] rounded-xl p-4 animate-pulse h-72">
                <div className="w-full h-40 bg-slate-100 rounded-lg mb-3"></div>
                <div className="h-4 bg-slate-100 rounded w-3/4 mb-2"></div>
                <div className="h-4 bg-slate-100 rounded w-1/2"></div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="bg-white border border-rose-200 rounded-xl p-8 text-center text-rose-600 my-6">
            {error}
          </div>
        ) : displayedProducts.length === 0 ? (
          <div className="bg-white border border-[#D9E1E8] rounded-2xl p-8 sm:p-12 text-center shadow-xs my-6">
            <div className="w-14 h-14 bg-[#EFF6FF] text-[#1769AA] rounded-full flex items-center justify-center mx-auto mb-4 border border-[#BFDBFE]">
              <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <h3 className="text-base sm:text-lg font-bold text-[#0B3A63] mb-1.5" style={{ fontFamily: "Outfit, sans-serif" }}>
              New Stock Arriving Soon
            </h3>
            <p className="text-xs text-[#667085] max-w-md mx-auto mb-5">
              We are currently replenishing our warehouse inventory for this category. Contact our Coimbatore sales team directly for project quotes and wholesale inquiries.
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Link
                to="/contact"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-[#1769AA] hover:bg-[#0B3A63] px-5 py-2.5 rounded-xl transition-all shadow-xs"
              >
                Request Custom Quotation
              </Link>
              <Link
                to="/shop"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#1769AA] bg-white border border-[#D9E1E8] hover:border-[#1769AA] px-5 py-2.5 rounded-xl transition-all"
              >
                Browse Shop Catalog
              </Link>
            </div>
          </div>
        ) : (
          <div data-testid="category-products-grid" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6 mb-12">
            {displayedProducts.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
