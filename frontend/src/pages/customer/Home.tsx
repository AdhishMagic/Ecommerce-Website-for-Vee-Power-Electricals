import { Link } from "react-router-dom";
import { products, categories, brands } from "../../data/mock/products";
import ProductCard from "../../components/common/ProductCard";

const whyChoose = [
  { icon: "✅", title: "Genuine Products", desc: "100% authentic products from authorized brand distributors. No counterfeits." },
  { icon: "🏆", title: "Trusted Brands", desc: "Exclusive dealer for Havells, Polycab, Finolex, Crompton, and 7 more top brands." },
  { icon: "💰", title: "Competitive Pricing", desc: "Best market prices with seasonal offers. Bulk pricing available for contractors." },
  { icon: "🚚", title: "Reliable Service", desc: "Fast dispatch from Coimbatore. Pan-Tamil Nadu delivery with order tracking." },
];

export default function Home() {
  const featuredProducts = products.filter(p => p.featured);

  return (
    <div>
      {/* Hero Section */}
      <section className="relative bg-white pb-0">
        {/* Background Banner */}
        <div className="absolute top-0 left-0 w-full h-[80%] bg-gradient-to-br from-[#0B3A63] via-[#0D4579] to-[#1769AA] z-0"></div>
        
        <div className="relative z-10 max-w-7xl mx-auto px-4 pt-12 sm:pt-16">
          {/* Main Hero Container - Div on Div effect */}
          <div className="bg-white rounded-3xl shadow-2xl shadow-[#0B3A63]/20 overflow-hidden border border-white/40 flex flex-col md:flex-row">
            {/* Text Content */}
            <div className="p-8 sm:p-12 md:w-1/2 flex flex-col justify-center relative">
              <div className="absolute top-0 right-0 w-64 h-64 bg-[#F2A900]/5 rounded-full blur-3xl -z-10 transform translate-x-1/2 -translate-y-1/2"></div>
              
              <div className="inline-flex items-center gap-2 bg-[#F6F8FA] text-[#0B3A63] text-xs font-semibold px-4 py-1.5 rounded-full mb-6 tracking-wider uppercase border border-[#D9E1E8] w-max">
                <span className="w-2 h-2 rounded-full bg-[#12773D] animate-pulse"></span>
                Coimbatore's Trusted Store
              </div>
              
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-[#17212B] leading-[1.1] mb-6" style={{ fontFamily: "Outfit" }}>
                Quality Products,<br />
                <span className="text-[#1769AA]">Delivered Fast</span>
              </h1>
              
              <p className="text-[#667085] text-lg mb-8 leading-relaxed max-w-md">
                Genuine electrical supplies from Havells, Polycab, Finolex, Crompton, and more. Trusted by professionals across Tamil Nadu.
              </p>
              
              <div className="flex flex-wrap gap-4">
                <Link to="/shop" className="bg-[#1769AA] hover:bg-[#0B3A63] text-white font-bold px-8 py-3.5 rounded-xl transition-all shadow-lg shadow-[#1769AA]/20">
                  Shop Products
                </Link>
                <Link to="/shop?view=categories" className="bg-[#F6F8FA] hover:bg-[#D9E1E8] text-[#17212B] font-semibold px-8 py-3.5 rounded-xl transition-all border border-[#D9E1E8]">
                  Explore Categories
                </Link>
              </div>
              
              <div className="mt-10 flex flex-wrap gap-6 text-sm font-medium text-[#667085]">
                <span className="flex items-center gap-1.5"><span className="text-[#F2A900]">⚡</span> 10,000+ Products</span>
                <span className="flex items-center gap-1.5"><span className="text-[#12773D]">🚚</span> Fast Shipping</span>
              </div>
            </div>
            
            {/* Image Content */}
            <div className="md:w-1/2 bg-[#F6F8FA] relative min-h-[300px] md:min-h-full">
              <div className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-2 p-2">
                {[
                  { src: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=500&h=400&fit=crop", alt: "Ceiling Fan" },
                  { src: "https://images.unsplash.com/photo-1550985616-10810253b84d?w=500&h=400&fit=crop", alt: "LED Lighting" },
                  { src: "https://images.unsplash.com/photo-1621905251918-48416bd8575a?w=500&h=400&fit=crop", alt: "Electrical Cables" },
                  { src: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=500&h=400&fit=crop", alt: "LED Panels" },
                ].map((img, i) => (
                  <div key={i} className="rounded-2xl overflow-hidden shadow-sm relative group">
                    <div className="absolute inset-0 bg-[#0B3A63]/10 group-hover:bg-transparent transition-colors z-10"></div>
                    <img
                      src={img.src}
                      alt={img.alt}
                      className="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-700"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
          
        </div>
      </section>

      {/* Quote Section */}
      <section className="bg-white py-16 sm:py-20 lg:py-24">
        <div className="max-w-5xl mx-auto px-4">
          <div className="flex flex-col items-center text-center gap-3 sm:gap-4 text-[#3b2f2a]">
            <p
              className="text-xs sm:text-sm uppercase tracking-[0.55em] text-[#6b5b52]"
              style={{ fontFamily: "Inter" }}
            >
              Our Promise
            </p>
            <div
              className="group flex flex-col items-center gap-2 sm:gap-3 uppercase tracking-widest"
              style={{ fontFamily: "Playfair Display, serif" }}
            >
              <p
                className="text-[1.55rem] sm:text-[2.15rem] lg:text-[2.75rem] leading-[1.08] font-semibold transform-gpu transition-all duration-300 ease-in-out cursor-default group-hover:-translate-y-1 group-hover:scale-105 group-hover:drop-shadow-lg"
                style={{ color: "#3b2f2a" }}
              >
                Empowering Your World With
              </p>
              <p
                className="text-[1.55rem] sm:text-[2.15rem] lg:text-[2.75rem] leading-[1.08] font-semibold transform-gpu transition-all duration-300 ease-in-out cursor-default group-hover:-translate-y-1 group-hover:scale-105 group-hover:drop-shadow-lg"
                style={{ color: "#3b2f2a" }}
              >
                Safe, Reliable, And Timeless
              </p>
              <p
                className="text-[1.55rem] sm:text-[2.15rem] lg:text-[2.75rem] leading-[1.08] font-semibold transform-gpu transition-all duration-300 ease-in-out cursor-default group-hover:-translate-y-1 group-hover:scale-105 group-hover:drop-shadow-lg"
                style={{ color: "#3b2f2a" }}
              >
                Electrical Solutions
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Categories Carousel */}
      <section className="bg-white py-12 overflow-hidden">
        <div className="max-w-7xl mx-auto px-4">
          <div className="rounded-3xl border border-gray-200 bg-white shadow-sm transition-all duration-300 ease-in-out hover:-translate-y-1 hover:shadow-xl overflow-hidden">
            <div className="px-6 py-6 sm:px-8 sm:py-8 border-b border-gray-200/80">
              <div className="flex justify-between items-end gap-4">
                <div>
                  <h2 className="text-2xl font-bold text-[#0B3A63]">Shop by Category</h2>
                  <p className="text-[#667085] text-sm mt-1">Browse our complete electrical product range</p>
                </div>
                <Link to="/shop?view=categories" className="text-sm text-[#1769AA] hover:text-[#0B3A63] font-medium hidden sm:block">
                  View all categories →
                </Link>
              </div>
            </div>

            <div className="relative w-full flex overflow-hidden group hover-pause py-4 bg-white">
              <div className="absolute left-0 top-0 bottom-0 w-16 bg-linear-to-r from-white to-transparent z-10"></div>
              <div className="absolute right-0 top-0 bottom-0 w-16 bg-linear-to-l from-white to-transparent z-10"></div>

              <div className="flex animate-marquee whitespace-nowrap min-w-max">
                <div className="flex gap-8 px-4">
                  {categories.map(cat => (
                    <Link
                      key={`first-${cat.id}`}
                      to={`/shop?category=${cat.id}`}
                      className="flex flex-col items-center group/cat w-32 shrink-0"
                    >
                      <div className="w-24 h-24 rounded-full bg-[#F6F8FA] border border-[#D9E1E8] flex items-center justify-center text-4xl shadow-sm group-hover/cat:shadow-md group-hover/cat:-translate-y-2 group-hover/cat:bg-[#0B3A63] group-hover/cat:border-[#0B3A63] transition-all duration-300">
                        <span className="group-hover/cat:scale-110 transition-transform">{cat.icon}</span>
                      </div>
                      <div className="mt-4 text-sm font-semibold text-[#17212B] group-hover/cat:text-[#1769AA] transition-colors truncate w-full text-center">
                        {cat.name}
                      </div>
                      <div className="text-[10px] text-[#667085] uppercase tracking-wider mt-1">{cat.subcategories.length} types</div>
                    </Link>
                  ))}
                </div>

                <div className="flex gap-8 px-4">
                  {categories.map(cat => (
                    <Link
                      key={`second-${cat.id}`}
                      to={`/shop?category=${cat.id}`}
                      className="flex flex-col items-center group/cat w-32 shrink-0"
                    >
                      <div className="w-24 h-24 rounded-full bg-[#F6F8FA] border border-[#D9E1E8] flex items-center justify-center text-4xl shadow-sm group-hover/cat:shadow-md group-hover/cat:-translate-y-2 group-hover/cat:bg-[#0B3A63] group-hover/cat:border-[#0B3A63] transition-all duration-300">
                        <span className="group-hover/cat:scale-110 transition-transform">{cat.icon}</span>
                      </div>
                      <div className="mt-4 text-sm font-semibold text-[#17212B] group-hover/cat:text-[#1769AA] transition-colors truncate w-full text-center">
                        {cat.name}
                      </div>
                      <div className="text-[10px] text-[#667085] uppercase tracking-wider mt-1">{cat.subcategories.length} types</div>
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Featured Products */}
      <section className="bg-white py-10 sm:py-14">
        <div className="max-w-7xl mx-auto px-4">
          <div className="rounded-3xl border border-gray-200 bg-white shadow-sm transition-all duration-300 ease-in-out hover:-translate-y-1 hover:shadow-xl overflow-hidden">
            <div className="px-6 py-6 sm:px-8 sm:py-8 border-b border-gray-200/80 flex justify-between items-end gap-4">
              <div>
                <h2 className="text-2xl font-bold text-[#0B3A63]">Featured Products</h2>
                <p className="text-[#667085] text-sm mt-1">Popular picks across our top categories</p>
              </div>
              <Link to="/shop" className="text-sm text-[#1769AA] hover:text-[#0B3A63] font-medium">View all →</Link>
            </div>
            <div className="px-6 py-6 sm:px-8 sm:py-8">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {featuredProducts.map(p => <ProductCard key={p.id} product={p} />)}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Brands */}
      <section className="bg-white py-10 sm:py-14">
        <div className="max-w-7xl mx-auto px-4">
          <div className="rounded-3xl border border-gray-200 bg-white shadow-sm transition-all duration-300 ease-in-out hover:-translate-y-1 hover:shadow-xl overflow-hidden">
            <div className="px-6 py-6 sm:px-8 sm:py-8 border-b border-gray-200/80 text-center">
              <h2 className="text-2xl font-bold text-[#0B3A63]">Brands We Carry</h2>
              <p className="text-[#667085] text-sm mt-1">Authorised dealer for India's leading electrical brands</p>
            </div>
            <div className="px-6 py-6 sm:px-8 sm:py-8">
              <div className="flex flex-wrap justify-center gap-3">
                {brands.map(brand => (
                  <Link
                    key={brand}
                    to={`/shop?brand=${encodeURIComponent(brand.toLowerCase())}`}
                    className="flex items-center gap-2 bg-[#F6F8FA] hover:bg-[#0B3A63] border border-[#D9E1E8] hover:border-[#0B3A63] rounded-lg px-5 py-3 transition-all duration-300 ease-in-out group hover:-translate-y-1 hover:shadow-lg"
                  >
                    <span className="text-sm font-semibold text-[#17212B] group-hover:text-white">{brand}</span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why Choose */}
      <section className="bg-white py-10 sm:py-14">
        <div className="max-w-7xl mx-auto px-4">
          <div className="rounded-3xl border border-gray-200 bg-white shadow-sm transition-all duration-300 ease-in-out hover:-translate-y-1 hover:shadow-xl overflow-hidden">
            <div className="px-6 py-6 sm:px-8 sm:py-8 border-b border-gray-200/80 text-center">
              <h2 className="text-2xl font-bold text-[#0B3A63]">Why Choose Vee Power?</h2>
              <p className="text-[#667085] text-sm mt-1">Trusted by contractors, builders & homes across Tamil Nadu</p>
            </div>
            <div className="px-6 py-6 sm:px-8 sm:py-8">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {whyChoose.map(item => (
                  <div
                    key={item.title}
                    className="group bg-white border border-[#D9E1E8] rounded-xl p-5 transition-all duration-300 ease-out transform-gpu hover:-translate-y-3 hover:scale-105 hover:shadow-2xl hover:bg-[#0B3A63]"
                  >
                    <div className="text-3xl mb-3 transition-all duration-300 ease-out group-hover:drop-shadow-sm group-hover:scale-110">
                      <span className="transition-colors duration-300 group-hover:text-white" aria-hidden="true">
                        {item.icon}
                      </span>
                    </div>
                    <h3 className="font-bold text-[#0B3A63] mb-1.5 transition-colors duration-300 group-hover:text-white">
                      {item.title}
                    </h3>
                    <p className="text-sm text-[#667085] leading-relaxed transition-colors duration-300 group-hover:text-white">
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
      <section className="bg-[#0B3A63] py-10">
        <div className="max-w-7xl mx-auto px-4 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold text-white mb-2" style={{ fontFamily: "Outfit" }}>
            Need Bulk Electrical Supplies?
          </h2>
          <p className="text-white/70 mb-6">Special pricing for contractors, builders and project purchases. Contact us for a custom quote.</p>
          <div className="flex justify-center">
            <Link to="/contact" className="bg-[#F2A900] hover:bg-[#D4920A] text-[#0B3A63] font-bold px-6 py-3 rounded-lg">
              Get Bulk Quote
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
