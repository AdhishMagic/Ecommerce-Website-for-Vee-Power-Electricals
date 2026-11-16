import { useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import Breadcrumbs from "../../components/common/Breadcrumbs";
import SEOHead from "../../components/common/SEOHead";
import { TAMIL_NADU_DISTRICTS, DistrictInfo } from "../../data/tamilNaduDistricts";

export default function DistrictLocationPage() {
  const { district } = useParams<{ district: string }>();

  const districtInfo: DistrictInfo | undefined = useMemo(() => {
    if (!district) return undefined;
    const clean = district.toLowerCase().trim();
    return TAMIL_NADU_DISTRICTS[clean] || undefined;
  }, [district]);

  // Neighboring districts in same zone
  const neighboringDistricts = useMemo(() => {
    if (!districtInfo) return [];
    return Object.values(TAMIL_NADU_DISTRICTS)
      .filter((d) => d.zone === districtInfo.zone && d.slug !== districtInfo.slug)
      .slice(0, 6);
  }, [districtInfo]);

  if (!districtInfo) {
    return (
      <div className="site-container py-12 text-center">
        <SEOHead
          title="District Not Found | Vee Power Electricals"
          description="The requested Tamil Nadu district location could not be found."
          robots="noindex, follow"
        />
        <h1 className="text-2xl font-bold text-[#0B3A63] mb-4">Location Not Found</h1>
        <p className="text-[#667085] mb-6">We could not find the Tamil Nadu location you were looking for.</p>
        <Link
          to="/locations/tamil-nadu"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#1769AA] text-white rounded-xl text-sm font-semibold hover:bg-[#0B3A63] transition-colors"
        >
          View All 38 Tamil Nadu Districts
        </Link>
      </div>
    );
  }

  const metaTitle = `Electrical Products & Supplies in ${districtInfo.name}, Tamil Nadu | Vee Power`;
  const metaDescription = `Order genuine ISI electrical cables, switchgear, LED lighting, and fans in ${districtInfo.name} (${districtInfo.majorTowns.slice(0, 3).join(", ")}). ${districtInfo.deliveryTime} from Vee Power Coimbatore.`;
  const canonicalUrl = `https://veepowerelectricals.com/locations/tamil-nadu/${districtInfo.slug}`;

  // Structured Data
  const jsonLdData = [
    {
      "@context": "https://schema.org",
      "@type": "ElectricalSupplyStore",
      "name": `Vee Power Electricals - ${districtInfo.name} Delivery Service`,
      "description": metaDescription,
      "url": canonicalUrl,
      "telephone": "+91-94432-23456",
      "address": {
        "@type": "PostalAddress",
        "streetAddress": "Cross Cut Road, Gandhipuram",
        "addressLocality": "Coimbatore",
        "addressRegion": "Tamil Nadu",
        "postalCode": "641012",
        "addressCountry": "IN"
      },
      "areaServed": {
        "@type": "AdministrativeArea",
        "name": `${districtInfo.name} District, Tamil Nadu`
      }
    }
  ];

  return (
    <div className="w-full bg-[#F6F8FA] min-h-screen py-6 sm:py-8 lg:py-10">
      <SEOHead
        title={metaTitle}
        description={metaDescription}
        canonicalUrl={canonicalUrl}
        jsonLd={jsonLdData}
      />

      <div className="site-container mx-auto">
        <Breadcrumbs
          items={[
            { label: "Locations", path: "/locations/tamil-nadu" },
            { label: "Tamil Nadu", path: "/locations/tamil-nadu" },
            { label: districtInfo.name }
          ]}
          className="mb-5 sm:mb-6"
        />

        {/* Hero Section */}
        <div className="bg-white border border-[#D9E1E8] rounded-2xl p-6 sm:p-8 lg:p-10 shadow-xs mb-8">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2.5 mb-3 flex-wrap">
              <span className="px-3 py-1 text-xs font-bold uppercase tracking-wider bg-[#EFF6FF] text-[#1769AA] rounded-full border border-[#BFDBFE]">
                {districtInfo.zone} Zone, Tamil Nadu
              </span>
              <span className="text-xs font-semibold text-[#10B981] bg-[#ECFDF5] border border-[#A7F3D0] px-3 py-1 rounded-full">
                ✓ {districtInfo.deliveryTime}
              </span>
            </div>

            <h1
              className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-[#0B3A63] tracking-tight leading-tight mb-3"
              style={{ fontFamily: "Outfit, sans-serif" }}
            >
              Electrical Products & Supplies in {districtInfo.name}
            </h1>

            <p className="text-sm sm:text-base text-[#475467] font-medium leading-relaxed mb-5">
              Certified electrical materials delivered directly to construction sites, manufacturing facilities, and homes across {districtInfo.name} from our Coimbatore warehouse.
            </p>

            <p className="text-xs sm:text-sm text-[#667085] leading-relaxed">
              {districtInfo.regionalContext}
            </p>
          </div>

          {/* Logistics Specifications Bar */}
          <div className="mt-8 pt-6 border-t border-[#F1F5F9] grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-4">
              <div className="text-[11px] font-bold text-[#667085] uppercase tracking-wider mb-1">
                Dispatch Hub & Corridor
              </div>
              <div className="text-xs sm:text-sm font-bold text-[#0B3A63]">
                {districtInfo.dispatchHub}
              </div>
            </div>

            <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-4">
              <div className="text-[11px] font-bold text-[#667085] uppercase tracking-wider mb-1">
                Logistics & Parcel Partners
              </div>
              <div className="text-xs sm:text-sm font-bold text-[#0B3A63]">
                {districtInfo.logisticsPartners.join(", ")}
              </div>
            </div>

            <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-4">
              <div className="text-[11px] font-bold text-[#667085] uppercase tracking-wider mb-1">
                District Trade Focus
              </div>
              <div className="text-xs sm:text-sm font-bold text-[#0B3A63] line-clamp-2">
                {districtInfo.industryFocus}
              </div>
            </div>
          </div>
        </div>

        {/* Major Towns / Localities Covered */}
        <div className="bg-white border border-[#D9E1E8] rounded-2xl p-6 sm:p-8 shadow-xs mb-8">
          <h2
            className="text-lg sm:text-xl font-bold text-[#0B3A63] mb-3"
            style={{ fontFamily: "Outfit, sans-serif" }}
          >
            Delivery Coverage Across {districtInfo.name} Towns & Taluks
          </h2>
          <p className="text-xs sm:text-sm text-[#667085] mb-5">
            We provide doorstep delivery and commercial parcel freight across all urban municipalities and rural taluks in {districtInfo.name}, including:
          </p>
          <div className="flex flex-wrap gap-2">
            {districtInfo.majorTowns.map((town, idx) => (
              <span
                key={idx}
                className="text-xs font-semibold px-3 py-1.5 bg-[#EFF6FF] border border-[#BFDBFE] text-[#1769AA] rounded-lg"
              >
                📍 {town}
              </span>
            ))}
          </div>
        </div>

        {/* Regional Technical & Safety Requirements */}
        <div className="bg-white border border-[#D9E1E8] rounded-2xl p-6 sm:p-8 shadow-xs mb-8">
          <h2
            className="text-lg sm:text-xl font-bold text-[#0B3A63] mb-4"
            style={{ fontFamily: "Outfit, sans-serif" }}
          >
            Recommended Electrical Solutions for {districtInfo.name}
          </h2>
          <div className="space-y-3">
            {districtInfo.electricalRequirements.map((req, idx) => (
              <div key={idx} className="flex items-start gap-3 bg-[#F8FAFC] border border-[#E2E8F0] p-4 rounded-xl">
                <span className="text-[#10B981] font-bold mt-0.5">⚡</span>
                <span className="text-xs sm:text-sm text-[#334155] font-medium leading-relaxed">
                  {req}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Popular Categories in this Region */}
        <div className="bg-white border border-[#D9E1E8] rounded-2xl p-6 sm:p-8 shadow-xs mb-8">
          <div className="flex items-center justify-between pb-4 border-b border-[#F1F5F9] mb-6">
            <h2
              className="text-lg sm:text-xl font-bold text-[#0B3A63]"
              style={{ fontFamily: "Outfit, sans-serif" }}
            >
              Essential Electrical Categories for {districtInfo.name}
            </h2>
            <Link
              to="/categories"
              className="text-xs font-bold text-[#1769AA] hover:text-[#0B3A63]"
            >
              View All Categories →
            </Link>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {[
              { name: "Wires & Cables", slug: "wires-cables", icon: "🔌" },
              { name: "Fans", slug: "fans", icon: "🌀" },
              { name: "Switches", slug: "switches", icon: "💡" },
              { name: "LED Lighting", slug: "led-lighting", icon: "✨" },
              { name: "MCB Protection", slug: "mcb-protection", icon: "🛡️" },
              { name: "Accessories", slug: "electrical-accessories", icon: "🧰" }
            ].map((cat) => (
              <Link
                key={cat.slug}
                to={`/categories/${cat.slug}`}
                className="bg-[#F8FAFC] border border-[#E2E8F0] hover:border-[#1769AA]/40 p-4 rounded-xl text-center transition-all group hover:shadow-2xs"
              >
                <div className="text-2xl mb-1">{cat.icon}</div>
                <div className="text-xs font-bold text-[#0B3A63] group-hover:text-[#1769AA] transition-colors">
                  {cat.name}
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Certified Brands Available */}
        <div className="bg-white border border-[#D9E1E8] rounded-2xl p-6 sm:p-8 shadow-xs mb-8">
          <div className="flex items-center justify-between pb-4 border-b border-[#F1F5F9] mb-5">
            <h2
              className="text-lg sm:text-xl font-bold text-[#0B3A63]"
              style={{ fontFamily: "Outfit, sans-serif" }}
            >
              Certified Brands Dispatched to {districtInfo.name}
            </h2>
            <Link
              to="/brands"
              className="text-xs font-bold text-[#1769AA] hover:text-[#0B3A63]"
            >
              All Brands →
            </Link>
          </div>
          <div className="flex flex-wrap gap-2 sm:gap-3">
            {[
              { name: "Polycab", slug: "polycab" },
              { name: "Finolex", slug: "finolex" },
              { name: "Havells", slug: "havells" },
              { name: "Legrand", slug: "legrand" },
              { name: "Philips", slug: "philips" },
              { name: "Crompton", slug: "crompton" },
              { name: "Schneider Electric", slug: "schneider" }
            ].map((b) => (
              <Link
                key={b.slug}
                to={`/brands/${b.slug}`}
                className="px-3.5 py-2 bg-[#F8FAFC] hover:bg-[#EFF6FF] border border-[#D9E1E8] hover:border-[#BFDBFE] text-xs font-semibold text-[#0B3A63] hover:text-[#1769AA] rounded-xl transition-all"
              >
                {b.name}
              </Link>
            ))}
          </div>
        </div>

        {/* How to Order for Contractors and Commercial Projects in District */}
        <div className="bg-[#EFF6FF] border border-[#BFDBFE] rounded-2xl p-6 sm:p-8 mb-8">
          <h2
            className="text-lg sm:text-xl font-bold text-[#0B3A63] mb-3"
            style={{ fontFamily: "Outfit, sans-serif" }}
          >
            Ordering for Sites & Projects in {districtInfo.name}
          </h2>
          <p className="text-xs sm:text-sm text-[#1E3A8A] leading-relaxed mb-4">
            Licensed electricians, builders, and corporate purchasing officers in {districtInfo.name} can procure bulk project quantities with complete tax compliance:
          </p>
          <ul className="space-y-2 text-xs sm:text-sm text-[#1E3A8A] mb-6">
            <li className="flex items-start gap-2">
              <span className="font-bold text-[#1769AA]">•</span>
              <span><strong>GST B2B Tax Invoicing:</strong> Enter your company GSTIN during checkout for 18% or 28% input tax credit reconciliation.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-bold text-[#1769AA]">•</span>
              <span><strong>Project BOQ Quotations:</strong> Email or WhatsApp your electrical Bill of Quantities (BOQ) for discounted project bundle pricing.</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-bold text-[#1769AA]">•</span>
              <span><strong>Direct Road Transport:</strong> Heavy wire reels, conduit bundles, and distribution boards are booked through our established road parcel networks with consignee tracking.</span>
            </li>
          </ul>
          <div className="flex flex-wrap gap-3">
            <Link
              to="/contact"
              className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-[#1769AA] hover:bg-[#0B3A63] text-white rounded-xl text-xs sm:text-sm font-semibold transition-colors shadow-xs"
            >
              Contact Coimbatore Sales Desk
            </Link>
            <Link
              to="/shop"
              className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-white border border-[#BFDBFE] text-[#1769AA] rounded-xl text-xs sm:text-sm font-semibold hover:bg-slate-50 transition-colors"
            >
              Browse Shop Catalog
            </Link>
          </div>
        </div>

        {/* Neighboring District Cross-Linking */}
        {neighboringDistricts.length > 0 && (
          <div className="pt-6 border-t border-[#D9E1E8]">
            <h3 className="text-xs font-bold text-[#667085] uppercase tracking-wider mb-4">
              Other {districtInfo.zone} Tamil Nadu Districts
            </h3>
            <div className="flex flex-wrap gap-2">
              {neighboringDistricts.map((d) => (
                <Link
                  key={d.slug}
                  to={`/locations/tamil-nadu/${d.slug}`}
                  className="px-3 py-1.5 bg-white hover:bg-[#EFF6FF] border border-[#D9E1E8] hover:border-[#BFDBFE] text-xs font-semibold text-[#0B3A63] hover:text-[#1769AA] rounded-lg transition-all"
                >
                  {d.name} ({d.deliveryTime.split("/")[0].trim()})
                </Link>
              ))}
              <Link
                to="/locations/tamil-nadu"
                className="px-3 py-1.5 bg-[#EFF6FF] text-[#1769AA] border border-[#BFDBFE] text-xs font-bold rounded-lg hover:underline"
              >
                All 38 Districts →
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
