import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { productService } from "../../services/productService";
import { Product, Category } from "../../types/product";
import ProductCard from "../../components/common/ProductCard";
import HeroSection from "../../components/common/HeroSection";

const whyChoose = [
  { icon: "✅", title: "Genuine Products", desc: "100% authentic products from authorized brand distributors. No counterfeits." },
  { icon: "🏆", title: "Trusted Brands", desc: "Exclusive dealer for Havells, Polycab, Finolex, Crompton, and 7 more top brands." },
  { icon: "💰", title: "Competitive Pricing", desc: "Best market prices with seasonal offers. Bulk pricing available for contractors." },
  { icon: "🚚", title: "Reliable Service", desc: "Fast dispatch from Coimbatore. Pan-Tamil Nadu delivery with order tracking." },
];

export default function Home() {
  const [featuredProducts, setFeaturedProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  const [isPaused, setIsPaused] = useState(false);
  const [speed, setSpeed] = useState<"normal" | "slow" | "fast">("normal");

  useEffect(() => {
    let isMounted = true;
    const loadHomeData = async () => {
      try {
        setLoading(true);
        const [feat, cats, brs] = await Promise.all([
          productService.getProducts({ featured: true }),
          productService.getCategories(),
          productService.getBrands(),
        ]);
        if (isMounted) {
          setFeaturedProducts(feat);
          setCategories(cats);
          setBrands(brs);
        }
      } catch (err) {
        console.error("Failed to load homepage data:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadHomeData();
    return () => {
      isMounted = false;
    };
  }, []);

  // Duplicate categories 3 times per track to ensure wide screens (>2560px) never see blank space
  const loopedTrack = categories.length > 0 ? [...categories, ...categories, ...categories] : [];

  const durationMap = {
    slow: "60s",
    normal: "40s",
    fast: "24s",
  };

  return (
    <div className="w-full">
      {/* Hero Section */}
      <HeroSection />

      {/* Quote Section */}
      <section className="bg-white py-12 sm:py-16 lg:py-20">
        <div className="site-container mx-auto">
          <div className="flex flex-col items-center text-center gap-3 sm:gap-4 text-[#3b2f2a] max-w-4xl mx-auto">
            <p
              className="text-xs sm:text-sm uppercase tracking-[0.35em] sm:tracking-[0.55em] text-[#6b5b52]"
              style={{ fontFamily: "Inter" }}
            >
              Our Promise
            </p>
            <div
              className="group flex flex-col items-center gap-1.5 sm:gap-2 lg:gap-3 uppercase tracking-wider sm:tracking-widest"
              style={{ fontFamily: "Playfair Display, serif" }}
            >
              <p
                className="leading-[1.12] font-semibold transform-gpu transition-all duration-300 ease-in-out cursor-default group-hover:-translate-y-1 group-hover:scale-105 group-hover:drop-shadow-lg"
                style={{
                  color: "#3b2f2a",
                  fontSize: "clamp(1.15rem, 2.8vw, 2.75rem)"
                }}
              >
                Empowering Your World With
              </p>
              <p
                className="leading-[1.12] font-semibold transform-gpu transition-all duration-300 ease-in-out cursor-default group-hover:-translate-y-1 group-hover:scale-105 group-hover:drop-shadow-lg"
                style={{
                  color: "#3b2f2a",
                  fontSize: "clamp(1.15rem, 2.8vw, 2.75rem)"
                }}
              >
                Safe, Reliable, And Timeless
              </p>
              <p
                className="leading-[1.12] font-semibold transform-gpu transition-all duration-300 ease-in-out cursor-default group-hover:-translate-y-1 group-hover:scale-105 group-hover:drop-shadow-lg"
                style={{
                  color: "#3b2f2a",
                  fontSize: "clamp(1.15rem, 2.8vw, 2.75rem)"
                }}
              >
                Electrical Solutions
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Categories Carousel */}
      {categories.length > 0 && (
        <section className="bg-white py-8 sm:py-12 overflow-hidden">
          <div className="site-container mx-auto">
            <div className="rounded-2xl sm:rounded-3xl border border-gray-200 bg-white shadow-sm transition-all duration-300 ease-in-out hover:shadow-lg overflow-hidden">
              <div className="px-5 py-5 sm:px-8 sm:py-6 border-b border-gray-200/80">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-3 sm:gap-4">
                  <div>
                    <h2 className="text-xl sm:text-2xl font-bold text-[#0B3A63]" style={{ fontFamily: "Outfit" }}>Shop by Category</h2>
                    <p className="text-[#667085] text-xs sm:text-sm mt-0.5">Browse our complete electrical product range</p>
                  </div>

                  {/* Optimized Animation Controls & View All Link */}
                  <div className="flex items-center gap-2 sm:gap-3 self-end sm:self-auto">
                    {/* Play / Pause Toggle */}
                    <button
                      type="button"
                      onClick={() => setIsPaused(prev => !prev)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl border border-gray-200 bg-[#F8FAFC] text-[#0B3A63] hover:bg-[#EEF2F6] hover:border-[#1769AA]/40 transition-all cursor-pointer shadow-2xs select-none"
                      title={isPaused ? "Resume continuous scroll" : "Pause continuous scroll"}
                      aria-label={isPaused ? "Resume continuous scroll" : "Pause continuous scroll"}
                    >
                      <span>{isPaused ? "▶" : "⏸"}</span>
                      <span>{isPaused ? "Play" : "Pause"}</span>
                    </button>

                    {/* Speed Selector */}
                    <div className="hidden md:inline-flex items-center rounded-xl border border-gray-200 bg-[#F8FAFC] p-0.5 text-xs font-semibold text-[#0B3A63] shadow-2xs">
                      {(["slow", "normal", "fast"] as const).map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setSpeed(s)}
                          className={`px-2 py-1 rounded-lg capitalize transition-all cursor-pointer text-[11px] ${
                            speed === s
                              ? "bg-white text-[#1769AA] font-bold shadow-2xs"
                              : "text-[#667085] hover:text-[#0B3A63]"
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>

                    <Link to="/shop?view=categories" className="text-xs sm:text-sm text-[#1769AA] hover:text-[#0B3A63] font-semibold transition-colors whitespace-nowrap pl-1">
                      View all categories →
                    </Link>
                  </div>
                </div>
              </div>

              {/* Seamless Infinite Marquee Track with Hardware Acceleration */}
              <div className="relative w-full flex overflow-hidden group hover-pause py-5 bg-white">
                {/* Left & Right Soft Fade Gradients */}
                <div className="absolute left-0 top-0 bottom-0 w-12 sm:w-20 bg-gradient-to-r from-white via-white/80 to-transparent z-10 pointer-events-none" />
                <div className="absolute right-0 top-0 bottom-0 w-12 sm:w-20 bg-gradient-to-l from-white via-white/80 to-transparent z-10 pointer-events-none" />

                <div
                  className="flex animate-marquee whitespace-nowrap will-change-transform select-none"
                  style={{
                    animationPlayState: isPaused ? "paused" : "running",
                    animationDuration: durationMap[speed],
                  }}
                >
                  {/* Track Group 1 */}
                  <div className="flex gap-6 sm:gap-8 px-3 sm:px-4 shrink-0">
                    {loopedTrack.map((cat, idx) => (
                      <Link
                        key={`t1-${cat.id}-${idx}`}
                        to={`/shop?category=${cat.id}`}
                        className="flex flex-col items-center group/cat w-28 sm:w-32 shrink-0"
                      >
                        <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-[#F6F8FA] border border-[#D9E1E8] flex items-center justify-center text-3xl sm:text-4xl shadow-2xs group-hover/cat:shadow-md group-hover/cat:-translate-y-1.5 group-hover/cat:bg-[#0B3A63] group-hover/cat:border-[#0B3A63] transition-all duration-300 overflow-hidden">
                          {cat.image ? (
                            <img src={cat.image} alt={cat.name} className="w-full h-full object-cover rounded-full" />
                          ) : (
                            <span className="group-hover/cat:scale-110 transition-transform">{cat.icon || "⚡"}</span>
                          )}
                        </div>
                        <div className="mt-3 text-xs sm:text-sm font-semibold text-[#17212B] group-hover/cat:text-[#1769AA] transition-colors truncate w-full text-center">
                          {cat.name}
                        </div>
                        <div className="text-[10px] text-[#667085] uppercase tracking-wider mt-0.5">
                          {cat.subcategories.length} types
                        </div>
                      </Link>
                    ))}
                  </div>

                  {/* Track Group 2: Exact Twin for Seamless Loop */}
                  <div className="flex gap-6 sm:gap-8 px-3 sm:px-4 shrink-0" aria-hidden="true">
                    {loopedTrack.map((cat, idx) => (
                      <Link
                        key={`t2-${cat.id}-${idx}`}
                        to={`/shop?category=${cat.id}`}
                        tabIndex={-1}
                        className="flex flex-col items-center group/cat w-28 sm:w-32 shrink-0"
                      >
                        <div className="w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-[#F6F8FA] border border-[#D9E1E8] flex items-center justify-center text-3xl sm:text-4xl shadow-2xs group-hover/cat:shadow-md group-hover/cat:-translate-y-1.5 group-hover/cat:bg-[#0B3A63] group-hover/cat:border-[#0B3A63] transition-all duration-300 overflow-hidden">
                          {cat.image ? (
                            <img src={cat.image} alt={cat.name} className="w-full h-full object-cover rounded-full" />
                          ) : (
                            <span className="group-hover/cat:scale-110 transition-transform">{cat.icon || "⚡"}</span>
                          )}
                        </div>
                        <div className="mt-3 text-xs sm:text-sm font-semibold text-[#17212B] group-hover/cat:text-[#1769AA] transition-colors truncate w-full text-center">
                          {cat.name}
                        </div>
                        <div className="text-[10px] text-[#667085] uppercase tracking-wider mt-0.5">
                          {cat.subcategories.length} types
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Featured Products */}
      <section className="bg-white py-8 sm:py-12">
        <div className="site-container mx-auto">
          <div className="rounded-2xl sm:rounded-3xl border border-gray-200 bg-white shadow-sm transition-all duration-300 ease-in-out hover:-translate-y-1 hover:shadow-xl overflow-hidden">
            <div className="px-5 py-5 sm:px-8 sm:py-7 border-b border-gray-200/80 flex justify-between items-end gap-4">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-[#0B3A63]" style={{ fontFamily: "Outfit" }}>Featured Products</h2>
                <p className="text-[#667085] text-xs sm:text-sm mt-1">Popular picks across our top categories</p>
              </div>
              <Link to="/shop" className="text-xs sm:text-sm text-[#1769AA] hover:text-[#0B3A63] font-medium">View all →</Link>
            </div>
            <div className="px-4 py-5 sm:px-8 sm:py-8">
              {loading && featuredProducts.length === 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="animate-pulse bg-gray-100 rounded-xl h-64"></div>
                  ))}
                </div>
              ) : featuredProducts.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
                  {featuredProducts.map(p => <ProductCard key={p.id} product={p} />)}
                </div>
              ) : (
                <div className="text-center py-10 text-gray-500 text-sm">
                  No featured products available at the moment.
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Brands */}
      {brands.length > 0 && (
        <section className="bg-white py-8 sm:py-12">
          <div className="site-container mx-auto">
            <div className="rounded-2xl sm:rounded-3xl border border-gray-200 bg-white shadow-sm transition-all duration-300 ease-in-out hover:-translate-y-1 hover:shadow-xl overflow-hidden">
              <div className="px-5 py-5 sm:px-8 sm:py-7 border-b border-gray-200/80 text-center">
                <h2 className="text-xl sm:text-2xl font-bold text-[#0B3A63]" style={{ fontFamily: "Outfit" }}>Brands We Carry</h2>
                <p className="text-[#667085] text-xs sm:text-sm mt-1">Authorised dealer for India's leading electrical brands</p>
              </div>
              <div className="px-4 py-6 sm:px-8 sm:py-8">
                <div className="flex flex-wrap justify-center gap-2.5 sm:gap-3 lg:gap-4">
                  {brands.map(brand => (
                    <Link
                      key={brand}
                      to={`/shop?brand=${encodeURIComponent(brand.toLowerCase())}`}
                      className="flex items-center gap-2 bg-[#F6F8FA] hover:bg-[#0B3A63] border border-[#D9E1E8] hover:border-[#0B3A63] rounded-lg px-4 py-2.5 sm:px-5 sm:py-3 transition-all duration-300 ease-in-out group hover:-translate-y-1 hover:shadow-lg"
                    >
                      <span className="text-xs sm:text-sm font-semibold text-[#17212B] group-hover:text-white">{brand}</span>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Why Choose */}
      <section className="bg-white py-8 sm:py-12">
        <div className="site-container mx-auto">
          <div className="rounded-2xl sm:rounded-3xl border border-gray-200 bg-white shadow-sm transition-all duration-300 ease-in-out hover:-translate-y-1 hover:shadow-xl overflow-hidden">
            <div className="px-5 py-5 sm:px-8 sm:py-7 border-b border-gray-200/80 text-center">
              <h2 className="text-xl sm:text-2xl font-bold text-[#0B3A63]" style={{ fontFamily: "Outfit" }}>Why Choose Vee Power?</h2>
              <p className="text-[#667085] text-xs sm:text-sm mt-1">Trusted by contractors, builders & homes across Tamil Nadu</p>
            </div>
            <div className="px-4 py-6 sm:px-8 sm:py-8">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5 lg:gap-6">
                {whyChoose.map(item => (
                  <div
                    key={item.title}
                    className="group bg-white border border-[#D9E1E8] rounded-xl p-5 transition-all duration-300 ease-out transform-gpu hover:-translate-y-2 hover:shadow-xl hover:bg-[#0B3A63]"
                  >
                    <div className="text-2xl sm:text-3xl mb-3 transition-all duration-300 ease-out group-hover:scale-110">
                      <span className="transition-colors duration-300 group-hover:text-white" aria-hidden="true">
                        {item.icon}
                      </span>
                    </div>
                    <h3 className="font-bold text-[#0B3A63] text-sm sm:text-base mb-1.5 transition-colors duration-300 group-hover:text-white" style={{ fontFamily: "Outfit" }}>
                      {item.title}
                    </h3>
                    <p className="text-xs sm:text-sm text-[#667085] leading-relaxed transition-colors duration-300 group-hover:text-white">
                      {item.desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Banner */}
      <section className="bg-[#0B3A63] py-10 sm:py-14">
        <div className="site-container mx-auto text-center">
          <h2 className="text-xl sm:text-2xl md:text-3xl font-bold text-white mb-2" style={{ fontFamily: "Outfit" }}>
            Need Bulk Electrical Supplies?
          </h2>
          <p className="text-white/70 text-xs sm:text-sm md:text-base mb-6 max-w-2xl mx-auto">Special pricing for contractors, builders and project purchases. Contact us for a custom quote.</p>
          <div className="flex justify-center">
            <Link to="/contact" className="bg-[#F2A900] hover:bg-[#D4920A] text-[#0B3A63] font-bold px-6 py-3 rounded-lg text-sm sm:text-base shadow-md">
              Get Bulk Quote
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
