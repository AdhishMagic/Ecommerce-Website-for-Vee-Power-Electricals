import { Link } from "react-router-dom";
import { products, categories, brands } from "../data/products";
import ProductCard from "../components/ProductCard";

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
      {/* Hero */}
      <section className="bg-gradient-to-br from-[#0B3A63] via-[#0D4579] to-[#1769AA] text-white">
        <div className="max-w-7xl mx-auto px-4 py-12 sm:py-16 grid md:grid-cols-2 gap-8 items-center">
          <div>
            <div className="inline-block bg-[#F2A900]/20 text-[#F2A900] text-xs font-semibold px-3 py-1 rounded-full mb-4 tracking-wider uppercase">
              Coimbatore's Trusted Electrical Store
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white leading-tight mb-4" style={{ fontFamily: "Outfit" }}>
              Quality Electrical Products, <span className="text-[#F2A900]">Delivered Fast</span>
            </h1>
            <p className="text-white/80 text-base sm:text-lg mb-8 leading-relaxed">
              Genuine electrical products from Havells, Polycab, Finolex, Crompton, and more. Trusted by contractors, builders, and homes across Tamil Nadu.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link to="/shop" className="bg-[#F2A900] hover:bg-[#D4920A] text-[#0B3A63] font-bold px-6 py-3 rounded-lg transition-colors">
                Shop Products
              </Link>
              <Link to="/shop?view=categories" className="bg-white/10 hover:bg-white/20 text-white border border-white/30 px-6 py-3 rounded-lg transition-colors">
                Explore Categories
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap gap-6 text-sm text-white/70">
              <span>⚡ 10,000+ Products</span>
              <span>🏭 10+ Brands</span>
              <span>📦 Fast Shipping</span>
              <span>🔒 Secure Payments</span>
            </div>
          </div>
          <div className="hidden md:grid grid-cols-2 gap-3">
            {[
              { src: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=300&h=200&fit=crop&auto=format", alt: "Ceiling Fan" },
              { src: "https://images.unsplash.com/photo-1580893206515-259ebe5ebef4?w=300&h=200&fit=crop&auto=format", alt: "LED Lighting" },
              { src: "https://images.unsplash.com/photo-1621905251918-48416bd8575a?w=300&h=200&fit=crop&auto=format", alt: "Electrical Cables" },
              { src: "https://images.unsplash.com/photo-1497366216548-37526070297c?w=300&h=200&fit=crop&auto=format", alt: "LED Panels" },
            ].map(img => (
              <div key={img.alt} className="rounded-lg overflow-hidden bg-white/10">
                <img src={img.src} alt={img.alt} className="w-full h-28 object-cover opacity-90" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Categories */}
      <section className="py-10 sm:py-14 bg-white">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex justify-between items-end mb-6">
            <div>
              <h2 className="text-2xl font-bold text-[#0B3A63]">Shop by Category</h2>
              <p className="text-[#667085] text-sm mt-1">Browse our complete electrical product range</p>
            </div>
            <Link to="/shop?view=categories" className="text-sm text-[#1769AA] hover:text-[#0B3A63] font-medium">
              View all →
            </Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {categories.map(cat => (
              <Link
                key={cat.id}
                to={`/shop?category=${cat.id}`}
                className="group bg-[#F6F8FA] hover:bg-[#0B3A63] border border-[#D9E1E8] rounded-xl p-4 text-center transition-all hover:border-[#0B3A63] hover:shadow-md"
              >
                <div className="text-3xl mb-2">{cat.icon}</div>
                <div className="text-sm font-semibold text-[#17212B] group-hover:text-white leading-tight">{cat.name}</div>
                <div className="text-xs text-[#667085] group-hover:text-white/70 mt-0.5">{cat.subcategories.length} types</div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Featured Products */}
      <section className="py-10 sm:py-14 bg-[#F6F8FA]">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex justify-between items-end mb-6">
            <div>
              <h2 className="text-2xl font-bold text-[#0B3A63]">Featured Products</h2>
              <p className="text-[#667085] text-sm mt-1">Popular picks across our top categories</p>
            </div>
            <Link to="/shop" className="text-sm text-[#1769AA] hover:text-[#0B3A63] font-medium">View all →</Link>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
            {featuredProducts.map(p => <ProductCard key={p.id} product={p} />)}
          </div>
        </div>
      </section>

      {/* Brands */}
      <section className="py-10 sm:py-14 bg-white">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-[#0B3A63]">Brands We Carry</h2>
            <p className="text-[#667085] text-sm mt-1">Authorised dealer for India's leading electrical brands</p>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            {brands.map(brand => (
              <Link
                key={brand}
                to={`/shop?brand=${brand}`}
                className="flex items-center gap-2 bg-[#F6F8FA] hover:bg-[#0B3A63] border border-[#D9E1E8] hover:border-[#0B3A63] rounded-lg px-5 py-3 transition-all group"
              >
                <span className="text-sm font-semibold text-[#17212B] group-hover:text-white">{brand}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* Why Choose */}
      <section className="py-10 sm:py-14 bg-[#F6F8FA]">
        <div className="max-w-7xl mx-auto px-4">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-bold text-[#0B3A63]">Why Choose Vee Power?</h2>
            <p className="text-[#667085] text-sm mt-1">Trusted by contractors, builders & homes across Tamil Nadu</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {whyChoose.map(item => (
              <div key={item.title} className="bg-white border border-[#D9E1E8] rounded-xl p-5">
                <div className="text-3xl mb-3">{item.icon}</div>
                <h3 className="font-bold text-[#0B3A63] mb-1.5">{item.title}</h3>
                <p className="text-sm text-[#667085] leading-relaxed">{item.desc}</p>
              </div>
            ))}
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
          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/contact" className="bg-[#F2A900] hover:bg-[#D4920A] text-[#0B3A63] font-bold px-6 py-3 rounded-lg">
              Get Bulk Quote
            </Link>
            <a href="tel:+919876543210" className="bg-white/10 hover:bg-white/20 text-white border border-white/30 px-6 py-3 rounded-lg">
              📞 Call Now
            </a>
          </div>
        </div>
      </section>
    </div>
  );
}
