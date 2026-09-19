import { useRef, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { productService } from "../../services/productService";
import { HeroCategory } from "../../types/product";

const authorizedBrands = ["Havells", "Polycab", "Finolex", "Crompton", "Philips", "Legrand"];

export default function HeroSection() {
  const videoRef = useRef<HTMLVideoElement>(null);
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

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.play().catch(() => {});
    }
  }, []);

  // Up to 4 featured categories displayed in hero
  const displayCategories = categories.slice(0, 4);

  // Dynamic telemetry status text based on hovered category
  const activeHoverCategory = hoveredIdx !== null ? displayCategories[hoveredIdx] : null;

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
        {/* Main Hero Surface Canvas — Increased Height & Gracious Vertical Padding */}
        <div className="bg-white rounded-2xl lg:rounded-3xl shadow-xl shadow-[#0B3A63]/10 border border-[#D9E1E8]/80 px-6 sm:px-8 lg:px-10 xl:px-12 py-8 sm:py-9 lg:py-11 xl:py-12 overflow-hidden">
          
          {/* Responsive Two-Column Grid: Left Content (0.82fr) + Right Showcase (1.18fr) */}
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(380px,0.85fr)_minmax(540px,1.15fr)] xl:grid-cols-[minmax(420px,0.82fr)_minmax(660px,1.18fr)] gap-7 lg:gap-8 xl:gap-10 items-center">
            
            {/* Left Column: Direct Commercial Action Engine */}
            <div className="flex flex-col justify-center space-y-4.5 sm:space-y-5 lg:space-y-6 relative z-20">
              
              {/* Top Badge Row */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="vee-badge-anim inline-flex items-center gap-2 bg-[#1769AA]/10 text-[#0B3A63] text-xs font-semibold px-3 py-1.5 rounded-full border border-[#1769AA]/20 shadow-2xs">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#388E3C] opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-[#388E3C]" />
                  </span>
                  <span>COIMBATORE'S TRUSTED STORE</span>
                  <span className="text-[#D9E1E8]">|</span>
                  <span className="text-[#1769AA] font-medium">Authorized Dealer</span>
                </div>

                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#B45309] bg-[#FFFBEB] border border-[#F2A900]/30 px-2.5 py-1 rounded-full">
                  <span className="text-xs">⚡</span> Pan-TN Dispatch
                </span>
              </div>

              {/* Animated Headline with Outfit typography */}
              <h1
                className="font-bold text-[#17212B] leading-[1.1] tracking-tight"
                style={{
                  fontFamily: "Outfit",
                  fontSize: "clamp(2.2rem, 3.1vw, 3.45rem)",
                }}
              >
                <span className="block">
                  <span className="vee-word vee-word-1">Quality</span>{" "}
                  <span className="vee-word vee-word-2">Products,</span>
                </span>
                <span className="block mt-0.5">
                  <span className="vee-word vee-word-3 text-[#1769AA] drop-shadow-xs">Delivered</span>{" "}
                  <span className="vee-word vee-word-4 text-[#1769AA] drop-shadow-xs">Fast</span>
                  <span className="inline-block text-[#F2A900] ml-1.5 text-2xl animate-pulse">⚡</span>
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
              <p className="vee-desc-anim text-[#475467] leading-relaxed max-w-[510px] text-xs sm:text-[14.5px]">
                Genuine electrical supplies from Havells, Polycab, Finolex,
                Crompton, and more. Trusted by contractors and homeowners across Tamil Nadu.
              </p>

              {/* Action Buttons: Dominant "Shop Products" CTA */}
              <div className="flex flex-col sm:flex-row gap-3 pt-1">
                <Link
                  to="/shop"
                  id="hero-shop-products-btn"
                  className="vee-cta-primary-anim relative group overflow-hidden bg-gradient-to-r from-[#0B3A63] to-[#1769AA] hover:from-[#1769AA] hover:to-[#0B3A63] text-white px-7 py-3.5 rounded-xl font-semibold text-sm transition-all duration-300 shadow-md hover:shadow-xl hover:shadow-[#1769AA]/30 hover:-translate-y-0.5 text-center flex items-center justify-center gap-2 whitespace-nowrap"
                >
                  <span>Shop Products</span>
                  <span className="inline-block transition-transform duration-300 group-hover:translate-x-1">→</span>
                  <div className="vee-shimmer" />
                </Link>
                <Link
                  to="/shop?view=categories"
                  id="hero-explore-categories-btn"
                  className="vee-cta-secondary-anim border border-[#D9E1E8] hover:border-[#1769AA] text-[#17212B] hover:text-[#1769AA] px-6 py-3.5 rounded-xl font-semibold text-sm transition-all duration-300 bg-white hover:bg-[#F6F8FA] text-center hover:-translate-y-0.5 shadow-xs whitespace-nowrap"
                >
                  Explore Categories
                </Link>
              </div>

              {/* Live Metric Cards — Balanced & Integrated */}
              <div className="vee-trust-anim grid grid-cols-3 gap-2.5 pt-4 border-t border-[#EEF2F6]">
                <div className="bg-[#F8FAFC] p-3 rounded-xl border border-[#EEF2F6] flex flex-col hover:border-[#1769AA]/40 transition-colors">
                  <span className="text-xs font-bold text-[#0B3A63] flex items-center gap-1">
                    <span className="text-[#F2A900]">⚡</span> 10,000+
                  </span>
                  <span className="text-[10.5px] text-[#667085] truncate font-medium mt-0.5">Products Ready</span>
                </div>

                <div className="bg-[#F8FAFC] p-3 rounded-xl border border-[#EEF2F6] flex flex-col hover:border-[#12773D]/40 transition-colors">
                  <span className="text-xs font-bold text-[#12773D] flex items-center gap-1">
                    <span>🚚</span> Fast Dispatch
                  </span>
                  <span className="text-[10.5px] text-[#667085] truncate font-medium mt-0.5">Pan-TN Delivery</span>
                </div>

                <div className="bg-[#F8FAFC] p-3 rounded-xl border border-[#EEF2F6] flex flex-col hover:border-[#1769AA]/40 transition-colors">
                  <span className="text-xs font-bold text-[#1769AA] flex items-center gap-1">
                    <span>🛡️</span> 100% Genuine
                  </span>
                  <span className="text-[10.5px] text-[#667085] truncate font-medium mt-0.5">Brand Warranty</span>
                </div>
              </div>

              {/* Contractor Social Proof Reassurance Bar */}
              <div className="flex items-center gap-2 text-[11px] text-[#475467] bg-[#F8FAFC] px-4 py-2.5 rounded-xl border border-[#EEF2F6]">
                <span className="text-[#F2A900] font-bold tracking-tighter">★★★★★</span>
                <span className="font-bold text-[#17212B]">4.9/5</span>
                <span className="text-[#D9E1E8]">|</span>
                <span className="truncate">Trusted by 1,200+ electricians & contractors in Tamil Nadu</span>
              </div>

            </div>

            {/* Right Column: High-Impact Showcase Studio — Taller & Generously Sized */}
            <div className="relative w-full min-h-[530px] sm:min-h-[550px] lg:h-[565px] xl:h-[585px] rounded-2xl lg:rounded-3xl overflow-hidden bg-gradient-to-br from-[#F8FAFC] via-white to-[#F1F5F9] border border-[#D9E1E8]/90 p-4 sm:p-4.5 lg:p-5 flex flex-col justify-between gap-3 shadow-xs">
              
              {/* Top Telemetry & Oscilloscope Bar with Live Reactive Letters */}
              <div className="relative z-20 w-full flex items-center justify-between px-4 py-2 bg-white/95 backdrop-blur-md rounded-xl border border-[#D9E1E8]/80 shadow-2xs text-[10.5px] sm:text-[11px] transition-all">
                <div className="flex items-center gap-2 font-bold">
                  <span className="w-2 h-2 rounded-full bg-[#12773D] animate-pulse" />
                  {activeHoverCategory ? (
                    <span className="text-[#1769AA] font-mono tracking-wide">
                      ⚡ CONNECTED: {activeHoverCategory.name.toUpperCase()} {activeHoverCategory.discountLabel ? `[${activeHoverCategory.discountLabel}]` : ''}
                    </span>
                  ) : (
                    <span className="text-[#0B3A63] font-mono tracking-wide">
                      ⚡ 240V / 50Hz ACTIVE GRID
                    </span>
                  )}
                </div>

                {/* Oscillating AC Sine Wave Display */}
                <div className="hidden sm:flex items-center gap-1.5 bg-[#0B3A63]/5 px-2.5 py-0.5 rounded border border-[#1769AA]/15 overflow-hidden">
                  <span className="text-[9px] font-mono font-bold text-[#1769AA]">AC WAVE:</span>
                  <div className="w-16 h-3.5 overflow-hidden relative flex items-center">
                    <div className="vee-sine-track flex items-center opacity-85">
                      <svg width="64" height="14" viewBox="0 0 64 14" className="shrink-0">
                        <path
                          d="M 0 7 Q 8 0, 16 7 T 32 7 T 48 7 T 64 7"
                          fill="none"
                          stroke="#1769AA"
                          strokeWidth="1.5"
                        />
                      </svg>
                      <svg width="64" height="14" viewBox="0 0 64 14" className="shrink-0">
                        <path
                          d="M 0 7 Q 8 0, 16 7 T 32 7 T 48 7 T 64 7"
                          fill="none"
                          stroke="#1769AA"
                          strokeWidth="1.5"
                        />
                      </svg>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center gap-1 text-[#B45309] font-semibold font-mono text-[10px]">
                  <span>🛡️</span>
                  <span>IS:694 & CE</span>
                </div>
              </div>

              {/* Animated Conduit Letters Stream */}
              <div className="hidden lg:block relative z-10 w-full overflow-hidden bg-[#1769AA]/8 border-y border-[#1769AA]/15 py-1 px-3 rounded-lg">
                <div className="vee-conduit-stream text-[9.5px] font-mono font-bold tracking-widest text-[#0B3A63]/80 gap-6 items-center select-none">
                  <span className="flex items-center gap-1.5 text-[#1769AA]">
                    <span>⚡ FEEDER 01: FANS & MOTORS [240V]</span>
                    <span className="text-[#F2A900]">➔</span>
                  </span>
                  <span className="flex items-center gap-1.5 text-[#0B3A63]">
                    <span>⚡ FEEDER 02: LED & LIGHTING [ISI]</span>
                    <span className="text-[#F2A900]">➔</span>
                  </span>
                  <span className="flex items-center gap-1.5 text-[#12773D]">
                    <span>⚡ FEEDER 03: COPPER WIRES & CABLES [IS:694]</span>
                    <span className="text-[#F2A900]">➔</span>
                  </span>
                  <span className="flex items-center gap-1.5 text-[#B45309]">
                    <span>⚡ FEEDER 04: MODULAR SWITCHES [10AX]</span>
                    <span className="text-[#F2A900]">➔</span>
                  </span>

                  {/* Infinite Loop Duplication */}
                  <span className="flex items-center gap-1.5 text-[#1769AA]">
                    <span>⚡ FEEDER 01: FANS & MOTORS [240V]</span>
                    <span className="text-[#F2A900]">➔</span>
                  </span>
                  <span className="flex items-center gap-1.5 text-[#0B3A63]">
                    <span>⚡ FEEDER 02: LED & LIGHTING [ISI]</span>
                    <span className="text-[#F2A900]">➔</span>
                  </span>
                  <span className="flex items-center gap-1.5 text-[#12773D]">
                    <span>⚡ FEEDER 03: COPPER WIRES & CABLES [IS:694]</span>
                    <span className="text-[#F2A900]">➔</span>
                  </span>
                  <span className="flex items-center gap-1.5 text-[#B45309]">
                    <span>⚡ FEEDER 04: MODULAR SWITCHES [10AX]</span>
                    <span className="text-[#F2A900]">➔</span>
                  </span>
                </div>
              </div>

              {/* Background Blueprint Watermark Letters */}
              <div className="absolute inset-0 pointer-events-none flex flex-col justify-center items-center opacity-[0.025] select-none z-0">
                <span className="text-5xl sm:text-6xl lg:text-7xl font-black tracking-widest text-[#0B3A63] uppercase">
                  VEE POWER HUB
                </span>
                <span className="text-xs font-mono tracking-widest text-[#0B3A63] mt-0.5">
                  240V AC // 50HZ // TESTED COMMERCIAL SPECIFICATIONS
                </span>
              </div>

              {/* Center Arena (Desktop): 3-Column Wings & Circuit Conduits — Statuesque & Taller */}
              <div className="relative z-10 hidden lg:grid grid-cols-[minmax(185px,225px)_1fr_minmax(185px,225px)] xl:grid-cols-[minmax(205px,255px)_1fr_minmax(205px,255px)] gap-3.5 xl:gap-5 items-stretch flex-1 my-1">
                
                {/* SVG Circuit Lines connecting Central Stage to Wings */}
                <svg
                  className="absolute inset-0 w-full h-full pointer-events-none z-0"
                  viewBox="0 0 680 360"
                  preserveAspectRatio="none"
                >
                  {/* Conduit Left-Top: Center to Fans */}
                  <path
                    d="M 220 105 L 185 105 L 155 75"
                    fill="none"
                    stroke="#D9E1E8"
                    strokeWidth="1.5"
                    strokeDasharray="4 4"
                  />
                  <path
                    d="M 220 105 L 185 105 L 155 75"
                    fill="none"
                    stroke={hoveredIdx === 0 ? "#F2A900" : "#1769AA"}
                    strokeWidth={hoveredIdx === 0 ? 3 : 2}
                    className={hoveredIdx === 0 ? "vee-circuit-pulse-fast" : "vee-circuit-pulse-line"}
                  />
                  <circle cx="155" cy="75" r="4" fill="#F2A900" className="vee-node-dot" />

                  {/* Conduit Left-Bottom: Center to Wires & Cables */}
                  <path
                    d="M 220 255 L 185 255 L 155 285"
                    fill="none"
                    stroke="#D9E1E8"
                    strokeWidth="1.5"
                    strokeDasharray="4 4"
                  />
                  <path
                    d="M 220 255 L 185 255 L 155 285"
                    fill="none"
                    stroke={hoveredIdx === 2 ? "#F2A900" : "#1769AA"}
                    strokeWidth={hoveredIdx === 2 ? 3 : 2}
                    className={hoveredIdx === 2 ? "vee-circuit-pulse-fast" : "vee-circuit-pulse-line"}
                  />
                  <circle cx="155" cy="285" r="4" fill="#F2A900" className="vee-node-dot" />

                  {/* Conduit Right-Top: Center to LED & Lighting */}
                  <path
                    d="M 460 105 L 495 105 L 525 75"
                    fill="none"
                    stroke="#D9E1E8"
                    strokeWidth="1.5"
                    strokeDasharray="4 4"
                  />
                  <path
                    d="M 460 105 L 495 105 L 525 75"
                    fill="none"
                    stroke={hoveredIdx === 1 ? "#F2A900" : "#1769AA"}
                    strokeWidth={hoveredIdx === 1 ? 3 : 2}
                    className={hoveredIdx === 1 ? "vee-circuit-pulse-fast" : "vee-circuit-pulse-line"}
                  />
                  <circle cx="525" cy="75" r="4" fill="#F2A900" className="vee-node-dot" />

                  {/* Conduit Right-Bottom: Center to Switches */}
                  <path
                    d="M 460 255 L 495 255 L 525 285"
                    fill="none"
                    stroke="#D9E1E8"
                    strokeWidth="1.5"
                    strokeDasharray="4 4"
                  />
                  <path
                    d="M 460 255 L 495 255 L 525 285"
                    fill="none"
                    stroke={hoveredIdx === 3 ? "#F2A900" : "#1769AA"}
                    strokeWidth={hoveredIdx === 3 ? 3 : 2}
                    className={hoveredIdx === 3 ? "vee-circuit-pulse-fast" : "vee-circuit-pulse-line"}
                  />
                  <circle cx="525" cy="285" r="4" fill="#F2A900" className="vee-node-dot" />
                </svg>

                {/* Left Wing: Category 0 (Fans) and Category 2 (Wires) */}
                <div className="flex flex-col justify-between py-2 z-10 gap-6 xl:gap-8">
                  {loading ? (
                    <>
                      <div className="h-[90px] bg-white/80 rounded-2xl border border-gray-200 animate-pulse" />
                      <div className="h-[90px] bg-white/80 rounded-2xl border border-gray-200 animate-pulse" />
                    </>
                  ) : (
                    [displayCategories[0], displayCategories[2]].map((item, localIdx) => {
                      if (!item) return null;
                      const globalIdx = localIdx === 0 ? 0 : 2;
                      const isHovered = hoveredIdx === globalIdx;

                      return (
                        <Link
                          key={item.id}
                          to={item.link}
                          id={`hero-category-${item.slug}`}
                          onMouseEnter={() => setHoveredIdx(globalIdx)}
                          onMouseLeave={() => setHoveredIdx(null)}
                          className={`vee-card-interactive ${
                            isHovered ? "vee-card-active" : ""
                          } bg-white/95 backdrop-blur-md p-3.5 xl:p-4 rounded-2xl border border-[#D9E1E8]/90 shadow-2xs flex items-center gap-3.5 group cursor-pointer`}
                        >
                          <div className="w-13 h-13 xl:w-14 xl:h-14 rounded-xl overflow-hidden shrink-0 bg-slate-100 relative border border-gray-100">
                            <img
                              src={item.image}
                              alt={item.name}
                              className="w-full h-full object-cover transform group-hover:scale-[1.06] transition-transform duration-200"
                              loading="lazy"
                              decoding="async"
                            />
                          </div>
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className="text-[13.5px] xl:text-[14px] font-bold text-[#17212B] group-hover:text-[#1769AA] transition-colors truncate">
                              {item.name}
                            </span>
                            <span className="text-[11px] xl:text-[11.5px] text-[#667085] truncate">
                              {item.subtitle}
                            </span>
                            {item.discountEnabled && item.discountValue > 0 && (
                              <div className="mt-0.5">
                                <span className="inline-block bg-[#F2A900] text-[#0B3A63] font-bold text-[9px] px-1.5 py-0.2 rounded shadow-2xs tracking-tight">
                                  {item.discountLabel}
                                </span>
                              </div>
                            )}
                          </div>
                          <span className="text-[#1769AA] text-xs font-semibold shrink-0 group-hover:translate-x-0.5 transition-transform">
                            →
                          </span>
                        </Link>
                      );
                    })
                  )}
                </div>

                {/* Central Animated Electrical Technician Stage — Substantial Height */}
                <div className="vee-technician-anim relative z-10 w-full max-w-[285px] sm:max-w-[305px] xl:max-w-[330px] mx-auto h-full min-h-[330px] sm:min-h-[350px] xl:min-h-[370px] rounded-2xl bg-white shadow-md shadow-[#0B3A63]/8 border border-[#D9E1E8]/90 overflow-hidden flex flex-col justify-between p-2 group">
                  
                  {/* Lamp Warm Golden Aura synchronizing with the light bulb */}
                  <div className="absolute top-0 left-1/4 w-56 h-56 bg-[#F2A900]/30 rounded-full blur-3xl pointer-events-none vee-lamp-glow" />

                  {/* Top Status Header */}
                  <div className="relative z-10 flex items-center justify-between px-2.5 pt-1.5 pointer-events-none">
                    <span className="bg-white/95 backdrop-blur-md px-2.5 py-0.5 rounded-full border border-gray-200 text-[10px] font-semibold text-[#0B3A63] flex items-center gap-1.5 shadow-2xs">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#F2A900] animate-pulse" />
                      Live Electrical Craft
                    </span>
                    <span className="bg-[#1769AA]/10 backdrop-blur-md px-2.5 py-0.5 rounded-full text-[10px] font-bold text-[#1769AA] font-mono">
                      240V Line
                    </span>
                  </div>

                  {/* Looping Character Animation — Generous Height */}
                  <div className="relative w-full flex-1 min-h-[245px] sm:min-h-[265px] xl:min-h-[285px] flex items-center justify-center bg-white p-1">
                    <video
                      ref={videoRef}
                      src="/electrician-hero.mp4"
                      autoPlay
                      muted
                      loop
                      playsInline
                      preload="metadata"
                      aria-label="Electrical technician installing lighting fixture"
                      className="w-full h-full object-contain object-center scale-[1.04]"
                    />
                  </div>

                  {/* Bottom Strip */}
                  <div className="relative z-10 bg-gradient-to-t from-[#F8FAFC] to-white border-t border-[#EEF2F6] px-3.5 py-2 flex items-center justify-between text-[11px]">
                    <span className="font-medium text-[#17212B] flex items-center gap-1">
                      <span className="text-[#F2A900]">💡</span> Powering Coimbatore
                    </span>
                    <Link
                      to="/shop?category=lighting"
                      className="font-bold text-[#1769AA] hover:text-[#0B3A63] inline-flex items-center gap-1 transition-colors"
                    >
                      <span>Shop Lights</span>
                      <span>→</span>
                    </Link>
                  </div>
                </div>

                {/* Right Wing: Category 1 (Lighting) and Category 3 (Switches) */}
                <div className="flex flex-col justify-between py-2 z-10 gap-6 xl:gap-8">
                  {loading ? (
                    <>
                      <div className="h-[90px] bg-white/80 rounded-2xl border border-gray-200 animate-pulse" />
                      <div className="h-[90px] bg-white/80 rounded-2xl border border-gray-200 animate-pulse" />
                    </>
                  ) : (
                    [displayCategories[1], displayCategories[3]].map((item, localIdx) => {
                      if (!item) return null;
                      const globalIdx = localIdx === 0 ? 1 : 3;
                      const isHovered = hoveredIdx === globalIdx;

                      return (
                        <Link
                          key={item.id}
                          to={item.link}
                          id={`hero-category-${item.slug}`}
                          onMouseEnter={() => setHoveredIdx(globalIdx)}
                          onMouseLeave={() => setHoveredIdx(null)}
                          className={`vee-card-interactive ${
                            isHovered ? "vee-card-active" : ""
                          } bg-white/95 backdrop-blur-md p-3.5 xl:p-4 rounded-2xl border border-[#D9E1E8]/90 shadow-2xs flex items-center gap-3.5 group cursor-pointer`}
                        >
                          <div className="w-13 h-13 xl:w-14 xl:h-14 rounded-xl overflow-hidden shrink-0 bg-slate-100 relative border border-gray-100">
                            <img
                              src={item.image}
                              alt={item.name}
                              className="w-full h-full object-cover transform group-hover:scale-[1.06] transition-transform duration-200"
                              loading="lazy"
                              decoding="async"
                            />
                          </div>
                          <div className="flex flex-col min-w-0 flex-1">
                            <span className="text-[13.5px] xl:text-[14px] font-bold text-[#17212B] group-hover:text-[#1769AA] transition-colors truncate">
                              {item.name}
                            </span>
                            <span className="text-[11px] xl:text-[11.5px] text-[#667085] truncate">
                              {item.subtitle}
                            </span>
                            {item.discountEnabled && item.discountValue > 0 && (
                              <div className="mt-0.5">
                                <span className="inline-block bg-[#F2A900] text-[#0B3A63] font-bold text-[9px] px-1.5 py-0.2 rounded shadow-2xs tracking-tight">
                                  {item.discountLabel}
                                </span>
                              </div>
                            )}
                          </div>
                          <span className="text-[#1769AA] text-xs font-semibold shrink-0 group-hover:translate-x-0.5 transition-transform">
                            →
                          </span>
                        </Link>
                      );
                    })
                  )}
                </div>

              </div>

              {/* Mobile & Tablet Dedicated Showcase (<1024px) */}
              <div className="lg:hidden flex flex-col gap-3 my-1 z-20">
                {/* Central Technician Video Card on Mobile */}
                <div className="w-full rounded-2xl bg-white border border-[#D9E1E8]/90 shadow-xs p-2.5 relative overflow-hidden flex flex-col items-center">
                  <div className="absolute top-2 inset-x-3 flex items-center justify-between z-10">
                    <span className="bg-white/95 px-2 py-0.5 rounded-full border border-gray-200 text-[10px] font-semibold text-[#0B3A63] flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#F2A900] animate-pulse" />
                      Live Craft
                    </span>
                    <span className="bg-[#1769AA]/10 px-2 py-0.5 rounded-full text-[10px] font-bold text-[#1769AA] font-mono">
                      240V Line
                    </span>
                  </div>

                  <div className="w-full h-[200px] sm:h-[230px] flex items-center justify-center">
                    <video
                      src="/electrician-hero.mp4"
                      autoPlay
                      muted
                      loop
                      playsInline
                      preload="metadata"
                      aria-label="Electrical technician installing lighting fixture"
                      className="w-full h-full object-contain"
                    />
                  </div>

                  <div className="w-full flex items-center justify-between text-[11px] pt-2 border-t border-[#EEF2F6] px-1">
                    <span className="font-medium text-[#17212B]">💡 Powering Coimbatore</span>
                    <Link to="/shop?category=lighting" className="font-bold text-[#1769AA]">
                      Shop Lights →
                    </Link>
                  </div>
                </div>

                {/* 2x2 Responsive Category Card Grid on Mobile */}
                <div className="grid grid-cols-2 gap-2 w-full">
                  {loading ? (
                    <>
                      <div className="h-16 bg-white rounded-xl border border-gray-200 animate-pulse" />
                      <div className="h-16 bg-white rounded-xl border border-gray-200 animate-pulse" />
                    </>
                  ) : (
                    displayCategories.map((item) => (
                      <Link
                        key={`m-${item.id}`}
                        to={item.link}
                        className="bg-white p-2.5 rounded-xl border border-[#D9E1E8]/90 hover:border-[#1769AA] shadow-2xs flex items-center gap-2.5 group transition-all"
                      >
                        <div className="w-11 h-11 rounded-lg overflow-hidden shrink-0 bg-slate-100">
                          <img
                            src={item.image}
                            alt={item.name}
                            className="w-full h-full object-cover"
                            loading="lazy"
                            decoding="async"
                          />
                        </div>
                        <div className="flex flex-col min-w-0 flex-1">
                          <span className="text-[11.5px] font-bold text-[#17212B] group-hover:text-[#1769AA] truncate">
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
                        <span className="text-[#1769AA] text-xs font-semibold shrink-0">
                          →
                        </span>
                      </Link>
                    ))
                  )}
                </div>
              </div>

              {/* Bottom Showcase Promotional Ticker: Continuous Infinite Marquee */}
              <div className="relative z-20 w-full overflow-hidden bg-[#0B3A63] text-white rounded-xl py-2 px-4 mt-0.5 shadow-2xs">
                <div className="vee-ticker-track text-[10px] sm:text-[10.5px] font-semibold uppercase tracking-wider gap-8 text-white/90">
                  <span className="flex items-center gap-1.5">
                    <span className="text-[#F2A900]">⚡</span> SPECIAL ONLINE OFFERS: UP TO 25% OFF ON FANS & LIGHTING
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="text-[#1769AA] bg-white px-1.5 py-0.2 rounded text-[9px] font-bold text-[#0B3A63]">PAN-TN</span>
                    EXPRESS COIMBATORE DISPATCH
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="text-[#F2A900]">🛡️</span> 100% ORIGINAL AUTHORIZED BRAND WARRANTY
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="text-[#388E3C]">●</span> 10,000+ PRODUCTS IN STOCK
                  </span>

                  {/* Duplicate track for seamless infinite marquee */}
                  <span className="flex items-center gap-1.5">
                    <span className="text-[#F2A900]">⚡</span> SPECIAL ONLINE OFFERS: UP TO 25% OFF ON FANS & LIGHTING
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="text-[#1769AA] bg-white px-1.5 py-0.2 rounded text-[9px] font-bold text-[#0B3A63]">PAN-TN</span>
                    EXPRESS COIMBATORE DISPATCH
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="text-[#F2A900]">🛡️</span> 100% ORIGINAL AUTHORIZED BRAND WARRANTY
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="text-[#388E3C]">●</span> 10,000+ PRODUCTS IN STOCK
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
