import { useState, useMemo } from "react";
import { Link } from "react-router-dom";
import Breadcrumbs from "../../components/common/Breadcrumbs";
import SEOHead from "../../components/common/SEOHead";
import { TAMIL_NADU_DISTRICTS, DistrictInfo } from "../../data/tamilNaduDistricts";

export default function TamilNaduHubPage() {
  const [selectedZone, setSelectedZone] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const districtsList = useMemo(() => {
    return Object.values(TAMIL_NADU_DISTRICTS);
  }, []);

  const filteredDistricts = useMemo(() => {
    return districtsList.filter((d) => {
      const matchesZone = selectedZone === "all" || d.zone === selectedZone;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        d.name.toLowerCase().includes(q) ||
        d.majorTowns.some((t) => t.toLowerCase().includes(q)) ||
        d.industryFocus.toLowerCase().includes(q);
      return matchesZone && matchesSearch;
    });
  }, [districtsList, selectedZone, searchQuery]);

  const zones: ("all" | "Western" | "Northern" | "Central" | "Southern" | "Delta / Coastal")[] = [
    "all",
    "Western",
    "Northern",
    "Central",
    "Southern",
    "Delta / Coastal"
  ];

  // Schema.org Structured Data
  const jsonLdData = [
    {
      "@context": "https://schema.org",
      "@type": "ElectricalSupplyStore",
      "name": "Vee Power Electricals - Tamil Nadu State Distribution",
      "description": "Authorized electrical supplies and project distribution across all 38 districts of Tamil Nadu from our central Coimbatore logistics hub.",
      "url": "https://veepowerelectricals.com/locations/tamil-nadu",
      "address": {
        "@type": "PostalAddress",
        "streetAddress": "Cross Cut Road, Gandhipuram",
        "addressLocality": "Coimbatore",
        "addressRegion": "Tamil Nadu",
        "postalCode": "641012",
        "addressCountry": "IN"
      },
      "telephone": "+91-94432-23456",
      "areaServed": districtsList.map(d => ({
        "@type": "AdministrativeArea",
        "name": `${d.name} District, Tamil Nadu`
      }))
    }
  ];

  return (
    <div className="w-full bg-[#F6F8FA] min-h-screen py-6 sm:py-8 lg:py-10">
      <SEOHead
        title="Electrical Supplies Delivery Across All 38 Tamil Nadu Districts | Vee Power"
        description="Fast dispatch of genuine electrical cables, switchgear, LED lighting, and fans across all 38 districts of Tamil Nadu. Same-day & 24-48hr courier delivery from Coimbatore."
        canonicalUrl="https://veepowerelectricals.com/locations/tamil-nadu"
        jsonLd={jsonLdData}
      />

      <div className="site-container mx-auto">
        <Breadcrumbs
          items={[
            { label: "Locations" },
            { label: "Tamil Nadu" }
          ]}
          className="mb-5 sm:mb-6"
        />

        {/* Hero Section */}
        <div className="bg-white border border-[#D9E1E8] rounded-2xl p-6 sm:p-8 lg:p-10 shadow-xs mb-8">
          <div className="max-w-3xl">
            <span className="inline-block px-3 py-1 text-xs font-bold uppercase tracking-wider bg-[#EFF6FF] text-[#1769AA] rounded-full mb-3 border border-[#BFDBFE]">
              Statewide Logistics Network
            </span>
            <h1
              className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-[#0B3A63] tracking-tight leading-tight mb-3"
              style={{ fontFamily: "Outfit, sans-serif" }}
            >
              Electrical Products Delivery Across All 38 Tamil Nadu Districts
            </h1>
            <p className="text-sm sm:text-base text-[#475467] font-medium leading-relaxed mb-5">
              Dispatched directly from our Coimbatore Central Warehouse at Cross Cut Road, Gandhipuram.
            </p>
            <p className="text-xs sm:text-sm text-[#667085] leading-relaxed">
              Vee Power Electricals supplies licensed electrical contractors, commercial building developers, industrial manufacturing plants, and residential homeowners across Tamil Nadu. Whether you require project coils of Polycab FR-LSH copper wire in Tiruppur, Legrand modular switches in Chennai, high-breaking MCBs in Hosur, or heavy agricultural pump starters in Erode and Thanjavur, our dedicated road transport and express courier logistics ensure prompt, fully insured delivery.
            </p>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mt-8 pt-6 border-t border-[#F1F5F9]">
            <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3.5 text-center">
              <div className="text-xl sm:text-2xl font-black text-[#0B3A63]">38 / 38</div>
              <div className="text-[11px] font-semibold text-[#667085] uppercase tracking-wide mt-0.5">
                Districts Covered
              </div>
            </div>
            <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3.5 text-center">
              <div className="text-xl sm:text-2xl font-black text-[#1769AA]">24 - 48 Hr</div>
              <div className="text-[11px] font-semibold text-[#667085] uppercase tracking-wide mt-0.5">
                Average Transit
              </div>
            </div>
            <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3.5 text-center">
              <div className="text-xl sm:text-2xl font-black text-[#10B981]">100%</div>
              <div className="text-[11px] font-semibold text-[#667085] uppercase tracking-wide mt-0.5">
                Genuine ISI Brands
              </div>
            </div>
            <div className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3.5 text-center">
              <div className="text-xl sm:text-2xl font-black text-[#F59E0B]">GST B2B</div>
              <div className="text-[11px] font-semibold text-[#667085] uppercase tracking-wide mt-0.5">
                Tax Invoicing
              </div>
            </div>
          </div>
        </div>

        {/* Search & Zone Filter Bar */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 pb-6 border-b border-[#D9E1E8] mb-8">
          {/* Zone Tabs */}
          <div className="flex flex-wrap gap-1.5 sm:gap-2">
            {zones.map((zone) => (
              <button
                key={zone}
                type="button"
                onClick={() => setSelectedZone(zone)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  selectedZone === zone
                    ? "bg-[#0B3A63] text-white shadow-2xs"
                    : "bg-white border border-[#D9E1E8] text-[#475467] hover:border-[#1769AA] hover:text-[#1769AA]"
                }`}
              >
                {zone === "all" ? "All Zones (38)" : zone}
              </button>
            ))}
          </div>

          {/* Search Input */}
          <div className="w-full md:w-72 shrink-0">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search district, town or industry..."
              className="w-full px-3.5 py-2 bg-white border border-[#D9E1E8] rounded-xl text-xs sm:text-sm text-[#17212B] placeholder-[#667085] focus:outline-none focus:border-[#1769AA] shadow-2xs"
            />
          </div>
        </div>

        {/* District Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 sm:gap-6 mb-12">
          {filteredDistricts.map((district) => (
            <article
              key={district.slug}
              className={`bg-white border rounded-2xl p-5 sm:p-6 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between ${
                district.isHeadquarters
                  ? "border-[#1769AA] ring-2 ring-[#1769AA]/10"
                  : "border-[#D9E1E8] hover:border-[#1769AA]/40"
              }`}
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h2
                    className="text-lg sm:text-xl font-bold text-[#0B3A63]"
                    style={{ fontFamily: "Outfit, sans-serif" }}
                  >
                    {district.name}
                  </h2>
                  {district.isHeadquarters ? (
                    <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-[#EFF6FF] text-[#1769AA] border border-[#BFDBFE] rounded-full">
                      HQ & Store
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-[#F1F5F9] text-[#475467] rounded-full">
                      {district.zone}
                    </span>
                  )}
                </div>

                <div className="text-xs text-[#1769AA] font-semibold mb-3 flex items-center gap-1.5">
                  <span>⏱</span>
                  <span>{district.deliveryTime}</span>
                </div>

                <p className="text-xs text-[#667085] leading-relaxed mb-4 line-clamp-3">
                  {district.regionalContext}
                </p>

                <div className="mb-4">
                  <span className="text-[11px] font-bold text-[#475467] uppercase tracking-wider block mb-1.5">
                    Major Coverage Hubs:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {district.majorTowns.slice(0, 4).map((town, idx) => (
                      <span
                        key={idx}
                        className="text-[11px] bg-[#F8FAFC] border border-[#E2E8F0] text-[#334155] px-2 py-0.5 rounded-md"
                      >
                        {town}
                      </span>
                    ))}
                    {district.majorTowns.length > 4 && (
                      <span className="text-[11px] text-[#667085] px-1 py-0.5">
                        +{district.majorTowns.length - 4} more
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-[#F1F5F9] flex items-center justify-between">
                <span className="text-[11px] text-[#667085]">
                  Via: {district.logisticsPartners[0]}
                </span>
                <Link
                  to={`/locations/tamil-nadu/${district.slug}`}
                  className="inline-flex items-center gap-1 text-xs font-bold text-[#1769AA] hover:text-[#0B3A63] transition-colors"
                >
                  <span>View District Details</span>
                  <span>→</span>
                </Link>
              </div>
            </article>
          ))}
        </div>

        {/* Central Warehouse & Order Information Block */}
        <div className="bg-[#0B3A63] text-white rounded-2xl p-6 sm:p-8 lg:p-10 mb-8 shadow-sm">
          <div className="max-w-3xl">
            <h2
              className="text-xl sm:text-2xl font-bold mb-3"
              style={{ fontFamily: "Outfit, sans-serif" }}
            >
              Coimbatore Central Warehouse & Trade Counter
            </h2>
            <p className="text-xs sm:text-sm text-white/80 leading-relaxed mb-6">
              Our main trade store and wholesale dispatch warehouse is located in the commercial heart of Coimbatore at Cross Cut Road, Gandhipuram. Contractors, industrial buyers, and electricians can place orders online for express courier dispatch to any of Tamil Nadu's 38 districts or visit our trade counter for immediate same-day store pickup.
            </p>
            <div className="flex flex-wrap gap-4 text-xs font-medium text-white/90">
              <div className="flex items-center gap-2">
                <span className="text-[#60A5FA]">📍</span>
                <span>Cross Cut Road, Gandhipuram, Coimbatore - 641012</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[#60A5FA]">📞</span>
                <span>Direct Sales: +91 94432 23456</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[#60A5FA]">🕒</span>
                <span>Monday – Saturday: 9:00 AM – 8:30 PM</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
