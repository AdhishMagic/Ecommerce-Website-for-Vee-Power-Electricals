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

  const brandInfo: BrandSeoInfo | undefined = useMemo(() => {
    if (!slug) return undefined;
    const cleanSlug = slug.toLowerCase().trim();
    return BRAND_SEO_DATA[cleanSlug] || Object.values(BRAND_SEO_DATA).find(b => slugify(b.name) === cleanSlug);
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
        "itemListElement": matchingProducts.map((p, idx) => ({
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
          className="mb-5 sm:mb-6"
        />

        {/* Hero Header Section */}
        <div className="bg-white border border-[#D9E1E8] rounded-2xl p-6 sm:p-8 lg:p-10 shadow-xs mb-8">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="max-w-2xl">
              <div className="flex items-center gap-3 mb-2 flex-wrap">
                <span className="px-3 py-1 text-xs font-bold uppercase tracking-wider bg-[#EFF6FF] text-[#1769AA] rounded-full border border-[#BFDBFE]">
                  Certified Electrical Manufacturer
                </span>
                <span className="text-xs font-medium text-[#667085]">
                  Origin: {brandInfo.originCountry}
                </span>
              </div>
              <h1
                className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-[#0B3A63] tracking-tight leading-tight mb-2"
                style={{ fontFamily: "Outfit, sans-serif" }}
              >
                {brandInfo.name} Electricals
              </h1>
              <p className="text-sm sm:text-base text-[#1769AA] font-semibold mb-4">
                {brandInfo.tagline}
              </p>
              <p className="text-xs sm:text-sm text-[#475467] leading-relaxed">
                {brandInfo.companyOverview}
              </p>
            </div>

            {/* Brand Logo Box */}
            <div className="w-36 h-36 sm:w-44 sm:h-44 bg-[#F8FAFC] border border-[#D9E1E8] rounded-2xl p-4 flex items-center justify-center shrink-0 shadow-2xs">
              {logoUrl ? (
                <img
                  src={logoUrl}
                  alt={`${brandInfo.name} logo`}
                  className="max-h-full max-w-full object-contain"
                  loading="eager"
                />
              ) : (
                <span
                  className="text-xl font-bold text-[#0B3A63] text-center"
                  style={{ fontFamily: "Outfit, sans-serif" }}
                >
                  {brandInfo.name}
                </span>
              )}
            </div>
          </div>

          {/* Key Strengths & Popular Series */}
          <div className="mt-8 pt-6 border-t border-[#F1F5F9] grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-xs font-bold text-[#0B3A63] uppercase tracking-wider mb-2.5">
                Key Engineering Strengths
              </h3>
              <ul className="space-y-1.5 text-xs text-[#475467]">
                {brandInfo.keyStrengths.map((str, idx) => (
                  <li key={idx} className="flex items-center gap-2">
                    <span className="text-[#10B981] font-bold">✓</span>
                    <span>{str}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <h3 className="text-xs font-bold text-[#0B3A63] uppercase tracking-wider mb-2.5">
                Popular Product Lines
              </h3>
              <div className="flex flex-wrap gap-2">
                {brandInfo.popularSeries.map((series, idx) => (
                  <span
                    key={idx}
                    className="text-xs bg-[#F1F5F9] text-[#334155] px-2.5 py-1 rounded-md font-medium"
                  >
                    {series}
                  </span>
                ))}
              </div>
              <p className="text-[11px] text-[#667085] mt-3 italic">
                {brandInfo.procurementNote}
              </p>
            </div>
          </div>
        </div>

        {/* Catalog / Products Section */}
        <div className="mb-10">
          <div className="flex items-center justify-between pb-4 border-b border-[#D9E1E8] mb-6">
            <h2
              className="text-xl sm:text-2xl font-bold text-[#0B3A63]"
              style={{ fontFamily: "Outfit, sans-serif" }}
            >
              {brandInfo.name} Product Catalog ({matchingProducts.length})
            </h2>

            {/* Categories Supplied by Brand */}
            {brandInfo.categoriesSupplied.length > 0 && (
              <div className="hidden sm:flex items-center gap-2">
                <span className="text-xs text-[#667085] font-semibold">Categories:</span>
                {brandInfo.categoriesSupplied.map((cat) => (
                  <Link
                    key={cat.slug}
                    to={`/categories/${cat.slug}`}
                    className="text-xs font-semibold text-[#1769AA] hover:text-[#0B3A63] bg-white border border-[#D9E1E8] px-2.5 py-1 rounded-lg hover:border-[#1769AA] transition-colors"
                  >
                    {cat.name}
                  </Link>
                ))}
              </div>
            )}
          </div>

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
          ) : matchingProducts.length === 0 ? (
            /* Genuine 0-Inventory Notice (complies with no false advertising) */
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
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4 sm:gap-6">
              {matchingProducts.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          )}
        </div>

        {/* Cross Brand Linking Section */}
        <div className="pt-6 border-t border-[#D9E1E8]">
          <h3 className="text-xs font-bold text-[#667085] uppercase tracking-wider mb-4">
            Certified Electrical Brands at Vee Power
          </h3>
          <div className="flex flex-wrap gap-2 sm:gap-3">
            {Object.values(BRAND_SEO_DATA)
              .filter((b) => b.slug !== brandInfo.slug)
              .map((b) => (
                <Link
                  key={b.slug}
                  to={`/brands/${b.slug}`}
                  className="px-3.5 py-2 bg-white hover:bg-[#EFF6FF] border border-[#D9E1E8] hover:border-[#BFDBFE] text-xs font-semibold text-[#0B3A63] hover:text-[#1769AA] rounded-xl transition-all shadow-2xs"
                >
                  {b.name}
                </Link>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
}
