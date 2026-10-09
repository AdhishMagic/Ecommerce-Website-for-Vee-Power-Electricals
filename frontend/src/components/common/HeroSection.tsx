import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { productService } from "../../services/productService";
import { HeroCategory } from "../../types/product";
import {
  getCategoryDefaultImage,
  handleProductImageError,
  isInappropriateOrPlaceholderImage,
  GENERIC_FALLBACK_IMAGE,
} from "../../utils/productImageResolver";

const authorizedBrands = ["Havells", "Polycab", "Finolex", "Crompton", "Philips", "Legrand"];

export default function HeroSection() {
  const [categories, setCategories] = useState<HeroCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const fetchHeroCategories = async () => {
    try {
      const data = await productService.getHeroCategories();
      setCategories(data);
    } catch {
      // Handled inside productService with fallback
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHeroCategories();

    // Listen to admin category updates for real-time synchronization
    const handleUpdate = () => {
      fetchHeroCategories();
    };
    window.addEventListener("hero_categories_updated", handleUpdate);
    return () => {
      window.removeEventListener("hero_categories_updated", handleUpdate);
    };
  }, []);

  // Exactly 3 category cards for the showcase:
  // Component 1: Electrical Accessories
  // Component 2: Fans
  // Component 3: LED Lighting
  // (Wires & Cables removed from this showcase as requested)
  const accessoriesCategory = categories.find(
    (c) => c.slug.includes("accessories") || c.name.toLowerCase().includes("accessories")
  ) || categories.find((c) => !c.name.toLowerCase().includes("wire") && !c.name.toLowerCase().includes("cable") && !c.name.toLowerCase().includes("fan") && !c.name.toLowerCase().includes("light")) || {
    id: "cat-accessories",
    name: "Electrical Accessories",
    slug: "electrical-accessories",
    link: "/shop?category=electrical-accessories",
    image: getCategoryDefaultImage("electrical-accessories"),
    subtitle: "Genuine Brands",
    heroOrder: 1,
    heroBadge: "",
    discountEnabled: false,
    discountType: "percentage" as const,
    discountValue: 0,
    discountLabel: "",
  };

  const fansCategory = categories.find(
    (c) => c.slug.includes("fan") || c.name.toLowerCase().includes("fan")
  ) || {
    id: "cat-fans",
    name: "Fans",
    slug: "fans",
    link: "/shop?category=fans",
    image: getCategoryDefaultImage("fans"),
    subtitle: "Genuine Brands",
    heroOrder: 2,
    heroBadge: "",
    discountEnabled: false,
    discountType: "percentage" as const,
    discountValue: 0,
    discountLabel: "",
  };

  const lightingCategory = categories.find(
    (c) => c.slug.includes("light") || c.name.toLowerCase().includes("light") || c.name.toLowerCase().includes("led")
  ) || {
    id: "cat-lighting",
    name: "LED Lighting",
    slug: "led-lighting",
    link: "/shop?category=led-lighting",
    image: getCategoryDefaultImage("led-lighting"),
    subtitle: "Genuine Brands",
    heroOrder: 3,
    heroBadge: "",
    discountEnabled: false,
    discountType: "percentage" as const,
    discountValue: 0,
    discountLabel: "",
  };

  const showcaseCategories = [
    { ...accessoriesCategory, key: "accessories" },
    { ...fansCategory, key: "fans" },
    { ...lightingCategory, key: "lighting" },
  ];

  return (
    <section className="vee-hero relative bg-white pb-12 sm:pb-14 lg:pb-18">
      {/* Background Banner with Electrical Ambience — Spans Full Viewport */}
      <div className="absolute top-0 left-0 w-full h-[80%] sm:h-[84%] lg:h-[86%] bg-gradient-to-br from-[#0B3A63] via-[#0D4579] to-[#1769AA] z-0 overflow-hidden">
        {/* Subtle Background Circuit Grid */}
        <svg
          className="absolute inset-0 w-full h-full opacity-[0.06] pointer-events-none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern
              id="vee-hero-circuit-bg-tight"
              width="56"
              height="56"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 56 0 L 0 0 0 56"
                fill="none"
                stroke="#FFFFFF"
                strokeWidth="0.75"
              />
              <circle cx="56" cy="56" r="1.5" fill="#F2A900" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#vee-hero-circuit-bg-tight)" />
        </svg>

        {/* Ambient Glow Accents */}
        <div className="absolute -top-32 -right-24 w-[520px] h-[520px] bg-[#2196F3]/25 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-1/2 left-1/3 w-[440px] h-[440px] bg-[#F2A900]/14 rounded-full blur-3xl pointer-events-none" />
      </div>

      {/* Hero Container: Single responsive container with fluid margins */}
      <div className="hero-container relative z-10 pt-4 sm:pt-6 lg:pt-8">
        {/* Main Hero Surface Canvas */}
        <div className="bg-white rounded-2xl lg:rounded-3xl shadow-xl shadow-[#0B3A63]/10 border border-[#D9E1E8]/80 px-6 sm:px-8 lg:px-10 xl:px-12 py-8 sm:py-9 lg:py-11 xl:py-12 overflow-hidden">

          {/* Responsive Two-Column Grid: Left Content (0.82fr) + Right Showcase (1.18fr) */}
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(380px,0.85fr)_minmax(540px,1.15fr)] xl:grid-cols-[minmax(420px,0.82fr)_minmax(660px,1.18fr)] gap-7 lg:gap-8 xl:gap-10 items-center">

            {/* Left Column: Direct Commercial Action Engine */}
            <div className="flex flex-col justify-center space-y-4.5 sm:space-y-5 lg:space-y-6 relative z-20">

              {/* Top Badge Row */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex items-center gap-2 bg-[#1769AA]/10 text-[#0B3A63] text-xs font-semibold px-3 py-1.5 rounded-full border border-[#1769AA]/20 shadow-2xs">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#388E3C] opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-[#388E3C]" />
                  </span>
                  <span>DELIVERY ACROSS INDIA</span>
                  <span className="text-[#D9E1E8]">|</span>
                  <span className="text-[#1769AA] font-medium">Authorized Dealer</span>
                </div>
              </div>

              {/* Headline with Outfit typography */}
              <h1
                className="font-bold text-[#17212B] leading-[1.1] tracking-tight"
                style={{
                  fontFamily: "Outfit",
                  fontSize: "clamp(1.85rem, 4.5vw, 3.45rem)",
                }}
              >
                <span className="block">
                  <span>Quality</span>{" "}
                  <span>Products,</span>
                </span>
                <span className="block mt-0.5">
                  <span className="text-[#1769AA] drop-shadow-xs">Delivered</span>{" "}
                  <span className="text-[#1769AA] drop-shadow-xs">Fast</span>
                  <span className="inline-block text-[#F2A900] ml-1.5 text-2xl">⚡</span>
                </span>
              </h1>

              {/* Authorized Brand Pills */}
              <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                <span className="text-[10.5px] font-bold text-[#667085] uppercase tracking-wider mr-0.5">
                  Direct Brands:
                </span>
                {authorizedBrands.map((b) => (
                  <Link
                    key={b}
                    to={`/shop?brand=${encodeURIComponent(b)}`}
                    className="px-2.5 py-1 rounded-md bg-[#F6F8FA] border border-[#D9E1E8] text-[11.5px] font-semibold text-[#0B3A63] hover:border-[#1769AA] hover:text-[#1769AA] hover:bg-white transition-all cursor-pointer shadow-2xs"
                  >
                    {b}
                  </Link>
                ))}
              </div>

              {/* Description */}
              <p className="text-[#475467] leading-relaxed max-w-[510px] text-xs sm:text-[14.5px]">
                Genuine electrical supplies from Havells, Polycab, Finolex,
                Crompton, and more. Trusted by contractors and homeowners across India.
              </p>

              {/* Action Buttons: Dominant "Shop Products" CTA */}
              <div className="flex flex-col sm:flex-row gap-3 pt-1">
                <Link
                  to="/shop"
                  id="hero-shop-products-btn"
                  className="relative group overflow-hidden bg-gradient-to-r from-[#0B3A63] to-[#1769AA] hover:from-[#1769AA] hover:to-[#0B3A63] text-white px-7 py-3.5 rounded-xl font-semibold text-sm transition-all duration-300 shadow-md hover:shadow-xl hover:shadow-[#1769AA]/30 hover:-translate-y-0.5 text-center flex items-center justify-center gap-2 whitespace-nowrap"
                >
                  <span>Shop Products</span>
                  <span className="inline-block transition-transform duration-300 group-hover:translate-x-1">→</span>
                </Link>
                <Link
                  to="/shop?view=categories"
                  id="hero-explore-categories-btn"
                  className="border border-[#D9E1E8] hover:border-[#1769AA] text-[#17212B] hover:text-[#1769AA] px-6 py-3.5 rounded-xl font-semibold text-sm transition-all duration-300 bg-white hover:bg-[#F6F8FA] text-center hover:-translate-y-0.5 shadow-xs whitespace-nowrap"
                >
                  Explore Categories
                </Link>
              </div>

              {/* Metric Assurance Cards */}
              <div className="grid grid-cols-3 gap-2 sm:gap-2.5 pt-4 border-t border-[#EEF2F6]">
                <div className="bg-[#F8FAFC] p-2.5 sm:p-3 rounded-xl border border-[#EEF2F6] flex flex-col hover:border-[#1769AA]/40 transition-colors">
                  <span className="text-[11px] sm:text-xs font-bold text-[#0B3A63] flex items-center gap-1">
                    <span className="text-[#F2A900]">⚡</span> 10,000+
                  </span>
                  <span className="text-[9.5px] sm:text-[10.5px] text-[#667085] truncate font-medium mt-0.5">Products Ready</span>
                </div>

                <div className="bg-[#F8FAFC] p-2.5 sm:p-3 rounded-xl border border-[#EEF2F6] flex flex-col hover:border-[#12773D]/40 transition-colors">
                  <span className="text-[11px] sm:text-xs font-bold text-[#12773D] flex items-center gap-1">
                    <span>🚚</span> Fast Dispatch
                  </span>
                  <span className="text-[9.5px] sm:text-[10.5px] text-[#667085] truncate font-medium mt-0.5">Delivery Across India</span>
                </div>

                <div className="bg-[#F8FAFC] p-2.5 sm:p-3 rounded-xl border border-[#EEF2F6] flex flex-col hover:border-[#1769AA]/40 transition-colors">
                  <span className="text-[11px] sm:text-xs font-bold text-[#1769AA] flex items-center gap-1">
                    <span>🛡️</span> 100% Genuine
                  </span>
                  <span className="text-[9.5px] sm:text-[10.5px] text-[#667085] truncate font-medium mt-0.5">Brand Warranty</span>
                </div>
              </div>

              {/* Social Proof Reassurance Bar */}
              <div className="flex items-center gap-2 text-[11px] text-[#475467] bg-[#F8FAFC] px-4 py-2.5 rounded-xl border border-[#EEF2F6]">
                <span className="text-[#F2A900] font-bold tracking-tighter">★★★★★</span>
                <span className="font-bold text-[#17212B]">4.9/5</span>
                <span className="text-[#D9E1E8]">|</span>
                <span className="truncate">Trusted by 1,200+ electricians &amp; contractors across India</span>
              </div>

            </div>

            {/* Right Column: Commercial Promotional Showcase Studio (Exactly 4 Primary Visual Components) */}
            <div className="relative w-full min-h-[530px] sm:min-h-[550px] lg:h-[565px] xl:h-[585px] rounded-2xl lg:rounded-3xl overflow-hidden bg-gradient-to-br from-[#F8FAFC] via-white to-[#F1F5F9] border border-[#D9E1E8]/90 p-4 sm:p-4.5 lg:p-5 flex flex-col justify-between gap-3 shadow-xs">

              {/* Top Promotional Header Bar */}
              <div className="relative z-20 w-full flex items-center justify-between px-4 py-2.5 bg-white/95 backdrop-blur-md rounded-xl border border-[#D9E1E8]/80 shadow-2xs text-[11px] sm:text-xs">
                <div className="flex items-center gap-2 font-semibold text-[#0B3A63]">
                  <span className="w-2 h-2 rounded-full bg-[#12773D]" />
                  <span>Special Offers on Electrical Essentials</span>
                </div>
                <div className="flex items-center gap-1.5 text-[#1769AA] font-semibold text-[10.5px]">
                  <span>🛡️</span>
                  <span>Trusted Electrical Brands</span>
                </div>
              </div>

              {/* Center Arena (Desktop): Exactly 4 Primary Visual Components in a Balanced Studio Layout */}
              <div id="hero-desktop-showcase" className="relative z-10 hidden lg:grid grid-cols-[minmax(260px,1.15fr)_minmax(240px,1fr)] xl:grid-cols-[minmax(290px,1.2fr)_minmax(260px,1fr)] gap-4 xl:gap-5 items-stretch flex-1 my-1">

                {/* Component 4: Central Electrical Essentials Promotional Card (Primary Focus) */}
                <div className="animate-promo-central relative z-10 w-full h-full min-h-[350px] rounded-2xl bg-white shadow-md shadow-[#0B3A63]/8 border border-[#D9E1E8]/90 overflow-hidden flex flex-col justify-between p-4 xl:p-4.5 group hover:border-[#1769AA]/40 transition-all duration-200">
                  {/* Card Header */}
                  <div className="flex items-center justify-between gap-1 pb-2.5 border-b border-[#EEF2F6]">
                    <span className="animate-promo-badge bg-[#1769AA]/10 text-[#0B3A63] text-[10.5px] xl:text-[11px] font-semibold px-2.5 py-0.5 rounded-full border border-[#1769AA]/20 inline-flex items-center gap-1 whitespace-nowrap">
                      <span className="text-[#F2A900]">★</span> Special Offers
                    </span>
                    <span className="bg-[#12773D]/10 text-[#12773D] text-[10.5px] font-bold px-2.5 py-0.5 rounded-full whitespace-nowrap">
                      25% OFF
                    </span>
                  </div>

                  {/* Center Commercial Product Visual */}
                  <div className="relative w-full flex-1 flex flex-col items-center justify-center p-3.5 xl:p-4 text-center my-2 rounded-xl bg-gradient-to-b from-[#F8FAFC] to-[#F1F5F9] border border-[#EEF2F6]">
                    <div className="w-full max-w-[270px] xl:max-w-[290px] h-44 xl:h-48 rounded-xl overflow-hidden bg-white shadow-xs border border-[#D9E1E8] mb-3 flex items-center justify-center p-2.5 group-hover:scale-[1.02] transition-transform duration-300">
                      <img
                        src={GENERIC_FALLBACK_IMAGE}
                        alt="Quality Electrical Products"
                        className="w-full h-full object-cover object-center transition-transform duration-300 group-hover:scale-105"
                        loading="eager"
                        decoding="async"
                        width="280"
                        height="180"
                        onError={(e) => handleProductImageError(e)}
                      />
                    </div>
                    <h3 className="font-bold text-[#17212B] text-[15px] xl:text-[16px] leading-snug">
                      Electrical Essentials
                    </h3>
                    <p className="text-[12px] xl:text-[12.5px] text-[#667085] mt-1 line-clamp-2 max-w-[290px]">
                      Certified switches, cables, fans &amp; energy-saving LED lighting
                    </p>
                  </div>

                  {/* Card Footer / CTA */}
                  <div className="pt-2.5 border-t border-[#EEF2F6] flex items-center justify-between gap-2">
                    <div className="flex flex-col min-w-0">
                      <span className="text-[10px] text-[#667085] uppercase tracking-wider font-medium truncate">Best Deals</span>
                      <span className="text-xs xl:text-[13px] font-bold text-[#0B3A63] truncate">From ₹99</span>
                    </div>
                    <Link
                      to="/shop"
                      id="hero-center-shop-deals-btn"
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[#0B3A63] hover:bg-[#1769AA] text-white text-xs font-semibold shadow-xs hover:shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all whitespace-nowrap shrink-0"
                    >
                      <span>Shop Deals</span>
                      <span>→</span>
                    </Link>
                  </div>
                </div>

                {/* Right Stack: Exactly 3 Category Cards (Components 1, 2, 3) */}
                <div className="flex flex-col justify-between py-0.5 z-10 gap-3 xl:gap-3.5">
                  {showcaseCategories.map((item, idx) => {
                    const isHovered = hoveredIdx === idx;
                    return (
                      <Link
                        key={item.key}
                        to={item.link}
                        id={`hero-category-${item.slug}`}
                        style={{ animationDelay: `${120 + idx * 80}ms` }}
                        onMouseEnter={() => setHoveredIdx(idx)}
                        onMouseLeave={() => setHoveredIdx(null)}
                        className={`animate-promo-category bg-white/95 backdrop-blur-md p-3.5 xl:p-4 rounded-2xl border border-[#D9E1E8]/90 shadow-2xs flex items-center gap-3.5 group cursor-pointer transition-all duration-200 hover:-translate-y-1 hover:shadow-md ${
                          isHovered ? "border-[#1769AA]" : "hover:border-[#1769AA]/50"
                        }`}
                      >
                        <div className="w-13 h-13 xl:w-14 xl:h-14 rounded-xl overflow-hidden shrink-0 bg-slate-100 relative border border-gray-100 p-0.5">
                          <img
                            src={item.image}
                            alt={item.name}
                            className="w-full h-full object-cover rounded-lg transform group-hover:scale-[1.06] transition-transform duration-200"
                            loading="lazy"
                            decoding="async"
                            width="56"
                            height="56"
                          />
                        </div>
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="text-[13.5px] xl:text-sm font-bold text-[#17212B] group-hover:text-[#1769AA] transition-colors truncate">
                            {item.name}
                          </span>
                          <span className="text-[11px] text-[#667085] truncate mt-0.5">
                            {item.subtitle}
                          </span>
                          {item.discountEnabled && item.discountValue > 0 && (
                            <div className="mt-1">
                              <span className="inline-block bg-[#F2A900] text-[#0B3A63] font-bold text-[9px] px-1.5 py-0.5 rounded shadow-2xs tracking-tight">
                                {item.discountLabel}
                              </span>
                            </div>
                          )}
                        </div>
                        <span className="text-[#1769AA] text-xs font-semibold shrink-0 group-hover:translate-x-1 transition-transform">
                          →
                        </span>
                      </Link>
                    );
                  })}
                </div>

              </div>

              {/* Mobile & Tablet Dedicated Showcase (<1024px): 4-Component Responsive Layout */}
              <div id="hero-mobile-showcase" className="lg:hidden flex flex-col gap-3 my-1 z-20">
                {/* Component 4: Central Commercial Card on Mobile/Tablet */}
                <div className="animate-promo-central w-full rounded-2xl bg-white border border-[#D9E1E8]/90 shadow-xs p-3.5 relative overflow-hidden flex flex-col gap-2.5">
                  <div className="flex items-center justify-between">
                    <span className="animate-promo-badge bg-[#1769AA]/10 text-[#0B3A63] text-[10px] sm:text-[10.5px] font-semibold px-2.5 py-0.5 rounded-full border border-[#1769AA]/20 inline-flex items-center gap-1">
                      <span className="text-[#F2A900]">★</span> Special Offers
                    </span>
                    <span className="bg-[#12773D]/10 text-[#12773D] text-[10px] font-bold px-2 py-0.5 rounded-full">
                      25% OFF
                    </span>
                  </div>

                  <div className="flex items-center gap-3 sm:gap-4 bg-gradient-to-r from-[#F8FAFC] to-[#F1F5F9] p-3 sm:p-3.5 rounded-xl border border-[#EEF2F6]">
                    <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden bg-white shadow-2xs border border-[#D9E1E8] shrink-0 p-1.5 flex items-center justify-center">
                      <img
                        src={GENERIC_FALLBACK_IMAGE}
                        alt="Quality Electrical Products"
                        className="w-full h-full object-contain scale-[1.25]"
                        loading="eager"
                        decoding="async"
                        width="80"
                        height="80"
                        onError={(e) => handleProductImageError(e)}
                      />
                    </div>
                    <div className="flex flex-col min-w-0 flex-1">
                      <span className="text-[12px] sm:text-xs font-bold text-[#17212B] truncate">Electrical Essentials</span>
                      <span className="text-[10.5px] sm:text-[11px] text-[#667085] truncate">Switches, Cables, Fans &amp; Lighting</span>
                      <span className="text-[10px] text-[#12773D] font-semibold mt-0.5">Delivery Across India</span>
                    </div>
                    <Link
                      to="/shop"
                      id="hero-mobile-shop-deals-btn"
                      className="shrink-0 px-3 py-1.5 rounded-lg bg-[#0B3A63] hover:bg-[#1769AA] text-white text-xs font-semibold shadow-xs hover:scale-105 active:scale-95 transition-all whitespace-nowrap"
                    >
                      Shop Deals →
                    </Link>
                  </div>
                </div>

                {/* Exactly 3 Category Cards: Responsive Grid on Tablet / Mobile */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 w-full">
                  {showcaseCategories.map((item, idx) => (
                      <Link
                        key={`m-${item.key}`}
                        to={item.link}
                        style={{ animationDelay: `${150 + idx * 80}ms` }}
                        className="animate-promo-category bg-white p-2.5 sm:p-3 rounded-xl border border-[#D9E1E8]/90 hover:border-[#1769AA] hover:shadow-sm shadow-2xs flex items-center gap-2.5 group transition-all"
                      >
                        <div className="w-11 h-11 sm:w-12 sm:h-12 rounded-lg overflow-hidden shrink-0 bg-slate-100">
                          <img
                            src={item.image}
                            alt={item.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                            loading="lazy"
                            decoding="async"
                            width="48"
                            height="48"
                          />
                        </div>
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="text-[11.5px] sm:text-xs font-bold text-[#17212B] group-hover:text-[#1769AA] truncate">
                            {item.name}
                          </span>
                          {item.discountEnabled && item.discountValue > 0 ? (
                            <span className="text-[9.5px] text-[#B45309] font-bold truncate">
                              {item.discountLabel}
                            </span>
                          ) : (
                            <span className="text-[9.5px] text-[#667085] truncate">
                              {item.subtitle}
                            </span>
                          )}
                        </div>
                        <span className="text-[#1769AA] text-xs font-semibold shrink-0 group-hover:translate-x-1 transition-transform">
                          →
                        </span>
                      </Link>
                    ))}
                </div>
              </div>

              {/* Bottom Showcase Promotional Strip */}
              <div className="animate-promo-strip relative z-20 w-full bg-[#0B3A63] text-white rounded-xl py-2 px-3 sm:px-4 shadow-2xs">
                <div className="flex flex-wrap items-center justify-between gap-y-1.5 gap-x-3 text-[10px] sm:text-[10.5px] font-medium text-white/90">
                  <span className="flex items-center gap-1.5">
                    <span className="text-[#F2A900]">⚡</span>
                    <span>Special Offers on Selected Products</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="text-[#388E3C]">●</span>
                    <span>Delivery Across India</span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="text-[#F2A900]">🛡️</span>
                    <span>100% Genuine Brand Warranty</span>
                  </span>
                </div>
              </div>

            </div>

          </div>

        </div>
      </div>
    </section>
  );
}
